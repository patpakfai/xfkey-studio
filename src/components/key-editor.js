import { html, useRef } from '../../vendor/preact-htm.js';
import { summarizeAction } from '../format.js';
import { textToSteps } from '../hid-usages.js';
import { slotName } from '../models.js';
import { actionProblems, emptyCombo } from '../protocol.js';
import { Icon } from '../icons.js';
import { MacroEditor } from './macro-editor.js';
import { MediaEditor, SpecialEditor } from './media-editor.js';
import { ShortcutEditor } from './shortcut-editor.js';

const TYPES = [
  { type: 'keys', label: 'Shortcut', icon: 'command' },
  { type: 'macro', label: 'Text & sequence', icon: 'type' },
  { type: 'media', label: 'Media', icon: 'music' },
  { type: 'special', label: 'Special', icon: 'sparkle', bleOnly: true },
  { type: 'none', label: 'Nothing', icon: 'ban' },
];

function newAction(type) {
  switch (type) {
    case 'keys': return { type, press: emptyCombo(), release: null };
    case 'macro': return { type, mode: 'text', text: '', steps: [], interval: 50, repeat: 1 };
    case 'media': return { type, usage: 0xcd };
    case 'special': return { type, code: 7 };
    default: return { type: 'none' };
  }
}

/** Everything that should block saving: protocol problems plus text the pad can't type. */
export function editorProblems(action, ble) {
  const problems = actionProblems(action, { ble });
  if (action.type === 'macro' && action.mode === 'text' && textToSteps(action.text).unsupported.length) {
    problems.push('Remove the characters the pad can’t type.');
  }
  return problems;
}

export function KeyEditor({ model, slot, action, onChange, overBudgetBy }) {
  // Remember what was set up for each type, so flipping tabs doesn't lose work.
  const drafts = useRef(new Map());
  const types = TYPES.filter((t) => !t.bleOnly || model.ble);
  const name = slotName(model, slot);
  const summary = summarizeAction(action);
  // The text editor already explains untypeable characters inline.
  const problems = actionProblems(action, { ble: model.ble });

  const selectType = (type) => {
    if (type === action.type) return;
    drafts.current.set(`${slot}:${action.type}`, action);
    onChange(drafts.current.get(`${slot}:${type}`) ?? newAction(type));
  };

  const onTabKey = (e) => {
    const i = types.findIndex((t) => t.type === action.type);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const tablist = e.currentTarget;
    const next = types[(i + step + types.length) % types.length];
    selectType(next.type);
    setTimeout(() => tablist.querySelector('[aria-selected="true"]')?.focus());
  };

  return html`
    <section class="card editor" aria-labelledby="editor-title">
      <div class="card-head">
        <h2 id="editor-title">${name}</h2>
        <span class="muted editor-summary">${summary.main !== '—' ? `${summary.main} · ${summary.sub}` : summary.sub}</span>
      </div>

      <div class="segmented" role="tablist" aria-label=${`What ${name} does`} onKeyDown=${onTabKey}>
        ${types.map((t) => html`
          <button type="button" role="tab" id=${`tab-${t.type}`} aria-selected=${action.type === t.type}
            aria-controls="editor-panel" tabindex=${action.type === t.type ? 0 : -1} onClick=${() => selectType(t.type)}>
            <${Icon} name=${t.icon} size=${16} /> <span>${t.label}</span>
          </button>`)}
      </div>

      <div id="editor-panel" role="tabpanel" aria-labelledby=${`tab-${action.type}`} class="editor-body">
        ${action.type === 'keys' && html`<${ShortcutEditor} action=${action} onChange=${onChange} ble=${model.ble} />`}
        ${action.type === 'macro' && html`<${MacroEditor} action=${action} onChange=${onChange} slot=${slot} />`}
        ${action.type === 'media' && html`<${MediaEditor} action=${action} onChange=${onChange} />`}
        ${action.type === 'special' && html`<${SpecialEditor} action=${action} onChange=${onChange} />`}
        ${action.type === 'none' && html`<p class="empty">${name} won't send anything.</p>`}
      </div>

      ${(problems.length > 0 || overBudgetBy > 0) && html`
        <div class="callout callout-error" role="alert">
          <${Icon} name="alert" size=${16} />
          <div>
            ${problems.map((p) => html`<p>${p}</p>`)}
            ${overBudgetBy > 0 && html`<p>The pad is out of memory by ${overBudgetBy} bytes — shorten a sequence.</p>`}
          </div>
        </div>`}
    </section>`;
}
