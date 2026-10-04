// Wire protocol for XFKEY macro pads (USB VID 0xAF88 / PID 0x6688, vendor "XFFP").
//
// Reverse-engineered from the vendor's web configurator
// (https://xuanfang.co/xfp-web/). See docs/PROTOCOL.md for the full write-up.
//
// Transport: the pad exposes a vendor-defined HID interface (usage page 0xFF00)
// with 64-byte input and output reports and no report IDs. Every request starts
// with MAGIC, and the pad answers each request with one input report whose first
// byte is MAGIC on success.
//
// This module is pure (no WebHID, no DOM) so it runs in the browser and in Node.

export const VENDOR_ID = 0xaf88;
export const PRODUCT_ID = 0x6688;
export const CONFIG_USAGE_PAGE = 0xff00;
export const REPORT_SIZE = 64;
export const MAGIC = 0xaf;

export const Cmd = Object.freeze({
  INFO: 0x01,
  WRITE: 0x02,
  /** USB models: persist the config block. Bluetooth models: finish one key. */
  COMMIT: 0x04,
  BLE_KEY_HEADER: 0x09,
  BLE_LIGHTING: 0x0d,
});

/** USB models keep every key plus the lighting in one 128-byte block. */
export const CONFIG_SIZE = 128;
/** Bytes 0..123 hold the key actions back to back; 124..127 hold the lighting. */
export const KEY_DATA_SIZE = 124;
/** [offset, length] of the WRITE packets that carry the config block. */
const USB_CHUNKS = [[0, 60], [60, 60], [120, 8]];
const BLE_MACRO_CHUNK = 32;
const BLE_BITMAP_SIZE = 15;

/** Modifier bits, as in a HID boot keyboard report. */
export const Mod = Object.freeze({
  LCTRL: 0x01, LSHIFT: 0x02, LALT: 0x04, LGUI: 0x08,
  RCTRL: 0x10, RSHIFT: 0x20, RALT: 0x40, RGUI: 0x80,
});

/** Max non-modifier keys in one shortcut (a boot keyboard report has 6 slots). */
export const MAX_COMBO_KEYS = 6;
/** Highest consumer usage the pad's consumer-control report accepts. */
export const MAX_CONSUMER_USAGE = 0x23c;
/** The macro step count is sent as a single byte. */
export const MAX_MACRO_STEPS = 255;

// Macro steps are single bytes: a plain keyboard usage, usage + MACRO_SHIFTED
// for the shifted character (only used for usages <= MACRO_SHIFTABLE_MAX), or a
// modifier code MACRO_MOD_BASE + n for n = LCtrl, LShift, LAlt, LGui, RCtrl,
// RShift, RAlt, RGui. Each step is pressed and released on its own, so a
// modifier step does not combine with the step after it.
export const MACRO_SHIFTED = 0x80;
export const MACRO_SHIFTABLE_MAX = 0x38;
export const MACRO_MOD_BASE = 201;

export const LightMode = Object.freeze({
  RAINBOW: 1,
  SOLID: 2,
  FLOW: 3,
  FLASH_ON_PRESS: 4,
  NEON: 5,
  OFF: 6,
  LIT_WHILE_PRESSED: 7,
  TOGGLE_ON_PRESS: 8,
});
export const LIGHT_MODES_WITH_COLOR = new Set([2, 3, 4, 7, 8]);

export class ProtocolError extends Error {
  constructor(message, reply) {
    super(message);
    this.name = 'ProtocolError';
    this.reply = reply;
  }
}

// ---------------------------------------------------------------------------
// Actions
//
//   { type: 'none' }
//   { type: 'keys', press: Combo, release: Combo | null }   Combo = { mods, keys }
//   { type: 'media', usage }                                 consumer usage (page 0x0C)
//   { type: 'macro', steps, interval, repeat }               interval in ms, repeat 0 = forever
//   { type: 'special', code }                                Bluetooth models only
// ---------------------------------------------------------------------------

