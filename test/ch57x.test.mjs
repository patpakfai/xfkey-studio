import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ch57xActionProblems, ch57xSavePackets, decodeRecord, encodeRecord, entryCount, expectedRecord, isCh57x3Record,
  parseIdentify, parseLayer, sameRecord, slotIds,
} from '../src/ch57x-protocol.js';
import { Ch57xClient } from '../src/client.js';
import { classifyDevice, CH57X, demoDevices, pickerFilters, XFKEY } from '../src/drivers.js';
import { textToSteps } from '../src/hid-usages.js';
import { ch57xModel } from '../src/models.js';
import { Mod, padReport } from '../src/protocol.js';
import { sanitizeAction } from '../src/storage.js';
import { Ch57xMockTransport } from '../src/transports.js';

const hex = (s) => s.trim().split(/\s+/).map((b) => parseInt(b, 16));
const shortcut = (mods, ...keys) => ({ type: 'keys', press: { mods, keys }, release: null });
const text = (s) => ({ type: 'macro', steps: textToSteps(s).steps, interval: 0, repeat: 1 });
/** A READ reply as the pad sends it: 64 bytes, report ID stripped. */
const reply = (s) => padReport(hex(s));

describe('CH57x records match captured bytes', () => {
  it('Shift+A on key 1, layer 1 (written to the 1-key pad, typed "A")', () => {
    assert.deepEqual(encodeRecord(1, 1, shortcut(Mod.LSHIFT, 0x04)), hex('fd 01 01 01 00 02 00 00 f2 00 00 04'));
  });

  it('Ctrl+Alt+Delete (vendor app capture in ch57x-keyboard-tool #153)', () => {
    assert.deepEqual(encodeRecord(1, 1, shortcut(Mod.LCTRL | Mod.LALT, 0x4c)),
      hex('fd 01 01 01 00 03 00 00 f1 00 00 f3 00 00 4c'));
  });

  it('media keys store the usage as two entries, low byte first', () => {
    assert.deepEqual(encodeRecord(2, 3, { type: 'media', usage: 0x0223 }), hex('fd 02 03 02 00 02 00 00 23 00 00 02'));
  });

  it('a key that does nothing is one empty entry', () => {
    assert.deepEqual(encodeRecord(1, 1, { type: 'none' }), hex('fd 01 01 01 00 01 00 00 00'));
  });

  it('a modifier-only shortcut ends with an empty key entry', () => {
    assert.deepEqual(encodeRecord(1, 1, shortcut(Mod.LGUI)), hex('fd 01 01 01 00 02 00 00 f4 00 00 00'));
  });

  it('text uses ⇧ entries for capitals and symbols, with the delay on each key', () => {
    const action = { ...text('Hi!'), interval: 0x0102 };
    assert.deepEqual(encodeRecord(1, 1, action),
      hex('fd 01 01 01 00 05 00 00 f2 01 02 0b 01 02 0c 00 00 f2 01 02 1e'));
    assert.equal(entryCount(action), 5);
  });

  it('every slot goes to all three layers, each followed by a commit', () => {
    const packets = ch57xSavePackets([1], [shortcut(0, 0x28)]);
    assert.deepEqual(packets, [
      hex('fd 01 01 01 00 01 00 00 28'), hex('fd fe ff'),
      hex('fd 01 02 01 00 01 00 00 28'), hex('fd fe ff'),
      hex('fd 01 03 01 00 01 00 00 28'), hex('fd fe ff'),
    ]);
  });

  it('knob slots start at 17, three per knob', () => {
    assert.deepEqual(slotIds(12, 2), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21, 22]);
    assert.deepEqual(slotIds(1, 0), [1]);
  });
});

describe('CH57x replies', () => {
  it('identify: the 1-key pad answers FB 01 00 0B', () => {
    assert.deepEqual(parseIdentify(reply('fb 01 00 0b')), { keys: 1, knobs: 0 });
    assert.throws(() => parseIdentify(reply('fa 01 00 0b')));
    assert.throws(() => parseIdentify(reply('fb 00 00 0b')));
    assert.throws(() => parseIdentify(reply('fb 30 00 0b')));
  });

  it('decodes the factory record (Return, byte 4 = 1) and rewrites it the same', () => {
    const record = reply('fa 01 01 01 01 01 00 00 28');
    assert.ok(isCh57x3Record(record));
    const action = decodeRecord(record);
    assert.deepEqual(action, shortcut(0, 0x28));
    assert.ok(sameRecord(record, expectedRecord(encodeRecord(1, 1, action))));
  });

  it('decodes shortcuts, text, media and empty keys', () => {
    assert.deepEqual(decodeRecord(reply('fa 01 01 01 00 02 00 00 f2 00 00 04')), shortcut(Mod.LSHIFT, 0x04));
    const typed = sanitizeAction(decodeRecord(reply('fa 01 01 01 00 05 00 00 f2 01 02 0b 01 02 0c 00 00 f2 01 02 1e')));
    assert.equal(typed.mode, 'text');
    assert.equal(typed.text, 'Hi!');
    assert.equal(typed.interval, 0x0102);
    assert.deepEqual(decodeRecord(reply('fa 02 01 02 00 02 00 00 cd 00 00 00')), { type: 'media', usage: 0xcd });
    assert.deepEqual(decodeRecord(reply('fa 01 01 01 00 01 00 00 00')), { type: 'none' });
  });

  it('keeps what it can’t edit byte for byte (a mouse binding from #153)', () => {
    const record = reply('fa 10 01 03 01 04 00 00 f1 00 00 00 00 00 00 00 00 00 00 00 01');
    assert.ok(isCh57x3Record(record));
    const action = decodeRecord(record);
    assert.equal(action.type, 'raw');
    assert.deepEqual(encodeRecord(0x10, 1, action), hex('fd 10 01 03 01 04 00 00 f1 00 00 00 00 00 00 00 00 00 00 00 01'));
  });

  it('keeps sequences with uneven delays as raw, so saving never changes them', () => {
    const action = decodeRecord(reply('fa 01 01 01 00 02 00 10 04 00 20 05'));
    assert.equal(action.type, 'raw');
  });

  it('refuses records laid out like other CH57x dialects (count at byte 9)', () => {
    const other = reply('fa 01 01 01 00 00 00 00 00 01 00 28');
    assert.equal(isCh57x3Record(other), false);
    assert.throws(() => parseLayer([other], [1], 1), /format/);
  });

  it('sorts a layer by slot and reports missing slots', () => {
    const a = reply('fa 02 01 01 00 01 00 00 05');
    const b = reply('fa 01 01 01 00 01 00 00 04');
    assert.deepEqual(parseLayer([a, b], [1, 2], 1), [b, a]);
    assert.throws(() => parseLayer([a], [1, 2], 1), /missing slot 1/);
  });
});

