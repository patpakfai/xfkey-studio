import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { formatCombo, speakCombo } from '../format.js';
import { keyByCode, keyByUsage, keyLabel, modifierByCode, MODIFIERS } from '../hid-usages.js';
import { isComboSet, MAX_COMBO_KEYS } from '../protocol.js';
import { Icon } from '../icons.js';
import { KeyPicker } from './key-picker.js';

// [event flag, left bit, right bit]
const EVENT_FLAGS = [['ctrlKey', 0x01, 0x10], ['shiftKey', 0x02, 0x20], ['altKey', 0x04, 0x40], ['metaKey', 0x08, 0x80]];

/** Modifiers the event says are down but we never saw go down (held before recording began). */
const missedMods = (e, mods) =>
  EVENT_FLAGS.reduce((acc, [flag, left, right]) => (e[flag] && !(mods & (left | right)) ? acc | left : acc), 0);

const anyModifierDown = (e) => e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;

/**
 * Captures one shortcut from the physical keyboard: the modifiers held plus the
 * first non-modifier key, or a modifier-only combo once it is released. Ends on
 * the keyup after which no modifier is down -- on macOS the keyup of a key
 * pressed with ⌘ never fires, so we can't wait for every key to come up.
 */
function useShortcutRecorder(active, onCapture, onDone, onUnknownKey) {
  const callbacks = useRef();
  callbacks.current = { onCapture, onDone, onUnknownKey };

  useEffect(() => {
    if (!active) return undefined;
    let mods = 0;
    let held = 0;
    let captured = null;

    const finish = () => {
      cleanup();
      if (captured) callbacks.current.onCapture(captured);
      callbacks.current.onDone();
    };
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKeyDown = (e) => {
      swallow(e);
      if (captured || e.repeat) return;
      const mod = modifierByCode(e.code);
      if (mod) {
        mods |= mod.bit;
        held |= mod.bit;
        return;
      }
      const k = keyByCode(e.code);
      if (!k) {
        callbacks.current.onUnknownKey(e.key);
        return;
      }
      captured = { mods: mods | missedMods(e, mods), keys: [k.usage] };
    };
    const onKeyUp = (e) => {
      swallow(e);
      const mod = modifierByCode(e.code);
      if (mod) held &= ~mod.bit;
      if (captured) {
        if (!anyModifierDown(e)) finish();
      } else if (mod && held === 0 && mods !== 0) {
        captured = { mods, keys: [] };
        finish();
      }
    };
    const onBlur = () => finish();
    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return cleanup;
  }, [active]);
}

/** `maxKeys` 1 means the pad sends one key per shortcut; picking a key then replaces it. */
export function ComboEditor({ combo, onChange, label, maxKeys = MAX_COMBO_KEYS }) {
  const [recording, setRecording] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hint, setHint] = useState('');
  const [showRight, setShowRight] = useState(() => (combo.mods & 0xf0) !== 0);

  useShortcutRecorder(
    recording,
    (captured) => {
      if (captured.mods & 0xf0) setShowRight(true);
      onChange(captured);
      setHint(`Recorded ${speakCombo(captured)}.`);
    },
    () => setRecording(false),
    (key) => setHint(`The pad can't send “${key}”. Pick a key from the list instead.`),
  );

  const toggleMod = (bit) => onChange({ ...combo, mods: combo.mods ^ bit });
  const removeKey = (i) => onChange({ ...combo, keys: combo.keys.filter((_, j) => j !== i) });
  const addKey = (usage) => onChange({ ...combo, keys: maxKeys === 1 ? [usage] : [...combo.keys, usage] });
  const canAdd = combo.keys.length < maxKeys || maxKeys === 1;
  const addLabel = !combo.keys.length ? 'Choose key' : maxKeys === 1 ? 'Change key' : 'Add another key';
  const startRecording = () => {
    setHint('');
    setRecording(true);
  };

  return html`
    <div class="combo">
      <div class="combo-display" aria-live="polite">
        <kbd class=${`combo-preview ${isComboSet(combo) ? '' : 'is-empty'}`} aria-label=${`${label}: ${speakCombo(combo)}`}>
          ${isComboSet(combo) ? formatCombo(combo) : 'Nothing yet'}
        </kbd>
        <button type="button" class=${`btn ${recording ? 'btn-recording' : ''}`} aria-pressed=${recording}
          onClick=${() => (recording ? setRecording(false) : startRecording())}>
          <${Icon} name="record" size=${16} />
          ${recording ? 'Press your shortcut…' : 'Record shortcut'}
        </button>
      </div>
      ${(hint || recording) && html`
        <p class="help" role="status">
          ${recording ? 'Press the keys together on your Mac keyboard. Click again to cancel.' : hint}
        </p>`}

      <div class="mod-toggles" role="group" aria-label=${`${label} modifiers`}>
        ${MODIFIERS.filter((m) => !m.right || showRight || combo.mods & m.bit).map((m) => html`
          <button type="button" class="mod-btn" aria-pressed=${(combo.mods & m.bit) !== 0} onClick=${() => toggleMod(m.bit)}>
            <span class="mod-glyph" aria-hidden="true">${m.glyph}</span>
            <span>${m.right ? 'Right ' : ''}${m.name}</span>
          </button>`)}
      </div>

      <div class="key-chips" role="group" aria-label=${`${label} keys`}>
        ${combo.keys.map((usage, i) => html`
          <span class="chip">
            <span class="chip-label">${keyLabel(usage)}</span>
            <button type="button" class="chip-remove" aria-label=${`Remove ${keyByUsage(usage)?.label ?? keyLabel(usage)}`}
              onClick=${() => removeKey(i)}>
              <${Icon} name="x" size=${12} />
            </button>
          </span>`)}
        ${canAdd && html`
          <button type="button" class="chip-add" onClick=${() => setPicking(true)}>
            <${Icon} name="plus" size=${14} /> ${addLabel}
          </button>`}
        <label class="check check-inline">
          <input type="checkbox" checked=${showRight} onChange=${(e) => setShowRight(e.currentTarget.checked)} />
          Right-hand modifiers
        </label>
      </div>

      ${picking && html`
        <${KeyPicker} title="Choose a key" exclude=${combo.keys} onPick=${addKey} onClose=${() => setPicking(false)} />`}
    </div>`;
}
