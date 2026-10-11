import { html, useRef } from '../../vendor/preact-htm.js';
import { summarizeAction } from '../format.js';
import { textToSteps } from '../hid-usages.js';
import { actionProblemsFor, slotName } from '../models.js';
import { emptyCombo } from '../protocol.js';
import { Icon } from '../icons.js';
import { MacroEditor } from './macro-editor.js';
import { MediaEditor, SpecialEditor } from './media-editor.js';
import { ShortcutEditor } from './shortcut-editor.js';

const TYPES = [
  { type: 'keys', label: 'Shortcut', icon: 'command' },
  { type: 'macro', label: 'Text & sequence', icon: 'type' },
  { type: 'media', label: 'Media', icon: 'music' },
  { type: 'special', label: 'Special', icon: 'sparkle' },
  { type: 'none', label: 'Nothing', icon: 'ban' },
];

function newAction(type, caps) {
  switch (type) {
    case 'keys': return { type, press: emptyCombo(), release: null };
    case 'macro': return { type, mode: 'text', text: '', steps: [], interval: caps.defaultInterval, repeat: 1 };
    case 'media': return { type, usage: 0xcd };
    case 'special': return { type, code: 7 };
    default: return { type: 'none' };
  }
}

/** Everything that should block saving: protocol problems plus text the pad can't type. */
export function editorProblems(action, model) {
  const problems = actionProblemsFor(model, action);
  if (action.type === 'macro' && action.mode === 'text' && textToSteps(action.text).unsupported.length) {
    problems.push('Remove the characters the pad can’t type.');
  }
  return problems;
}

/** `steps` is { used, total } on pads that limit the steps per key (CH57x). */
export function KeyEditor({ model, slot, action, onChange, overBudgetBy, steps }) {
  // Remember what was set up for each type, so flipping tabs doesn't lose work.
  const drafts = useRef(new Map());
  const { caps } = model;
  const types = TYPES.filter((t) => caps.types.includes(t.type));
  // A key set by another app ('raw') has no tab; the first tab takes keyboard focus.
  const focusType = types.some((t) => t.type === action.type) ? action.type : types[0].type;
  const name = slotName(model, slot);
  const summary = summarizeAction(action);
  // The text editor already explains untypeable characters inline.
  const problems = actionProblemsFor(model, action);

  const selectType = (type) => {
    if (type === action.type) return;
    drafts.current.set(`${slot}:${action.type}`, action);
    onChange(drafts.current.get(`${slot}:${type}`) ?? newAction(type, caps));
  };

  const onTabKey = (e) => {
    const i = types.findIndex((t) => t.type === focusType);
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
            aria-controls="editor-panel" tabindex=${focusType === t.type ? 0 : -1} onClick=${() => selectType(t.type)}>
            <${Icon} name=${t.icon} size=${16} /> <span>${t.label}</span>
          </button>`)}
      </div>

      <div id="editor-panel" role="tabpanel" aria-labelledby=${`tab-${focusType}`} class="editor-body">
        ${action.type === 'keys' && html`<${ShortcutEditor} action=${action} onChange=${onChange} caps=${caps} />`}
        ${action.type === 'macro' && html`<${MacroEditor} action=${action} onChange=${onChange} slot=${slot} caps=${caps} steps=${steps} />`}
        ${action.type === 'media' && html`<${MediaEditor} action=${action} onChange=${onChange} maxUsage=${caps.maxConsumerUsage} />`}
        ${action.type === 'special' && html`<${SpecialEditor} action=${action} onChange=${onChange} />`}
        ${action.type === 'none' && html`<p class="empty">${name} won't send anything.</p>`}
        ${action.type === 'raw' && html`
          <p class="empty">
            ${name} holds ${summary.main === 'Mouse' ? 'a mouse action' : 'a setting'} made with another app. XFKEY Studio can't edit it yet,
            but keeps it as it is when you save. Pick a type above to replace it.
          </p>`}
      </div>

      ${steps && action.type !== 'none' && html`
        <p class=${`help step-count ${steps.used > steps.total ? 'is-over' : ''}`}>
          Uses ${steps.used} of the ${steps.total} steps the keyboard stores for this key.
        </p>`}

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
