// The pad families this site can talk to. A driver knows its USB ids and how to
// identify a pad; `connect()` returns a session that loads, checks and saves
// that pad's keys. The app only talks to sessions, never to a protocol.

import { Ch57xClient, PadClient } from './client.js';
import {
  CH57X_PRODUCT_ID, CH57X_REPORT_ID, CH57X_USAGE_PAGE, CH57X_VENDOR_ID, ch57xSavePackets, decodeRecord, entryCount,
  LAYERS, MAX_ENTRIES,
} from './ch57x-protocol.js';
import { actionProblemsFor, ch57xModel, DEFAULT_LIGHTING, defaultActions, modelFor } from './models.js';
import { CONFIG_USAGE_PAGE, KEY_DATA_SIZE, PRODUCT_ID, savePackets, usbKeyDataSize, VENDOR_ID } from './protocol.js';
import { deviceKey, loadSaved, sanitizeAction, storeSaved } from './storage.js';
import { Ch57xMockTransport, MockTransport, WebHidTransport } from './transports.js';

const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
export const usbId = (device) => `${hex4(device.vendorId)}:${hex4(device.productId)}`;

const hasCollection = (device, usagePage) => (device.collections ?? []).some((c) => c.usagePage === usagePage);
const sameIds = (device, filter) => device.vendorId === filter.vendorId && device.productId === filter.productId;

export const factoryProfile = (model) => ({ actions: defaultActions(model), lighting: { ...DEFAULT_LIGHTING } });

/**
 * A session:
 *   model, key (identifies the pad across reconnects), details, idLabel,
 *   support: 'supported' | 'experimental', notice (shown above the editor),
 *   load() -> { profile, source: 'pad' | 'browser' | 'factory', at, verified }
 *   packets(profile), save(profile, onProgress) -> the new baseline,
 *   problems(action), memory(profile) -> { used, total } | null,
 *   steps(action) -> { used, total } | null
 */

export const XFKEY = {
  id: 'xfkey',
  family: 'XFKEY',
  filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID, usagePage: CONFIG_USAGE_PAGE }],
  reportId: 0,
  matches(device) {
    return sameIds(device, this.filters[0]) && hasCollection(device, CONFIG_USAGE_PAGE);
  },
  transport: (device) => new WebHidTransport(device, { reportId: XFKEY.reportId }),

  async connect(transport, { demo = false } = {}) {
    const client = new PadClient(transport);
    const info = await client.info();
    const model = modelFor(info);
    const key = demo ? `demo-${info.keyCount}-${info.variant}` : deviceKey(info);
    const packets = (profile) => savePackets(model, profile.actions, profile.lighting);
    return {
      driver: XFKEY,
      transport,
      model,
      key,
      demo,
      details: model.ble ? 'Bluetooth protocol' : 'USB',
      idLabel: `ID ${info.chipId}`,
      support: model.unknown ? 'experimental' : 'supported',
      notice: model.unknown
        ? `This pad reports an unknown model (${info.keyCount} keys, variant ${info.variant}). The layout is a guess and saving may not work.`
        : null,
      // The pad can't report its settings: start from what this browser last saved.
      async load() {
        const stored = loadSaved(key, model);
        return stored
          ? { profile: { actions: stored.actions, lighting: stored.lighting }, source: 'browser', at: stored.savedAt, verified: false }
          : { profile: factoryProfile(model), source: 'factory', at: null, verified: false };
      },
      packets,
      async save(profile, onProgress) {
        await client.sendPackets(packets(profile), onProgress);
        const at = Date.now();
        storeSaved(key, { ...profile, savedAt: at });
        return { profile, source: 'browser', at, verified: false };
      },
      problems: (action) => actionProblemsFor(model, action),
      memory(profile) {
        if (model.ble) return null;
        try {
          return { used: usbKeyDataSize(profile.actions), total: KEY_DATA_SIZE };
        } catch {
          return null;
        }
      },
      steps: () => null,
    };
  },
};

