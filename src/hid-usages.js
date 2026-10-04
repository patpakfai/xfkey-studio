// HID usage tables with macOS-friendly labels.
//
// KEYS: keyboard page (0x07). `code` is the KeyboardEvent.code that produces the
// usage, used when recording shortcuts. `char`/`shiftChar` are what the key
// types on a US layout, used to turn text into macro steps.

import { MACRO_MOD_BASE, MACRO_SHIFTABLE_MAX, MACRO_SHIFTED } from './protocol.js';

const key = (usage, code, label, group, extra = {}) => ({ usage, code, label, group, ...extra });

const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l, i) =>
  key(0x04 + i, `Key${l}`, l, 'letters', { char: l.toLowerCase(), shiftChar: l }));

const digits = [...'1234567890'].map((d, i) =>
  key(0x1e + i, `Digit${d}`, d, 'digits', { char: d, shiftChar: '!@#$%^&*()'[i] }));

const fKeys = (from, to, firstUsage, notOnMac = false) =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    key(firstUsage + i, `F${from + i}`, `F${from + i}`, 'function', notOnMac ? { note: 'Usually ignored by macOS' } : {}));

export const KEYS = [
  ...letters,
  ...digits,
  key(0x28, 'Enter', 'Return', 'editing', { glyph: '↩', char: '\n', aliases: ['enter'] }),
  key(0x29, 'Escape', 'Esc', 'editing', { glyph: '⎋', aliases: ['escape'] }),
  key(0x2a, 'Backspace', 'Delete', 'editing', { glyph: '⌫', aliases: ['backspace'] }),
  key(0x2b, 'Tab', 'Tab', 'editing', { glyph: '⇥', char: '\t' }),
  key(0x2c, 'Space', 'Space', 'editing', { char: ' ', aliases: ['spacebar'] }),
  key(0x2d, 'Minus', '-', 'symbols', { char: '-', shiftChar: '_', aliases: ['minus', 'dash'] }),
  key(0x2e, 'Equal', '=', 'symbols', { char: '=', shiftChar: '+', aliases: ['equal', 'plus'] }),
  key(0x2f, 'BracketLeft', '[', 'symbols', { char: '[', shiftChar: '{' }),
  key(0x30, 'BracketRight', ']', 'symbols', { char: ']', shiftChar: '}' }),
  key(0x31, 'Backslash', '\\', 'symbols', { char: '\\', shiftChar: '|', aliases: ['backslash', 'pipe'] }),
  key(0x33, 'Semicolon', ';', 'symbols', { char: ';', shiftChar: ':' }),
  key(0x34, 'Quote', "'", 'symbols', { char: "'", shiftChar: '"', aliases: ['quote', 'apostrophe'] }),
  key(0x35, 'Backquote', '`', 'symbols', { char: '`', shiftChar: '~', aliases: ['backtick', 'grave', 'tilde'] }),
  key(0x36, 'Comma', ',', 'symbols', { char: ',', shiftChar: '<' }),
  key(0x37, 'Period', '.', 'symbols', { char: '.', shiftChar: '>', aliases: ['dot'] }),
  key(0x38, 'Slash', '/', 'symbols', { char: '/', shiftChar: '?' }),
  key(0x39, 'CapsLock', 'Caps Lock', 'other', { glyph: '⇪' }),
  ...fKeys(1, 12, 0x3a),
  key(0x46, 'PrintScreen', 'Print Screen', 'other', { note: 'Acts as F13 on a Mac' }),
  key(0x47, 'ScrollLock', 'Scroll Lock', 'other', { note: 'Acts as F14 on a Mac' }),
  key(0x48, 'Pause', 'Pause', 'other', { note: 'Acts as F15 on a Mac' }),
  key(0x49, 'Insert', 'Insert', 'navigation', { note: 'Help key on a Mac' }),
  key(0x4a, 'Home', 'Home', 'navigation', { glyph: '↖' }),
  key(0x4b, 'PageUp', 'Page Up', 'navigation', { glyph: '⇞', aliases: ['pgup'] }),
  key(0x4c, 'Delete', 'Fwd Delete', 'editing', { glyph: '⌦', aliases: ['forward delete', 'del'] }),
  key(0x4d, 'End', 'End', 'navigation', { glyph: '↘' }),
  key(0x4e, 'PageDown', 'Page Down', 'navigation', { glyph: '⇟', aliases: ['pgdn'] }),
  key(0x4f, 'ArrowRight', 'Right', 'navigation', { glyph: '→', aliases: ['arrow'] }),
  key(0x50, 'ArrowLeft', 'Left', 'navigation', { glyph: '←', aliases: ['arrow'] }),
  key(0x51, 'ArrowDown', 'Down', 'navigation', { glyph: '↓', aliases: ['arrow'] }),
  key(0x52, 'ArrowUp', 'Up', 'navigation', { glyph: '↑', aliases: ['arrow'] }),
  key(0x53, 'NumLock', 'Num Lock', 'numpad', { note: 'Clear key on a Mac', aliases: ['clear'] }),
  key(0x54, 'NumpadDivide', 'Num /', 'numpad'),
  key(0x55, 'NumpadMultiply', 'Num *', 'numpad'),
  key(0x56, 'NumpadSubtract', 'Num -', 'numpad'),
  key(0x57, 'NumpadAdd', 'Num +', 'numpad'),
  key(0x58, 'NumpadEnter', 'Num Enter', 'numpad'),
  ...[...'1234567890'].map((d, i) => key(0x59 + i, `Numpad${d}`, `Num ${d}`, 'numpad')),
  key(0x63, 'NumpadDecimal', 'Num .', 'numpad'),
  key(0x65, 'ContextMenu', 'Menu', 'other', { aliases: ['application', 'context'] }),
  key(0x67, 'NumpadEqual', 'Num =', 'numpad'),
  ...fKeys(13, 20, 0x68),
  ...fKeys(21, 24, 0x70, true),
];

