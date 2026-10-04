import { html } from '../../vendor/preact-htm.js';
import { formatCombo } from '../format.js';
import { keyByCode } from '../hid-usages.js';
import { emptyCombo, Mod } from '../protocol.js';
import { ComboEditor } from './combo-editor.js';

const { LCTRL: CTRL, LSHIFT: SHIFT, LALT: OPT, LGUI: CMD } = Mod;
const preset = (label, mods, code) => ({ label, combo: { mods, keys: [keyByCode(code).usage] } });

const PRESETS = [
  ['Editing', [
    preset('Copy', CMD, 'KeyC'),
    preset('Paste', CMD, 'KeyV'),
    preset('Cut', CMD, 'KeyX'),
    preset('Undo', CMD, 'KeyZ'),
    preset('Redo', SHIFT | CMD, 'KeyZ'),
    preset('Select all', CMD, 'KeyA'),
    preset('Save', CMD, 'KeyS'),
    preset('Find', CMD, 'KeyF'),
  ]],
  ['Screenshots', [
    preset('Capture area', SHIFT | CMD, 'Digit4'),
    preset('Capture screen', SHIFT | CMD, 'Digit3'),
    preset('Screenshot tool', SHIFT | CMD, 'Digit5'),
  ]],
  ['macOS', [
    preset('Spotlight', CMD, 'Space'),
    preset('Mission Control', CTRL, 'ArrowUp'),
    preset('App switcher', CMD, 'Tab'),
    preset('Next input source', CTRL, 'Space'),
    preset('Emoji & symbols', CTRL | CMD, 'Space'),
    preset('Lock screen', CTRL | CMD, 'KeyQ'),
    preset('Force quit', OPT | CMD, 'Escape'),
  ]],
  ['Video calls', [
    preset('Zoom: mute', SHIFT | CMD, 'KeyA'),
    preset('Zoom: camera', SHIFT | CMD, 'KeyV'),
    preset('Teams: mute', SHIFT | CMD, 'KeyM'),
    preset('Meet: mute', CMD, 'KeyD'),
    preset('Meet: camera', CMD, 'KeyE'),
  ]],
  ['Browser', [
    preset('New tab', CMD, 'KeyT'),
    preset('Reopen tab', SHIFT | CMD, 'KeyT'),
    preset('Next tab', CTRL, 'Tab'),
    preset('Previous tab', CTRL | SHIFT, 'Tab'),
    preset('Reload', CMD, 'KeyR'),
  ]],
];

const sameCombo = (a, b) => !!a && a.mods === b.mods && a.keys.join() === b.keys.join();

export function ShortcutEditor({ action, onChange, ble }) {
  const hasRelease = action.release !== null;

  return html`
    <div class="stack">
      <div class="field">
        <span class="field-label">When pressed</span>
        <${ComboEditor} label="When pressed" combo=${action.press} onChange=${(press) => onChange({ ...action, press })} />
      </div>

      ${!ble && html`
        <div class="field">
          <label class="check">
            <input type="checkbox" checked=${hasRelease}
              onChange=${(e) => onChange({ ...action, release: e.currentTarget.checked ? emptyCombo() : null })} />
            Send a different shortcut when the key is released
          </label>
          ${hasRelease && html`
            <div class="nested">
              <span class="field-label">When released</span>
              <${ComboEditor} label="When released" combo=${action.release}
                onChange=${(release) => onChange({ ...action, release })} />
            </div>`}
        </div>`}

      <details class="presets" open>
        <summary>Mac shortcuts</summary>
        ${PRESETS.map(([group, items]) => html`
          <div class="preset-group">
            <h3 class="group-title">${group}</h3>
            <div class="preset-list">
              ${items.map((p) => html`
                <button type="button" class="preset" aria-pressed=${sameCombo(action.press, p.combo)}
                  onClick=${() => onChange({ ...action, press: p.combo })}>
                  <span>${p.label}</span>
                  <kbd>${formatCombo(p.combo)}</kbd>
                </button>`)}
            </div>
          </div>`)}
        <p class="help">
          Tip: F13–F20 make great keys for your own shortcuts in apps like Raycast, Alfred or Keyboard Maestro.
          On a Windows PC, ⌘ Command acts as the Windows key and ⌥ Option as Alt.
        </p>
      </details>
    </div>`;
}