describe('CH57x limits', () => {
  it('flags what the pad cannot do', () => {
    assert.deepEqual(ch57xActionProblems(shortcut(Mod.LGUI, 0x06)), []);
    assert.match(ch57xActionProblems(shortcut(0, 0x04, 0x05))[0], /one key per shortcut/);
    assert.match(ch57xActionProblems({ ...shortcut(0, 0x04), release: { mods: 0, keys: [5] } })[0], /release/);
    assert.match(ch57xActionProblems({ ...text('abc'), repeat: 2 })[0], /repeat/);
    assert.match(ch57xActionProblems(text('ABCDEFGHIJ'))[0], /20 steps/);
    assert.deepEqual(ch57xActionProblems(text('abcdefghijklmnopqr')), []);
    assert.match(ch57xActionProblems({ type: 'special', code: 6 })[0], /can't/);
    assert.throws(() => ch57xSavePackets([1], [text('ABCDEFGHIJ')]), /Key 1/);
  });
});

describe('CH57x client against the demo pad', () => {
  it('identifies, reads, saves and verifies', async () => {
    const transport = new Ch57xMockTransport({ keys: 1, knobs: 0 });
    const client = new Ch57xClient(transport, { recordPauseMs: 0, commitPauseMs: 0 });
    assert.deepEqual(await client.identify(), { keys: 1, knobs: 0 });
    const [factory] = await client.readLayer(1, 0, [1], 1);
    assert.deepEqual(decodeRecord(factory), shortcut(0, 0x28));

    const packets = ch57xSavePackets([1], [shortcut(Mod.LGUI, 0x06)]);
    await client.sendPackets(packets);
    assert.deepEqual(await client.verify(1, 0, [1], packets), []);
    assert.deepEqual(decodeRecord((await client.readLayer(1, 0, [1], 3))[0]), shortcut(Mod.LGUI, 0x06));
  });

  it('verify reports a slot that reads back differently', async () => {
    const transport = new Ch57xMockTransport({ keys: 2, knobs: 0 });
    const client = new Ch57xClient(transport, { recordPauseMs: 0, commitPauseMs: 0 });
    const packets = ch57xSavePackets([1, 2], [shortcut(0, 0x06), shortcut(0, 0x07)]);
    await client.sendPackets(packets.slice(0, -2)); // layer 3, key 2 never arrives
    assert.deepEqual(await client.verify(2, 0, [1, 2], packets), [{ layer: 3, index: 1 }]);
  });

  it('a driver session saves and checks a profile', async () => {
    const [device] = demoDevices('ch57x-1');
    const session = await CH57X.connect(device.mockTransport, { demo: true });
    const loaded = await session.load();
    assert.equal(loaded.source, 'pad');
    assert.deepEqual(loaded.profile.actions, [shortcut(0, 0x28)]);
    const saved = await session.save({ actions: [text('ok')], lighting: null });
    assert.equal(saved.verified, true);
  });
});

describe('Device detection', () => {
  const device = (vendorId, productId, usagePage = 0xff00) => ({ vendorId, productId, collections: [{ usagePage }] });

  it('sends each pad to its driver, and only recognizes other CH57x versions', () => {
    assert.equal(classifyDevice(device(0xaf88, 0x6688)).driver, XFKEY);
    assert.equal(classifyDevice(device(0x514c, 0x8850)).driver, CH57X);
    assert.deepEqual(classifyDevice(device(0x1189, 0x8850)), { driver: null, family: 'CH57x' });
    assert.equal(classifyDevice(device(0x514c, 0x8850, 0x0001)), null);
    assert.equal(classifyDevice(device(0x046d, 0xc52b)), null);
  });

  it("Chrome's picker covers every family", () => {
    const ids = pickerFilters().map((f) => `${f.vendorId.toString(16)}:${f.productId.toString(16)}`);
    assert.ok(ids.includes('af88:6688') && ids.includes('514c:8850') && ids.includes('1189:8842'));
    assert.ok(pickerFilters().every((f) => f.usagePage === 0xff00));
  });

  it('the 1-key CH57x layout is the verified one', () => {
    const model = ch57xModel(1, 0);
    assert.equal(model.verified, true);
    assert.deepEqual(model.rows, [[0]]);
    assert.equal(ch57xModel(12, 2).verified, false);
    assert.deepEqual(ch57xModel(12, 2).rows.map((r) => r.length), [4, 4, 4, 3, 3]);
  });
});
