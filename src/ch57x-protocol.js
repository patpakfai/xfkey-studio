// Wire protocol for CH57x-family mini keypads (the "MINI_KEYBOARD" pads), in the
// dialect used by USB VID 0x514C / PID 0x8850 ("ch57x-3").
//
// Write format from kriomant/ch57x-keyboard-tool's k8850_4x4.rs (MIT), which was
// built from USB captures of the vendor app. Identify, read-back and the 1-key
// layout were checked on a real 1-key 514C:8850 pad. See docs/PROTOCOL.md.
//
// Transport: a vendor-defined HID interface (usage page 0xFF00, usage 0x01),
// report ID 3, 64-byte reports. Offsets below exclude the report ID. IDENTIFY
// and READ get replies; writes and commits get none.
//
// Two commands are deliberately never built here: 0xEF (enters the bootloader,
// with no firmware image to recover from) and 0xFC (rewrites the key/knob
// geometry, which makes a working pad look broken).
//
// This module is pure (no WebHID, no DOM) so it runs in the browser and in Node.

import { isComboSet, ProtocolError } from './protocol.js';

export const CH57X_VENDOR_ID = 0x514c;
export const CH57X_PRODUCT_ID = 0x8850;
export const CH57X_USAGE_PAGE = 0xff00;
export const CH57X_REPORT_ID = 3;

export const Ch57xCmd = Object.freeze({
  READ: 0xfa,
  IDENTIFY: 0xfb,
  WRITE: 0xfd,
});

export const RecordType = Object.freeze({ KEYBOARD: 1, MEDIA: 2, MOUSE: 3 });

/** Every slot is stored on each of the pad's layers. */
export const LAYERS = 3;
/** Entries one record holds. A 19th is accepted on the wire but not stored. */
export const MAX_ENTRIES = 18;
export const MAX_KEYS = 16;
export const MAX_KNOBS = 4;
/** Knob slots start after the 16 key slots: 17 + 3 × knob + action. */
const KNOB_SLOT_BASE = MAX_KEYS + 1;
/** Highest usage the pad's consumer-control report accepts (descriptor max 0x2FF). */
export const CH57X_MAX_CONSUMER_USAGE = 0x2ff;

/** Ends one binding and stores it in flash. */
const COMMIT = [Ch57xCmd.WRITE, 0xfe, 0xff];
/** Modifier entries F1..F8 = LCtrl, LShift, LAlt, LGui, RCtrl, RShift, RAlt, RGui (bit order). */
const MOD_ENTRY = 0xf1;
const isModEntry = (code) => code >= MOD_ENTRY && code < MOD_ENTRY + 8;
const SHIFT_ENTRY = MOD_ENTRY + 1;

// The site's macro steps (see protocol.js): a usage, usage + 0x80 for the
// shifted character (usages <= 0x38), or 201..208 for a modifier. On this pad a
// modifier entry is held for the next key -- verified: [F2, 04] types "A".
const STEP_SHIFTED = 0x80;
const STEP_SHIFTABLE_MAX = 0x38;
const STEP_MOD_BASE = 201;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// ---------------------------------------------------------------------------
// Requests and replies
// ---------------------------------------------------------------------------

export const identifyRequest = () => [Ch57xCmd.IDENTIFY, Ch57xCmd.IDENTIFY, Ch57xCmd.IDENTIFY];

/** IDENTIFY reply: [0xFB, keys, knobs, ?]. The 1-key pad answers [FB 01 00 0B]. */
export function parseIdentify(reply) {
  const [cmd, keys, knobs] = reply;
  if (cmd !== Ch57xCmd.IDENTIFY || !isInt(keys, 0, MAX_KEYS) || !isInt(knobs, 0, MAX_KNOBS) || keys + knobs === 0) {
    throw new ProtocolError("This keyboard didn't describe its keys the way CH57x pads do.", reply);
  }
  return { keys, knobs };
}

/** Asks for every record on one layer (1-based); the pad sends one reply per slot. */
export const readRequest = (keys, knobs, layer) => [Ch57xCmd.READ, keys, knobs, layer];

/** Wire slot ids in display order: keys 1..n, then ccw/press/cw for each knob. */
export function slotIds(keys, knobs) {
  const ids = Array.from({ length: keys }, (_, i) => i + 1);
  for (let k = 0; k < knobs; k++) ids.push(KNOB_SLOT_BASE + 3 * k, KNOB_SLOT_BASE + 3 * k + 1, KNOB_SLOT_BASE + 3 * k + 2);
  return ids;
}

/** Number of 3-byte entries a record carries. Mouse records split it over bytes 4 and 5. */
const entriesIn = (record) => (record[3] === RecordType.MOUSE ? record[4] + record[5] : record[5]);
const recordEnd = (record) => 6 + 3 * entriesIn(record);

/**
 * Whether a READ reply is laid out the way this dialect stores records. Other
 * CH57x dialects keep the count at byte 9 and leave byte 5 at 0, so they fail
 * this check -- which is what keeps us from writing a format they don't speak.
 */
