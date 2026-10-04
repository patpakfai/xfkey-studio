#!/usr/bin/env node
// Command-line companion to XFKEY Studio, using node-hid instead of WebHID.
// Shares the protocol code with the website.
//
//   npm install            (installs the optional node-hid dependency)
//   node tools/xfkey.mjs info
//   node tools/xfkey.mjs bytes <profile.json>    print what `save` would send (no pad needed)
//   node tools/xfkey.mjs save  <profile.json>    write a profile exported from the website

import { readFile } from 'node:fs/promises';
import { PadClient } from '../src/client.js';
import { modelFor } from '../src/models.js';
import { CONFIG_USAGE_PAGE, padReport, PRODUCT_ID, savePackets, toHex, VENDOR_ID } from '../src/protocol.js';
import { importProfile } from '../src/storage.js';

const TIMEOUT_MS = 1500;
const verbose = process.argv.includes('--verbose');
const [command, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

async function openPad() {
  let HID;
  try {
    HID = (await import('node-hid')).default;
  } catch {
    throw new Error('node-hid is not installed. Run `npm install` in this folder first.');
  }
  const info = HID.devices(VENDOR_ID, PRODUCT_ID).find((d) => d.usagePage === CONFIG_USAGE_PAGE);
  if (!info) throw new Error('No XFKEY pad found. Is it plugged in?');
  const device = new HID.HID(info.path);
  const transport = {
    async request(bytes) {
      if (verbose) console.log('->', toHex(bytes, ' '));
      device.write([0x00, ...padReport(bytes)]); // leading 0 = no report ID
      const reply = device.readTimeout(TIMEOUT_MS);
      if (!reply.length) throw new Error("The keyboard didn't answer.");
      if (verbose) console.log('<-', toHex(reply.slice(0, 16), ' '));
      return Uint8Array.from(reply);
    },
  };
  return { client: new PadClient(transport), close: () => device.close() };
}

async function loadProfile(path, model) {
  if (!path) throw new Error('Give the path of a profile exported from XFKEY Studio.');
  const text = await readFile(path, 'utf8');
  // Without a pad, trust the model recorded in the file.
  const target = model ?? modelFor(JSON.parse(text).model ?? {});
  const { profile, warnings } = importProfile(text, target);
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  return { profile, model: target };
}

async function main() {
  if (!['info', 'bytes', 'save'].includes(command)) {
    console.log('Usage: node tools/xfkey.mjs <info | bytes <profile.json> | save <profile.json>> [--verbose]');
    process.exitCode = command ? 1 : 0;
    return;
  }
  if (command === 'bytes') {
    const { profile, model } = await loadProfile(file, null);
    savePackets(model, profile.actions, profile.lighting).forEach((p) => console.log(toHex(p, ' ')));
    return;
  }

  const pad = await openPad();
  try {
    const info = await pad.client.info();
    const model = modelFor(info);
    console.log(`${model.name}${model.unknown ? ' (unknown model)' : ''} — ${info.keyCount} keys, variant ${info.variant}, ` +
      `${model.ble ? 'Bluetooth' : 'USB'} protocol, ID ${info.chipId}`);
    if (command === 'info') return;

    const { profile } = await loadProfile(file, model);
    const packets = savePackets(model, profile.actions, profile.lighting);
    await pad.client.sendPackets(packets, (done, total) => process.stdout.write(`\rSaving ${done}/${total}`));
    console.log('\nSaved.');
  } finally {
    pad.close();
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
