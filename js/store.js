/* Persistence + state. Everything lives in localStorage; the whole DB is a
   single JSON blob, which is fine at this scale (a few thousand entries). */

const KEY = 'nutrition-tracker';
const SCHEMA_VERSION = 1;

export const DEFAULT_NUTRIENTS = [
  { id: 'fat_total', name: 'Total Fat',     unit: 'g',  decimals: 1, goal: null, enabled: true },
  { id: 'fat_sat',   name: 'Saturated Fat', unit: 'g',  decimals: 1, goal: null, enabled: true },
  { id: 'chol',      name: 'Cholesterol',   unit: 'mg', decimals: 0, goal: null, enabled: true },
];

function emptyDb() {
  return {
    schemaVersion: SCHEMA_VERSION,
    nutrients: DEFAULT_NUTRIENTS.map((n) => ({ ...n })),
    foods: [],
    entries: [],
    settings: { countEmptyDays: false, theme: 'auto' },
  };
}

export function uid(prefix = 'i') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---- migration ---------------------------------------------------------- */
/* Runs on every load so an old backup file imports cleanly. Add a case here
   whenever the shape changes; never mutate the caller's object. */
function migrate(raw) {
  const db = { ...emptyDb(), ...raw };
  db.settings = { ...emptyDb().settings, ...(raw.settings || {}) };
  db.nutrients = (Array.isArray(raw.nutrients) && raw.nutrients.length ? raw.nutrients : emptyDb().nutrients)
    .map((n) => ({
      id: String(n.id),
      name: String(n.name ?? n.id),
      unit: String(n.unit ?? 'g'),
      decimals: Number.isFinite(n.decimals) ? clampInt(n.decimals, 0, 3) : 1,
      goal: Number.isFinite(n.goal) ? n.goal : null,
      enabled: n.enabled !== false,
    }));
  db.foods = (raw.foods || []).map((f) => ({
    id: f.id || uid('f'),
    name: String(f.name || 'Untitled'),
    serving: String(f.serving || ''),
    note: String(f.note || ''),
    values: sanitizeValues(f.values),
    archived: !!f.archived,
    createdAt: f.createdAt || Date.now(),
    updatedAt: f.updatedAt || f.createdAt || Date.now(),
  }));
  const foodIds = new Set(db.foods.map((f) => f.id));
  db.entries = (raw.entries || [])
    .filter((e) => e && e.date && foodIds.has(e.foodId))
    .map((e) => ({
      id: e.id || uid('e'),
      date: String(e.date).slice(0, 10),
      foodId: e.foodId,
      qty: Number.isFinite(e.qty) && e.qty > 0 ? e.qty : 1,
      createdAt: e.createdAt || Date.now(),
    }));
  db.schemaVersion = SCHEMA_VERSION;
  return db;
}

function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

function sanitizeValues(values) {
  const out = {};
  if (values && typeof values === 'object') {
    for (const [k, v] of Object.entries(values)) {
      const num = Number(v);
      if (Number.isFinite(num)) out[k] = num;
    }
  }
  return out;
}

/* ---- load / save -------------------------------------------------------- */
let db;
try {
  const stored = localStorage.getItem(KEY);
  db = stored ? migrate(JSON.parse(stored)) : emptyDb();
} catch (err) {
  console.error('Could not read saved data, starting empty.', err);
  db = emptyDb();
}

const listeners = new Set();
let saveFailed = false;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    saveFailed = false;
  } catch (err) {
    console.error('Save failed', err);
    if (!saveFailed) {
      saveFailed = true;
      window.dispatchEvent(new CustomEvent('storage-error', { detail: err }));
    }
  }
}

function commit() {
  persist();
  listeners.forEach((fn) => fn(db));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDb() { return db; }

/* Cross-tab / multi-window sync. */
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    db = migrate(JSON.parse(e.newValue));
    listeners.forEach((fn) => fn(db));
  } catch { /* ignore a corrupt write from another tab */ }
});

/* ---- nutrients ---------------------------------------------------------- */
export function nutrients({ all = false } = {}) {
  return all ? db.nutrients.slice() : db.nutrients.filter((n) => n.enabled);
}
export function getNutrient(id) { return db.nutrients.find((n) => n.id === id) || null; }

export function addNutrient({ name, unit, decimals, goal }) {
  const base = slug(name) || 'nutrient';
  let id = base, i = 2;
  while (db.nutrients.some((n) => n.id === id)) id = `${base}_${i++}`;
  const n = { id, name: name.trim(), unit: unit.trim() || 'g', decimals: clampInt(decimals ?? 1, 0, 3), goal: goal ?? null, enabled: true };
  db.nutrients.push(n);
  commit();
  return n;
}

export function updateNutrient(id, patch) {
  const n = getNutrient(id);
  if (!n) return;
  Object.assign(n, patch);
  if ('decimals' in patch) n.decimals = clampInt(n.decimals, 0, 3);
  commit();
}

/* Removes the nutrient and its value on every food. */
export function deleteNutrient(id) {
  db.nutrients = db.nutrients.filter((n) => n.id !== id);
  db.foods.forEach((f) => { delete f.values[id]; });
  commit();
}

