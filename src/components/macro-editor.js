import { html, useState } from '../../vendor/preact-htm.js';
import { describeStep, stepsToText, textToSteps } from '../hid-usages.js';
import { Icon } from '../icons.js';
import { KeyPicker } from './key-picker.js';
import { NumberField } from './number-field.js';

/** `steps` is { used, total } on pads that count steps per key (CH57x), else null. */
export function MacroEditor({ action, onChange, slot, caps, steps }) {
  const [picking, setPicking] = useState(false);
  const { unsupported } = action.mode === 'text' ? textToSteps(action.text) : { unsupported: [] };
  const full = steps ? steps.used >= steps.total : action.steps.length >= caps.macroSteps;

  const setText = (text) => onChange({ ...action, text, steps: textToSteps(text).steps });
  const setSteps = (steps) => onChange({ ...action, steps, text: stepsToText(steps) ?? '' });

  const switchMode = (mode) => {
    if (mode === action.mode) return;
    if (mode === 'steps') return onChange({ ...action, mode });
    const text = stepsToText(action.steps);
    if (text !== null) return onChange({ ...action, mode, text });
    // Keep only the steps that are plain characters.
    const kept = action.steps.filter((s) => stepsToText([s]) !== null);
    // eslint-disable-next-line no-alert
    if (!window.confirm('Text mode can only hold characters. Remove the special keys and modifiers from this sequence?')) return;
    onChange({ ...action, mode, steps: kept, text: stepsToText(kept) });
  };

  return html`
    <div class="stack">
      <div class="segmented segmented-sm" role="radiogroup" aria-label="Sequence type">
        <button type="button" role="radio" aria-checked=${action.mode === 'text'} onClick=${() => switchMode('text')}>
          <${Icon} name="type" size=${16} /> Type text
        </button>
        <button type="button" role="radio" aria-checked=${action.mode === 'steps'} onClick=${() => switchMode('steps')}>
          <${Icon} name="zap" size=${16} /> Key sequence
        </button>
      </div>

      ${action.mode === 'text' ? html`
        <div class="field">
          <label class="field-label" for=${`macro-text-${slot}`}>Text to type</label>
          <textarea id=${`macro-text-${slot}`} rows="3" spellcheck="false" autocomplete="off"
            placeholder="e.g. your email address or a code snippet" value=${action.text}
            aria-invalid=${unsupported.length > 0} aria-describedby=${`macro-text-${slot}-msg`}
            onInput=${(e) => setText(e.currentTarget.value)}></textarea>
          ${unsupported.length > 0
            ? html`<p id=${`macro-text-${slot}-msg`} class="field-error">
                Can't type ${unsupported.map((c) => `“${c}”`).join(' ')} — the pad only types characters found on a US keyboard.
              </p>`
            : html`<p id=${`macro-text-${slot}-msg`} class="help">
                ${steps ? 'Capitals and symbols that need ⇧ take two steps.' : `${action.steps.length} keystrokes.`}${' '}
                The pad presses keys, so switch macOS to the ABC / U.S. input source first —
                with a Chinese or Japanese input method on, the letters go into the input method instead.
              </p>`}
        </div>` : html`
        <div class="field">
          <span class="field-label">Keys, in order</span>
          <ol class="steps" aria-label="Sequence steps">
            ${action.steps.map((step, i) => {
              const d = describeStep(step);
              return html`
                <li class=${`chip chip-${d.kind}`}>
                  <span class="chip-label">${d.label}</span>
                  <button type="button" class="chip-remove" aria-label=${`Remove step ${i + 1}, ${d.label}`}
                    onClick=${() => setSteps(action.steps.filter((_, j) => j !== i))}>
                    <${Icon} name="x" size=${12} />
                  </button>
                </li>`;
            })}
            <li>
              <button type="button" class="chip-add" disabled=${full}
                onClick=${() => setPicking(true)}>
                <${Icon} name="plus" size=${14} /> Add keys
              </button>
            </li>
          </ol>
          <p class="help">
            ${caps.modsCombine
              ? 'A modifier step (⌘, ⇧ …) is held down for the next key, so ⌘ then C sends ⌘C.'
              : "A modifier step (⌘, ⇧ …) is tapped on its own — it doesn't combine with the next key. For a shortcut like ⌘C, use the Shortcut tab."}
            ${action.steps.length > 0 && html` <button type="button" class="link-btn" onClick=${() => setSteps([])}>Clear all</button>`}
          </p>
        </div>`}

      <div class="field-row">
        <${NumberField} id=${`macro-interval-${slot}`} label="Delay between keys" value=${action.interval}
          min=${0} max=${65535} suffix="ms"
          help=${caps.macroRepeat ? '50 ms works for most apps.' : '0 types as fast as the pad can. Delays are not tested on this pad yet.'}
          onChange=${(interval) => onChange({ ...action, interval })} />
        ${caps.macroRepeat && html`
          <${NumberField} id=${`macro-repeat-${slot}`} label="Play it" value=${action.repeat || 1}
            min=${1} max=${255} suffix="times" disabled=${action.repeat === 0} help="Per key press."
            onChange=${(repeat) => onChange({ ...action, repeat })} />`}
      </div>
      ${caps.macroRepeat && html`
        <label class="check">
          <input type="checkbox" checked=${action.repeat === 0}
            onChange=${(e) => onChange({ ...action, repeat: e.currentTarget.checked ? 0 : 1 })} />
          Repeat forever
        </label>`}
      ${action.repeat === 0 && html`
        <p class="callout callout-warn" role="note">
          <${Icon} name="alert" size=${16} />
          <span>Not tested on real hardware: how an endless sequence stops is up to the pad's firmware. Be ready to unplug the pad.</span>
        </p>`}

      ${picking && html`
        <${KeyPicker} macro title="Add keys to the sequence" modsCombine=${caps.modsCombine} onClose=${() => setPicking(false)}
          onPick=${(step) => onChange((latest) => {
            const steps = [...latest.steps, step];
            return { ...latest, steps, text: stepsToText(steps) ?? '' };
          })} />`}
    </div>`;
}