export function isCh57x3Record(record) {
  if (record?.[0] !== Ch57xCmd.READ || !Object.values(RecordType).includes(record[3])) return false;
  const count = entriesIn(record);
  if (count < 1 || count > MAX_ENTRIES + 1) return false;
  return Array.from(record.slice(recordEnd(record))).every((b) => b === 0);
}

// ---------------------------------------------------------------------------
// Actions <-> entries
//
// Actions use the site's shared format (see protocol.js), plus
//   { type: 'raw', bytes }   a record we can't edit (e.g. a mouse action set by
//                            the vendor app), kept byte for byte from offset 3.
// ---------------------------------------------------------------------------

const modEntries = (mods) => [0, 1, 2, 3, 4, 5, 6, 7].filter((bit) => mods & (1 << bit)).map((bit) => [0, MOD_ENTRY + bit]);

/** [delay ms, code] pairs for a keyboard record. */
export function keyboardEntries(action) {
  switch (action.type) {
    case 'keys': {
      if (!isComboSet(action.press)) return [[0, 0]];
      const { mods, keys } = action.press;
      // A modifier-only combo still needs a key entry for the modifiers to land on.
      return [...modEntries(mods), ...(keys.length ? keys.map((k) => [0, k]) : [[0, 0]])];
    }
    case 'macro':
      return action.steps.flatMap((step) => {
        if (step >= STEP_MOD_BASE && step < STEP_MOD_BASE + 8) return [[0, MOD_ENTRY + step - STEP_MOD_BASE]];
        if (step >= STEP_SHIFTED) return [[0, SHIFT_ENTRY], [action.interval, step - STEP_SHIFTED]];
        return [[action.interval, step]];
      });
    default:
      return [[0, 0]];
  }
}

/** Entries an action needs; the pad stores at most MAX_ENTRIES per slot. */
export function entryCount(action) {
  switch (action?.type) {
    case 'keys':
    case 'macro':
      return keyboardEntries(action).length;
    case 'media':
      return 2;
    case 'raw':
      return entriesIn([0, 0, 0, ...action.bytes]);
    default:
      return 1;
  }
}