export const emptyCombo = () => ({ mods: 0, keys: [] });
export const isComboSet = (combo) => !!combo && (combo.mods !== 0 || combo.keys.length > 0);

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Human-readable problems that would make an action unsafe to send. */
export function actionProblems(action, { ble = false } = {}) {
  const problems = [];
  const checkCombo = (combo, label) => {
    if (!combo) return;
    if (!isInt(combo.mods, 0, 0xff)) problems.push(`${label}: invalid modifiers.`);
    if (!Array.isArray(combo.keys) || combo.keys.length > MAX_COMBO_KEYS) {
      problems.push(`${label}: use at most ${MAX_COMBO_KEYS} keys.`);
    } else if (!combo.keys.every((k) => isInt(k, 1, ble ? BLE_BITMAP_SIZE * 8 - 1 : 0xff))) {
      problems.push(`${label}: contains a key this pad can't send.`);
    }
  };

  switch (action?.type) {
    case 'none':
      break;
    case 'keys':
      checkCombo(action.press, 'On press');
      checkCombo(action.release, 'On release');
      if (ble && isComboSet(action.release)) problems.push('Bluetooth models can only trigger on press.');
      break;
    case 'media':
      if (!isInt(action.usage, 1, MAX_CONSUMER_USAGE)) problems.push('Pick a media function.');
      break;
    case 'macro':
      if (!Array.isArray(action.steps) || action.steps.length === 0) problems.push('The sequence is empty.');
      else if (action.steps.length > MAX_MACRO_STEPS) problems.push(`Use at most ${MAX_MACRO_STEPS} steps.`);
      else if (!action.steps.every((s) => isInt(s, 1, 0xff))) problems.push('The sequence contains an invalid step.');
      if (!isInt(action.interval, 0, 0xffff)) problems.push('Delay must be 0–65535 ms.');
      if (!isInt(action.repeat, 0, 0xff)) problems.push('Repeat count must be 0–255.');
      break;
    case 'special':
      if (!ble) problems.push('Special functions only exist on Bluetooth models.');
      else if (!isInt(action.code, 0, 0xff)) problems.push('Pick a special function.');
      break;
    default:
      problems.push('Unknown action type.');
  }
  return problems;
}

function assertValid(actions, ble) {
  actions.forEach((action, i) => {
    const problems = actionProblems(action, { ble });
    if (problems.length) throw new ProtocolError(`Key ${i + 1}: ${problems.join(' ')}`);
  });
}

// ---------------------------------------------------------------------------
// USB models: one 128-byte block written in three chunks, then COMMIT.
// ---------------------------------------------------------------------------

/** Encodes one key as stored in the USB config block. */
export function encodeKeyUsb(action) {
  switch (action.type) {
    case 'none':
      return [0, 0, 0, 0];
    case 'keys': {
      const press = isComboSet(action.press) ? action.press : null;
      const release = isComboSet(action.release) ? action.release : null;
      // Trigger mode: 1 = on press, 2 = on release, 3 = both (press combo first).
      const mode = (press ? 1 : 0) | (release ? 2 : 0);
      if (mode === 0) return [0, 0, 0, 0];
      const out = [0, mode];
      for (const combo of [press, release]) {
        if (combo) out.push(combo.mods, combo.keys.length, ...combo.keys);
      }
      return out;
    }
    case 'media':
      // Little-endian consumer usage, as sent in the pad's consumer report.
      return [2, action.usage & 0xff, action.usage >> 8];
    case 'macro':
      return [3, action.interval >> 8, action.interval & 0xff, action.repeat, action.steps.length, ...action.steps];
    default:
      throw new ProtocolError(`"${action.type}" actions are not supported on USB models.`);
  }
}

/** Bytes of key data a USB model would use for these actions (limit: KEY_DATA_SIZE). */
export const usbKeyDataSize = (actions) => actions.reduce((sum, a) => sum + encodeKeyUsb(a).length, 0);

export function buildUsbConfig(actions, lighting) {
  assertValid(actions, false);
  const data = actions.flatMap(encodeKeyUsb);
  if (data.length > KEY_DATA_SIZE) {
    throw new ProtocolError(`These settings need ${data.length} bytes, but the pad only stores ${KEY_DATA_SIZE}.`);
  }
  const config = new Uint8Array(CONFIG_SIZE);
  config.set(data);
  config.set([lighting.mode, ...parseHexColor(lighting.color)], KEY_DATA_SIZE);
  return config;
}

