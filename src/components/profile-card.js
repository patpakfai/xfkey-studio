import { html, useRef } from '../../vendor/preact-htm.js';
import { Icon } from '../icons.js';

/** Export / import / reset, plus the raw bytes for the curious. */
export function ProfileCard({ onExport, onImport, onReset, packets }) {
  const fileInput = useRef(null);

  return html`
    <section class="card" aria-labelledby="profile-title">
      <div class="card-head">
        <h2 id="profile-title"><${Icon} name="save" /> Profile</h2>
      </div>
      <div class="button-row">
        <button type="button" class="btn" onClick=${onExport}><${Icon} name="download" size=${16} /> Export</button>
        <button type="button" class="btn" onClick=${() => fileInput.current.click()}><${Icon} name="upload" size=${16} /> Import</button>
        <button type="button" class="btn" onClick=${onReset}><${Icon} name="reset" size=${16} /> Factory keys</button>
      </div>
      <input ref=${fileInput} type="file" accept=".json,application/json" class="visually-hidden" tabindex="-1"
        aria-hidden="true" onChange=${(e) => {
          const file = e.currentTarget.files[0];
          e.currentTarget.value = '';
          if (file) onImport(file);
        }} />
      <p class="help">Profiles are plain JSON files you can back up or share. Nothing changes on the pad until you save.</p>
      <details class="advanced">
        <summary><${Icon} name="code" size=${14} /> Bytes sent on save</summary>
        ${packets.error
          ? html`<p class="field-error">${packets.error}</p>`
          : html`<pre class="packets">${packets.list.map((p) => p.map((b) => b.toString(16).padStart(2, '0')).join(' ')).join('\n')}</pre>`}
      </details>
    </section>`;
}
