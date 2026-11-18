// Foto's bij keuzes (houtsoorten, afwerkingen, bewerkingen, spijltypes, leuningprofielen, spillen, dragers).
// Opgeslagen in IndexedDB van de browser (veel meer ruimte dan localStorage, nodig op de iPad); alles blijft op dit apparaat.
// Sleutel = 'soort:id', bv. 'hout:Eiken', 'afw:a3', 'spijl:sp2', 'profiel:Rond profiel', 'spil:eind'. Waarde = data-URL (jpeg).
// Synchroon te lezen via een kopie in het geheugen; ZP.fotos.ready = belofte die klaar is als alles geladen is.
ZP.fotos = (function () {
  const DB = 'zaagplanner-fotos', ST = 'f', mem = new Map();
  let idb = null;
  const open = () => new Promise((res) => {
    try {
      if (!window.indexedDB) return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  const tx = (mode, fn) => new Promise((res, rej) => {
    if (!idb) return res(null);
    try { const t = idb.transaction(ST, mode), s = t.objectStore(ST), out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }
    catch (e) { rej(e); }
  });
  // zonder IndexedDB (zeldzaam): terugvallen op localStorage
  const LS = 'zaagplanner.fotos';
  const lsBewaar = () => { if (idb) return; try { localStorage.setItem(LS, JSON.stringify(Object.fromEntries(mem))); } catch (e) { if (api.onError) api.onError(e); } };
  const ready = (async () => {
    idb = await open();
    if (!idb) { try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(LS) || '{}'))) mem.set(k, v); } catch (e) { /* geen opslag */ } return; }
    await new Promise((res) => {
      try {
        const c = idb.transaction(ST, 'readonly').objectStore(ST).openCursor();
        c.onsuccess = () => { const k = c.result; if (!k) return res(); mem.set(String(k.key), k.value); k.continue(); };
        c.onerror = () => res();
      } catch (e) { res(); }
    });
  })();
  const sleutel = (soort, id) => soort + ':' + id;
  const api = {
    ready, sleutel,
    get: (soort, id) => mem.get(sleutel(soort, id)) || '',
    heeft: (soort, id) => mem.has(sleutel(soort, id)),
    async set(soort, id, url) { mem.set(sleutel(soort, id), url); lsBewaar(); await tx('readwrite', s => s.put(url, sleutel(soort, id))); },
    async del(soort, id) { mem.delete(sleutel(soort, id)); lsBewaar(); await tx('readwrite', s => s.delete(sleutel(soort, id))); },
    // voor de back-up: alle foto's als object, en terugzetten
    alles: () => Object.fromEntries(mem),
    async zetAlles(obj) { for (const [k, v] of Object.entries(obj || {})) { if (typeof v !== 'string' || !/^data:image\//.test(v)) continue; mem.set(k, v); await tx('readwrite', s => s.put(v, k)); } lsBewaar(); },
    onError: null,
    get aantal() { return mem.size; },
    get opslag() { return idb ? 'IndexedDB' : 'geheugen'; },
  };
  return api;
})();
