// Profiles: what we last wrote to each pad (the pad can't report its own
// settings), plus JSON export/import.

import { stepsToText } from './hid-usages.js';
import { actionProblems, LightMode, MAX_COMBO_KEYS } from './protocol.js';
import { slotCount } from './models.js';

const PREFIX = 'xfkey-studio:v1:';
const FILE_FORMAT = 'xfkey-studio-profile';

export const deviceKey = (info) => `${info.keyCount}-${info.variant}-${info.chipId}`;

/** localStorage can throw (private mode, blocked storage); treat that as "nothing saved". */
function readJson(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSaved(key, model) {
  const record = readJson(`saved:${key}`);
  if (!record) return null;
  try {
    return { ...sanitizeProfile(record, model), savedAt: record.savedAt ?? null };
  } catch {
    return null;
  }
}

/** `record` is { actions, lighting, savedAt }. */
export const storeSaved = (key, record) => writeJson(`saved:${key}`, record);

// ---------------------------------------------------------------------------
// Validation, shared by localStorage records and imported files
// ---------------------------------------------------------------------------

const toInt = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);

function sanitizeCombo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = Array.isArray(raw.keys) ? raw.keys.filter((k) => Number.isInteger(k) && k > 0 && k < 256) : [];
  return { mods: toInt(raw.mods, 0, 255, 0), keys: keys.slice(0, MAX_COMBO_KEYS) };
}

export function sanitizeAction(raw) {
  switch (raw?.type) {
    case 'keys':
      return { type: 'keys', press: sanitizeCombo(raw.press) ?? { mods: 0, keys: [] }, release: sanitizeCombo(raw.release) };
    case 'media':
      return { type: 'media', usage: toInt(raw.usage, 1, 0xffff, 0xcd) };
    case 'macro': {
      const steps = Array.isArray(raw.steps) ? raw.steps.filter((s) => Number.isInteger(s) && s > 0 && s < 256) : [];
      const text = stepsToText(steps);
      return {
        type: 'macro',
        steps,
        interval: toInt(raw.interval, 0, 0xffff, 50),
        repeat: toInt(raw.repeat, 0, 255, 1),
        // Re-open text macros in the text editor, sequences in the step editor.
        mode: raw.mode === 'steps' || text === null ? 'steps' : 'text',
        text: text ?? '',
      };
    }
    case 'special':
      return { type: 'special', code: toInt(raw.code, 0, 255, 6) };
    default:
      return { type: 'none' };
  }
}

function sanitizeLighting(raw) {
  const color = typeof raw?.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : '#1e90ff';
  return { mode: toInt(raw?.mode, 1, 8, LightMode.RAINBOW), color };
}

/** Normalizes a stored or imported profile to this model's number of keys. */
export function sanitizeProfile(raw, model) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.actions)) throw new Error('This file is not a pad profile.');
  const count = slotCount(model);
  const actions = Array.from({ length: count }, (_, i) => sanitizeAction(raw.actions[i]));
  return { actions, lighting: sanitizeLighting(raw.lighting) };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function exportProfile(profile, model) {
  const data = {
    format: FILE_FORMAT,
    version: 1,
    model: { name: model.name, keyCount: model.keyCount, variant: model.variant },
    lighting: profile.lighting,
    actions: profile.actions,
  };
  return new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
}

/** Parses an exported file. Returns the profile plus warnings worth showing. */
export function importProfile(text, model) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (raw?.format !== FILE_FORMAT) throw new Error("That file wasn't exported from XFKEY Studio.");
  const profile = sanitizeProfile(raw, model);
  const warnings = [];
  if (raw.actions.length !== profile.actions.length) {
    warnings.push(`The file has ${raw.actions.length} keys; this pad has ${profile.actions.length}.`);
  }
  profile.actions.forEach((action, i) => {
    if (actionProblems(action, { ble: model.ble }).length) warnings.push(`Key ${i + 1} needs attention.`);
  });
  return { profile, warnings };
}
