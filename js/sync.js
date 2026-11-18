// Synchronisatie van de Zaagplanner met de gedeelde opslag (ZP.cloud): meerdere laptops en gebruikers, ook aan hetzelfde project.
//
// Opzet
// - De app blijft werken op de eigen opslag van de browser (ook zonder internet). Na elke wijziging gaat alleen wat veranderd is
//   naar de server; wat anderen wijzigden komt binnen (direct via "luister", en anders bij de volgende ronde).
// - Documenten: 'project:<id>' (zonder 3D-model), 'cost' (prijzen en normen), 'materials' (materialenlijst), 'settings', 'mappen'
//   en – alleen heen – 'werk:<id>' (lijst stukken voor de timer-app, zonder prijzen). Het 3D-model (groot, verandert alleen bij
//   inlezen) gaat als los bestand 'mesh/<project>/<kenmerk>.json'.
// - Elk document heeft op de server een versie. Opslaan lukt alleen met de versie die dit apparaat kende; is een ander voor
//   geweest, dan worden de twee versies samengevoegd (merge3: gemeenschappelijke basis, mijn versie, hun versie) en opnieuw
//   opgeslagen. Zo raken wijzigingen van twee mensen aan één project niet kwijt; alleen bij precies hetzelfde veld wint de eigen invoer.
// - Per apparaat onthouden: meta {volg, docs{id:{v (versie), h (kenmerk inhoud), u (updated)}}, mesh{pid}} en per document de basis
//   (laatst gesynchroniseerde inhoud) voor het samenvoegen.
window.ZP = window.ZP || {};
ZP.sync = (function () {
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  function gelijk(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!gelijk(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!gelijk(a[k], b[k])) return false;
    return true;
  }
  const idVan = (x) => (isObj(x) ? (x.id !== undefined ? x.id : x.key) : undefined);
  const metIds = (l) => l.length > 0 && l.every(x => idVan(x) !== undefined && idVan(x) !== null);
  // Onderdelen die als één geheel gelden (niet half samenvoegen): de indeling van één groep, de houtvergelijking, een plattegrond
  const ATOMAIR = [/^layouts\.[^.]+\.[^.]+$/, /^houtOpties\.res$/, /^stairs\.[^.]+\.plan$/, /^parts\.[^.]+\.poly$/, /^opstelling$/];
  // samenvoegen: b = basis (laatst gelijk), m = mijn versie, t = hun versie; undefined = bestaat niet (meer)
  function merge3(b, m, t, pad) {
    pad = pad || '';
    if (gelijk(m, t)) return m;
    if (gelijk(m, b)) return t;            // ik heb niets gewijzigd → hun versie (ook als zij het weghaalden)
    if (gelijk(t, b)) return m;            // zij hebben niets gewijzigd → mijn versie
    if (m === undefined) return t;         // ik haalde het weg, zij wijzigden het → houden (liever te veel dan kwijt)
    if (t === undefined) return m;
    if (ATOMAIR.some(r => r.test(pad))) return m;
    if (isObj(m) && isObj(t)) {
      const uit = {}, bb = isObj(b) ? b : {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) { const v = merge3(bb[k], m[k], t[k], pad ? pad + '.' + k : k); if (v !== undefined) uit[k] = v; }
      return uit;
    }
    if (Array.isArray(m) && Array.isArray(t) && metIds(m) && metIds(t)) {
      // lijsten van dingen met een id (onderdelen, trappen, bewerkingen, materialen …): per id samenvoegen; mijn volgorde, hun nieuwe erachter
      const bl = Array.isArray(b) && metIds(b) ? b : [], op = (l) => new Map(l.map(x => [String(idVan(x)), x])), B = op(bl), M = op(m), T = op(t), uit = [], gehad = new Set();
      const voeg = (id) => { if (gehad.has(id)) return; gehad.add(id); const v = merge3(B.get(id), M.get(id), T.get(id), pad + '.' + id); if (v !== undefined) uit.push(v); };
      for (const x of m) voeg(String(idVan(x)));
      for (const x of t) voeg(String(idVan(x)));
      return uit;
    }
    return m;                              // hetzelfde veld door allebei gewijzigd: de eigen invoer blijft staan
  }
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + '.' + s.length.toString(36); };

  // project als document: zonder 3D-model en zonder rekenhulpen (zelfde regels als ZP.store.serialize)
  function projTekst(p) {
    return JSON.stringify(p, function (k, v) {
      if (k === 'mesh' || k === '_pmap' || (k[0] === '_' && k !== '')) return undefined;
      if (this && this.piece !== undefined && this.key !== undefined && (k === 'pc' || k === 'poly' || k === 'bb' || k === 'v')) return undefined;
      if (k === 'part' && this && this.variants) return undefined;
      return v;
    });
  }
  // kenmerk van het 3D-model (id's, aantal punten, eerste en laatste coördinaat in 0,01 mm – zo wordt het bestand ook afgerond,
  // dus elk apparaat komt op hetzelfde kenmerk uit)
  const meshRef = (p) => { const l = (p.parts || []).filter(x => x.mesh && x.mesh.length); if (!l.length) return ''; let s = ''; for (const x of l) s += x.id + ':' + x.mesh.length + ':' + Math.round(x.mesh[0] * 100) + ':' + Math.round(x.mesh[x.mesh.length - 1] * 100) + ';'; return hash(s); };

  // ---------- opslag van meta en basis per apparaat (browser); voor de tests is er een variant in het geheugen ----------
  function browserOpslag() {
    const MK = 'zaagplanner.syncmeta'; let dbP = null;
    const open = () => dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open('zaagplanner-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('basis'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, f) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('basis', mode), q = f(t.objectStore('basis')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return {
      metaLees: () => { try { return JSON.parse(localStorage.getItem(MK)) || null; } catch (e) { return null; } },
      metaSchrijf: (m) => { try { localStorage.setItem(MK, JSON.stringify(m)); } catch (e) { /* geen opslag */ } },
      basisLees: (id) => tx('readonly', s => s.get(id)).catch(() => undefined),
      basisSchrijf: (id, tekst) => tx('readwrite', s => (tekst === null ? s.delete(id) : s.put(tekst, id))).catch(() => {}),
      basisLeeg: () => tx('readwrite', s => s.clear()).catch(() => {}),
    };
  }
  function geheugenOpslag() { let meta = null; const b = new Map(); return { metaLees: () => (meta ? JSON.parse(meta) : null), metaSchrijf: (m) => { meta = JSON.stringify(m); }, basisLees: async (id) => b.get(id), basisSchrijf: async (id, t) => { if (t === null) b.delete(id); else b.set(id, t); }, basisLeeg: async () => b.clear() }; }

  // ---------- de synchronisatie zelf ----------
  // o = { backend, db, opslag, werkDoc(p) → object|null, opWijziging(ids, door) , opStatus(status) }
  function maak(o) {
    const be = o.backend, db = o.db, op = o.opslag || browserOpslag();
    let meta = op.metaLees() || { volg: 0, docs: {}, mesh: {}, gestart: false };
    meta.docs = meta.docs || {}; meta.mesh = meta.mesh || {};
    const status = { bezig: false, laatst: null, fout: '', wachtend: 0, samengevoegd: 0 };
    const bewaarMeta = () => op.metaSchrijf(meta);
    const meldStatus = () => { if (o.opStatus) try { o.opStatus(status); } catch (e) { /* */ } };

    // lokaal document als tekst (null = bestaat niet)
    const GLOBAAL = ['cost', 'materials', 'settings', 'mappen'];
    function tekstVan(id) {
      if (id === 'cost') return db.cost ? JSON.stringify(db.cost) : null;
      if (id === 'materials') return JSON.stringify({ materials: db.materials || [], matExtra: db.matExtra || [], subExtra: db.subExtra || [], matDatum: db.matDatum || {} });
      if (id === 'settings') return JSON.stringify(db.settings || {});
      if (id === 'mappen') return JSON.stringify(db.mappen || []);
      if (id.startsWith('project:')) {
        const p = db.projects.find(x => x.id === id.slice(8)); if (!p) return null;
        // verwijzing naar het 3D-model: houden zolang het hier nog niet is opgehaald (anders wist dit apparaat hem voor iedereen)
        const ref = meshRef(p); if (ref) p.meshRef = ref; else if (p.meshRef && meta.mesh[p.id] !== p.meshRef) { /* nog op te halen */ } else delete p.meshRef;
        return projTekst(p);
      }
      return null;
    }
    const soortVan = (id) => (id.startsWith('project:') ? 'project' : id.startsWith('werk:') ? 'werk' : id);
    // document (object of null) in de lokale gegevens zetten
    function zet(id, data) {
      if (id === 'cost') { if (data) db.cost = data; }
      else if (id === 'materials') { if (data) { db.materials = data.materials || []; db.matExtra = data.matExtra || []; db.subExtra = data.subExtra || []; db.matDatum = data.matDatum || {}; } }
      else if (id === 'settings') { if (data) db.settings = ZP.store && ZP.materials ? ZP.store.deepMerge(ZP.materials.defaultSettings(), data) : data; }
      else if (id === 'mappen') { if (data) db.mappen = data; }
      else if (id.startsWith('project:')) {
        const pid = id.slice(8), i = db.projects.findIndex(x => x.id === pid);
        if (!data) { if (i >= 0) db.projects.splice(i, 1); if (db.current === pid) db.current = null; return; }
        // het 3D-model blijft lokaal: overnemen van de onderdelen die er al waren
        if (i >= 0) { const mesh = new Map(db.projects[i].parts.filter(x => x.mesh).map(x => [x.id, x.mesh])); for (const x of data.parts || []) if (mesh.has(x.id)) x.mesh = mesh.get(x.id); db.projects[i] = data; }
        else db.projects.push(data);
      }
    }
    const lokaleIds = () => GLOBAAL.concat(db.projects.map(p => 'project:' + p.id));

    // ---------- 3D-model als bestand ----------
    async function meshOp(p) {
      const ref = meshRef(p); if (!ref || meta.mesh[p.id] === ref) return;
      const o2 = {}; for (const x of p.parts) if (x.mesh && x.mesh.length) o2[x.id] = Array.from(x.mesh, v => Math.round(v * 100) / 100);
      await be.bestandOp(`mesh/${p.id}/${ref}.json`, JSON.stringify(o2)); meta.mesh[p.id] = ref; bewaarMeta();
    }
    async function meshHaal(p) {
      if (!p.meshRef || !(p.parts || []).length || p.parts.some(x => x.mesh && x.mesh.length)) { if (p.meshRef) meta.mesh[p.id] = p.meshRef; return false; }
      const t = await be.bestandHaal(`mesh/${p.id}/${p.meshRef}.json`); if (!t) return false;
      const o2 = JSON.parse(t); for (const x of p.parts) if (o2[x.id]) x.mesh = o2[x.id];
      meta.mesh[p.id] = p.meshRef; bewaarMeta(); return true;
    }

    // ---------- binnengekomen document verwerken ----------
    async function verwerk(r, gewijzigd) {
      const m = meta.docs[r.id];
      if (m && r.versie <= m.v) return;                               // al bekend (of mijn eigen wijziging)
      if (r.soort === 'werk') { meta.docs[r.id] = Object.assign(m || {}, { v: r.versie }); return; }
      const lokaal = tekstVan(r.id), schoon = !!m && lokaal !== null && hash(lokaal) === m.h;
      const neem = async (data) => {                                  // hun versie (of het samengevoegde) wordt de lokale
        zet(r.id, data);
        const nu = tekstVan(r.id);
        await op.basisSchrijf(r.id, r.verwijderd ? null : JSON.stringify(r.data));
        return nu;
      };
      if (r.verwijderd) {
        if (lokaal === null || schoon) { await neem(null); delete meta.docs[r.id]; meta.docs[r.id] = { v: r.versie, weg: true }; gewijzigd.add(r.id); }
        else meta.docs[r.id] = { v: r.versie, h: '' };              // hier nog gewijzigd na hun verwijderen: blijft bestaan en gaat terug naar de server
        return;
      }
      if (lokaal === null && m && !m.weg && r.id.startsWith('project:')) {
        // hier verwijderd, daar gewijzigd: het project komt terug (liever te veel dan kwijt)
      }
      if (lokaal === null || schoon || !m) {
        // geen eigen wijzigingen (of nog nooit gekoppeld en de server is nieuwer): hun versie overnemen
        if (!m && lokaal !== null) { const mijn = JSON.parse(lokaal); if (r.id.startsWith('project:') && (mijn.updated || '') > ((r.data || {}).updated || '')) { meta.docs[r.id] = { v: r.versie, h: '' }; return; } }
        const nu = await neem(r.data);
        meta.docs[r.id] = { v: r.versie, h: nu === null ? '' : hash(nu), u: r.data && r.data.updated };
        gewijzigd.add(r.id); return;
      }
      // allebei gewijzigd: samenvoegen op de gemeenschappelijke basis; het resultaat gaat daarna naar de server
      const basisT = await op.basisLees(r.id), basis = basisT ? JSON.parse(basisT) : undefined;
      const samen = merge3(basis, JSON.parse(lokaal), r.data);
      zet(r.id, samen); await op.basisSchrijf(r.id, JSON.stringify(r.data));
      meta.docs[r.id] = { v: r.versie, h: '' };                      // h leeg = moet nog naar de server
      status.samengevoegd++; gewijzigd.add(r.id);
    }

    // ---------- eigen wijzigingen naar de server ----------
    async function stuur(id, gewijzigd, poging) {
      const m0 = meta.docs[id];
      // snel: project niet opgeslagen sinds de laatste keer (zelfde 'updated') → niets te doen
      if (id.startsWith('project:') && m0 && m0.h && !m0.weg && m0.u !== undefined) { const p0 = db.projects.find(x => x.id === id.slice(8)); if (p0 && p0.updated === m0.u) return; }
      const tekst = tekstVan(id), m = meta.docs[id];
      if (tekst === null) {                                           // hier verwijderd → op de server als verwijderd markeren
        if (!m || m.weg) return;
        const r = await be.schrijf(id, soortVan(id), null, m.v, true);
        if (r.ok) { meta.docs[id] = { v: r.versie, weg: true }; await op.basisSchrijf(id, null); }
        else if (!poging) { const rij = await be.haal(id); if (rij) { delete meta.docs[id]; await verwerk(rij, gewijzigd); } }
        return;
      }
      const h = hash(tekst); if (m && m.h === h && !m.weg) return;    // niets gewijzigd
      if (id.startsWith('project:')) { const p = db.projects.find(x => x.id === id.slice(8)); if (p) await meshOp(p); }
      const r = await be.schrijf(id, soortVan(id), JSON.parse(tekst), m && !m.weg ? m.v : (m ? m.v : 0), false);
      if (r.ok) { const pp = id.startsWith('project:') ? db.projects.find(x => x.id === id.slice(8)) : null;
        meta.docs[id] = { v: r.versie, h, u: pp ? pp.updated : undefined }; await op.basisSchrijf(id, tekst); if (r.volg && r.volg === meta.volg + 1) meta.volg = r.volg; return; }
      if (poging >= 2) throw new Error('Opslaan van ' + id + ' lukt niet (steeds een nieuwere versie op de server).');
      const rij = await be.haal(id);                                  // een ander was voor: ophalen, samenvoegen, opnieuw
      if (rij) { if (meta.docs[id] && rij.versie <= meta.docs[id].v) meta.docs[id].v = rij.versie - 1; await verwerk(rij, gewijzigd); }
      else delete meta.docs[id];
      await stuur(id, gewijzigd, (poging || 0) + 1);
    }
    // lijst stukken voor de timer-app (alleen heen; de laatste schrijver wint)
    async function stuurWerk(p) {
      if (!o.werkDoc) return;
      const id = 'werk:' + p.id, w = o.werkDoc(p), m = meta.docs[id], tekst = w ? JSON.stringify(w) : null;
      if (!tekst) { if (m && !m.weg && m.h) { const r = await be.schrijf(id, 'werk', null, m.v, true); if (r.ok) meta.docs[id] = { v: r.versie, weg: true }; else { const rij = await be.haal(id); if (rij) meta.docs[id] = { v: rij.versie, h: m.h }; } } return; }
      const h = hash(tekst); if (m && m.h === h && !m.weg) return;
      let r = await be.schrijf(id, 'werk', w, m ? m.v : 0, false);
      if (!r.ok) { const rij = await be.haal(id); r = await be.schrijf(id, 'werk', w, rij ? rij.versie : 0, false); }
      if (r.ok) meta.docs[id] = { v: r.versie, h };
    }

    let loopt = null, opnieuw = false;
    // één ronde: binnenhalen, samenvoegen, versturen. Geeft de lijst gewijzigde documenten terug.
    async function ronde() {
      if (!meta.gestart) return [];
      if (loopt) { opnieuw = true; return loopt; }
      status.bezig = true; status.fout = ''; meldStatus();
      loopt = (async () => {
        const gewijzigd = new Set();
        try {
          do {
            opnieuw = false;
            const rijen = await be.sinds(meta.volg);
            for (const r of rijen) { await verwerk(r, gewijzigd); if (r.volg > meta.volg) meta.volg = r.volg; }
            for (const id of new Set([...lokaleIds(), ...Object.keys(meta.docs).filter(k => k.startsWith('project:'))])) await stuur(id, gewijzigd, 0);
            for (const p of db.projects) await stuurWerk(p);
            for (const k of Object.keys(meta.docs)) if (k.startsWith('werk:') && !db.projects.some(p => 'werk:' + p.id === k) && !meta.docs[k].weg && meta.docs[k].h) { const r = await be.schrijf(k, 'werk', null, meta.docs[k].v, true); if (r.ok) meta.docs[k] = { v: r.versie, weg: true }; }
            bewaarMeta();
          } while (opnieuw);
          // ontbrekende 3D-modellen ophalen (nieuw apparaat)
          for (const p of db.projects) { try { if (await meshHaal(p)) gewijzigd.add('project:' + p.id); } catch (e) { /* later opnieuw */ } }
          status.laatst = new Date().toISOString(); status.wachtend = 0;
        } catch (e) { status.fout = (e && e.message) || String(e); }
        status.bezig = false; loopt = null; bewaarMeta(); meldStatus();
        if (gewijzigd.size && o.opWijziging) try { o.opWijziging([...gewijzigd]); } catch (e) { /* */ }
        return [...gewijzigd];
      })();
      return loopt;
    }
    // eerste keer koppelen. richting 'server' = dit apparaat neemt prijzen/materialen/instellingen van de server over (nieuwe laptop);
    // 'hier' = de gegevens van dit apparaat gaan naar de server (eerste apparaat, of de server is leeg). Projecten worden altijd
    // samengevoegd: wat alleen hier staat gaat erheen, wat alleen daar staat komt hierheen, van dubbele wint de nieuwste.
    async function start(richting) {
      const koppen = await be.koppen();
      const leeg = !koppen.some(k => !k.verwijderd && k.soort !== 'werk');
      meta = { volg: 0, docs: {}, mesh: {}, gestart: true }; await op.basisLeeg();
      if (!leeg && richting === 'hier') for (const k of koppen) if (GLOBAAL.includes(k.id)) meta.docs[k.id] = { v: k.versie, h: '' };   // mijn versie overschrijft die van de server
      bewaarMeta();
      return ronde();
    }
    function stop() { meta = { volg: 0, docs: {}, mesh: {}, gestart: false }; bewaarMeta(); }
    // aantal documenten dat nog naar de server moet (snel: alleen op 'updated' en de algemene documenten)
    function wachtend() { let n = 0; for (const id of lokaleIds()) { const m = meta.docs[id]; if (!m) { n++; continue; } if (id.startsWith('project:')) { const p = db.projects.find(x => 'project:' + x.id === id); if (p && m.u !== undefined && p.updated !== m.u) n++; } } return n; }
    return { ronde, start, stop, status, serverLeeg: async () => !(await be.koppen()).some(k => !k.verwijderd && k.soort !== 'werk'), gestart: () => !!meta.gestart, meta: () => meta, wachtend };
  }

  return { merge3, gelijk, hash, maak, browserOpslag, geheugenOpslag, projTekst, meshRef };
})();
