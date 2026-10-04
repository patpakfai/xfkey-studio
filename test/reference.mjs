// Port of the vendor configurator's encoders (xuanfang.co/xfp-web,
// assets/js/app.8e792937.js, component "MainIndex"), kept as close to the
// original as possible -- including its float maths -- so our encoder can be
// checked byte for byte against what the official site sends.
//
// Input is the vendor's own "setList" entry format:
//   { type: 1, downKeys: [{ num, type: 'cb' | '' }], upKeys: [...] }   keys / shortcut
//   { type: 2, downKeys: [{ num }] }                                   media (num = lo << 8 | hi)
//   { type: 3, downKeys: [{ name }], time, runNum }                    multi-key sequence
//   { type: 4, downKeys: [{ num }] }                                   special (Bluetooth)

const sunCbNum = (e) => e.reduce((e, t) => e + t, 0);

function olorRgb(e) {
  const s = e.toLowerCase();
  const n = [];
  for (let i = 1; i < 7; i += 2) n.push(parseInt('0x' + s.slice(i, i + 2)));
  return n;
}

// --- USB ---------------------------------------------------------------------

function getCommonKeyValue(e) {
  const s = e.downKeys.length;
  const i = e.upKeys.length;
  let n = 1;
  if (s < 1 && i > 0) n = 2;
  if (s > 0 && i > 0) n = 3;
  if (s > 0 && i < 1) n = 1;
  if (s < 1 && i < 1) n = 0;
  const a = [], o = [];
  e.downKeys.forEach((k) => ('cb' == k.type ? a.push(k.num) : o.push(k.num)));
  const r = [], l = [];
  e.upKeys.forEach((k) => ('cb' == k.type ? r.push(k.num) : l.push(k.num)));
  let c = [];
  if (n === 0) c = [0, 0, 0, 0];
  if (n === 1) c = [0, n, sunCbNum(a), o.length].concat(o);
  if (n === 2) c = [0, n, sunCbNum(r), l.length].concat(l);
  if (n === 3) c = [0, n, sunCbNum(a), o.length].concat(o).concat([sunCbNum(r), l.length].concat(l));
  return c;
}

function getMediaKeyValue(e) {
  const t = e.downKeys[0].num;
  return [2, t / 256, t % 256];
}

function getDjhyKeyValue(e) {
  const n = [3, e.time / 256, e.time % 256, e.runNum, e.downKeys.length];
  return n.concat(e.downKeys.map((k) => k.name));
}

function getKeysNum(e) {
  return 1 == e.type ? getCommonKeyValue(e) : 2 == e.type ? getMediaKeyValue(e) : 3 == e.type ? getDjhyKeyValue(e) : undefined;
}

/** saveSetToKeyboard + saveSet: the four reports the site sends to a USB pad. */
export function refUsbPackets(setList, lightMode, color) {
  const saveDataList = new Array(128).fill(0);
  let t = [];
  setList.forEach((s) => (t = t.concat(getKeysNum(s))));
  const s = olorRgb(color);
  t.forEach((v, i) => (saveDataList[i] = v));
  saveDataList[124] = lightMode;
  saveDataList[125] = s[0];
  saveDataList[126] = s[1];
  saveDataList[127] = s[2];
  const n = [175, 2, 0, 60], a = [175, 2, 60, 60], o = [175, 2, 120, 8];
  for (let r = 0; r < 128; r++) {
    if (r < 60) n.push(saveDataList[r]);
    if (r > 59 && r < 120) a.push(saveDataList[r]);
    if (r > 119) o.push(saveDataList[r]);
  }
  // The site wraps each packet in a Uint8Array before sendReport().
  return [n, a, o, [175, 4]].map((p) => Array.from(new Uint8Array(p)));
}

// --- Bluetooth -----------------------------------------------------------------

function buildConfigBuf(e) {
  const t = new Array(15).fill(0);
  for (const s of e) {
    const n = (s >> 3) << 3;
    t[s >> 3] |= 1 << (s - n) % 8;
  }
  return t;
}

function buildPackets(e, t, s = 32) {
  const i = [];
  for (let a = 0; a < t.length; a += s) {
    const n = t.slice(a, a + s);
    i.push([175, 2, e, a, n.length, ...n]);
  }
  return i;
}

function getCommonKeyValueBLE(e, t) {
  const s = [], i = [];
  e.downKeys.forEach((k) => ('cb' == k.type ? s.push(k.num) : i.push(k.num)));
  return [[175, 9, t, sunCbNum(s), 0, 0, 0, 0], [175, 2, t, 0, 15].concat(buildConfigBuf(i)), [175, 4, t, 0, 1, 1]];
}

function getMediaKeyValueBLE(e, t) {
  const i = e.downKeys[0].num;
  return [[175, 9, t, 2, 0, 0, 0, 0], [175, 2, t, 0, 2, i / 256, i % 256], [175, 4, t, 2, 2, 1]];
}

function getSpecialKeyValueBLE(e, t) {
  return [[175, 9, t, 0, 0, 0, 0, 0], [175, 2, t, 0, 1, e.downKeys[0].num], [175, 4, t, 4, 1, 1]];
}

function getDjhyKeyValueBLE(e, t) {
  const a = e.downKeys.map((k) => k.name);
  const l = [[175, 9, t, 0, 0, 0, e.time / 256, e.time % 256]].concat(buildPackets(t, a));
  l.push([175, 4, t, 3, a.length, e.runNum]);
  return l;
}

function getKeysNumBLE(e, t) {
  return 1 == e.type ? getCommonKeyValueBLE(e, t) : 2 == e.type ? getMediaKeyValueBLE(e, t)
    : 3 == e.type ? getDjhyKeyValueBLE(e, t) : 4 == e.type ? getSpecialKeyValueBLE(e, t) : undefined;
}

/** saveSetToBLEKeyboard + saveSetBLE. */
export function refBlePackets(setList, lightMode, color) {
  const t = [175, 13, 0, 1, 255, 255, 255, 0];
  const s = olorRgb(color);
  t[3] = lightMode;
  t[4] = s[0];
  t[5] = s[1];
  t[6] = s[2];
  let i = [t];
  setList.forEach((entry, idx) => (i = i.concat(getKeysNumBLE(entry, idx + 1))));
  return i.map((p) => Array.from(new Uint8Array(p)));
}
