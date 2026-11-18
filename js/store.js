// Opslag in de browser (localStorage) met back-up naar/van een JSON-bestand.
// Alles blijft op deze pc; er gaat niets naar buiten.
ZP.store = (function () {
  const KEY = 'zaagplanner.v1';
  function blank() {
    return { version: 1, plankSoortMigrated: true, matExtra: [], subExtra: [], materials: ZP.materials.defaults(), settings: ZP.materials.defaultSettings(), projects: [], current: null };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const db = JSON.parse(raw);
      db.settings = deepMerge(ZP.materials.defaultSettings(), db.settings || {});
      db.materials = db.materials || ZP.materials.defaults();
      // keepboom is een alternatief voor de trapboom: maten voor trapbomen zijn ook geschikt voor keepbomen
      if (!db.keepboomMigrated) {
        for (const m of db.materials) if (m.types && m.types.includes('trapboom') && !m.types.includes('keepboom')) m.types.splice(m.types.indexOf('trapboom') + 1, 0, 'keepboom');
        db.keepboomMigrated = true;
      }
      // materialenlijst per onderdeel: regels voor meerdere onderdelen opsplitsen (één regel per onderdeel)
      // materialenlijst als houtsoort › plank soort › maten (geen onderdelen meer per regel)
      if (!db.plankSoortMigrated) { db.materials = ZP.materials.normalize(db.materials, 'Massief'); db.plankSoortMigrated = true; }
      db.matExtra = db.matExtra || []; // houtsoorten die (nog) geen plank soorten hebben
      db.subExtra = db.subExtra || []; // plank soorten die (nog) geen maten hebben: {material, sub, grossT, netT}
      db.projects = db.projects || [];
      return db;
    } catch (e) { console.warn('Opslag niet leesbaar', e); return blank(); }
  }
  let timer = null, lastError = null;
  function save(db, now) {
    clearTimeout(timer);
    const run = () => {
      try { localStorage.setItem(KEY, serialize(db)); lastError = null; }
      catch (e) { lastError = e; console.warn('Opslaan mislukt', e); if (api.onError) api.onError(e); }
    };
    if (now) run(); else timer = setTimeout(run, 300);
  }
  // Rekenhulpen (polygonen van plaatsingen, verwijzingen) niet opslaan; die worden bij het openen opnieuw opgebouwd.
  function serialize(db) {
    return JSON.stringify(db, function (k, v) {
      if (k === '_pmap') return undefined;
      if (this && this.piece !== undefined && this.key !== undefined && (k === 'pc' || k === 'poly' || k === 'bb' || k === 'v')) return undefined;
      if (k === 'part' && this && this.variants) return undefined;
      return v;
    });
  }
  function deepMerge(base, over) {
    for (const k of Object.keys(over)) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') base[k] = deepMerge(base[k], over[k]);
      else base[k] = over[k];
    }
    return base;
  }
  function download(name, text, type = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const api = { load, save, blank, download, deepMerge, serialize, onError: null, get lastError() { return lastError; } };
  return api;
})();