export const KEY_GROUPS = [
  ['letters', 'Letters'],
  ['digits', 'Numbers'],
  ['function', 'Function keys'],
  ['editing', 'Editing'],
  ['navigation', 'Navigation'],
  ['symbols', 'Symbols'],
  ['numpad', 'Numpad'],
  ['other', 'Other'],
];

const KEY_BY_USAGE = new Map(KEYS.map((k) => [k.usage, k]));
const KEY_BY_CODE = new Map(KEYS.map((k) => [k.code, k]));
export const keyByUsage = (usage) => KEY_BY_USAGE.get(usage);
export const keyByCode = (code) => KEY_BY_CODE.get(code);

/** Short label for a keycap or chip, e.g. "↩" for Return, "F13", "A". */
export const keyLabel = (usage) => {
  const k = KEY_BY_USAGE.get(usage);
  return k ? k.glyph ?? k.label : `0x${usage.toString(16).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Modifiers, listed in macOS display order (⌃ ⌥ ⇧ ⌘), left side then right.
// ---------------------------------------------------------------------------

export const MODIFIERS = [
  { bit: 0x01, code: 'ControlLeft', name: 'Control', glyph: '⌃', right: false },
  { bit: 0x04, code: 'AltLeft', name: 'Option', glyph: '⌥', right: false },
  { bit: 0x02, code: 'ShiftLeft', name: 'Shift', glyph: '⇧', right: false },
  { bit: 0x08, code: 'MetaLeft', name: 'Command', glyph: '⌘', right: false },
  { bit: 0x10, code: 'ControlRight', name: 'Control', glyph: '⌃', right: true },
  { bit: 0x40, code: 'AltRight', name: 'Option', glyph: '⌥', right: true },
  { bit: 0x20, code: 'ShiftRight', name: 'Shift', glyph: '⇧', right: true },
  { bit: 0x80, code: 'MetaRight', name: 'Command', glyph: '⌘', right: true },
];
const MOD_BY_CODE = new Map(MODIFIERS.map((m) => [m.code, m]));
export const modifierByCode = (code) => MOD_BY_CODE.get(code);

/** Macro step code for a modifier bit (201 = LCtrl ... 208 = RGui). */
export const macroModStep = (bit) => MACRO_MOD_BASE + Math.log2(bit);

// ---------------------------------------------------------------------------
// Consumer page (0x0C) usages for media keys. `mac`: macOS is known to act on it.
// ---------------------------------------------------------------------------

export const MEDIA = [
  { usage: 0x00cd, label: 'Play / Pause', icon: 'playPause', group: 'media', mac: true },
  { usage: 0x00b6, label: 'Previous track', icon: 'previous', group: 'media', mac: true },
  { usage: 0x00b5, label: 'Next track', icon: 'next', group: 'media', mac: true },
  { usage: 0x00b4, label: 'Rewind', icon: 'rewind', group: 'media', mac: true },
  { usage: 0x00b3, label: 'Fast forward', icon: 'fastForward', group: 'media', mac: true },
  { usage: 0x00b7, label: 'Stop', icon: 'stop', group: 'media' },
  { usage: 0x00e2, label: 'Mute', icon: 'mute', group: 'volume', mac: true },
  { usage: 0x00ea, label: 'Volume down', icon: 'volumeDown', group: 'volume', mac: true },
  { usage: 0x00e9, label: 'Volume up', icon: 'volumeUp', group: 'volume', mac: true },
  { usage: 0x0070, label: 'Brightness down', icon: 'brightnessDown', group: 'display', mac: true },
  { usage: 0x006f, label: 'Brightness up', icon: 'brightnessUp', group: 'display', mac: true },
  { usage: 0x00b8, label: 'Eject', icon: 'eject', group: 'display', mac: true },
  { usage: 0x0194, label: 'My Computer', icon: 'monitor', group: 'windows' },
  { usage: 0x0183, label: 'Media player', icon: 'music', group: 'windows' },
  { usage: 0x0192, label: 'Calculator', icon: 'calculator', group: 'windows' },
  { usage: 0x0223, label: 'Browser home', icon: 'globe', group: 'windows' },
  { usage: 0x018a, label: 'Email', icon: 'mail', group: 'windows' },
  { usage: 0x0224, label: 'Web back', icon: 'arrowLeft', group: 'windows' },
  { usage: 0x0225, label: 'Web forward', icon: 'arrowRight', group: 'windows' },
  { usage: 0x0227, label: 'Web refresh', icon: 'refresh', group: 'windows' },
  { usage: 0x0152, label: 'Bass +', icon: 'speaker', group: 'windows' },
  { usage: 0x0153, label: 'Bass −', icon: 'speaker', group: 'windows' },
  { usage: 0x0154, label: 'Treble +', icon: 'speaker', group: 'windows' },
  { usage: 0x0155, label: 'Treble −', icon: 'speaker', group: 'windows' },
];

export const MEDIA_GROUPS = [
  ['media', 'Playback'],
  ['volume', 'Volume'],
  ['display', 'Display & system'],
  ['windows', 'Windows / other systems'],
];

const MEDIA_BY_USAGE = new Map(MEDIA.map((m) => [m.usage, m]));
export const mediaByUsage = (usage) => MEDIA_BY_USAGE.get(usage);

/** Bluetooth-only "special" functions (page turning / phone swipes). */
export const SPECIAL = [
  { code: 7, label: 'Previous page', icon: 'arrowLeft' },
  { code: 6, label: 'Next page', icon: 'arrowRight' },
  { code: 2, label: 'Swipe up (iPhone)', icon: 'arrowUp' },
  { code: 3, label: 'Swipe down (iPhone)', icon: 'arrowDown' },
  { code: 4, label: 'Swipe left (iPhone)', icon: 'arrowLeft' },
  { code: 5, label: 'Swipe right (iPhone)', icon: 'arrowRight' },
  { code: 8, label: 'Swipe up (Android)', icon: 'arrowUp' },
  { code: 9, label: 'Swipe down (Android)', icon: 'arrowDown' },
  { code: 10, label: 'Swipe left (Android)', icon: 'arrowLeft' },
  { code: 11, label: 'Swipe right (Android)', icon: 'arrowRight' },
];

// ---------------------------------------------------------------------------
// Macro steps <-> text
//
// Verified on a 2-key pad: shifted steps press Shift together with the key,
// while modifier steps (201..208) tap the modifier alone and release it.
// ---------------------------------------------------------------------------

const CHAR_TO_STEP = new Map();
for (const k of KEYS) {
  if (k.char !== undefined) CHAR_TO_STEP.set(k.char, k.usage);
  if (k.shiftChar !== undefined) CHAR_TO_STEP.set(k.shiftChar, k.usage + MACRO_SHIFTED);
}
const STEP_TO_CHAR = new Map([...CHAR_TO_STEP].map(([c, s]) => [s, c]));

/** Converts text to macro steps. Characters a US keyboard can't type are reported. */
export function textToSteps(text) {
  const steps = [];
  const unsupported = new Set();
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    const step = CHAR_TO_STEP.get(ch);
    if (step === undefined) unsupported.add(ch);
    else steps.push(step);
  }
  return { steps, unsupported: [...unsupported] };
}

/** Inverse of textToSteps, or null when a step isn't a plain character. */
export function stepsToText(steps) {
  let text = '';
  for (const s of steps) {
    const ch = STEP_TO_CHAR.get(s);
    if (ch === undefined) return null;
    text += ch;
  }
  return text;
}

/** Describes one macro step for display: `label` for chips, `short` for keycaps. */
export function describeStep(step) {
  if (step >= MACRO_MOD_BASE && step < MACRO_MOD_BASE + 8) {
    const mod = MODIFIERS.find((m) => m.bit === 1 << (step - MACRO_MOD_BASE));
    const side = mod.right ? 'Right ' : '';
    return { kind: 'mod', label: `${side}${mod.glyph} ${mod.name}`, short: `${mod.right ? 'R' : ''}${mod.glyph}` };
  }
  const shifted = step >= MACRO_SHIFTED;
  const usage = shifted ? step - MACRO_SHIFTED : step;
  const k = KEY_BY_USAGE.get(usage);
  if (shifted && k?.shiftChar) return { kind: 'char', label: k.shiftChar, short: k.shiftChar };
  if (shifted) return { kind: 'key', label: `⇧ ${keyLabel(usage)}`, short: `⇧${keyLabel(usage)}` };
  if (k?.char && k.char.trim()) return { kind: 'char', label: k.char, short: k.char };
  return { kind: 'key', label: k ? k.label : keyLabel(usage), short: keyLabel(usage) };
}

/** Whether `usage` can be sent shifted inside a macro (usage + MACRO_SHIFTED). */
export const canShiftInMacro = (usage) => usage <= MACRO_SHIFTABLE_MAX;