export const CH57X = {
  id: 'ch57x',
  family: 'CH57x',
  filters: [{ vendorId: CH57X_VENDOR_ID, productId: CH57X_PRODUCT_ID, usagePage: CH57X_USAGE_PAGE }],
  reportId: CH57X_REPORT_ID,
  matches(device) {
    return sameIds(device, this.filters[0]) && hasCollection(device, CH57X_USAGE_PAGE);
  },
  transport: (device) => new WebHidTransport(device, { reportId: CH57X.reportId }),

  async connect(transport, { demo = false } = {}) {
    const client = new Ch57xClient(transport);
    const { keys, knobs } = await client.identify();
    const model = ch57xModel(keys, knobs);
    const ids = model.slotIds;
    const packets = (profile) => ch57xSavePackets(ids, profile.actions);
    return {
      driver: CH57X,
      transport,
      model,
      key: `${demo ? 'demo-' : ''}ch57x-${keys}-${knobs}`,
      demo,
      details: `USB ${hex4(CH57X_VENDOR_ID)}:${hex4(CH57X_PRODUCT_ID)}`,
      idLabel: 'reads back',
      support: model.verified ? 'supported' : 'experimental',
      notice: model.verified
        ? null
        : "Experimental: this layout hasn't been tested on a real pad yet. Each save is read back and checked.",
      // Layer 1 is the one the pad uses; saving writes every layer the same.
      // Reading also checks the pad stores keys in this format before anything is written.
      async load() {
        const records = await client.readLayer(keys, knobs, ids, 1);
        const actions = records.map((record) => sanitizeAction(decodeRecord(record)));
        return { profile: { actions, lighting: null }, source: 'pad', at: Date.now(), verified: false };
      },
      packets,
      async save(profile, onProgress) {
        const list = packets(profile);
        const total = list.length + LAYERS;
        await client.sendPackets(list, (done) => onProgress?.(done, total));
        const mismatches = await client.verify(keys, knobs, ids, list);
        onProgress?.(total, total);
        if (mismatches.length) {
          const { layer, index } = mismatches[0];
          throw new Error(`The keyboard took the save, but ${model.slotNames[index]} on layer ${layer} reads back differently. Try saving again.`);
        }
        return { profile, source: 'pad', at: Date.now(), verified: true };
      },
      problems: (action) => actionProblemsFor(model, action),
      memory: () => null,
      steps: (action) => ({ used: entryCount(action), total: MAX_ENTRIES }),
    };
  },
};

export const DRIVERS = [XFKEY, CH57X];

/**
 * CH57x pads that speak other protocol versions. Chrome's list shows them so
 * people can see their pad was found, but nothing is ever sent to them.
 * 1189:8850 is not the same pad as 514C:8850.
 */
const RECOGNIZED = [
  [0x1189, 0x8840], [0x1189, 0x8842], [0x1189, 0x8850], [0x1189, 0x8851], [0x1189, 0x8890], [0x514c, 0x8851],
].map(([vendorId, productId]) => ({ vendorId, productId, usagePage: 0xff00 }));

/** One filter list for Chrome's picker, covering every pad we can show. */
export const pickerFilters = () => [...DRIVERS.flatMap((d) => d.filters), ...RECOGNIZED];

/** { driver, family } for a pad we support, { family } for one we only recognize, or null. */
export function classifyDevice(device) {
  const driver = DRIVERS.find((d) => d.matches(device));
  if (driver) return { driver, family: driver.family };
  if (RECOGNIZED.some((f) => sameIds(device, f)) && hasCollection(device, 0xff00)) return { driver: null, family: 'CH57x' };
  return null;
}

/** Demo pads stand in for real devices; each keeps one simulated pad across opens. */
export const transportFor = (device, driver) => device.mockTransport ?? driver.transport(device);

/**
 * Simulated devices from ?demo=<list>: "2-17" is an XFKEY with 2 keys and
 * variant 17, "ch57x-1" a 1-key CH57x pad ("ch57x-12-2" adds 2 knobs), and
 * "ch57x-other" a CH57x pad in a protocol version we don't support.
 */
export function demoDevices(spec) {
  const tokens = (spec || '2-17,ch57x-1').split(',').map((t) => t.trim()).filter(Boolean);
  return tokens.flatMap((token) => {
    const ch = /^ch57x-(\d+)(?:-(\d+))?$/.exec(token);
    if (ch) {
      const [keys, knobs] = [Number(ch[1]), Number(ch[2] ?? 0)];
      return [{
        demo: true, productName: 'USB Composite Device', vendorId: CH57X_VENDOR_ID, productId: CH57X_PRODUCT_ID,
        collections: [{ usagePage: CH57X_USAGE_PAGE }], mockTransport: new Ch57xMockTransport({ keys, knobs }),
      }];
    }
    if (token === 'ch57x-other') {
      return [{ demo: true, productName: 'USB Composite Device', vendorId: 0x1189, productId: 0x8842, collections: [{ usagePage: 0xff00 }] }];
    }
    const [keyCount, variant] = token.split('-').map(Number);
    if (!keyCount) return [];
    return [{
      demo: true, productName: 'XFKEY', vendorId: VENDOR_ID, productId: PRODUCT_ID,
      collections: [{ usagePage: CONFIG_USAGE_PAGE }], mockTransport: new MockTransport({ keyCount, variant: variant || 17 }),
    }];
  });
}
