// Gedeelde opslag (Supabase): verbinding, inloggen en de bewerkingen die de Zaagplanner (ZP.sync) en de timer-app nodig hebben.
// Instellingen per apparaat in localStorage 'zaagplanner.koppeling' {url, key, naam}; de gegevens zelf staan in de tabellen
// zp_data / zp_metingen en de opslag-bak 'zaagplanner' (zie tools/supabase-opzet.sql en KOPPELEN.md).
// Wachtwoorden worden nooit bewaard: Supabase onthoudt alleen de sessie in deze browser.
// Voor de tests is er een nagebootste server (nepServer/nepBackend) met dezelfde bewerkingen.
window.ZP = window.ZP || {};
ZP.cloud = (function () {
  const KEY = 'zaagplanner.koppeling', LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const lees = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const cfg = () => lees(KEY, {});
  const zetCfg = (o) => { const c = Object.assign(cfg(), o); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* geen opslag */ } sb = null; return c; };
  // elk apparaat (browser) een eigen kenmerk, om eigen wijzigingen te herkennen
  const apparaat = () => { let a = null; try { a = localStorage.getItem('zaagplanner.apparaat'); if (!a) { a = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('zaagplanner.apparaat', a); } } catch (e) { a = 'tijdelijk'; } return a; };
  const ingesteld = () => { const c = cfg(); return !!(c.url && c.key); };
  // koppelcode voor een ander apparaat (adres + openbare sleutel; geen wachtwoord): in de link of QR-code van de timer-app
  const code = () => { const c = cfg(); return c.url && c.key ? btoa(c.url + '|' + c.key) : ''; };
  function uitCode(s) { try { const [url, key] = atob(String(s).trim()).split('|'); if (/^https:\/\//.test(url) && key) { zetCfg({ url, key }); return true; } } catch (e) { /* geen geldige code */ } return false; }

  let sb = null, libP = null;
  function laadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (!libP) libP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIB; s.onload = res; s.onerror = () => { libP = null; rej(new Error('Geen verbinding met internet (bibliotheek niet geladen).')); }; document.head.appendChild(s); });
    return libP;
  }
  async function client() {
    if (sb) return sb;
    const c = cfg(); if (!c.url || !c.key) throw new Error('De koppeling is nog niet ingesteld.');
    await laadLib();
    sb = window.supabase.createClient(c.url.replace(/\/+$/, ''), c.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'zaagplanner.sessie' } });
    return sb;
  }
  const fout = (e) => { if (e) throw new Error(e.message || String(e)); };

  // ---------- inloggen (e-mail + wachtwoord; gebruikers maak je aan in Supabase › Authentication › Users) ----------
  async function sessie() { try { const c = await client(), r = await c.auth.getSession(); return r.data && r.data.session ? r.data.session.user : null; } catch (e) { return null; } }
  async function inloggen(email, wachtwoord) { const c = await client(), r = await c.auth.signInWithPassword({ email, password: wachtwoord }); fout(r.error); return r.data.user; }
  async function uitloggen() { const c = await client(); await c.auth.signOut(); }

  // ---------- documenten (zp_data) ----------
  const KOL = 'id,soort,data,versie,volg,verwijderd,door,gewijzigd';
  const backend = {
    apparaat,
    // alles wat nieuwer is dan volgnummer n (in stukken van 100)
    async sinds(n) {
      const c = await client(), uit = []; let van = n;
      for (let i = 0; i < 50; i++) { const r = await c.from('zp_data').select(KOL).gt('volg', van).order('volg').limit(100); fout(r.error); uit.push(...r.data); if (r.data.length < 100) break; van = r.data[r.data.length - 1].volg; }
      return uit;
    },
    // alleen de koppen (zonder inhoud), bv. om te zien wat er op de server staat
    async koppen(soort) { const c = await client(); let q = c.from('zp_data').select('id,soort,versie,volg,verwijderd,door,gewijzigd'); if (soort) q = q.eq('soort', soort); const r = await q; fout(r.error); return r.data; },
    async haal(id) { const c = await client(), r = await c.from('zp_data').select(KOL).eq('id', id).maybeSingle(); fout(r.error); return r.data; },
    async haalSoort(soort) { const c = await client(), r = await c.from('zp_data').select(KOL).eq('soort', soort).eq('verwijderd', false); fout(r.error); return r.data; },
    // opslaan lukt alleen als de server nog de versie heeft die dit apparaat kende (anders: conflict → eerst samenvoegen)
    async schrijf(id, soort, data, versieOud, verwijderd) {
      const c = await client(), rij = { soort, data: verwijderd ? null : data, verwijderd: !!verwijderd, door: apparaat() + '|' + (cfg().naam || '') };
      if (!versieOud) {
        const r = await c.from('zp_data').insert(Object.assign({ id, versie: 1 }, rij)).select('id,versie,volg');
        if (r.error) { if (r.error.code === '23505') return { conflict: true }; fout(r.error); }
        return { ok: true, versie: r.data[0].versie, volg: r.data[0].volg };
      }
      const r = await c.from('zp_data').update(Object.assign({ versie: versieOud + 1 }, rij)).eq('id', id).eq('versie', versieOud).select('id,versie,volg');
      fout(r.error);
      return r.data.length ? { ok: true, versie: r.data[0].versie, volg: r.data[0].volg } : { conflict: true };
    },
    // meteen horen als een ander apparaat iets wijzigt; ook wie er nu werkt (aanwezigheid)
    async luister(opWijziging, opAanwezig) {
      const c = await client(), kanaal = c.channel('zaagplanner');
      kanaal.on('postgres_changes', { event: '*', schema: 'public', table: 'zp_data' }, (p) => opWijziging && opWijziging(p.new || p.old));
      if (opAanwezig) kanaal.on('presence', { event: 'sync' }, () => { const st = kanaal.presenceState(), l = []; for (const k of Object.keys(st)) for (const x of st[k]) l.push(x); opAanwezig(l); });
      kanaal.subscribe();
      return { meld: (o) => kanaal.track(o).catch(() => {}), stop: () => c.removeChannel(kanaal) };
    },
    // ---------- bestanden (3D-modellen, foto's) ----------
    async bestandOp(pad, tekst) { const c = await client(), r = await c.storage.from('zaagplanner').upload(pad, new Blob([tekst], { type: 'application/json' }), { upsert: true, contentType: 'application/json' }); fout(r.error); return true; },
    async bestandHaal(pad) { const c = await client(), r = await c.storage.from('zaagplanner').download(pad); if (r.error) return null; return await r.data.text(); },
    // ---------- metingen (timer-app) ----------
    // met eigen id: nogmaals versturen (na wegvallen verbinding) maakt geen dubbele meting
    async metingBewaar(m) { const c = await client(), r = await c.from('zp_metingen').insert(m).select('id'); if (r.error && r.error.code === '23505') return m.id; fout(r.error); return r.data[0].id; },
    async metingen(f) { const c = await client(); let q = c.from('zp_metingen').select('*').order('gemaakt', { ascending: false }).limit((f && f.max) || 2000); if (f && f.project) q = q.eq('project', f.project); if (f && f.wie) q = q.eq('wie', f.wie); if (f && f.sinds) q = q.gte('gemaakt', f.sinds); const r = await q; fout(r.error); return r.data; },
    async metingZet(id, patch) { const c = await client(), r = await c.from('zp_metingen').update(patch).eq('id', id); fout(r.error); },
    async metingWeg(id) { const c = await client(), r = await c.from('zp_metingen').delete().eq('id', id); fout(r.error); },
  };

  // ---------- nagebootste server voor de tests: zelfde bewerkingen, in het geheugen ----------
  const nepServer = () => ({ rijen: new Map(), volg: 0, bestanden: new Map(), metingen: [], luisteraars: [] });
  function nepBackend(S, app, naam) {
    const kopie = (x) => JSON.parse(JSON.stringify(x));
    const meld = (rij) => { for (const l of S.luisteraars.slice()) if (l.app !== app) setTimeout(() => l.cb(kopie(rij)), 0); };
    return {
      apparaat: () => app,
      async sinds(n) { return [...S.rijen.values()].filter(r => r.volg > n).sort((a, b) => a.volg - b.volg).map(kopie); },
      async koppen(soort) { return [...S.rijen.values()].filter(r => !soort || r.soort === soort).map(r => { const k = kopie(r); delete k.data; return k; }); },
      async haal(id) { return S.rijen.has(id) ? kopie(S.rijen.get(id)) : null; },
      async haalSoort(soort) { return [...S.rijen.values()].filter(r => r.soort === soort && !r.verwijderd).map(kopie); },
      async schrijf(id, soort, data, versieOud, verwijderd) {
        const oud = S.rijen.get(id);
        if (!versieOud ? !!oud : !oud || oud.versie !== versieOud) return { conflict: true };
        const rij = { id, soort, data: verwijderd ? null : kopie(data), versie: (versieOud || 0) + 1, volg: ++S.volg, verwijderd: !!verwijderd, door: app + '|' + (naam || ''), gewijzigd: new Date().toISOString() };
        S.rijen.set(id, rij); meld(rij); return { ok: true, versie: rij.versie, volg: rij.volg };
      },
      async luister(cb) { const l = { app, cb }; S.luisteraars.push(l); return { meld: () => {}, stop: () => { S.luisteraars = S.luisteraars.filter(x => x !== l); } }; },
      async bestandOp(pad, tekst) { S.bestanden.set(pad, tekst); return true; },
      async bestandHaal(pad) { return S.bestanden.has(pad) ? S.bestanden.get(pad) : null; },
      async metingBewaar(m) { if (m.id && S.metingen.some(x => x.id === m.id)) return m.id; const r = Object.assign({ id: 'm' + (S.metingen.length + 1), gemaakt: new Date().toISOString(), telt: true }, kopie(m)); S.metingen.push(r); return r.id; },
      async metingen(f) { return S.metingen.filter(m => (!f || !f.project || m.project === f.project) && (!f || !f.wie || m.wie === f.wie)).map(kopie).reverse(); },
      async metingZet(id, patch) { const m = S.metingen.find(x => x.id === id); if (m) Object.assign(m, patch); },
      async metingWeg(id) { S.metingen = S.metingen.filter(x => x.id !== id); },
    };
  }

  return { cfg, zetCfg, apparaat, ingesteld, code, uitCode, client, sessie, inloggen, uitloggen, backend, nepServer, nepBackend };
})();