/** Human-readable problems that would make an action unsafe to send to this pad. */
export function ch57xActionProblems(action) {
  const problems = [];
  const tooLong = () => {
    const n = entryCount(action);
    if (n > MAX_ENTRIES) {
      problems.push(`This needs ${n} steps, but the keyboard stores ${MAX_ENTRIES} per key. Modifiers and ⇧ capitals each take a step.`);
    }
  };
  switch (action?.type) {
    case 'none':
      break;
    case 'keys': {
      const { press, release } = action;
      if (isComboSet(release)) problems.push("This keyboard can't send a different shortcut on release.");
      if (!isInt(press?.mods, 0, 0xff)) problems.push('Invalid modifiers.');
      if (!Array.isArray(press?.keys) || !press.keys.every((k) => isInt(k, 1, 0xff))) {
        problems.push("The shortcut contains a key this pad can't send.");
      } else if (press.keys.length > 1) {
        problems.push('This keyboard sends one key per shortcut. For several keys, use Text & sequence.');
      }
      break;
    }
    case 'macro':
      if (!Array.isArray(action.steps) || action.steps.length === 0) problems.push('The sequence is empty.');
      else if (!action.steps.every((s) => isInt(s, 1, 0xff) && s !== 0xff)) problems.push('The sequence contains an invalid step.');
      else tooLong();
      if (!isInt(action.interval, 0, 0xffff)) problems.push('Delay must be 0–65535 ms.');
      if (action.repeat !== 1) problems.push("This keyboard can't repeat a sequence. Set it to play once.");
      break;
    case 'media':
      if (!isInt(action.usage, 1, CH57X_MAX_CONSUMER_USAGE)) problems.push('Pick a media function.');
      break;
    case 'raw':
      if (!Array.isArray(action.bytes) || action.bytes.length < 3 || !action.bytes.every((b) => isInt(b, 0, 0xff))) {
        problems.push('This key holds data that can’t be written back.');
      }
      break;
    default:
      problems.push("This keyboard can't do that.");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** The bytes from offset 3 (type) onwards that store `action`. */
function recordBody(action) {
  switch (action.type) {
    case 'media':
      // Two entries: low byte, then high byte of the consumer usage.
      return [RecordType.MEDIA, 0, 2, 0, 0, action.usage & 0xff, 0, 0, action.usage >> 8];
    case 'raw':
      return action.bytes;
    default: {
      const entries = keyboardEntries(action);
      return [RecordType.KEYBOARD, 0, entries.length, ...entries.flatMap(([delay, code]) => [delay >> 8, delay & 0xff, code])];
    }
  }
}

/** One WRITE report: [0xFD, slot, layer, type, 0, count, entries…]. Layers are 1-based. */
export function encodeRecord(slot, layer, action) {
  const problems = ch57xActionProblems(action);
  if (problems.length) throw new ProtocolError(problems.join(' '));
  return [Ch57xCmd.WRITE, slot, layer, ...recordBody(action)];
}

/** Every report needed to store `actions` (one per slot, display order) on every layer. */
export function ch57xSavePackets(ids, actions) {
  if (actions.length !== ids.length) throw new ProtocolError(`Expected ${ids.length} keys, got ${actions.length}.`);
  actions.forEach((action, i) => {
    const problems = ch57xActionProblems(action);
    if (problems.length) throw new ProtocolError(`Key ${i + 1}: ${problems.join(' ')}`);
  });
  const packets = [];
  for (let layer = 1; layer <= LAYERS; layer++) {
    ids.forEach((slot, i) => packets.push(encodeRecord(slot, layer, actions[i]), [...COMMIT]));
  }
  return packets;
}

/** Whether a packet from ch57xSavePackets is a commit (the pad needs a moment after it). */
export const isCommit = (packet) => packet[0] === COMMIT[0] && packet[1] === COMMIT[1] && packet[2] === COMMIT[2];

/** Decodes a keyboard record's entries into a shortcut or a sequence, or null. */
function decodeKeyboard(entries) {
  if (entries.every(([delay, code]) => delay === 0 && code === 0)) return { type: 'none' };

  // Shortcut: modifiers, then at most one key (the last entry), no delays.
  const firstKey = entries.findIndex(([, code]) => !isModEntry(code));
  if (entries.every(([delay]) => delay === 0) && (firstKey === -1 || firstKey === entries.length - 1)) {
    const mods = entries.filter(([, c]) => isModEntry(c)).reduce((m, [, c]) => m | (1 << (c - MOD_ENTRY)), 0);
    const key = firstKey === -1 ? 0 : entries[firstKey][1];
    return { type: 'keys', press: { mods, keys: key ? [key] : [] }, release: null };
  }

  // Sequence: ⇧ + a shiftable key folds into one shifted step.
  const steps = [];
  for (let i = 0; i < entries.length; i++) {
    const [, code] = entries[i];
    const next = entries[i + 1]?.[1];
    if (code === SHIFT_ENTRY && next !== undefined && next >= 1 && next <= STEP_SHIFTABLE_MAX) {
      steps.push(next + STEP_SHIFTED);
      i++;
    } else if (isModEntry(code)) {
      steps.push(STEP_MOD_BASE + code - MOD_ENTRY);
    } else if (code >= 1 && code < STEP_SHIFTED) {
      steps.push(code);
    } else {
      return null;
    }
  }
  const delays = entries.filter(([, c]) => !isModEntry(c)).map(([d]) => d);
  return { type: 'macro', steps, interval: delays[0] ?? 0, repeat: 1 };
}

function decodeAction(record) {
  const count = entriesIn(record);
  const entries = Array.from({ length: count }, (_, i) => [(record[6 + 3 * i] << 8) | record[7 + 3 * i], record[8 + 3 * i]]);
  if (record[3] === RecordType.KEYBOARD) return decodeKeyboard(entries);
  if (record[3] === RecordType.MEDIA && count === 2) return { type: 'media', usage: entries[0][1] | (entries[1][1] << 8) };
  return null;
}

/**
 * Turns a READ reply into an action. Anything that wouldn't be written back
 * exactly the same (byte 4 aside, which the vendor app writes as 0) becomes a
 * 'raw' action, so saving never changes a key the user didn't touch.
 */
export function decodeRecord(record) {
  const bytes = Array.from(record.slice(3, recordEnd(record)));
  const decoded = decodeAction(record);
  if (decoded && !ch57xActionProblems(decoded).length) {
    const body = recordBody(decoded);
    if (body.length === bytes.length && body.every((b, i) => i === 1 || b === bytes[i])) return decoded;
  }
  return { type: 'raw', bytes };
}

/**
 * Sorts one layer's READ replies by slot (the pad may send them out of order)
 * and checks they're complete and in this dialect.
 */
export function parseLayer(replies, ids, layer) {
  const bySlot = new Map();
  for (const reply of replies) {
    if (reply[0] !== Ch57xCmd.READ) continue;
    if (!isCh57x3Record(reply)) {
      throw new ProtocolError('This keyboard stores its keys in a CH57x format this site doesn’t know yet.', reply);
    }
    if (reply[2] === layer) bySlot.set(reply[1], reply);
  }
  const missing = ids.filter((id) => !bySlot.has(id));
  if (missing.length) {
    throw new ProtocolError(`The keyboard didn't send layer ${layer} completely (missing slot ${missing.join(', ')}).`);
  }
  return ids.map((id) => bySlot.get(id));
}

/** The record a successful save leaves on the pad, as READ returns it. */
export function expectedRecord(packet) {
  return [Ch57xCmd.READ, ...packet.slice(1)];
}

/** Compares a READ reply with what was written, ignoring byte 4 and trailing zeros. */
export function sameRecord(reply, expected) {
  const end = Math.max(recordEnd(reply), expected.length);
  for (let i = 0; i < end; i++) {
    if (i !== 4 && (reply[i] ?? 0) !== (expected[i] ?? 0)) return false;
  }
  return true;
}
