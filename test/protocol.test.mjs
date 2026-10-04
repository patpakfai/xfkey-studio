import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PadClient } from '../src/client.js';
import { describeStep, MEDIA, stepsToText, textToSteps } from '../src/hid-usages.js';
import { defaultActions, modelFor } from '../src/models.js';
import {
  actionProblems, bleSavePackets, KEY_DATA_SIZE, Mod, padReport, parseInfo, ProtocolError,
  REPORT_SIZE, usbKeyDataSize, usbSavePackets,
} from '../src/protocol.js';
import { refBlePackets, refUsbPackets } from './reference.mjs';

// --- helpers -----------------------------------------------------------------

const combo = (mods, ...keys) => ({ mods, keys });
const keys = (press, release = null) => ({ type: 'keys', press, release });
const media = (usage) => ({ type: 'media', usage });
const macro = (steps, interval = 50, repeat = 1) => ({ type: 'macro', steps, interval, repeat });
const NONE = { type: 'none' };

/** Converts our action format into the vendor site's setList entry format. */
function toVendorEntry(action) {
  const comboEntries = (c) => !c ? [] : [
    ...[1, 2, 4, 8, 16, 32, 64, 128].filter((bit) => c.mods & bit).map((num) => ({ num, type: 'cb' })),
    ...c.keys.map((num) => ({ num, type: '' })),
  ];
  switch (action.type) {
    case 'none': return { type: 1, downKeys: [], upKeys: [] };
    case 'keys': return { type: 1, downKeys: comboEntries(action.press), upKeys: comboEntries(action.release) };
    case 'media': return { type: 2, downKeys: [{ num: ((action.usage & 0xff) << 8) | (action.usage >> 8) }] };
    case 'macro': return { type: 3, downKeys: action.steps.map((name) => ({ name })), time: action.interval, runNum: action.repeat };
    case 'special': return { type: 4, downKeys: [{ num: action.code }] };
  }
}

function assertUsbMatchesVendor(actions, lighting = { mode: 1, color: '#1e90ff' }) {
  const ours = usbSavePackets(actions, lighting).map((p) => Array.from(p));
  const theirs = refUsbPackets(actions.map(toVendorEntry), lighting.mode, lighting.color);
  assert.deepEqual(ours, theirs);
}

function assertBleMatchesVendor(actions, lighting = { mode: 1, color: '#1e90ff' }) {
  const ours = bleSavePackets(actions, lighting).map((p) => Array.from(p));
  const theirs = refBlePackets(actions.map(toVendorEntry), lighting.mode, lighting.color);
  assert.deepEqual(ours, theirs);
}

const CMD = Mod.LGUI;
const text = (s) => textToSteps(s).steps;

// --- USB encoding vs. the vendor site ----------------------------------------------

describe('USB packets match the vendor configurator byte for byte', () => {
  it('factory defaults (A, B)', () => assertUsbMatchesVendor(defaultActions(modelFor({ keyCount: 2, variant: 17 }))));

  it('Mac shortcuts on press', () => assertUsbMatchesVendor([
    keys(combo(CMD, 0x06)), // ⌘C
    keys(combo(Mod.LSHIFT | CMD, 0x21)), // ⇧⌘4
  ]));

  it('modifier-only, release-only and press+release combos', () => assertUsbMatchesVendor([
    keys(combo(Mod.LSHIFT)),
    keys(null, combo(Mod.LCTRL, 0x52)),
    keys(combo(Mod.LCTRL | Mod.LALT, 0x04, 0x05), combo(Mod.RGUI, 0x2c)),
    keys(combo(0, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09)),
  ]));

  it('no action', () => assertUsbMatchesVendor([NONE, keys(combo(0)), keys(null, null)]));

  it('every media key', () => {
    for (let i = 0; i < MEDIA.length; i += 4) assertUsbMatchesVendor(MEDIA.slice(i, i + 4).map((m) => media(m.usage)));
  });

  it('text macros, long delays, endless repeat and modifier steps', () => assertUsbMatchesVendor([
    macro(text('Hello, World!\n'), 50, 1),
    macro(text('~`|"'), 300, 0),
    macro([201, 0x06, 204, 0x19, 208], 65535, 255),
  ]));

  it('settings that straddle the 60-byte chunk boundaries', () => {
    const actions = [
      macro(text('The quick brown fox jumps over the lazy dog')),
      ...Array.from({ length: 11 }, (_, i) => keys(combo(i, 0x04 + i, 0x1e + i))),
    ];
    assert.ok(usbKeyDataSize(actions) > 100);
    assertUsbMatchesVendor(actions);
  });

  it('lighting modes and colours', () => {
    for (const [mode, color] of [[1, '#1e90ff'], [2, '#FF4500'], [6, '#000000'], [8, '#c71585']]) {
      assertUsbMatchesVendor([keys(combo(0, 0x04)), NONE], { mode, color });
    }
  });
});

