import { html, useCallback, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { classifyDevice, demoDevices, pickerFilters, transportFor, usbId } from './drivers.js';
import { defaultActions } from './models.js';
import { exportProfile, importProfile } from './storage.js';
import { authorizedDevices, isWebHidAvailable, requestDevice } from './transports.js';
import { Icon } from './icons.js';
import { DeviceList } from './components/device-list.js';
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
      return "The keyboard didn't answer. Unplug it, plug it back in, then try again.";
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

const demoParam = () => new URLSearchParams(location.search).get('demo');

/** Stable ids for list keys; HIDDevice objects have none of their own. */
const deviceIds = new WeakMap();
let nextDeviceId = 0;
const idFor = (device) => {
  if (!deviceIds.has(device)) deviceIds.set(device, `device-${nextDeviceId++}`);
  return deviceIds.get(device);
};

export function App() {
  const [candidates, setCandidates] = useState([]); // pads found, see DeviceList
  const [finding, setFinding] = useState(false);
  const [listError, setListError] = useState('');
  const [opening, setOpening] = useState(null); // id of the candidate being opened
  const [pad, setPad] = useState(null); // the open session, see drivers.js
  const [profile, setProfile] = useState(null); // { actions, lighting }
  const [baseline, setBaseline] = useState(null); // { profile, source, at, verified }: what the pad holds, as far as we know
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(null); // { done, total }
  const { toasts, push: toast, dismiss } = useToasts();
  const padRef = useRef(null);
  padRef.current = pad;
  // Edits survive an unplug/replug of the same pad, and a trip back to the list.
  const profileRef = useRef(null);
  profileRef.current = profile;
  const lastPadKey = useRef(null);
  const lastModel = useRef(null);
  const dirtyRef = useRef(false);
  /** Key of a pad that was unplugged while open; it reopens when it comes back. */
  const reopenKey = useRef(null);
  const probes = useRef(new Map()); // device -> promise of its identify run

  // --- finding pads ------------------------------------------------------------

  const upsert = useCallback((device, patch) => setCandidates((list) => {
    const i = list.findIndex((c) => c.device === device);
    if (i === -1) return [...list, { id: idFor(device), device, ...patch }];
    const next = [...list];
    next[i] = { ...next[i], ...patch };
    return next;
  }), []);

  const drop = useCallback((device) => setCandidates((list) => list.filter((c) => c.device !== device)), []);

  /** Identifies a device and adds it to the list. Resolves to its session's key, or null. */
  const probe = useCallback((device) => {
    const kind = classifyDevice(device);
    if (!kind) return Promise.resolve(null);
    const base = { driver: kind.driver, family: kind.family, usb: usbId(device), demo: !!device.demo, error: '' };
    if (!kind.driver) {
      upsert(device, { ...base, status: 'unsupported' });
      return Promise.resolve(null);
    }
    upsert(device, { ...base, status: 'checking' });
    const run = (async () => {
      const transport = transportFor(device, kind.driver);
      try {
        await transport.open();
        const session = await kind.driver.connect(transport, { demo: !!device.demo });
        upsert(device, { status: 'ready', model: session.model, support: session.support });
        return session.key;
      } catch (err) {
        upsert(device, { status: 'error', error: errorMessage(err) });
        return null;
      } finally {
        if (padRef.current?.transport !== transport) await transport.close().catch(() => {});
      }
    })();
    probes.current.set(device, run);
    return run;
  }, [upsert]);

  const find = async () => {
    setListError('');
    setFinding(true);
    try {
      const device = await requestDevice(pickerFilters());
      if (device) await probe(device);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setFinding(false);
    }
  };

  const forget = async (device) => {
    await device.forget?.().catch(() => {});
    drop(device);
  };

  // --- opening a pad -----------------------------------------------------------

  const openPad = useCallback(async (device) => {
    const kind = classifyDevice(device);
    if (!kind?.driver) return;
    await probes.current.get(device);
    setOpening(idFor(device));
    setListError('');
    const transport = transportFor(device, kind.driver);
    try {
      await transport.open();
      const session = await kind.driver.connect(transport, { demo: !!device.demo });
      const loaded = await session.load();
      const samePad = lastPadKey.current === session.key && profileRef.current;
      if (!samePad && dirtyRef.current
        // eslint-disable-next-line no-alert
        && !window.confirm('You have unsaved changes for another keyboard. Open this one and discard them?')) {
        await transport.close().catch(() => {});
        return;
      }
      lastPadKey.current = session.key;
      lastModel.current = session.model;
      reopenKey.current = null;
      setPad(session);
      setBaseline(loaded);
      if (!samePad) {
        setProfile(clone(loaded.profile));
        setSelected(0);
      }
    } catch (err) {
      await transport.close().catch(() => {});
      upsert(device, { status: 'error', error: errorMessage(err) });
    } finally {
      setOpening(null);
    }
  }, [upsert]);

  /** Back to the list. The draft stays, so reopening the same pad picks up where it left off. */
  const leavePad = async () => {
    const current = padRef.current;
    setPad(null);
    await current?.transport.close().catch(() => {});
  };

  useEffect(() => {
    const demo = demoParam();
    if (demo !== null) {
      demoDevices(demo).forEach(probe);
      return undefined;
    }
    if (!isWebHidAvailable()) return undefined;

    const onConnect = async ({ device }) => {
      const key = await probe(device);
      if (key && key === reopenKey.current && !padRef.current) openPad(device);
    };
    const onDisconnect = ({ device }) => {
      drop(device);
      if (padRef.current?.transport.device === device) {
        reopenKey.current = padRef.current.key;
        setPad(null);
        toast('info', 'Keyboard unplugged. Plug it back in to keep editing — your changes are still here.');
      }
    };
    navigator.hid.addEventListener('connect', onConnect);
    navigator.hid.addEventListener('disconnect', onDisconnect);
    authorizedDevices().then((devices) => devices.forEach(probe));
    return () => {
      navigator.hid.removeEventListener('connect', onConnect);
      navigator.hid.removeEventListener('disconnect', onDisconnect);
    };
  }, [probe, openPad, drop, toast]);

  const tryDemo = () => demoDevices().forEach(probe);

  // --- editing ---------------------------------------------------------------

  const model = pad?.model ?? lastModel.current;
  const dirty = !!profile && !!baseline && !sameProfile(profile, baseline.profile);
  dirtyRef.current = dirty;

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

  const memory = useMemo(() => (pad && profile ? pad.memory(profile) : null), [pad, profile]);

  const flagged = useMemo(() => new Set(
    (profile?.actions ?? []).flatMap((a, i) => (model && editorProblems(a, model).length ? [i] : [])),
  ), [profile, model]);

  const packets = useMemo(() => {
    if (!profile || !pad) return { list: [] };
    try {
      return { list: pad.packets(profile) };
    } catch (err) {
      return { list: [], error: err.message };
    }
  }, [profile, pad]);

  const overBudgetBy = memory ? Math.max(0, memory.used - memory.total) : 0;
  const canSave = !!pad && !saving && !packets.error && flagged.size === 0;

  // --- actions -----------------------------------------------------------------

  const save = async () => {
    if (!canSave) return;
    setSaving({ done: 0, total: packets.list.length });
    try {
      const next = await pad.save(profile, (done, total) => setSaving({ done, total }));
      setBaseline({ ...next, profile: clone(next.profile) });
      let message = 'Saved to the keyboard. Try your keys!';
      if (next.verified) message = 'Saved and checked — the keyboard holds these settings now. Try your keys!';
      if (pad.demo) message = 'Demo: saved to the simulated pad (nothing was sent).';
      toast('success', message);
    } catch (err) {
      toast('error', `Saving failed: ${errorMessage(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const revert = () => setProfile(clone(baseline.profile));

  const resetToFactory = () => {
    setProfile((p) => ({ ...p, actions: defaultActions(model) }));
    toast('info', 'Keys reset to the factory letters. Save to apply them.');
  };

  const reload = async () => {
    try {
      const loaded = await pad.load();
      setBaseline(loaded);
      setProfile(clone(loaded.profile));
      toast('info', 'Loaded the keys stored on the keyboard.');
    } catch (err) {
      toast('error', `Couldn't read the keyboard: ${errorMessage(err)}`);
    }
  };

  const doExport = () => {
    const url = URL.createObjectURL(exportProfile(profile, model));
    const name = `${model.family}-${model.keyCount}-key-profile.json`;
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
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

  const editing = !!pad && !!profile;

  return html`
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><${Icon} name="keyboard" size=${20} /></span>
        <span>XFKEY Studio</span>
      </div>
      ${pad && html`
        <div class="topbar-device">
          <span class=${`status-dot ${pad.demo ? 'is-demo' : ''}`} aria-hidden="true"></span>
          <span>${pad.demo ? 'Demo' : 'Connected'} · ${model.name} (${pad.driver.family})</span>
          <button type="button" class="btn btn-sm btn-ghost" onClick=${leavePad} disabled=${!!saving}>Switch keyboard</button>
        </div>`}
    </header>

    <main id="main">
      ${editing
        ? html`
          <${SaveBar} pad=${pad} memory=${memory} dirty=${dirty} baseline=${baseline}
            saving=${saving} canSave=${canSave} blocked=${flagged.size > 0 || !!packets.error}
            onSave=${save} onRevert=${revert} />
          ${pad.notice && html`
            <p class="callout callout-warn" role="note">
              <${Icon} name="alert" size=${16} />
              <span>${pad.notice}</span>
            </p>`}
          <section class="card pad-card" aria-labelledby="pad-title">
            <h2 id="pad-title" class="visually-hidden">Your pad</h2>
            <${PadView} model=${model} actions=${profile.actions} selected=${selected} onSelect=${setSelected} flagged=${flagged} />
            <p class="help center">Click a key to change what it does.</p>
          </section>
          <div class="workspace">
            <${KeyEditor} key=${`${pad.key}:${selected}`} model=${model} slot=${selected} action=${profile.actions[selected]}
              onChange=${(next) => updateAction(selected, next)} overBudgetBy=${overBudgetBy}
              steps=${pad.steps(profile.actions[selected])} />
            <div class="sidebar">
              ${model.caps.lighting && html`
                <${LightingCard} lighting=${profile.lighting} onChange=${(lighting) => setProfile((p) => ({ ...p, lighting }))} />`}
              <${KeyTester} />
              <${ProfileCard} onExport=${doExport} onImport=${doImport} packets=${packets}
                onReset=${model.caps.factoryReset ? resetToFactory : null} onReload=${model.caps.readBack ? reload : null} />
            </div>
          </div>`
        : html`<${Welcome} finding=${finding} error=${listError} candidates=${candidates} opening=${opening}
            onFind=${find} onDemo=${tryDemo} onOpen=${openPad} onRetry=${probe} onForget=${forget}
            hasDraft=${dirty} demo=${demoParam() !== null} />`}
    </main>

    <footer class="footer">
      <p>
        Unofficial configurator for XFKEY (USB AF88:6688) and CH57x (USB 514C:8850) macro pads. Not affiliated with
        the manufacturers. · <a href="https://github.com/patpakfai/xfkey-studio">Source code</a>
      </p>
    </footer>

    <${Toasts} toasts=${toasts} onDismiss=${dismiss} />`;
}

function savedStatus(baseline) {
  const when = baseline.at ? new Date(baseline.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  switch (baseline.source) {
    case 'factory': return 'Not saved from this browser yet';
    case 'pad': return baseline.verified ? `Saved and checked ${when}` : 'Matches the keyboard';
    default: return `Saved ${when}`;
  }
}

function SaveBar({ pad, memory, dirty, baseline, saving, canSave, blocked, onSave, onRevert }) {
  const pct = memory ? Math.min(100, (memory.used / memory.total) * 100) : 0;
  const over = !!memory && memory.used > memory.total;
  let status;
  if (saving) status = `Saving… ${saving.done}/${saving.total}`;
  else if (blocked) status = 'Fix the highlighted key to save';
  else if (dirty && baseline.source !== 'factory') status = 'Unsaved changes';
  else status = savedStatus(baseline);

  return html`
    <div class="savebar" role="region" aria-label="Save">
      <div class="savebar-info">
        <strong>${pad.model.name}</strong>
        <span class="muted">${pad.driver.family} · ${pad.details}${pad.demo ? ' · demo' : ` · ${pad.idLabel}`}</span>
      </div>
      ${memory && html`
        <div class="meter" title="Memory used by key settings">
          <span class="meter-label">Memory</span>
          <span class="meter-track" role="meter" aria-valuemin="0" aria-valuemax=${memory.total} aria-valuenow=${memory.used}
            aria-label="Memory used">
            <span class=${`meter-fill ${over ? 'is-over' : pct > 85 ? 'is-high' : ''}`} style=${{ width: `${pct}%` }}></span>
          </span>
          <span class=${`meter-value ${over ? 'is-over' : ''}`}>${memory.used}/${memory.total} B</span>
        </div>`}
      <div class="savebar-actions">
        <span class=${`save-status ${blocked ? 'is-blocked' : dirty && baseline.source !== 'factory' ? 'is-dirty' : ''}`}
          aria-live="polite">${status}</span>
        ${dirty && html`<button type="button" class="btn btn-ghost" onClick=${onRevert} disabled=${!!saving}>
          <${Icon} name="undo" size=${16} /> ${baseline.source === 'factory' ? 'Reset' : 'Revert'}
        </button>`}
        <button type="button" class="btn btn-primary" onClick=${onSave} disabled=${!canSave} aria-busy=${!!saving}>
          ${saving ? html`<span class="spinner" aria-hidden="true"></span>` : html`<${Icon} name="save" size=${16} />`}
          ${saving ? 'Saving…' : 'Save to keyboard'}
        </button>
      </div>
      ${saving && html`<span class="savebar-progress" style=${{ width: `${(saving.done / saving.total) * 100}%` }}></span>`}
    </div>`;
}

function Welcome({ finding, error, candidates, opening, onFind, onDemo, onOpen, onRetry, onForget, hasDraft, demo }) {
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
        </div>` : null}

      ${hasDraft && html`<p class="callout callout-info" role="status"><${Icon} name="plug" size=${16} />
        <span>Open your keyboard again to continue — your unsaved edits are kept.</span></p>`}

      ${error && html`<p class="callout callout-error" role="alert"><${Icon} name="alert" size=${16} /><span>${error}</span></p>`}

      <${DeviceList} candidates=${candidates} opening=${opening} onOpen=${onOpen} onRetry=${onRetry} onForget=${onForget} />

      <div class="button-row center">
        <button type="button" class=${`btn btn-lg ${candidates.length ? '' : 'btn-primary'}`} onClick=${onFind}
          disabled=${!supported || !secure || finding}>
          ${finding
            ? html`<span class="spinner" aria-hidden="true"></span> Waiting for Chrome…`
            : html`<${Icon} name="search" /> ${candidates.some((c) => !c.demo) ? 'Find another keyboard' : 'Find my keyboard'}`}
        </button>
        ${!demo && !candidates.some((c) => c.demo) && html`
          <button type="button" class="btn btn-lg btn-ghost" onClick=${onDemo}>Try the demo</button>`}
      </div>

      <ol class="steps-list">
        <li>Plug the pad into your computer with a USB cable.</li>
        <li>Click <strong>Find my keyboard</strong> and pick it in Chrome's list. XFKEY pads are listed
          as <strong>XFKEY</strong>; CH57x pads as <strong>USB Composite Device</strong>.</li>
        <li>Click <strong>Customize</strong> next to your keyboard, change its keys, then <strong>Save to keyboard</strong>.</li>
      </ol>

      <details class="advanced trouble">
        <summary>Keyboard not in Chrome's list?</summary>
        <ul>
          <li>Use a USB-A to USB-C cable if you can — many small pads don't power up on a USB-C to USB-C cable.</li>
          <li>Quit the pad maker's own app; it can keep the pad busy.</li>
          <li>Bluetooth pads must be plugged in with a cable to change their keys.</li>
          <li>Supported: XFKEY (USB AF88:6688) and CH57x (USB 514C:8850). Other CH57x versions are listed
            as “Not supported yet”.</li>
        </ul>
      </details>

      <p class="help center">Your settings are stored on the pad itself, so they work on any computer afterwards.</p>
    </section>`;
}
