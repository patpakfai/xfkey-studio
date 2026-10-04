import { html, useCallback, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { PadClient } from './client.js';
import { DEFAULT_LIGHTING, defaultActions, modelFor } from './models.js';
import { KEY_DATA_SIZE, savePackets, usbKeyDataSize } from './protocol.js';
import { deviceKey, exportProfile, importProfile, loadSaved, storeSaved } from './storage.js';
import {
  findAuthorizedPad, isPadDevice, isWebHidAvailable, MockTransport, requestPad, WebHidTransport,
} from './transports.js';
import { Icon } from './icons.js';
import { editorProblems, KeyEditor } from './components/key-editor.js';
import { LightingCard } from './components/lighting.js';
import { PadView } from './components/pad.js';
import { ProfileCard } from './components/profile-card.js';
import { KeyTester } from './components/tester.js';
import { Toasts, useToasts } from './components/toasts.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
/** JSON with sorted object keys, so equal profiles compare equal whatever built them. */
const canonical = (value) => JSON.stringify(value, (_, v) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const sameProfile = (a, b) =>
  !!a && !!b && canonical({ actions: a.actions, lighting: a.lighting }) === canonical({ actions: b.actions, lighting: b.lighting });

function errorMessage(err) {
  switch (err?.name) {
    case 'TimeoutError':
      return "The keyboard didn't answer. Unplug it, plug it back in, then connect again.";
    case 'NotAllowedError':
    case 'SecurityError':
      return "Chrome couldn't open the keyboard. Quit any other app that might be using it, then try again.";
    case 'InvalidStateError':
    case 'NetworkError':
      return 'The keyboard was disconnected.';
    default:
      return err?.message || String(err);
  }
}

const factoryProfile = (model) => ({ actions: defaultActions(model), lighting: { ...DEFAULT_LIGHTING } });

const demoRequested = () => new URLSearchParams(location.search).has('demo');

/** Demo pads come from ?demo=<keyCount>-<variant>, defaulting to the 2-key pad. */
function demoTransport() {
  const [keyCount, variant] = (new URLSearchParams(location.search).get('demo') || '2-17').split('-').map(Number);
  return new MockTransport({ keyCount: keyCount || 2, variant: variant || 17 });
}

export function App() {
  const [phase, setPhase] = useState('idle'); // idle | connecting | ready
  const [connectError, setConnectError] = useState('');
  const [pad, setPad] = useState(null); // { client, transport, info, model, key, demo }
  const [profile, setProfile] = useState(null); // { actions, lighting }
  const [saved, setSaved] = useState(null); // last profile saved from this browser, if any
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(null); // { done, total }
  const { toasts, push: toast, dismiss } = useToasts();
  const padRef = useRef(null);
  padRef.current = pad;
  // Edits survive an unplug/replug of the same pad.
  const profileRef = useRef(null);
  profileRef.current = profile;
  const lastPadKey = useRef(null);
  const lastModel = useRef(null);

  // --- connection ------------------------------------------------------------

  const attach = useCallback(async (transport, demo = false) => {
    setPhase('connecting');
    setConnectError('');
    try {
      await transport.open();
      const client = new PadClient(transport);
      const info = await client.info();
      const model = modelFor(info);
      const key = demo ? `demo-${info.keyCount}-${info.variant}` : deviceKey(info);
      const stored = loadSaved(key, model);
      const samePad = lastPadKey.current === key && profileRef.current;
      lastPadKey.current = key;
      lastModel.current = model;
      setPad({ client, transport, info, model, key, demo });
      setSaved(stored);
      if (!samePad) {
        setProfile(clone(stored ?? factoryProfile(model)));
        setSelected(0);
      }
      setPhase('ready');
    } catch (err) {
      await transport.close().catch(() => {});
      setPhase('idle');
      setConnectError(errorMessage(err));
    }
  }, []);

  const connect = async () => {
    try {
      const device = await requestPad();
      if (device) await attach(new WebHidTransport(device));
    } catch (err) {
      setConnectError(errorMessage(err));
    }
  };

  const disconnect = async () => {
    const current = padRef.current;
    setPad(null);
    setPhase('idle');
    await current?.transport.close().catch(() => {});
  };

  useEffect(() => {
    if (demoRequested()) {
      attach(demoTransport(), true);
      return undefined;
    }
    if (!isWebHidAvailable()) return undefined;

    const onConnect = ({ device }) => {
      if (!padRef.current && isPadDevice(device)) attach(new WebHidTransport(device));
    };
    const onDisconnect = ({ device }) => {
      if (padRef.current?.transport.device === device) {
        setPad(null);
        setPhase('idle');
        toast('info', 'Keyboard unplugged. Plug it back in to keep editing — your changes are still here.');
      }
    };
    navigator.hid.addEventListener('connect', onConnect);
    navigator.hid.addEventListener('disconnect', onDisconnect);
    findAuthorizedPad().then((device) => device && !padRef.current && attach(new WebHidTransport(device)));
    return () => {
      navigator.hid.removeEventListener('connect', onConnect);
      navigator.hid.removeEventListener('disconnect', onDisconnect);
    };
  }, [attach, toast]);

  // --- editing ---------------------------------------------------------------

  const model = pad?.model ?? lastModel.current;
  // Compare against what we last saved, or the factory mapping if we never saved.
  const baseline = useMemo(() => saved ?? (model ? factoryProfile(model) : null), [saved, model]);
  const dirty = !!profile && !!baseline && !sameProfile(profile, baseline);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const updateAction = (index, next) =>
    setProfile((p) => {
      const actions = [...p.actions];
      actions[index] = typeof next === 'function' ? next(actions[index]) : next;
      return { ...p, actions };
    });

  const bytesUsed = useMemo(() => {
    if (!profile || model?.ble) return null;
    try {
      return usbKeyDataSize(profile.actions);
    } catch {
      return null;
    }
  }, [profile, model]);

  const flagged = useMemo(() => new Set(
    (profile?.actions ?? []).flatMap((a, i) => (editorProblems(a, model?.ble).length ? [i] : [])),
  ), [profile, model]);

  const packets = useMemo(() => {
    if (!profile || !model) return { list: [] };
    try {
      return { list: savePackets(model, profile.actions, profile.lighting) };
    } catch (err) {
      return { list: [], error: err.message };
    }
  }, [profile, model]);

  const overBudgetBy = bytesUsed !== null ? Math.max(0, bytesUsed - KEY_DATA_SIZE) : 0;
  const canSave = phase === 'ready' && !saving && !packets.error && flagged.size === 0;

  // --- actions -----------------------------------------------------------------

  const save = async () => {
    if (!canSave) return;
    setSaving({ done: 0, total: packets.list.length });
    try {
      await pad.client.sendPackets(packets.list, (done, total) => setSaving({ done, total }));
      const record = { ...clone(profile), savedAt: Date.now() };
      storeSaved(pad.key, record);
      setSaved(record);
      toast('success', pad.demo ? 'Demo: settings “saved” (nothing was sent).' : 'Saved to the keyboard. Try your keys!');
    } catch (err) {
      toast('error', `Saving failed: ${errorMessage(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const revert = () => setProfile(clone(baseline));

  const resetToFactory = () => {
    setProfile((p) => ({ ...p, actions: defaultActions(model) }));
    toast('info', 'Keys reset to the factory letters. Save to apply them.');
  };

  const doExport = () => {
    const url = URL.createObjectURL(exportProfile(profile, model));
    const a = Object.assign(document.createElement('a'), { href: url, download: `xfkey-${model.keyCount}-key-profile.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file) => {
    try {
      const { profile: imported, warnings } = importProfile(await file.text(), model);
      setProfile(imported);
      setSelected(0);
      toast(warnings.length ? 'info' : 'success', `Imported ${file.name}. ${warnings.join(' ')} Save to apply it.`);
    } catch (err) {
      toast('error', err.message);
    }
  };

  // --- render ------------------------------------------------------------------

  return html`
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><${Icon} name="keyboard" size=${20} /></span>
        <span>XFKEY Studio</span>
      </div>
      ${pad && html`
        <div class="topbar-device">
          <span class=${`status-dot ${pad.demo ? 'is-demo' : ''}`} aria-hidden="true"></span>
          <span>${pad.demo ? 'Demo' : 'Connected'} · ${model.name}</span>
          <button type="button" class="btn btn-sm btn-ghost" onClick=${disconnect}>Disconnect</button>
        </div>`}
    </header>

    <main id="main">
      ${phase === 'ready' && profile
        ? html`
          <${SaveBar} model=${model} pad=${pad} bytesUsed=${bytesUsed} dirty=${dirty} saved=${saved}
            saving=${saving} canSave=${canSave} blocked=${flagged.size > 0 || !!packets.error}
            onSave=${save} onRevert=${revert} />
          ${model.unknown && html`
            <p class="callout callout-warn" role="note">
              <${Icon} name="alert" size=${16} />
              <span>This pad reports an unknown model (${pad.info.keyCount} keys, variant ${pad.info.variant}). The layout is a guess and saving may not work.</span>
            </p>`}
          <section class="card pad-card" aria-labelledby="pad-title">
            <h2 id="pad-title" class="visually-hidden">Your pad</h2>
            <${PadView} model=${model} actions=${profile.actions} selected=${selected} onSelect=${setSelected} flagged=${flagged} />
            <p class="help center">Click a key to change what it does.</p>
          </section>
          <div class="workspace">
            <${KeyEditor} key=${selected} model=${model} slot=${selected} action=${profile.actions[selected]}
              onChange=${(next) => updateAction(selected, next)} overBudgetBy=${overBudgetBy} />
            <div class="sidebar">
              <${LightingCard} lighting=${profile.lighting} onChange=${(lighting) => setProfile((p) => ({ ...p, lighting }))} />
              <${KeyTester} />
              <${ProfileCard} onExport=${doExport} onImport=${doImport} onReset=${resetToFactory} packets=${packets} />
            </div>
          </div>`
        : html`<${Welcome} phase=${phase} error=${connectError} onConnect=${connect}
            onDemo=${() => attach(demoTransport(), true)} hasDraft=${dirty} />`}
    </main>

    <footer class="footer">
      <p>
        Unofficial configurator for XFKEY pads (USB 0xAF88:0x6688). Not affiliated with the manufacturer. ·
        <a href="https://github.com/patpakfai/xfkey-studio">Source code</a>
      </p>
    </footer>

    <${Toasts} toasts=${toasts} onDismiss=${dismiss} />`;
}

function SaveBar({ model, pad, bytesUsed, dirty, saved, saving, canSave, blocked, onSave, onRevert }) {
  const pct = bytesUsed === null ? 0 : Math.min(100, (bytesUsed / KEY_DATA_SIZE) * 100);
  const over = bytesUsed !== null && bytesUsed > KEY_DATA_SIZE;
  let status;
  if (saving) status = `Saving… ${saving.done}/${saving.total}`;
  else if (blocked) status = 'Fix the highlighted key to save';
  else if (!saved) status = 'Not saved from this browser yet';
  else if (dirty) status = 'Unsaved changes';
  else status = `Saved ${new Date(saved.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;

  return html`
    <div class="savebar" role="region" aria-label="Save">
      <div class="savebar-info">
        <strong>${model.name}</strong>
        <span class="muted">${model.ble ? 'Bluetooth protocol' : 'USB'}${pad.demo ? ' · demo' : ` · ID ${pad.info.chipId}`}</span>
      </div>
      ${bytesUsed !== null && html`
        <div class="meter" title="Memory used by key settings">
          <span class="meter-label">Memory</span>
          <span class="meter-track" role="meter" aria-valuemin="0" aria-valuemax=${KEY_DATA_SIZE} aria-valuenow=${bytesUsed}
            aria-label="Memory used">
            <span class=${`meter-fill ${over ? 'is-over' : pct > 85 ? 'is-high' : ''}`} style=${{ width: `${pct}%` }}></span>
          </span>
          <span class=${`meter-value ${over ? 'is-over' : ''}`}>${bytesUsed}/${KEY_DATA_SIZE} B</span>
        </div>`}
      <div class="savebar-actions">
        <span class=${`save-status ${blocked ? 'is-blocked' : dirty && saved ? 'is-dirty' : ''}`} aria-live="polite">${status}</span>
        ${dirty && html`<button type="button" class="btn btn-ghost" onClick=${onRevert} disabled=${!!saving}>
          <${Icon} name="undo" size=${16} /> ${saved ? 'Revert' : 'Reset'}
        </button>`}
        <button type="button" class="btn btn-primary" onClick=${onSave} disabled=${!canSave} aria-busy=${!!saving}>
          ${saving ? html`<span class="spinner" aria-hidden="true"></span>` : html`<${Icon} name="save" size=${16} />`}
          ${saving ? 'Saving…' : 'Save to keyboard'}
        </button>
      </div>
      ${saving && html`<span class="savebar-progress" style=${{ width: `${(saving.done / saving.total) * 100}%` }}></span>`}
    </div>`;
}

function Welcome({ phase, error, onConnect, onDemo, hasDraft }) {
  const supported = isWebHidAvailable();
  const secure = window.isSecureContext;

  return html`
    <section class="welcome">
      <div class="welcome-art" aria-hidden="true">
        <span class="mini-key">⌘C</span><span class="mini-key">⌘V</span>
      </div>
      <h1>Set up your macro pad</h1>
      <p class="lead">Remap keys, type text, control media and set the lights — right from Chrome on your Mac.</p>

      ${!supported || !secure ? html`
        <div class="callout callout-warn" role="alert">
          <${Icon} name="alert" size=${16} />
          <div>
            ${!secure
              ? html`<p>Open this page from <code>http://localhost</code> (run <code>npm start</code>), not as a file.</p>`
              : html`<p>This browser can't talk to USB keyboards. Use <strong>Google Chrome</strong>, Microsoft Edge, Brave, Arc or Opera — Safari and Firefox don't support WebHID.</p>`}
          </div>
        </div>` : html`
        <ol class="steps-list">
          <li>Plug the pad into your Mac with a USB cable.</li>
          <li>Click <strong>Connect</strong> and choose <strong>XFKEY</strong> in Chrome's list.</li>
          <li>Pick a key, change it, then <strong>Save to keyboard</strong>.</li>
        </ol>`}

      ${hasDraft && html`<p class="callout callout-info" role="status"><${Icon} name="plug" size=${16} />
        <span>Reconnect the pad to continue — your unsaved edits are kept.</span></p>`}

      ${error && html`<p class="callout callout-error" role="alert"><${Icon} name="alert" size=${16} /><span>${error}</span></p>`}

      <div class="button-row center">
        <button type="button" class="btn btn-primary btn-lg" onClick=${onConnect} disabled=${!supported || !secure || phase === 'connecting'}>
          ${phase === 'connecting' ? html`<span class="spinner" aria-hidden="true"></span> Connecting…` : html`<${Icon} name="plug" /> Connect`}
        </button>
        <button type="button" class="btn btn-lg btn-ghost" onClick=${onDemo}>Try the demo</button>
      </div>
      <p class="help center">Your settings are stored on the pad itself, so they work on any computer afterwards.</p>
    </section>`;
}
