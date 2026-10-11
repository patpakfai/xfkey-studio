// Pad models. XFKEY models are identified by the INFO reply (key count +
// variant byte), taken from the vendor configurator's model table; CH57x models
// are built from the key and knob count the pad reports. `rows` lists slot
// indexes per physical row; `ble` models use the XFKEY Bluetooth protocol.
// `caps` says what the editor may offer for the model's family.

import {
  ch57xActionProblems, CH57X_MAX_CONSUMER_USAGE, CH57X_PRODUCT_ID, CH57X_VENDOR_ID, MAX_ENTRIES, slotIds,
} from './ch57x-protocol.js';
import {
  actionProblems, emptyCombo, LightMode, MAX_COMBO_KEYS, MAX_CONSUMER_USAGE, MAX_MACRO_STEPS,
} from './protocol.js';

const strip = (n) => [Array.from({ length: n }, (_, i) => i)];
const grid = (...sizes) => {
  let next = 0;
  return sizes.map((size) => Array.from({ length: size }, () => next++));
};

const ARROWS = [0x52, 0x50, 0x51, 0x4f]; // Up, Left, Down, Right

const XFKEY_CAPS = Object.freeze({
  types: ['keys', 'macro', 'media', 'none'],
  release: true,
  lighting: true,
  comboKeys: MAX_COMBO_KEYS,
  macroSteps: MAX_MACRO_STEPS,
  macroRepeat: true,
  /** Whether a modifier step is held for the next key (CH57x) or tapped alone (XFKEY). */
  modsCombine: false,
  maxConsumerUsage: MAX_CONSUMER_USAGE,
  /** Delay a new sequence starts with, in ms. */
  defaultInterval: 50,
  factoryReset: true,
  readBack: false,
});
const XFKEY_BLE_CAPS = Object.freeze({ ...XFKEY_CAPS, types: ['keys', 'macro', 'media', 'special', 'none'], release: false });

const model = (keyCount, variant, name, rows, extra = {}) => ({
  family: 'xfkey', keyCount, variant, name, rows, ble: false, caps: extra.ble ? XFKEY_BLE_CAPS : XFKEY_CAPS, ...extra,
});

export const MODELS = [
  model(1, 17, '1-Key Pad', strip(1)),
  model(1, 4, '1-Key Pad (Bluetooth)', strip(1), { ble: true }),
  model(1, 18, 'Big 1-Key Pad', strip(1)),
  model(2, 17, '2-Key Pad', strip(2)),
  model(2, 4, '2-Key Pad (Bluetooth)', strip(2), { ble: true }),
  model(2, 33, '2-Key Pad', strip(2)),
  model(2, 2, '2-Key Pro', grid(2, 3), { slotCount: 5, slotNames: ['Key 1', 'Key 2', 'Extra 1', 'Extra 2', 'Extra 3'] }),
  model(3, 4, '3-Key Pad (Bluetooth)', strip(3), { ble: true }),
  model(3, 17, '3-Key Pad', strip(3)),
  model(3, 19, '3-Key Pad (2 + 1)', grid(2, 1)),
  model(3, 33, '3-Key Pad', strip(3)),
  model(4, 33, '4-Key Strip', strip(4)),
  model(4, 17, '4-Key Strip', strip(4)),
  model(4, 20, 'Arrow Pad', grid(1, 3), { defaults: ARROWS, slotNames: ['Up', 'Left', 'Down', 'Right'] }),
  model(4, 18, 'Arrow Pad', grid(1, 3), { defaults: ARROWS, slotNames: ['Up', 'Left', 'Down', 'Right'] }),
  model(4, 19, 'Round 4-Key Pad', grid(2, 2)),
  model(5, 33, '5-Key Strip', strip(5)),
  model(5, 34, '5-Key Pad (two rows)', grid(3, 2)),
  model(6, 33, '6-Key Pad', grid(3, 3)),
  model(6, 17, '6-Key Pad', grid(3, 3)),
  model(6, 19, '6-Key Pad (4 + 2)', grid(4, 2)),
  model(6, 18, '6-Key Strip', strip(6)),
  model(7, 17, '7-Key Strip', strip(7)),
  model(8, 33, '8-Key Pad', grid(4, 4)),
  model(8, 17, '8-Key Pad', grid(4, 4)),
  model(9, 17, '9-Key Pad', grid(3, 3, 3)),
  model(9, 18, '9-Key Pad', grid(3, 3, 3)),
  model(9, 19, '9-Key Pad', grid(3, 3, 3)),
  model(10, 17, '10-Key Pad', grid(5, 5)),
  model(10, 18, '10-Key Pad (4-4-2)', grid(4, 4, 2)),
  model(12, 18, '12-Key Pad', grid(6, 6)),
  model(12, 17, '12-Key Pad', grid(3, 3, 3, 3)),
];

