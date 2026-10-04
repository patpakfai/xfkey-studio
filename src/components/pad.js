import { html } from '../../vendor/preact-htm.js';
import { summarizeAction } from '../format.js';
import { slotName } from '../models.js';
import { Icon } from '../icons.js';

/** The pad drawn as keycaps. Works as a radio group: arrows move, click selects. */
export function PadView({ model, actions, selected, onSelect, flagged }) {
  const order = model.rows.flat();

  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = order[(order.indexOf(selected) + step + order.length) % order.length];
    onSelect(next);
    setTimeout(() => document.getElementById(`keycap-${next}`)?.focus());
  };

  return html`
    <div class="pad" role="radiogroup" aria-label="Keys on your pad" onKeyDown=${onKeyDown}
      style=${{ '--cols': Math.max(...model.rows.map((r) => r.length)) }}>
      ${model.rows.map((row) => html`
        <div class="pad-row">
          ${row.map((i) => {
            const s = summarizeAction(actions[i]);
            const name = slotName(model, i);
            return html`
              <button type="button" role="radio" id=${`keycap-${i}`} aria-checked=${selected === i}
                tabindex=${selected === i ? 0 : -1}
                class=${`keycap ${selected === i ? 'is-selected' : ''} ${flagged.has(i) ? 'is-flagged' : ''}`}
                aria-label=${`${name}: ${s.main === '—' ? '' : `${s.main}, `}${s.sub}`}
                onClick=${() => onSelect(i)}>
                <span class="keycap-name">${name}</span>
                ${s.icon
                  ? html`<span class="keycap-icon"><${Icon} name=${s.icon} size=${28} /></span>`
                  : html`<span class="keycap-main">${s.main}</span>`}
                <span class="keycap-sub">${s.icon ? s.main : s.sub}</span>
                ${flagged.has(i) && html`<span class="keycap-flag"><${Icon} name="alert" size=${14} label="Needs attention" /></span>`}
              </button>`;
          })}
        </div>`)}
    </div>`;
}