describe('USB config block', () => {
  it('lays out key data, then mode + RGB in the last four bytes', () => {
    const [p1, p2, p3, commit] = usbSavePackets([keys(combo(CMD, 0x06)), media(0xcd)], { mode: 2, color: '#102030' });
    assert.deepEqual(p1.slice(0, 4 + 9), [0xaf, 0x02, 0, 60, 0, 1, CMD, 1, 0x06, 2, 0xcd, 0x00, 0]);
    assert.deepEqual(p2.slice(0, 4), [0xaf, 0x02, 60, 60]);
    assert.deepEqual(p3, [0xaf, 0x02, 120, 8, 0, 0, 0, 0, 2, 0x10, 0x20, 0x30]);
    assert.deepEqual(commit, [0xaf, 0x04]);
  });

  it('refuses settings that do not fit instead of corrupting the lighting bytes', () => {
    const actions = [macro(text('x'.repeat(KEY_DATA_SIZE - 5 - 4 + 1))), NONE];
    assert.equal(usbKeyDataSize(actions), KEY_DATA_SIZE + 1);
    assert.throws(() => usbSavePackets(actions, { mode: 1, color: '#ffffff' }), ProtocolError);
  });

  it('refuses invalid actions', () => {
    assert.throws(() => usbSavePackets([keys(combo(0, 1, 2, 3, 4, 5, 6, 7))], { mode: 1, color: '#ffffff' }), /at most 6 keys/);
    assert.throws(() => usbSavePackets([{ type: 'special', code: 6 }], { mode: 1, color: '#ffffff' }), /Bluetooth/);
    assert.throws(() => usbSavePackets([NONE], { mode: 1, color: 'blue' }), /colour/);
  });
});

// --- Bluetooth encoding vs. the vendor site --------------------------------------

describe('Bluetooth packets match the vendor configurator byte for byte', () => {
  it('shortcuts, media, special, none', () => assertBleMatchesVendor([
    keys(combo(CMD, 0x06)),
    media(0xe9),
    { type: 'special', code: 7 },
    NONE,
  ], { mode: 4, color: '#ff8c00' }));

  it('macros longer than one 32-step chunk', () => assertBleMatchesVendor([
    macro(text('This sentence is long enough to need three chunks of steps, ok?'), 120, 3),
  ]));

  it('rejects release combos, which Bluetooth models do not support', () => {
    assert.match(actionProblems(keys(null, combo(0, 4)), { ble: true }).join(), /only trigger on press/);
  });
});

// --- reports, info, client -----------------------------------------------------------

describe('reports', () => {
  it('pads requests to a full 64-byte report', () => {
    const report = padReport([0xaf, 0x01]);
    assert.equal(report.length, REPORT_SIZE);
    assert.deepEqual(Array.from(report.slice(0, 3)), [0xaf, 0x01, 0]);
    assert.throws(() => padReport(new Array(65).fill(0)), ProtocolError);
  });

  it('parses an INFO reply shaped like a real 2-key pad (ID bytes changed)', () => {
    const reply = Uint8Array.from([0xaf, 0x01, 0x02, 0x11, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, ...new Array(54).fill(0)]);
    const info = parseInfo(reply);
    assert.deepEqual(info, { keyCount: 2, variant: 17, chipId: '123456789abc' });
    assert.equal(modelFor(info).name, '2-Key Pad');
    assert.equal(modelFor(info).ble, false);
  });

  it('falls back to a generic layout for unknown models', () => {
    const m = modelFor({ keyCount: 8, variant: 99 });
    assert.equal(m.unknown, true);
    assert.deepEqual(m.rows, [[0, 1, 2, 3, 4, 5], [6, 7]]);
  });

  it('PadClient stops at the first rejected packet', async () => {
    const sent = [];
    const transport = {
      async request(bytes) {
        sent.push(bytes);
        return Uint8Array.from(sent.length === 2 ? [0x00, 0x02] : [0xaf, bytes[1]]);
      },
    };
    const client = new PadClient(transport);
    await assert.rejects(client.sendPackets([[0xaf, 2], [0xaf, 2], [0xaf, 4]]), /step 2 of 3/);
    assert.equal(sent.length, 2);
  });
});

// --- text <-> macro steps ------------------------------------------------------------

describe('text macros', () => {
  it('maps characters to keys, using +0x80 for shifted characters', () => {
    assert.deepEqual(text('aA1!'), [0x04, 0x84, 0x1e, 0x9e]);
    assert.deepEqual(text('\n\t '), [0x28, 0x2b, 0x2c]);
  });

  it('round-trips every typeable ASCII character', () => {
    const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
    const { steps, unsupported } = textToSteps(ascii);
    assert.deepEqual(unsupported, []);
    assert.equal(stepsToText(steps), ascii);
  });

  it('reports characters a keyboard cannot type', () => {
    assert.deepEqual(textToSteps('hi 你好 é').unsupported, ['你', '好', 'é']);
  });

  it('describes steps for display', () => {
    assert.deepEqual(describeStep(0x84), { kind: 'char', label: 'A', short: 'A' });
    assert.deepEqual(describeStep(0x28), { kind: 'key', label: 'Return', short: '↩' });
    assert.deepEqual(describeStep(204), { kind: 'mod', label: '⌘ Command', short: '⌘' });
    assert.deepEqual(describeStep(208), { kind: 'mod', label: 'Right ⌘ Command', short: 'R⌘' });
    assert.equal(stepsToText([204, 0x06]), null);
  });
});
