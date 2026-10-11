import { html, useState } from '../../vendor/preact-htm.js';
import { MEDIA, MEDIA_GROUPS, mediaByUsage, SPECIAL } from '../hid-usages.js';
import { Icon } from '../icons.js';

function OptionGrid({ label, options, isSelected, onSelect }) {
  return html`
    <div class="option-grid" role="radiogroup" aria-label=${label}>
      ${options.map((o) => html`
        <button type="button" role="radio" class="option" aria-checked=${isSelected(o)} onClick=${() => onSelect(o)}>
          <${Icon} name=${o.icon} size=${22} />
          <span>${o.label}</span>
        </button>`)}
    </div>`;
}

export function MediaEditor({ action, onChange, maxUsage }) {
  const custom = !mediaByUsage(action.usage);
  const [hex, setHex] = useState(() => action.usage.toString(16).padStart(3, '0'));
  const parsed = /^(0x)?[0-9a-f]{1,3}$/i.test(hex.trim()) ? parseInt(hex.trim().replace(/^0x/i, ''), 16) : NaN;
  const hexValid = parsed >= 1 && parsed <= maxUsage;
  const max = maxUsage.toString(16).toUpperCase();

  return html`
    <div class="stack">
      ${MEDIA_GROUPS.map(([group, label]) => html`
        <section class="option-section">
          <h3 class="group-title">
            ${label}
            ${group === 'windows' && html`<span class="badge">Usually no effect on a Mac</span>`}
          </h3>
          <${OptionGrid} label=${label} options=${MEDIA.filter((m) => m.group === group)}
            isSelected=${(m) => m.usage === action.usage} onSelect=${(m) => onChange({ type: 'media', usage: m.usage })} />
        </section>`)}

      <details class="advanced" open=${custom}>
        <summary>Custom consumer usage</summary>
        <div class="field">
          <label class="field-label" for="custom-usage">Usage ID (hex, page 0x0C)</label>
          <div class="inline-form">
            <input id="custom-usage" class="mono" value=${hex} spellcheck="false" aria-invalid=${!hexValid}
              aria-describedby="custom-usage-msg" onInput=${(e) => setHex(e.currentTarget.value)} />
            <button type="button" class="btn" disabled=${!hexValid} onClick=${() => onChange({ type: 'media', usage: parsed })}>
              Use
            </button>
          </div>
          <p id="custom-usage-msg" class=${hexValid ? 'help' : 'field-error'}>
            ${hexValid ? `For power users: any consumer-page usage from 001 to ${max}.` : `Enter a hex value from 001 to ${max}.`}
          </p>
        </div>
      </details>
    </div>`;
}

export function SpecialEditor({ action, onChange }) {
  return html`
    <div class="stack">
      <p class="help">For phones and tablets paired over Bluetooth.</p>
      <${OptionGrid} label="Special functions" options=${SPECIAL}
        isSelected=${(s) => s.code === action.code} onSelect=${(s) => onChange({ type: 'special', code: s.code })} />
    </div>`;
}