/** Known model for an INFO reply, or a generic USB layout flagged `unknown`. */
export function modelFor({ keyCount, variant }) {
  const known = MODELS.find((m) => m.keyCount === keyCount && m.variant === variant);
  if (known) return known;
  const count = Number.isInteger(keyCount) ? Math.max(1, Math.min(keyCount, 16)) : 1;
  const rows = [];
  for (let i = 0; i < count; i += 6) rows.push(Array.from({ length: Math.min(6, count - i) }, (_, j) => i + j));
  return model(count, variant, `${count}-Key Pad`, rows, { unknown: true });
}

// ---------------------------------------------------------------------------
// CH57x pads
// ---------------------------------------------------------------------------

const CH57X_CAPS = Object.freeze({
  types: ['keys', 'macro', 'media', 'none'],
  release: false,
  lighting: false,
  comboKeys: 1,
  /** Each entry is one step; text needs more where ⇧ is involved, see entryCount(). */
  macroSteps: MAX_ENTRIES,
  macroRepeat: false,
  modsCombine: true,
  maxConsumerUsage: CH57X_MAX_CONSUMER_USAGE,
  // The per-step delay field isn't verified on hardware yet, so new sequences don't use it.
  defaultInterval: 0,
  factoryReset: false,
  readBack: true,
  stepBudget: MAX_ENTRIES,
});

/** Keys per row for the key counts these pads come in; others fall back to rows of 4. */
const CH57X_ROWS = {
  1: [1], 2: [2], 3: [3], 4: [4], 5: [5], 6: [3, 3], 8: [4, 4], 9: [3, 3, 3], 10: [5, 5],
  11: [4, 4, 3], 12: [4, 4, 4], 15: [5, 5, 5], 16: [4, 4, 4, 4],
};

/** Layouts confirmed on real hardware with this site. */
const CH57X_VERIFIED = new Set(['1-0']);

export function ch57xModel(keys, knobs) {
  const sizes = CH57X_ROWS[keys] ?? Array.from({ length: Math.ceil(keys / 4) }, (_, i) => Math.min(4, keys - 4 * i));
  const rows = grid(...sizes, ...Array(knobs).fill(3));
  const knobNames = Array.from({ length: knobs }, (_, k) => [`Knob ${k + 1} ⟲`, `Knob ${k + 1} press`, `Knob ${k + 1} ⟳`]).flat();
  const s = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return {
    family: 'ch57x',
    name: knobs ? `${keys}-Key Pad + ${s(knobs, 'knob')}` : `${keys}-Key Pad`,
    keyCount: keys,
    knobCount: knobs,
    vendorId: CH57X_VENDOR_ID,
    productId: CH57X_PRODUCT_ID,
    rows,
    slotCount: keys + 3 * knobs,
    slotNames: [...Array.from({ length: keys }, (_, i) => `Key ${i + 1}`), ...knobNames],
    slotIds: slotIds(keys, knobs),
    ble: false,
    verified: CH57X_VERIFIED.has(`${keys}-${knobs}`),
    caps: CH57X_CAPS,
  };
}

/** Problems that would make `action` unsafe to send to a pad of this model. */
export const actionProblemsFor = (m, action) =>
  (m.family === 'ch57x' ? ch57xActionProblems(action) : actionProblems(action, { ble: m.ble }));

export const slotCount = (m) => m.slotCount ?? m.keyCount;
export const slotName = (m, i) => m.slotNames?.[i] ?? `Key ${i + 1}`;

/** Factory mapping: A, B, C, ... (or arrows for the arrow pad). */
export function defaultActions(m) {
  return Array.from({ length: slotCount(m) }, (_, i) => ({
    type: 'keys',
    press: { ...emptyCombo(), keys: [m.defaults?.[i] ?? 0x04 + i] },
    release: null,
  }));
}

export const DEFAULT_LIGHTING = Object.freeze({ mode: LightMode.RAINBOW, color: '#1e90ff' });
