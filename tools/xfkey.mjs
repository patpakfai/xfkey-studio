#!/usr/bin/env node
// Command-line companion to XFKEY Studio, using node-hid instead of WebHID.
// Shares the drivers and protocol code with the website.
//
//   npm install            (installs the optional node-hid dependency)
//   node tools/xfkey.mjs info
//   node tools/xfkey.mjs read                     print the keys stored on a CH57x pad as a profile
//   node tools/xfkey.mjs bytes <profile.json>    print what `save` would send (no pad needed)
//   node tools/xfkey.mjs save  <profile.json>    write a profile exported from the website

import { readFile } from 'node:fs/promises';
import { ch57xSavePackets } from '../src/ch57x-protocol.js';
import { classifyDevice } from '../src/drivers.js';
import { ch57xModel, modelFor } from '../src/models.js';
import { padReport, savePackets, toHex } from '../src/protocol.js';
import { exportProfile, importProfile } from '../src/storage.js';

const TIMEOUT_MS = 1500;
const QUIET_MS = 300;
const verbose = process.argv.includes('--verbose');
const [command, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** The same transport interface as the browser's WebHidTransport, over node-hid. */
function nodeTransport(device, reportId) {
  const write = (bytes) => {
    if (verbose) console.log('->', toHex(bytes, ' '));
    device.write([reportId, ...padReport(bytes)]); // a leading 0 means "no report ID"
  };
  const read = (ms) => {
    const reply = device.readTimeout(ms);
    if (!reply.length) return null;
    // hidapi puts the report ID in front of numbered reports; WebHID doesn't.
    const data = Uint8Array.from(reportId ? reply.slice(1) : reply);
    if (verbose) console.log('<-', toHex(data.slice(0, 24), ' '));
    return data;
  };
  return {
    async open() {},
    async close() {},
    async request(bytes) {
      write(bytes);
      const reply = read(TIMEOUT_MS);
      if (!reply) throw new Error("The keyboard didn't answer.");
      return reply;
    },
    async collect(bytes, count) {
      write(bytes);
      const replies = [];
      for (let reply = read(TIMEOUT_MS); reply; reply = replies.length < count ? read(QUIET_MS) : null) replies.push(reply);
      if (!replies.length) throw new Error("The keyboard didn't answer.");
      return replies;
    },
    async send(bytes) {
      write(bytes);
    },
  };
}

async function openPad() {
  let HID;
  try {
    HID = (await import('node-hid')).default;
  } catch {
    throw new Error('node-hid is not installed. Run `npm install` in this folder first.');
  }
  for (const info of HID.devices()) {
    const driver = classifyDevice({ ...info, collections: [{ usagePage: info.usagePage }] })?.driver;
    if (!driver) continue;
    const device = new HID.HID(info.path);
    const transport = nodeTransport(device, driver.reportId);
    try {
      return { session: await driver.connect(transport), close: () => device.close() };
    } catch (err) {
      device.close();
      throw err;
    }
  }
  throw new Error('No supported pad found. Is it plugged in?');
}

async function loadProfile(path, model) {
  if (!path) throw new Error('Give the path of a profile exported from XFKEY Studio.');
  const text = await readFile(path, 'utf8');
  // Without a pad, trust the model recorded in the file.
  const recorded = JSON.parse(text).model ?? {};
  const target = model ?? (recorded.family === 'ch57x' ? ch57xModel(recorded.keyCount, recorded.knobCount ?? 0) : modelFor(recorded));
  const { profile, warnings } = importProfile(text, target);
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  return { profile, model: target };
}

const packetsFor = (model, profile) =>
  (model.family === 'ch57x' ? ch57xSavePackets(model.slotIds, profile.actions) : savePackets(model, profile.actions, profile.lighting));

async function main() {
  if (!['info', 'read', 'bytes', 'save'].includes(command)) {
    console.log('Usage: node tools/xfkey.mjs <info | read | bytes <profile.json> | save <profile.json>> [--verbose]');
    process.exitCode = command ? 1 : 0;
    return;
  }
  if (command === 'bytes') {
    const { profile, model } = await loadProfile(file, null);
    packetsFor(model, profile).forEach((p) => console.log(toHex(p, ' ')));
    return;
  }

  const pad = await openPad();
  try {
    const { session } = pad;
    const { model } = session;
    console.log(`${session.driver.family} ${model.name}${model.unknown ? ' (unknown model)' : ''} — ${session.details}, ${session.idLabel}` +
      `${session.support === 'experimental' ? ' (experimental)' : ''}`);
    if (command === 'info') return;

    if (command === 'read') {
      if (!model.caps.readBack) throw new Error("This pad can't report its settings.");
      const { profile } = await session.load();
      process.stdout.write(await exportProfile(profile, model).text());
      return;
    }

    const { profile } = await loadProfile(file, model);
    const saved = await session.save(profile, (done, total) => process.stdout.write(`\rSaving ${done}/${total}`));
    console.log(saved.verified ? '\nSaved and read back: the pad holds this profile.' : '\nSaved.');
  } finally {
    pad.close();
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
