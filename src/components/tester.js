import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { formatMods } from '../format.js';
import { keyByCode } from '../hid-usages.js';
import { Icon } from '../icons.js';

const MAX_EVENTS = 10;

function describeEvent(e) {
  const mods = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0) | (e.metaKey ? 0x08 : 0);
  const k = keyByCode(e.code);
  const isModifier = /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(e.code);
  const keyText = isModifier ? '' : k ? (k.glyph ?? k.label) : e.key;
  return `${formatMods(mods)}${keyText}` || e.code;
}

/** Shows what the pad sends, so a new mapping can be checked without leaving the page. */
export function KeyTester() {
  const [listening, setListening] = useState(false);
  const [events, setEvents] = useState([]);
  const nextId = useRef(0);
  const area = useRef(null);

  useEffect(() => {
    if (!listening) return undefined;
    const onKey = (e) => {
      if (e.repeat) return;
      // Outside the text box, stop shortcuts from acting on the page (⌘S, ⌘P …),
      // but leave plain keys alone so Tab still moves focus.
      if (e.type === 'keydown' && e.target !== area.current && (e.metaKey || e.ctrlKey || e.altKey)) e.preventDefault();
      const entry = { id: nextId.current++, down: e.type === 'keydown', label: describeEvent(e), code: e.code };
      setEvents((list) => [entry, ...list].slice(0, MAX_EVENTS));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [listening]);

  return html`
    <section class="card" aria-labelledby="tester-title">
      <div class="card-head">
        <h2 id="tester-title"><${Icon} name="keyboard" /> Key tester</h2>
        <button type="button" class=${`btn btn-sm ${listening ? 'btn-recording' : ''}`} aria-pressed=${listening}
          onClick=${() => setListening(!listening)}>
          ${listening ? 'Stop' : 'Start listening'}
        </button>
      </div>
      <p class="help">
        After saving, press your pad's keys to see what arrives. Media keys go straight to macOS, so they won't show up here.
        Shortcuts Chrome reserves (like ⌘W, ⌘Q) still act on the browser.
      </p>
      <label class="field">
        <span class="field-label">Typing test area</span>
        <textarea ref=${area} rows="2" placeholder="Click here, then press a key that types text"></textarea>
      </label>
      ${listening && html`
        <ol class="event-log" aria-live="polite" aria-label="Recent key events">
          ${events.length === 0 && html`<li class="muted">Waiting for a key…</li>`}
          ${events.map((ev) => html`
            <li key=${ev.id}>
              <span class=${`event-dir ${ev.down ? 'is-down' : ''}`}>${ev.down ? 'down' : 'up'}</span>
              <kbd>${ev.label}</kbd>
              <span class="muted mono">${ev.code}</span>
            </li>`)}
        </ol>`}
    </section>`;
}