export function moveNutrient(id, dir) {
  const i = db.nutrients.findIndex((n) => n.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= db.nutrients.length) return;
  [db.nutrients[i], db.nutrients[j]] = [db.nutrients[j], db.nutrients[i]];
  commit();
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

/* ---- foods -------------------------------------------------------------- */
export function foods({ includeArchived = false } = {}) {
  return db.foods
    .filter((f) => includeArchived || !f.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
export function getFood(id) { return db.foods.find((f) => f.id === id) || null; }

export function saveFood({ id, name, serving, note, values }) {
  const clean = sanitizeValues(values);
  if (id) {
    const f = getFood(id);
    if (!f) return null;
    Object.assign(f, { name: name.trim(), serving: serving.trim(), note: (note || '').trim(), values: clean, updatedAt: Date.now() });
    commit();
    return f;
  }
  const f = {
    id: uid('f'), name: name.trim(), serving: serving.trim(), note: (note || '').trim(),
    values: clean, archived: false, createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.foods.push(f);
  commit();
  return f;
}

export function setFoodArchived(id, archived) {
  const f = getFood(id);
  if (!f) return;
  f.archived = archived;
  f.updatedAt = Date.now();
  commit();
}

/* Deletes the food and every logged entry referencing it. */
export function deleteFood(id) {
  db.foods = db.foods.filter((f) => f.id !== id);
  db.entries = db.entries.filter((e) => e.foodId !== id);
  commit();
}

export function countEntriesForFood(id) {
  return db.entries.filter((e) => e.foodId === id).length;
}

/* ---- entries ------------------------------------------------------------ */
export function entriesForDate(date) {
  return db.entries
    .filter((e) => e.date === date)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function addEntry(date, foodId, qty = 1) {
  const e = { id: uid('e'), date, foodId, qty: qty > 0 ? qty : 1, createdAt: Date.now() };
  db.entries.push(e);
  commit();
  return e;
}

export function updateEntry(id, patch) {
  const e = db.entries.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  if (!(e.qty > 0)) e.qty = 1;
  commit();
}

export function deleteEntry(id) {
  db.entries = db.entries.filter((e) => e.id !== id);
  commit();
}

/* Re-inserts a removed entry verbatim so "Undo" restores it in place. */
export function restoreEntry(entry) {
  if (!entry || db.entries.some((e) => e.id === entry.id)) return;
  db.entries.push({ ...entry });
  commit();
}

/* ---- derived ------------------------------------------------------------ */
/* Totals for one day, keyed by nutrient id. Missing values count as 0. */
export function totalsForDate(date) {
  const totals = {};
  for (const n of db.nutrients) totals[n.id] = 0;
  for (const e of entriesForDate(date)) {
    const f = getFood(e.foodId);
    if (!f) continue;
    for (const n of db.nutrients) {
      totals[n.id] += (Number(f.values[n.id]) || 0) * e.qty;
    }
  }
  return totals;
}

/* Which dates have at least one entry, as a Set of 'YYYY-MM-DD'. */
export function loggedDates() {
  return new Set(db.entries.map((e) => e.date));
}

export function entryCountByDate() {
  const counts = new Map();
  for (const e of db.entries) counts.set(e.date, (counts.get(e.date) || 0) + 1);
  return counts;
}

/* Foods ordered by how recently they were logged, for the picker. */
export function recentFoodIds(limit = 8) {
  const seen = new Map();
  for (const e of db.entries) {
    const prev = seen.get(e.foodId) || 0;
    if (e.createdAt > prev) seen.set(e.foodId, e.createdAt);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => { const f = getFood(id); return f && !f.archived; })
    .slice(0, limit);
}

/* ---- settings ----------------------------------------------------------- */
export function settings() { return db.settings; }
export function updateSettings(patch) {
  Object.assign(db.settings, patch);
  commit();
}

/* ---- backup ------------------------------------------------------------- */
export function exportJson() {
  return JSON.stringify({ ...db, exportedAt: new Date().toISOString(), app: 'nutrition-tracker' }, null, 2);
}

/* Replaces everything. Throws on anything that isn't a plausible backup. */
export function importJson(text, { merge = false } = {}) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.foods)) {
    throw new Error('That file does not look like a Nutrition Tracker backup.');
  }
  const incoming = migrate(raw);
  if (!merge) {
    db = incoming;
    commit();
    return { foods: incoming.foods.length, entries: incoming.entries.length };
  }
  /* Merge: keep existing data, add nutrients/foods/entries not already present.
     Foods match on name (case-insensitive) so a re-import doesn't duplicate. */
  const byName = new Map(db.foods.map((f) => [f.name.toLowerCase(), f]));
  const idMap = new Map();
  for (const n of incoming.nutrients) {
    if (!db.nutrients.some((x) => x.id === n.id)) db.nutrients.push({ ...n });
  }
  let addedFoods = 0;
  for (const f of incoming.foods) {
    const existing = byName.get(f.name.toLowerCase());
    if (existing) { idMap.set(f.id, existing.id); continue; }
    const copy = { ...f, values: { ...f.values } };
    db.foods.push(copy);
    byName.set(copy.name.toLowerCase(), copy);
    idMap.set(f.id, copy.id);
    addedFoods++;
  }
  const seen = new Set(db.entries.map((e) => e.id));
  let addedEntries = 0;
  for (const e of incoming.entries) {
    if (seen.has(e.id)) continue;
    const foodId = idMap.get(e.foodId);
    if (!foodId) continue;
    db.entries.push({ ...e, foodId });
    addedEntries++;
  }
  commit();
  return { foods: addedFoods, entries: addedEntries };
}

export function clearAll() {
  db = emptyDb();
  commit();
}
