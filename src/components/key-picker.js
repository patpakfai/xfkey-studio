import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { canShiftInMacro, describeStep, KEY_GROUPS, KEYS, macroModStep, MODIFIERS } from '../hid-usages.js';
import { MACRO_SHIFTED } from '../protocol.js';
import { Icon } from '../icons.js';

function matches(k, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return k.label.toLowerCase().includes(needle) ||
    k.code.toLowerCase().includes(needle) ||
    k.glyph === q || k.char === q || k.shiftChar === q ||
    (k.aliases ?? []).some((a) => a.includes(needle));
}

/**
 * Modal key list. In combo mode a pick closes the dialog; in macro mode it stays
 * open so several steps can be added, and offers Shift + modifier steps.
 */
export function KeyPicker({ title, macro = false, exclude = [], onPick, onClose }) {
  const dialog = useRef(null);
  const [query, setQuery] = useState('');
  const [shift, setShift] = useState(false);
  const [lastAdded, setLastAdded] = useState('');

  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);

  const pick = (step) => {
    onPick(step);
    if (macro) setLastAdded(describeStep(step).label);
    else dialog.current.close();
  };

  const q = query.trim();
  const groups = KEY_GROUPS
    .map(([group, label]) => [label, KEYS.filter((k) => k.group === group && !exclude.includes(k.usage) && matches(k, q))])
    .filter(([, keys]) => keys.length);
  const mods = macro ? MODIFIERS.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.glyph === q) : [];

  // In a sequence, show the character that will actually be typed (a vs. A).
  const keyText = (k) => {
    if (macro && shift && k.shiftChar) return k.shiftChar;
    if (macro && k.char?.trim()) return k.char;
    if (k.glyph) return html`<span class="pick-glyph" aria-hidden="true">${k.glyph}</span> ${k.label}`;
    return k.label;
  };

  return html`
    <dialog ref=${dialog} class="picker" aria-labelledby="picker-title" onClose=${onClose}>
      <div class="picker-head">
        <h2 id="picker-title">${title}</h2>
        <button type="button" class="icon-btn" aria-label="Close" onClick=${() => dialog.current.close()}>
          <${Icon} name="x" />
        </button>
      </div>
      <div class="picker-tools">
        <label class="search">
          <${Icon} name="search" size=${16} />
          <span class="visually-hidden">Search keys</span>
          <input type="search" placeholder="Search: return, f13, arrow, [" value=${query}
            onInput=${(e) => setQuery(e.currentTarget.value)} autofocus />
        </label>
        ${macro && html`
          <label class="check">
            <input type="checkbox" checked=${shift} onChange=${(e) => setShift(e.currentTarget.checked)} />
            With Shift (A, !, @ …)
          </label>`}
      </div>
      <div class="picker-body">
        ${mods.length > 0 && html`
          <section>
            <h3>Modifiers <span class="muted">— tapped on their own</span></h3>
            <div class="picker-grid">
              ${mods.map((m) => html`
                <button type="button" class="pick" onClick=${() => pick(macroModStep(m.bit))}>
                  <span class="pick-glyph" aria-hidden="true">${m.glyph}</span> ${m.right ? 'Right ' : ''}${m.name}
                </button>`)}
            </div>
          </section>`}
        ${groups.map(([label, keys]) => html`
          <section>
            <h3>${label}</h3>
            <div class="picker-grid">
              ${keys.map((k) => {
                const shifted = macro && shift;
                const blocked = shifted && !canShiftInMacro(k.usage);
                return html`
                  <button type="button" class=${`pick ${k.note ? 'has-note' : ''}`} disabled=${blocked}
                    title=${blocked ? 'Use a ⇧ Shift modifier step for this key' : k.note}
                    onClick=${() => pick(shifted ? k.usage + MACRO_SHIFTED : k.usage)}>
                    ${keyText(k)}
                  </button>`;
              })}
            </div>
          </section>`)}
        ${groups.length === 0 && mods.length === 0 && html`<p class="empty">No key matches “${q}”.</p>`}
      </div>
      ${macro && html`
        <div class="picker-foot">
          <span class="muted" aria-live="polite">${lastAdded ? `Added ${lastAdded}` : 'Click keys to add them in order.'}</span>
          <button type="button" class="btn btn-primary" onClick=${() => dialog.current.close()}>Done</button>
        </div>`}
    </dialog>`;
}
