import { html } from '../../vendor/preact-htm.js';
import { LIGHT_MODES_WITH_COLOR, LightMode } from '../protocol.js';
import { Icon } from '../icons.js';

const MODES = [
  [LightMode.RAINBOW, 'Rainbow cycle'],
  [LightMode.NEON, 'Neon flow'],
  [LightMode.SOLID, 'Solid colour'],
  [LightMode.FLOW, 'Colour flow'],
  [LightMode.FLASH_ON_PRESS, 'Flash on press'],
  [LightMode.LIT_WHILE_PRESSED, 'Light while pressed'],
  [LightMode.TOGGLE_ON_PRESS, 'Toggle on press'],
  [LightMode.OFF, 'Off'],
];

const SWATCHES = ['#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1', '#1e90ff', '#c71585', '#ffffff'];

export function LightingCard({ lighting, onChange }) {
  const needsColor = LIGHT_MODES_WITH_COLOR.has(lighting.mode);

  return html`
    <section class="card" aria-labelledby="lighting-title">
      <div class="card-head">
        <h2 id="lighting-title"><${Icon} name="bulb" /> Lighting</h2>
      </div>
      <div class="field">
        <label class="field-label" for="light-mode">Effect</label>
        <select id="light-mode" value=${lighting.mode} onChange=${(e) => onChange({ ...lighting, mode: Number(e.currentTarget.value) })}>
          ${MODES.map(([value, label]) => html`<option value=${value}>${label}</option>`)}
        </select>
      </div>
      ${needsColor && html`
        <div class="field">
          <span class="field-label" id="light-colour-label">Colour</span>
          <div class="swatches" role="group" aria-labelledby="light-colour-label">
            ${SWATCHES.map((c) => html`
              <button type="button" class="swatch" style=${{ '--swatch': c }} aria-pressed=${lighting.color === c}
                aria-label=${`Colour ${c}`} onClick=${() => onChange({ ...lighting, color: c })}></button>`)}
            <label class="swatch swatch-custom" title="Pick any colour" style=${{ '--swatch': lighting.color }}>
              <span class="visually-hidden">Custom colour</span>
              <input type="color" value=${lighting.color} onInput=${(e) => onChange({ ...lighting, color: e.currentTarget.value })} />
            </label>
          </div>
        </div>`}
      <p class="help">Saved together with the keys. Pads without LEDs ignore it.</p>
    </section>`;
}