export function usbSavePackets(actions, lighting) {
  const config = buildUsbConfig(actions, lighting);
  const packets = USB_CHUNKS.map(([offset, length]) => [
    MAGIC, Cmd.WRITE, offset, length, ...config.subarray(offset, offset + length),
  ]);
  packets.push([MAGIC, Cmd.COMMIT]);
  return packets;
}

// ---------------------------------------------------------------------------
// Bluetooth models: lighting packet, then a header/data/commit group per key.
// Mirrors the vendor app; not verified on hardware.
// ---------------------------------------------------------------------------

function keyBitmap(keys) {
  const bitmap = new Array(BLE_BITMAP_SIZE).fill(0);
  for (const usage of keys) bitmap[usage >> 3] |= 1 << (usage & 7);
  return bitmap;
}

function encodeKeyBle(action, slot) {
  const header = (b3, b6 = 0, b7 = 0) => [MAGIC, Cmd.BLE_KEY_HEADER, slot, b3, 0, 0, b6, b7];
  const write = (offset, bytes) => [MAGIC, Cmd.WRITE, slot, offset, bytes.length, ...bytes];
  const commit = (kind, b4, b5) => [MAGIC, Cmd.COMMIT, slot, kind, b4, b5];

  switch (action.type) {
    case 'none':
    case 'keys': {
      const combo = action.type === 'keys' && isComboSet(action.press) ? action.press : emptyCombo();
      return [header(combo.mods), write(0, keyBitmap(combo.keys)), commit(0, 1, 1)];
    }
    case 'media':
      return [header(2), write(0, [action.usage & 0xff, action.usage >> 8]), commit(2, 2, 1)];
    case 'special':
      return [header(0), write(0, [action.code]), commit(4, 1, 1)];
    case 'macro': {
      const packets = [header(0, action.interval >> 8, action.interval & 0xff)];
      for (let offset = 0; offset < action.steps.length; offset += BLE_MACRO_CHUNK) {
        packets.push(write(offset, action.steps.slice(offset, offset + BLE_MACRO_CHUNK)));
      }
      packets.push(commit(3, action.steps.length, action.repeat));
      return packets;
    }
    default:
      throw new ProtocolError(`Unknown action type "${action.type}".`);
  }
}

export function bleSavePackets(actions, lighting) {
  assertValid(actions, true);
  const packets = [[MAGIC, Cmd.BLE_LIGHTING, 0, lighting.mode, ...parseHexColor(lighting.color), 0]];
  actions.forEach((action, i) => packets.push(...encodeKeyBle(action, i + 1)));
  return packets;
}

/** Every packet needed to store `actions` + `lighting` on a pad of this model. */
export const savePackets = (model, actions, lighting) =>
  model.ble ? bleSavePackets(actions, lighting) : usbSavePackets(actions, lighting);

// ---------------------------------------------------------------------------
// Requests and replies
// ---------------------------------------------------------------------------

export const infoRequest = () => [MAGIC, Cmd.INFO];

/**
 * INFO reply: [MAGIC, 0x01, keyCount, variant, id0..id5, 0...]. Bytes 4..9
 * differ per unit and look like a chip ID; we only use them to tell pads apart.
 */
export function parseInfo(reply) {
  if (reply[0] !== MAGIC) {
    throw new ProtocolError('The keyboard sent an unexpected reply to the info request.', reply);
  }
  return {
    keyCount: reply[2],
    variant: reply[3],
    chipId: toHex(reply.slice(4, 10)),
  };
}

export const isAck = (reply) => reply[0] === MAGIC;

/** Zero-pads a request to a full report, the way Windows sends it. */
export function padReport(bytes) {
  if (bytes.length > REPORT_SIZE) throw new ProtocolError(`Packet is ${bytes.length} bytes; the limit is ${REPORT_SIZE}.`);
  const report = new Uint8Array(REPORT_SIZE);
  report.set(bytes);
  return report;
}

export function parseHexColor(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color ?? '');
  if (!match) throw new ProtocolError(`"${color}" is not a #rrggbb colour.`);
  const n = parseInt(match[1], 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

export const toHex = (bytes, sep = '') =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
