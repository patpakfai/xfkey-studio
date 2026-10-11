// Display strings for shortcuts and actions, using macOS conventions (⌃⌥⇧⌘).

import { describeStep, keyLabel, mediaByUsage, MODIFIERS, SPECIAL } from './hid-usages.js';
import { isComboSet } from './protocol.js';

/** "⌃⌥⇧⌘" glyphs in macOS order; right-hand modifiers get a "R" prefix. */
export function formatMods(mods) {
  return MODIFIERS.filter((m) => mods & m.bit).map((m) => (m.right ? `R${m.glyph}` : m.glyph)).join('');
}

/** "⇧⌘4", "⌃↑", "⌘Space", "A + B". */
export function formatCombo(combo) {
  if (!isComboSet(combo)) return '';
  const keys = combo.keys.map(keyLabel).join(' + ');
  return formatMods(combo.mods) + keys;
}

/** Spoken form for screen readers: "Shift Command 4". */
export function speakCombo(combo) {
  if (!isComboSet(combo)) return 'nothing';
  const mods = MODIFIERS.filter((m) => combo.mods & m.bit).map((m) => `${m.right ? 'right ' : ''}${m.name}`);
  return [...mods, ...combo.keys.map(keyLabel)].join(' ');
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** { main, sub } for a keycap. */
export function summarizeAction(action) {
  switch (action.type) {
    case 'keys': {
      const press = formatCombo(action.press);
      const release = formatCombo(action.release);
      if (press && release) return { main: press, sub: `then ${release} on release` };
      if (release) return { main: release, sub: 'on release' };
      return press ? { main: press, sub: 'Shortcut' } : { main: '—', sub: 'No action' };
    }
    case 'media': {
      const m = mediaByUsage(action.usage);
      return { main: m?.label ?? `Usage 0x${action.usage.toString(16)}`, sub: 'Media', icon: m?.icon };
    }
    case 'macro': {
      if (!action.steps.length) return { main: '—', sub: 'Empty sequence' };
      const sub = action.repeat === 0 ? 'Repeats forever' : action.repeat > 1 ? `Sequence ×${action.repeat}` : 'Sequence';
      if (action.mode === 'text') return { main: `“${truncate(action.text.replace(/\n/g, '↩'), 14)}”`, sub: 'Types text' };
      const preview = action.steps.slice(0, 8).map((s) => describeStep(s).short).join(' ');
      return { main: truncate(preview, 12), sub };
    }
    case 'special':
      return { main: SPECIAL.find((s) => s.code === action.code)?.label ?? 'Special', sub: 'Special' };
    case 'raw':
      // CH57x record type 3 is a mouse action.
      return { main: action.bytes[0] === 3 ? 'Mouse' : 'Custom', sub: 'Set by another app' };
    default:
      return { main: '—', sub: 'No action' };
  }
}
