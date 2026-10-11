import { html } from '../../vendor/preact-htm.js';
import { Icon } from '../icons.js';

const SUPPORT = {
  supported: ['Supported', 'is-ok'],
  experimental: ['Experimental', 'is-warn'],
  unsupported: ['Not supported yet', 'is-muted'],
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describeModel(model) {
  const parts = [plural(model.keyCount, 'key')];
  if (model.knobCount) parts.push(plural(model.knobCount, 'knob'));
  if (model.ble) parts.push('Bluetooth model');
  return parts.join(' · ');
}

/**
 * Pads the site has found, each with a Customize button.
 * A candidate is { id, device, driver, family, usb, demo, status, model, support, error }
 * with status 'checking' | 'ready' | 'error' | 'unsupported'.
 */
export function DeviceList({ candidates, opening, onOpen, onRetry, onForget }) {
  if (!candidates.length) return null;
  return html`
    <section class="devices" aria-labelledby="devices-title">
      <h2 id="devices-title">Keyboards found</h2>
      <ul class="device-list">
        ${candidates.map((c) => html`
          <${DeviceRow} key=${c.id} candidate=${c} busy=${opening === c.id} disabled=${opening !== null}
            onOpen=${onOpen} onRetry=${onRetry} onForget=${onForget} />`)}
      </ul>
    </section>`;
}

function DeviceRow({ candidate: c, busy, disabled, onOpen, onRetry, onForget }) {
  const support = c.status === 'unsupported' ? 'unsupported' : c.status === 'ready' ? c.support : null;
  const [badge, badgeClass] = SUPPORT[support] ?? [];
  const title = c.model?.name ?? (c.family === 'XFKEY' ? 'XFKEY pad' : 'CH57x keypad');

  let line;
  if (c.status === 'checking') line = html`<span class="spinner spinner-sm" aria-hidden="true"></span> Checking what it is…`;
  else if (c.status === 'error') line = c.error;
  else if (c.status === 'unsupported') {
    line = html`It uses another version of the CH57x protocol, which this site can't write yet.${' '}
      <a href="https://jvspier.github.io/macropad-rebind/" target="_blank" rel="noopener">macropad-rebind</a> may support it.`;
  } else line = describeModel(c.model);

  return html`
    <li class=${`device ${c.status === 'error' ? 'is-error' : ''}`}>
      <span class="device-icon" aria-hidden="true"><${Icon} name="keyboard" size=${22} /></span>
      <div class="device-text">
        <div class="device-title">
          <strong>${title}</strong>
          <span class="badge">${c.family}</span>
          ${badge && html`<span class=${`badge ${badgeClass}`}>${badge}</span>`}
        </div>
        <p class="device-line" aria-live="polite">${line}</p>
        <p class="device-meta">USB ${c.usb}${c.demo ? ' · simulated for the demo' : ''}</p>
      </div>
      <div class="device-actions">
        ${c.driver && c.status !== 'error' && html`
          <button type="button" class="btn btn-primary" disabled=${c.status !== 'ready' || disabled}
            aria-busy=${busy} onClick=${() => onOpen(c.device)}>
            ${busy ? html`<span class="spinner" aria-hidden="true"></span> Opening…` : 'Customize'}
          </button>`}
        ${c.driver && c.status === 'error' && html`
          <button type="button" class="btn" disabled=${disabled} onClick=${() => onRetry(c.device)}>
            <${Icon} name="refresh" size=${16} /> Try again
          </button>`}
        ${!c.demo && html`
          <button type="button" class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => onForget(c.device)}
            title="Remove this site's permission to use the keyboard">Forget</button>`}
      </div>
    </li>`;
}
