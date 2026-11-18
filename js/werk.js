// Werkzaamheden in de werkplaats: gedeeld door de timer-app (telefoon) en de Zaagplanner.
// - WERK: per soort onderdeel de werkzaamheden, de eenheid (per stuk / meter / tred / trap) en bij welke norm de tijd hoort.
// - werkDoc(p, hulp): de lijst stukken van een project voor de timer-app (zonder prijzen), met per stuk wat het is
//   (recht/verdreven, recht/gebogen, houtsoort, afwerking) – zo hoeft niemand in de werkplaats "recht of gebogen" te kiezen.
// - voorstellen(metingen, C): gemeten uren per eenheid → voorstel per norm (mediaan van de laatste 10 metingen per werkzaamheid).
window.ZP = window.ZP || {};
ZP.werk = (function () {
  const NS = '::';
  // pad = norm waar deze werkzaamheid in zit; deel = telt op tot de norm van het onderdeel (de norm is de som van de delen)
  const afw = (ond) => ({ k: 'afwerken', t: 'Afwerken', per: ond === 'trapboom' || ond === 'keepboom' || ond === 'leuning' ? 'm' : ond === 'spil' ? 'tred' : 'stuk', pad: (k) => (k.afw ? 'afwNorm' + NS + k.afw + NS + ond : null) });
  const WERK = {
    trede: { t: 'Treden', werk: [
      { k: 'aftekenen', t: 'Aftekenen', per: 'stuk', deel: 1, pad: (k) => 'tredeNorm' + NS + (k.soort || 'Recht') },
      { k: 'zagen', t: 'Op maat zagen', per: 'stuk', deel: 1, pad: (k) => 'tredeNorm' + NS + (k.soort || 'Recht') },
      { k: 'verlijmen', t: 'Verlijmen', per: 'stuk', deel: 1, pad: (k) => 'tredeNorm' + NS + (k.soort || 'Recht') },
      { k: 'schuren', t: 'Schuren', per: 'stuk', deel: 1, pad: (k) => 'tredeNorm' + NS + (k.soort || 'Recht') },
      { k: 'kanten', t: 'Ronde kant en kopse kant', per: 'stuk', deel: 1, pad: (k) => 'tredeNorm' + NS + (k.soort || 'Recht') },
      afw('trede')] },
    stootbord: { t: 'Stootborden', werk: [
      { k: 'zagen', t: 'Op maat zagen', per: 'stuk', deel: 1, pad: () => 'stootbord' },
      { k: 'schuren', t: 'Schuren', per: 'stuk', deel: 1, pad: () => 'stootbord' },
      afw('stootbord')] },
    trapboom: { t: 'Trapbomen', werk: [
      { k: 'aftekenen', t: 'Aftekenen', per: 'm', deel: 1, pad: (k) => 'trapboom' + NS + (k.vorm || 'Recht') },
      { k: 'zagen', t: 'Op maat zagen', per: 'm', deel: 1, pad: (k) => 'trapboom' + NS + (k.vorm || 'Recht') },
      { k: 'frezen', t: 'Nesten frezen', per: 'tred', pad: (k) => 'trapboomTred' + NS + (k.vorm || 'Recht') },
      { k: 'schuren', t: 'Schuren', per: 'm', deel: 1, pad: (k) => 'trapboom' + NS + (k.vorm || 'Recht') },
      afw('trapboom')] },
    keepboom: { t: 'Keepbomen', werk: [
      { k: 'aftekenen', t: 'Aftekenen', per: 'm', deel: 1, pad: (k) => 'keepboom' + NS + (k.vorm || 'Recht') },
      { k: 'zagen', t: 'Op maat zagen', per: 'm', deel: 1, pad: (k) => 'keepboom' + NS + (k.vorm || 'Recht') },
      { k: 'keepen', t: 'Keepen zagen', per: 'tred', pad: (k) => 'keepboomTred' + NS + (k.vorm || 'Recht') },
      { k: 'schuren', t: 'Schuren', per: 'm', deel: 1, pad: (k) => 'keepboom' + NS + (k.vorm || 'Recht') },
      afw('keepboom')] },
    spil: { t: 'Spillen', werk: [{ k: 'maken', t: 'Spil maken', per: 'tred', deel: 1, pad: () => 'spil' }, afw('spil')] },
    leuning: { t: 'Leuning', werk: [{ k: 'maken', t: 'Leuning maken', per: 'm', deel: 1, pad: (k) => (k.profiel ? 'leuning' + NS + k.profiel + '|' + (k.vorm || 'Recht') : null) }, afw('leuning')] },
    baluster: { t: 'Spijltjes', werk: [{ k: 'maken', t: 'Spijltjes maken', per: 'stuk', pad: (k) => (k.spijl ? 'spijl' + NS + k.spijl : null) }, { k: 'afwerken', t: 'Gronden / afwerken', per: 'stuk', pad: () => 'grondverven' }] },
    bordes: { t: 'Bordes', werk: [{ k: 'maken', t: 'Bordes maken', per: 'stuk', pad: () => null }, { k: 'afwerken', t: 'Afwerken', per: 'stuk', pad: () => null }] },
    overig: { t: 'Overig', werk: [{ k: 'maken', t: 'Maken', per: 'stuk', pad: () => null }] },
    // zonder stukken: per trap
    opzetten: { t: 'Voorbereiden', los: 1, werk: [{ k: 'voorbereiden', t: 'Uitzetten, mallen, machines instellen', per: 'trap', deel: 1, pad: () => 'opzetten' + NS + 'u' }] },
    montage: { t: 'Montage', los: 1, werk: [
      { k: 'zetten', t: 'Trap zetten', per: 'trap', deel: 1, pad: () => 'montage' + NS + 'zetten' },
      { k: 'leuning', t: 'Leuning ophangen', per: 'm', deel: 1, pad: () => 'montage' + NS + 'leuningOphangen' },
      { k: 'balustrade', t: 'Balustrade plaatsen', per: 'm', deel: 1, pad: () => 'montage' + NS + 'balBoom' },
      { k: 'aftimmering', t: 'Aftimmering trapgat', per: 'm', deel: 1, pad: () => 'montage' + NS + 'aftimmering' },
      { k: 'sloop', t: 'Oude trap verwijderen', per: 'trap', deel: 1, pad: () => 'montage' + NS + 'sloop' },
      { k: 'reizen', t: 'Reizen', per: 'trap', pad: () => null }] },
  };
  const EENHEID = { stuk: 'stuks', m: 'meter', tred: 'treden', trap: 'trap' };
  const werkVan = (ond, k) => ((WERK[ond] || {}).werk || []).find(w => w.k === k) || null;
  // statussen waarbij een project in de werkplaats (timer-app) zichtbaar is
  const IN_WERK = ['Opdracht', 'In productie', 'Gereed in werkplaats'];

  // lijst stukken voor de timer-app. hulp = {code(sid), hout(x), afw(x) (naam), vorm(x), verdreven(x), profiel, spijl}
  function werkDoc(p, hulp) {
    const K = (p.begroting || {}).klant || {}, status = K.status || 'Offerte';
    if (!IN_WERK.includes(status) || !(p.parts || []).length) return null;
    const trappen = (p.stairs || []).map(s => {
      const parts = p.parts.filter(x => x.stair === s.id && x.include !== false && !(x.kopie > 1));
      return { id: s.id, code: hulp.code(s.id), naam: s.name, aantal: Math.max(1, +s.aantal || 1), treden: parts.filter(x => x.type === 'trede').length,
        stukken: parts.map(x => { const k = { hout: hulp.hout(x), afw: hulp.afw(x) };
          if (x.type === 'trede') k.soort = hulp.verdreven(x) ? 'Verdreven' : 'Recht';
          if (x.type === 'trapboom' || x.type === 'keepboom' || x.type === 'leuning') k.vorm = hulp.vorm(x);
          if (x.type === 'leuning' && hulp.profiel) k.profiel = hulp.profiel;
          if (x.type === 'baluster' && hulp.spijl) k.spijl = hulp.spijl;
          return { id: String(x.id), n: x.name, t: x.type, nr: x.nr || 0, z: x.side || '', l: Math.round(x.L || 0), k }; }) };
    });
    return { id: p.id, naam: p.name, klant: K.naam || '', plaats: K.plaats || '', nr: K.nr || '', status, trappen };
  }

  // ---------- van metingen naar normvoorstellen ----------
  const mediaan = (l) => { const s = l.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  const kwart = (l, q) => { const s = l.slice().sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
  const hoeveel = (m, w) => (w.per === 'm' ? +m.meters : +m.aantal) || 0;
  // uren per eenheid van één meting (null = niet bruikbaar)
  function urenPer(m) { const w = werkVan(m.onderdeel, m.werk), h = w ? hoeveel(m, w) : 0; return w && h > 0 && m.seconden > 0 ? m.seconden / 3600 / h : null; }
  // metingen: [{onderdeel, werk, kenmerk, seconden, aantal, meters, telt, gemaakt}] → [{pad, delen[{k,t,u,n,p25,p75}], gemeten, n, alle, compleet}]
  function voorstellen(metingen, min) {
    const perPad = new Map();
    for (const m of metingen.slice().sort((a, b) => String(b.gemaakt || '').localeCompare(String(a.gemaakt || '')))) {
      if (m.telt === false) continue; const w = werkVan(m.onderdeel, m.werk), u = urenPer(m); if (!w || u === null) continue;
      const pad = w.pad(m.kenmerk || {}); if (!pad) continue;
      if (!perPad.has(pad)) perPad.set(pad, { pad, onderdeel: m.onderdeel, ken: m.kenmerk || {}, werk: new Map() });
      const g = perPad.get(pad); if (!g.werk.has(w.k)) g.werk.set(w.k, []);
      if (g.werk.get(w.k).length < 10) g.werk.get(w.k).push(u);     // de laatste 10 per werkzaamheid
    }
    const uit = [];
    for (const g of perPad.values()) {
      // alle werkzaamheden die samen deze norm vormen (bv. tredeNorm = aftekenen + zagen + verlijmen + schuren + kanten)
      const alle = (WERK[g.onderdeel].werk || []).filter(w => w.pad(g.ken) === g.pad);
      const delen = alle.filter(w => g.werk.has(w.k)).map(w => { const l = g.werk.get(w.k); return { k: w.k, t: w.t, per: w.per, u: mediaan(l), n: l.length, p25: kwart(l, 0.25), p75: kwart(l, 0.75) }; });
      const n = Math.min(...delen.map(d => d.n));
      uit.push({ pad: g.pad, onderdeel: g.onderdeel, per: alle[0].per, delen, mist: alle.filter(w => !g.werk.has(w.k)).map(w => w.t), gemeten: delen.reduce((a, d) => a + d.u, 0), p25: delen.reduce((a, d) => a + d.p25, 0), p75: delen.reduce((a, d) => a + d.p75, 0),
        n, compleet: delen.length === alle.length, genoeg: n >= (min || 3) });
    }
    return uit.sort((a, b) => a.pad.localeCompare(b.pad));
  }
  // gewerkte uren per onderdeel van één project (nacalculatie)
  function urenPerOnderdeel(metingen, pid) {
    const m = new Map();
    for (const x of metingen) if (x.project === pid && x.telt !== false) m.set(x.onderdeel, (m.get(x.onderdeel) || 0) + (+x.seconden || 0) / 3600);
    return [...m.entries()].map(([onderdeel, uren]) => ({ onderdeel, titel: (WERK[onderdeel] || { t: onderdeel }).t, uren }));
  }
  // omschrijving van een norm-pad voor op het scherm
  function padNaam(pad) {
    const k = pad.split(NS);
    const n = { tredeNorm: 'Trede ' + (k[1] || '').toLowerCase(), stootbord: 'Stootbord', trapboom: 'Trapboom ' + (k[1] || '').toLowerCase() + ' (per m)', trapboomTred: 'Nesten frezen ' + (k[1] || '').toLowerCase() + ' (per trede)',
      keepboom: 'Keepboom ' + (k[1] || '').toLowerCase() + ' (per m)', keepboomTred: 'Keepen zagen ' + (k[1] || '').toLowerCase() + ' (per trede)', spil: 'Spil (per tred)', leuning: 'Leuning ' + (k[1] || '').replace('|', ', ').toLowerCase() + ' (per m)',
      afwNorm: 'Afwerken ' + (k[2] || '') + ' – ' + (k[1] || ''), grondverven: 'Spijltje gronden', spijl: 'Spijltje maken', opzetten: 'Voorbereiding per trap',
      montage: 'Montage: ' + ({ zetten: 'trap zetten', leuningOphangen: 'leuning ophangen (per m)', balBoom: 'balustrade plaatsen (per m)', aftimmering: 'aftimmering (per m)', sloop: 'oude trap verwijderen' }[k[1]] || k[1]) }[k[0]];
    return n || pad;
  }
  // gemengde selectie (rechte én verdreven treden, rechte én gebogen bomen) in één keer getimed: de tijd verdelen.
  // Een verdreven trede / gebogen boom telt zwaarder (vuistregel 1,6 / 1,3) – per groep een eigen meting.
  const ZWAAR = { Verdreven: 1.6, Gebogen: 1.3 };
  function verdeel(stukken, seconden, w) {
    const groepen = new Map();
    for (const s of stukken) { const key = (s.k.soort || s.k.vorm || '') + '|' + (s.k.hout || '') + '|' + (s.k.afw || ''); if (!groepen.has(key)) groepen.set(key, []); groepen.get(key).push(s); }
    const gewicht = (l) => l.reduce((a, s) => a + (w.per === 'm' ? Math.max(0.1, s.l / 1000) : 1) * (ZWAAR[s.k.soort || s.k.vorm] || 1), 0);
    const tot = [...groepen.values()].reduce((a, l) => a + gewicht(l), 0) || 1;
    return [...groepen.values()].map(l => ({ stukken: l, seconden: Math.round(seconden * gewicht(l) / tot), kenmerk: Object.assign({}, l[0].k), aantal: l.length, meters: Math.round(l.reduce((a, s) => a + s.l, 0)) / 1000, gemengd: groepen.size > 1 }));
  }
  return { WERK, EENHEID, IN_WERK, werkVan, werkDoc, voorstellen, urenPer, urenPerOnderdeel, padNaam, verdeel, mediaan };
})();
