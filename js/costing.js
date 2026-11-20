// Begroting en prijzen.
// Bron van de arbeid: het Excel-bestand "Trappen_normtijden" (uren per tred, meter, stuk, bewerking, spijltype, afwerking, montage).
// Alle bedragen staan in de app: uurtarieven, materiaalprijzen, opslag, BTW, kilometers, en eventuele vaste prijzen.
// Een vaste prijs wordt gesignaleerd zodra hij onder kostprijs + minimale marge zakt (bv. als het uurloon of materiaal duurder wordt).
ZP.cost = (function () {
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);
  const VERSION = 11;                 // 11: leuninghout per profiel × houtsoort

  const TRAPTYPES = ['Rechte steektrap', 'Kwartslag', 'Dubbele kwartslag', 'Spiltrap', 'Bordestrap', 'S-trap', 'Zoldertrap / steile trap'];
  const VORMEN = ['Recht', 'Gebogen'];
  const PROFIELEN = ['Rond profiel', 'Ovaal profiel', 'Vierkant profiel met afronding', 'Decoratief gefreesd profiel', 'Vlak (plank) profiel', 'Stokleuning', 'Sleutelgat profiel', 'Muurleuning rond', 'Handregel op smetplank'];
  const STATUS = ['Offerte', 'Opdracht', 'In productie', 'Gereed in werkplaats', 'Geplaatst', 'Gefactureerd'];

  // ---------- startwaarden ----------
  // uren = normen uit Trappen_normtijden_10.xlsx (worden bij inlezen overschreven); bedragen = aannames om aan te passen in de app
  function defaults() {
    const lib = [
      ['Neus afronden (radius)', 'Treden', 'per tred', 0.1, 0], ['Neus profileren (halfrond / ojief)', 'Treden', 'per tred', 0.2, 0],
      ['Antislipgroeven frezen', 'Treden', 'per tred', 0.15, 0], ['Antislipprofiel inlaten – enkel', 'Treden', 'per tred', 0.2, 12],
      ['Antislipprofiel inlaten – dubbel', 'Treden', 'per tred', 0.3, 20], ['LED-groef + LED-strip (verlichting)', 'Treden', 'per tred', 0.35, 25],
      ['Inkeping rond spil / paal', 'Treden', 'per stuk', 0.4, 0], ['Bloktrede maken (dikke trede)', 'Treden', 'per tred', 0.6, 0],
      ['Overzettrede (renovatie)', 'Treden', 'per tred', 0.8, 0], ['Trede voor stalen trap (boren + bevestiging)', 'Treden', 'per tred', 0.3, 0],
      ['Wandaansluiting scriben / aanpassen', 'Trapboom', 'per m', 0.5, 0], ['Boom afschuinen / onderkant profileren', 'Trapboom', 'per m', 0.3, 0],
      ['Ophanging / bevestiging boom', 'Trapboom', 'per stuk', 0.5, 5], ['Smetplank maken (incl. profiel)', 'Trapboom', 'per m', 0.6, 0],
      ['Spil verlijmen uit lagen', 'Spil', 'per stuk', 1, 0], ['Spil draaien (gedraaide spil)', 'Spil', 'per m', 1.5, 0],
      ['Spil profileren (gefreesd)', 'Spil', 'per m', 0.8, 0], ['Spilkop maken (bol / piramide / plat)', 'Spil', 'per stuk', 0.5, 0],
      ['Pen- / gatverbinding leuning aan spil', 'Spil', 'per stuk', 0.25, 0], ['Spil inlaten in vloer / voet stellen', 'Spil', 'per stuk', 0.5, 0],
      ['Leuning buigen / gebogen verlijmen', 'Leuning', 'per m', 2, 10], ['Leuning namaken (bestaand profiel)', 'Leuning', 'per m', 1, 0],
      ['Spijlgaten boren (leuning + onderslof)', 'Balustrade', 'per stuk', 0.1, 0], ['Gedraaide spijlen', 'Balustrade', 'per stuk', 0.4, 0],
      ['Leuningkrul / eindkap maken', 'Leuning', 'per stuk', 0.75, 0], ['Muurleuninghouders aanbrengen', 'Leuning', 'per stuk', 0.15, 0],
      ['Leuningverbinding (verbindingsschroef/deuvel)', 'Leuning', 'per stuk', 0.3, 3], ['Hekwerk overloop / trapgat (maatwerk)', 'Balustrade', 'per m', 1, 0],
      ['Rozet / kapje om spil of paal', 'Spil', 'per stuk', 0.3, 0]];
    const beslag = [
      ['PU-lijm', 'liter', 18, 0.15, 'per tred'], ['Houtlijm D3', 'liter', 12, 0.1, 'per tred'], ['Schroeven en beslag (set)', 'set', 45, 1, 'per trap'],
      ['Tredebevestiging (schroeven/pluggen)', 'set', 2.5, 1, 'per tred'], ['Montagemateriaal (ankers, pluggen)', 'set', 15, 1, 'per trap'],
      ['Muurleuninghouder', 'stuk', 8.5, 1.2, 'per m leuning'], ['Leuningverbinder', 'stuk', 6, 0, 'per stuk'], ['Eindkap leuning', 'stuk', 9, 2, 'per trap'],
      ['Spijlbevestiging (deuvels/schroeven)', 'set', 0.6, 1, 'per spijl'], ['LED-voeding / driver', 'stuk', 45, 0, 'per trap'],
      ['Rozet spil', 'stuk', 12, 0, 'per trap'], ['Schuurmateriaal', 'set', 12, 1, 'per trap'], ['Grondverf', 'liter', 25, 0, 'per trap']];
    const treden = {}; for (const t of TRAPTYPES) treden[t] = null;
    treden['Dubbele kwartslag'] = 1.192857;
    const leuning = {}; for (const p of PROFIELEN) for (const v of VORMEN) leuning[p + '|' + v] = null;
    leuning['Rond profiel|Recht'] = 0.5;
    const leuningMat = {}; for (const p of PROFIELEN) leuningMat[p] = 28;
    return {
      v: VERSION,
      source: 'Startwaarden (Trappen_normtijden_10.xlsx)', sourceFile: '', sourceDate: '',
      // ---- bedragen (app) ----
      tarief: { werk: 65, montage: 65, km: 0.45, opslagArbeid: 0, opslagMat: 0.15, btw: 0.21, minMarge: 0, afval: 1.45 },
      bedrijf: { naam: '', adres: '', plaats: '', tel: '', mail: '', kvk: '', btwnr: '' },
      // leuningMat: per profiel € per m per houtsoort; leuningHout = null → bij ensure() gevuld uit de materialenlijst
      leuningMat, leuningHout: null, onderslofMat: 23.75, leuningVast: {},
      beslag: beslag.map(([naam, eenheid, prijs, std, per]) => ({ id: uid('s'), naam, eenheid, prijs, std, per })),
      // ---- uren (Excel) + bedragen (app) per item ----
      bewerkingen: lib.map(([naam, onderdeel, eenheid, u, mat]) => ({ id: uid('b'), naam, onderdeel, eenheid, u, mat })),
      afwerkingen: [
        ['Onbehandeld', '–', 0, 0, 0, 0], ['Hardwax-olie naturel', 'Hardwax-olie', 42, 20, 2, 0], ['Hardwax-olie wit / kleur', 'Hardwax-olie met pigment', 48, 20, 2, 0.05],
        ['Wit gegrond', 'Grondverf wit', 25, 10, 1, 0.15], ['Wit gegrond + afgelakt', 'Grondverf + aflak wit', 32, 10, 3, 0.35],
        ['Blanke lak (2K)', 'Parket-/traplak', 55, 12, 3, 0.3], ['Gebeitst + olie', 'Beits + hardwax-olie', 45, 15, 3, 0.15]]
        .map(([naam, product, prijsL, dekking, lagen, uM2], i) => ({ id: 'af' + (i + 1), naam, product, prijsL, dekking, lagen, uM2 })),
      afwStd: { treden: 'Hardwax-olie naturel', rest: 'Hardwax-olie naturel' },
      spijltypes: [
        ['Vierkant 40×40 (standaard)', 40, 0.2125, 0.675], ['Plat 18×68 (smal opstaand)', 18, 0.18, 1.2], ['Plat 68×18 (breed aanzicht)', 68, 0.18, 1.2],
        ['Rond Ø32', 32, 0.25, 1.5], ['Geprofileerd (gefreesd)', 40, 0.35, 1], ['Gedraaid (draaiwerk)', 45, 0.6125, 2.5], ['RVS staaf Ø12 (inkoop)', 12, 0.1, 6]]
        .map(([naam, breedte, u, mat], i) => ({ id: 'sp' + (i + 1), naam, breedte, u, mat })),
      // trapspillen per soort (app; staat niet in Excel): uren en materiaal per stuk, optioneel een vaste prijs
      spilSoorten: { eind: { u: 1.5, mat: 0 }, hoek: { u: 2, mat: 0 }, tussen: { u: 1, mat: 0 } },
      // leuningdragers (app): prijs per stuk, aantal per meter leuning aan de muurzijde
      dragers: [['RVS rond (standaard)', 8.5], ['Mat zwart', 9.5], ['Messing / goud', 14], ['Chroom', 10], ['Hout (eiken)', 11], ['Verdekt / onzichtbaar', 18]]
        .map(([naam, prijs], i) => ({ id: 'dr' + (i + 1), naam, prijs, perM: 1.2 })),
      balustrades: [
        { id: 'bl1', naam: 'Standaard: vierkante spijlen met onderslof', spijl: 'sp1', tussen: 100, onderslof: true },
        { id: 'bl2', naam: 'Gedraaide spijlen (klassiek)', spijl: 'sp6', tussen: 100, onderslof: true },
        { id: 'bl3', naam: 'Platte spijlen zonder onderslof', spijl: 'sp2', tussen: 100, onderslof: false }],
      // ---- uren (Excel) ----
      treden, tredenGem: 1.192857, stootbord: 0.384615,
      trapboom: { Recht: 3.25, Gebogen: null }, trapboomGem: 3.25, keepboom: { Recht: null, Gebogen: 4.307692 }, keepboomGem: 4.307692,
      spil: 0.321429, onderslof: 0.75, leuning, leuningGem: { Recht: 0.5, Gebogen: null }, grondverven: 0.076087, spilSchaven: 0.4,
      montage: { zetten: 3.5, leuningOphangen: 0.3, balBoom: 0.375, balVerdieping: 0.461538, aftimmering: 0.5, trapgat: 1, sloop: 3 },
      profielen: PROFIELEN.slice(), traptypes: TRAPTYPES.slice(),
    };
  }
  // oudere opslag (versie 8/9: uren en materiaal door elkaar) omzetten; bedragen, tekeningen en eigen items blijven bewaard
  function migrate(C) {
    const d = defaults(), u = (x) => (x && typeof x === 'object' ? (x.u > 0 ? x.u : null) : x);
    const out = Object.assign(d, {
      tarief: Object.assign(d.tarief, C.tarief || {}), bedrijf: Object.assign(d.bedrijf, C.bedrijf || {}),
      beslag: (C.beslag || d.beslag).filter(s => !/^antislipprofiel$|^led-strip/i.test(s.naam)),
      bewerkingen: (C.bewerkingen || d.bewerkingen).map(b => Object.assign({}, b, { naam: /^LED-groef frezen/.test(b.naam) ? 'LED-groef + LED-strip (verlichting)' : b.naam, mat: /^LED-groef/.test(b.naam) && !b.mat ? 25 : b.mat })),
      afwerkingen: C.afwerkingen || d.afwerkingen, afwStd: C.afwStd || d.afwStd, spijltypes: C.spijltypes || d.spijltypes,
      balustrades: (C.balustrades || d.balustrades).map(b => ({ id: b.id, naam: b.naam, spijl: b.spijl, tussen: b.tussen, onderslof: b.onderslof, vast: b.vast, vastKost: b.vastKost })),
      treden: {}, tredenGem: u(C.tredenGem) || d.tredenGem, stootbord: u(C.stootbord) || d.stootbord,
      trapboom: {}, keepboom: {}, trapboomGem: u(C.trapboomGem) || d.trapboomGem, keepboomGem: u(C.keepboomGem) || d.keepboomGem,
      spil: u(C.spil) || d.spil, onderslof: u(C.onderslof) || d.onderslof, leuning: {}, leuningGem: {},
      onderslofMat: C.onderslof && C.onderslof.mat ? C.onderslof.mat : d.onderslofMat,
      grondverven: C.grondverven || d.grondverven, spilSchaven: C.spilSchaven || d.spilSchaven, montage: Object.assign(d.montage, C.montage || {}),
      profielen: C.profielen || d.profielen, traptypes: C.traptypes || d.traptypes, source: C.source || d.source,
    });
    for (const t of out.traptypes) out.treden[t] = u((C.treden || {})[t]) || d.treden[t] || null;
    for (const v of VORMEN) { out.trapboom[v] = u((C.trapboom || {})[v]) || d.trapboom[v]; out.keepboom[v] = u((C.keepboom || {})[v]) || d.keepboom[v]; out.leuningGem[v] = u((C.leuningGem || {})[v]) || d.leuningGem[v]; }
    for (const p of out.profielen) for (const v of VORMEN) { const o = (C.leuning || {})[p + '|' + v]; out.leuning[p + '|' + v] = u(o) || d.leuning[p + '|' + v] || null; if (o && o.mat) out.leuningMat[p] = o.mat; }
    for (const p of out.profielen) if (out.leuningMat[p] === undefined) out.leuningMat[p] = 28;
    return out;
  }
  // versie 10 → 11: één houtprijs per profiel wordt een prijs per houtsoort; vaste prijs per profiel|vorm geldt voor elke houtsoort
  function upgradeLeuning(C, db) {
    const M = ZP.materials, uit = [...new Set((db.materials || []).map(m => M.canonMaterial(m.material).split(M.SEP || ' › ')[0].trim()).filter(Boolean))];
    C.leuningHout = uit.length ? uit : ['Eiken'];
    for (const p of Object.keys(C.leuningMat)) {
      const v = C.leuningMat[p]; if (v && typeof v === 'object') continue;
      C.leuningMat[p] = {}; for (const h of C.leuningHout) C.leuningMat[p][h] = +v || 0;
    }
    for (const [k, v] of Object.entries(C.leuningVast)) if (k.split('|').length === 2) { for (const h of C.leuningHout) C.leuningVast[k + '|' + h] = Object.assign({}, v); delete C.leuningVast[k]; }
    C.v = VERSION;
  }
  function ensure(db) {
    if (!db.cost) db.cost = defaults();
    else if ((db.cost.v || 0) < 10) db.cost = migrate(db.cost);
    const d = defaults();
    for (const k of Object.keys(d)) if (db.cost[k] === undefined) db.cost[k] = d[k];
    if (!db.cost.leuningHout) upgradeLeuning(db.cost, db);
    if (db.cost.montage.sloop === undefined) db.cost.montage.sloop = d.montage.sloop;   // staat (nog) niet in Excel: in de app in te stellen
    balStdVan(db.cost);
    // nieuwe prijsregels (PLAN §11.6): velden die oudere gegevens nog niet hebben
    const c = db.cost;
    c.stootbordType = c.stootbordType || {}; c.houtFactor = c.houtFactor || {}; c.opzetten = c.opzetten || { prijs: 0, u: 0 };
    if (c.tarief.restPct === undefined) c.tarief.restPct = 0;
    // geen kuiptrap meer (wens gebruiker 20-11-2026: kuip- en wronkstukken worden nooit gemaakt): type weg, oude keuzes → Spiltrap
    if (Array.isArray(c.traptypes)) c.traptypes = c.traptypes.filter(t => t !== 'Kuiptrap');
    for (const o of [c.treden, c.stootbordType]) if (o) delete o.Kuiptrap;
    for (const p of (db.projects || [])) {
      for (const s of Object.values(((p.begroting || {}).stairs) || {})) if (s && s.type === 'Kuiptrap') s.type = 'Spiltrap';
      for (const v of ((p.config || {}).varianten || [])) if (v && v.type === 'Kuiptrap') v.type = 'Spiltrap';
    }
    // koppeltabel materiaalnamen (instellingen) voor de houtsoort-factor; niet mee opslaan
    if (!Object.prototype.hasOwnProperty.call(c, 'matMap')) Object.defineProperty(c, 'matMap', { value: () => (db.settings || {}).materialMap, enumerable: false, configurable: true });
    return db.cost;
  }

  // ---------- normen (uren) opzoeken: niet gemeten = gemiddelde van de groep ----------
  const pos = (x, gem) => (x > 0 ? x : gem) || 0;
  // normbestand versie 11: treden per soort (recht / verdreven) zonder afwerken; afwerken apart per afwerking en onderdeel
  const VERDREVEN_AANDEEL = { 'Rechte steektrap': 0, Kwartslag: 0.23, 'Dubbele kwartslag': 0.43, Spiltrap: 1, Bordestrap: 0, 'S-trap': 0.43, 'Zoldertrap / steile trap': 0 };
  const tredeSoortU = (C, soort) => pos((C.tredeNorm || {})[soort], C.tredeNormGem);
  // per tred voor een type trap; met versie 11 het gemiddelde van recht en verdreven naar het gangbare aandeel verdreven treden
  const tredeU = (C, type) => {
    if (!C.tredeNorm) return pos(C.treden[type], C.tredenGem);
    const a = VERDREVEN_AANDEEL[type] !== undefined ? VERDREVEN_AANDEEL[type] : 0.3;
    return (1 - a) * tredeSoortU(C, 'Recht') + a * tredeSoortU(C, 'Verdreven');
  };
  // uren afwerken per eenheid (tred, stootbord, m trapboom/keepboom, tred spil) voor een afwerking; 0 zonder normen van versie 11
  const afwU = (C, afwId, onderdeel) => { if (!C.afwNorm) return 0; const a = C.afwerkingen.find(x => x.id === afwId); const n = a && C.afwNorm[a.naam]; return n ? +n[onderdeel] || 0 : 0; };
  // materiaal dat niet wordt afgewerkt (normbestand, Instellingen "Afwerken nodig? = Nee", bv. multiplex)
  const geenAfw = (C, materiaal) => !!materiaal && (C.geenAfwerking || []).some(n => String(materiaal).toLowerCase().includes(String(n).toLowerCase().split(/\s+/)[0]));
  // verdreven trede = wigvormig: oppervlak duidelijk kleiner dan de omhullende rechthoek
  // eigen afwerking van één stuk (Uitvoering): B.afwStuk[onderdeel-id]; kopieën (trap × aantal) volgen het origineel; null = volgt de soort
  // … of van deze ene trap (B.afwTrap[trap][soort]: trappen in één project kunnen een andere afwerking hebben)
  const afwVanStuk = (C, B, x) => { const ok = (id) => (id && C.afwerkingen.some(a => a.id === id) ? id : null);
    return ok(((B && B.afwStuk) || {})[String(x.id).split('*')[0]]) || ok((((B && B.afwTrap) || {})[x.stair] || {})[x.type]); };
  // afwerking van één stuk zoals gerekend: stuk → trap → soort (B.afw[soort], anders treden/rest) → standaard
  const afwVanPart = (C, B, x) => { const B0 = (B && B.afw) || {}, g = x.type === 'trede' || x.type === 'leuning' ? 'treden' : 'rest', ok = (id) => (id && C.afwerkingen.some(a => a.id === id) ? id : null);
    return afwVanStuk(C, B, x) || ok(B0[x.type]) || ok(B0[g]) || (afwByName(C, C.afwStd[g] || C.afwStd.rest) || {}).id; };
  // houtsoort-factor op de werkplaats-uren: C.houtFactor{houtsoort: factor} (1 = geen invloed); gemiddelde over de stukken
  function houtFactor(C, p, list) {
    const F = C.houtFactor || {}, keys = Object.keys(F); if (!keys.length || !list.length) return 1;
    const mm = typeof C.matMap === 'function' ? C.matMap() : null;
    let som = 0;
    for (const x of list) { const w = String(ZP.nest.materialOf(x, { materialMap: mm || {} }, p.typeMaterial || {})).split(' › ')[0].toLowerCase(); const k = keys.find(h => h.toLowerCase() === w); som += k && +F[k] > 0 ? +F[k] : 1; }
    return som / list.length;
  }
  // omhullende van het 3D-model van een onderdeel (cache per mesh) en "ligt binnen d mm van elkaar"
  const meshBox = new WeakMap();
  function boxVan(x) {
    const m = x.mesh; if (meshBox.has(m)) return meshBox.get(m);
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.length; i += 3) for (let a = 0; a < 3; a++) { const v = m[i + a]; if (v < b[a]) b[a] = v; if (v > b[a + 3]) b[a + 3] = v; }
    meshBox.set(m, b); return b;
  }
  const meshDichtbij = (a, b, d) => { const A = boxVan(a), Bx = boxVan(b); for (let i = 0; i < 3; i++) if (A[i] - d > Bx[i + 3] || Bx[i] - d > A[i + 3]) return false; return true; };
  const isVerdreven = (x) => { const bb = ZP.geom.bbox(x.poly), a = Math.abs(ZP.geom.area(x.poly)); return bb.w * bb.h > 0 && a / (bb.w * bb.h) < 0.93; };
  const boomU = (C, kind, vorm) => pos(C[kind][vorm], C[kind + 'Gem']);
  // normbestand versie 11: nesten frezen (trapboom) / keepen zagen (keepboom) per trede in de boom; 0 als het bestand dat niet heeft
  const boomTredU = (C, kind, vorm) => (C[kind + 'Tred'] ? pos(C[kind + 'Tred'][vorm], C[kind + 'TredGem']) : 0);
  const leuningU = (C, profiel, vorm) => pos(C.leuning[profiel + '|' + vorm], C.leuningGem[vorm] || C.leuningGem.Recht);

  // ---------- kostprijzen (uren × uurtarief + materiaal) ----------
  const bewKost = (C, b) => (+b.u || 0) * C.tarief.werk + (+b.mat || 0);
  // materiaal per m²: product (lagen ÷ dekking × prijs per liter) + klein materiaal (schuurpapier, kwasten, lappen: a.klein per m²)
  const afwMat = (a) => (a && +a.dekking > 0 ? (+a.lagen || 0) / a.dekking * (+a.prijsL || 0) : 0) + (a ? +a.klein || 0 : 0);
  // gemeten dekking (m² per liter per laag) uit de projecten waar het verbruik is ingevuld (B.afwLiters[id] = {l, m2})
  function afwGemeten(db, a) {
    let m2 = 0, l = 0, n = 0;
    for (const p of db.projects || []) { const e = ((p.begroting || {}).afwLiters || {})[a.id]; if (e && e.l > 0 && e.m2 > 0) { m2 += e.m2; l += e.l; n++; } }
    return n ? { n, dekking: m2 * (+a.lagen || 1) / l } : null;
  }
  const afwPrijs = (C, a) => afwMat(a) + (a ? (+a.uM2 || 0) * C.tarief.werk : 0);
  const afwByName = (C, naam) => C.afwerkingen.find(a => a.naam === naam) || C.afwerkingen[0];
  // leuning per meter per profiel × vorm × houtsoort: maken (uren + hout) + ophangen (montage)
  const leunKey = (profiel, vorm, hout) => profiel + '|' + vorm + '|' + (hout || '');
  const leunHout = (C, profiel, hout) => +((C.leuningMat[profiel] || {})[hout]) || 0;
  function leuningPerM(C, profiel, vorm, hout) {
    const u = leuningU(C, profiel, vorm), mat = leunHout(C, profiel, hout);
    const maken = u * C.tarief.werk + mat, ophangen = C.montage.leuningOphangen * C.tarief.montage;
    return { u, mat, maken, ophangen, kost: maken + ophangen, vast: C.leuningVast[leunKey(profiel, vorm, hout)] };
  }
  // houtsoort van de leuning in een project: keuze bij Hout, anders het materiaal van de getekende leuning
  function leunHoutVan(C, p) {
    const lijst = C.leuningHout || [], l = (s) => String(s || '').toLowerCase();
    const leun = p.parts.find(x => x.type === 'leuning' && x.include !== false);
    const naam = ZP.materials.canonMaterial((p.typeMaterial || {}).leuning || (leun && leun.material) || '').split(' › ')[0];
    return lijst.find(h => l(h) === l(naam)) || lijst.find(h => naam && (l(naam).includes(l(h)) || l(h).includes(l(naam)))) || lijst[0] || '';
  }
  // samenstelling van een balustraderegel in de begroting: eigen keuze per regel, anders die van het gekozen balustradetype.
  // Komt de samenstelling overeen met het type, dan geldt de vaste prijs van dat type.
  function balRegel(C, bl) {
    const std = balStdVan(C), t = C.balustrades.find(x => x.id === bl.type) || null;
    const d = t || { spijl: std.spijl, tussen: std.tussen, onderslof: !!std.slof[bl.plaats === 'verdieping' ? 'verdieping' : 'boom'] };
    const cfg = { spijl: bl.spijl || d.spijl, tussen: bl.tussen > 0 ? +bl.tussen : +d.tussen || 100, onderslof: bl.onderslof !== undefined ? !!bl.onderslof : !!d.onderslof };
    const same = !!t && cfg.spijl === t.spijl && cfg.tussen === (+t.tussen || 100) && cfg.onderslof === !!t.onderslof;
    return { t, cfg, same, vast: same ? t.vast : null, vastKost: same ? t.vastKost : null };
  }
  // balustrades per verdieping anders (B.balApart, Uitvoering): keuze B.balVloer[vloernaam] = {type, spijl, hout, afw}
  // geldt voor balustraderegels "op de verdieping" (sleutel = bl.vloer, '' = zonder naam). Type = samenstelling van dat type,
  // spijl gaat daar nog voor. Hout en afwerking komen op de specificatiestaat (de prijs per meter rekent met het spijltype).
  // vorm (Recht/Gebogen) van een boom of leuningstuk zoals de begroting rekent.
  // Boom: eigen keuze per stuk → configurator (soort|kant|nr, soort|kant) → keuze per trap (B.stairs[trap].boomVorm/keepVorm) → tekening.
  // Leuning: eigen keuze per stuk → B.leuning.vorm (niet 'vorm uit tekening') → uit de tekening = de vorm van de boom aan dezelfde
  // kant van dezelfde trap (gebogen = hij loopt mee met de ronding van de boom). Een draai/aansluitstuk telt als rechte leuning;
  // zonder boom aan die kant (bv. langs een spil) alleen gebogen als het stuk zelf gebogen is en minstens 1,5 m lang.
  function stukVorm(p, B, x) {
    B = B || {}; const m = B.boomVormen || {}, eigen = m['id:' + String(x.id).split('*')[0]]; if (eigen) return eigen;
    if (x.type === 'trapboom' || x.type === 'keepboom') {
      const std = ((B.stairs || {})[x.stair] || {})[x.type === 'trapboom' ? 'boomVorm' : 'keepVorm'];
      return m[x.type + '|' + x.side + '|' + x.nr] || m[x.type + '|' + x.side] || (std && std !== 'auto' ? std : ZP.parts.vorm(x) || 'Recht');
    }
    if (x.type === 'leuning') {
      const L = B.leuning || {}; if (!L.auto && L.vorm) return L.vorm;
      return leunVormTekening(p, B, x);
    }
    return ZP.parts.vorm(x) || 'Recht';
  }
  function leunVormTekening(p, B, x) {
    const bomen = x.side ? p.parts.filter(y => y.include !== false && y.stair === x.stair && y.side === x.side && (y.type === 'trapboom' || y.type === 'keepboom')) : [];
    if (bomen.length) return bomen.some(y => stukVorm(p, B, y) === 'Gebogen') ? 'Gebogen' : 'Recht';
    return (+x.L || 0) >= 1500 && ZP.parts.vorm(x) === 'Gebogen' ? 'Gebogen' : 'Recht';
  }
  // vinkje "Trappen wijken van elkaar af" (Uitvoering): B.trappenApart; nog nooit gekozen + bestaande keuzes per trap = aan
  function trappenApart(p) {
    if (!p.stairs || p.stairs.length < 2) return false; const B = p.begroting || {}, a = B.trappenApart;
    if (a !== undefined) return !!a;
    return Object.keys(p.typeMaterial || {}).some(k => k.startsWith('s:')) || Object.values(B.afwTrap || {}).some(o => Object.keys(o || {}).length);
  }
  function balVloerVan(B, bl) { return B && B.balApart && bl.plaats === 'verdieping' ? ((B.balVloer || {})[bl.vloer || ''] || null) : null; }
  function balEffectief(B, bl) {
    const o = balVloerVan(B, bl); if (!o) return bl;
    const e = Object.assign({}, bl);
    if (o.type) { e.type = o.type; delete e.spijl; delete e.tussen; delete e.onderslof; }
    if (o.spijl) e.spijl = o.spijl;
    return e;
  }
  // standaard balustrade (app): standaardspijltje, tussenruimte en onderslof per plaats (op de boom / op de verdieping)
  function balStdVan(C) {
    const sps = C.spijltypes || [];
    C.balStd = C.balStd || {};
    if (!sps.some(s => s.id === C.balStd.spijl)) C.balStd.spijl = (sps[0] || {}).id;
    if (!(+C.balStd.tussen > 0)) C.balStd.tussen = 100;
    C.balStd.slof = Object.assign({ boom: false, verdieping: true }, C.balStd.slof || {});
    for (const s of sps) if (s.meer === undefined) s.meer = 0;   // meerprijs per stuk t.o.v. het standaardspijltje (zonder norm)
    return C.balStd;
  }
  // balustrade per meter (excl. leuning – die heeft een eigen prijs per meter), zoals het Excel-bestand (blad Balustrade/Norm F):
  // maken = spijltjes (uren + materiaal per stuk) + onderslof per m; afwerken = grondverven per onderdeel (spijltjes);
  // plaatsen = montagenorm op de boom / op de verdieping. De norm rekent altijd met het standaardspijltje; een ander
  // spijltje kost een meerprijs per stuk (meerSp = € per m).
  function balustradePerM(C, bal, plaats = 'boom') {
    const W = C.tarief.werk, std = balStdVan(C), dummy = { u: 0, mat: 0, breedte: 40, naam: '?', meer: 0 };
    const sp = C.spijltypes.find(s => s.id === bal.spijl) || C.spijltypes.find(s => s.id === std.spijl) || C.spijltypes[0] || dummy;
    const spStd = C.spijltypes.find(s => s.id === std.spijl) || sp;
    const tussen = Math.max(1, +bal.tussen || 100);
    const perM = 1000 / ((+sp.breedte || 0) + tussen), perMStd = 1000 / ((+spStd.breedte || 0) + tussen);
    const bev = C.beslag.find(b => b.per === 'per spijl'), bevSt = bev ? bev.prijs * bev.std : 0;
    const uSp = perMStd * (+spStd.u || 0), matSp = perMStd * (+spStd.mat || 0), bevM = perM * bevSt;
    const afwU = perMStd * (+C.grondverven || 0);
    const slofU = bal.onderslof ? C.onderslof : 0, slofMat = bal.onderslof ? +C.onderslofMat || 0 : 0;
    const plaatsU = plaats === 'verdieping' ? C.montage.balVerdieping : C.montage.balBoom;
    const meer = sp.id === spStd.id ? 0 : +sp.meer || 0, meerSp = perM * meer;
    const spijlen = uSp * W + matSp + bevM, afwerken = afwU * W, slof = slofU * W + slofMat, plaatsen = plaatsU * C.tarief.montage;
    return { spijl: sp, spijlStd: spStd, perM, perMStd, uren: uSp + afwU + slofU, maakU: uSp + slofU, afwU, matSp, bevM, slofMat, plaatsU, meer, meerSp,
      spijlen, afwerken, slof, plaatsen, kost: spijlen + afwerken + slof + plaatsen, vast: bal.vast };
  }
  // standaardprijs per meter balustrade per plaats (kostprijs en verkoop = met opslag arbeid/materiaal, excl. BTW)
  function balStdPrijs(C, plaats) {
    const std = balStdVan(C), pm = balustradePerM(C, { spijl: std.spijl, tussen: std.tussen, onderslof: !!std.slof[plaats] }, plaats);
    const T = C.tarief, arb = (pm.maakU + pm.afwU) * T.werk + pm.plaatsU * T.montage, mat = pm.matSp + pm.slofMat + pm.bevM;
    return Object.assign(pm, { arb, mat, verkoop: arb * (1 + (+T.opslagArbeid || 0)) + mat * (1 + (+T.opslagMat || 0)) });
  }

  // ---------- vaste prijzen bewaken ----------
  // te laag = vaste prijs < kostprijs × (1 + minimale marge); gestegen = kostprijs hoger dan toen de prijs werd vastgezet
  function check(C, vast, kost, basis) {
    if (!(+vast > 0)) return null;
    const min = kost * (1 + (+C.tarief.minMarge || 0));
    return { vast: +vast, kost, min, marge: vast / (kost || 1) - 1, teLaag: vast < min - 0.005, stijging: basis > 0 ? kost / basis - 1 : 0 };
  }
  function signalen(C) {
    const out = [];
    for (const b of C.bewerkingen) { const s = check(C, b.vast, bewKost(C, b), b.vastKost); if (s && s.teLaag) out.push(Object.assign({ soort: 'Bewerking', naam: b.naam, eenheid: b.eenheid }, s)); }
    // vaste prijzen van leuning en balustrade zijn exclusief ophangen/plaatsen (dat staat apart bij montage; de klant kan het zelf doen)
    for (const bal of C.balustrades) { const pm = balustradePerM(C, bal); const s = check(C, bal.vast, pm.kost - pm.plaatsen, bal.vastKost); if (s && s.teLaag) out.push(Object.assign({ soort: 'Balustrade', naam: bal.naam, eenheid: 'per m' }, s)); }
    for (const [key, v] of Object.entries(C.leuningVast || {})) {
      if (!v || !(v.prijs > 0)) continue; const [pr, vo, h] = key.split('|'); const pm = leuningPerM(C, pr, vo, h);
      const s = check(C, v.prijs, pm.maken, v.kost); if (s && s.teLaag) out.push(Object.assign({ soort: 'Leuning', naam: `${pr} – ${(vo || '').toLowerCase()}${h ? ' – ' + h : ''}`, eenheid: 'per m' }, s));
    }
    return out;
  }
  // vaste prijs vastzetten: kostprijs van dat moment onthouden (om later de stijging te kunnen tonen)
  function setVast(C, kind, id, prijs) {
    const p = prijs === '' || prijs === null || !(+prijs > 0) ? null : +prijs;
    if (kind === 'bew') { const b = C.bewerkingen.find(x => x.id === id); if (!b) return; b.vast = p; b.vastKost = p ? bewKost(C, b) : null; }
    else if (kind === 'bal') { const b = C.balustrades.find(x => x.id === id); if (!b) return; b.vast = p; const pm = balustradePerM(C, b); b.vastKost = p ? pm.kost - pm.plaatsen : null; }
    else if (kind === 'leun') { const [pr, vo, h] = id.split('|'); if (p) C.leuningVast[id] = { prijs: p, kost: leuningPerM(C, pr, vo, h).maken }; else delete C.leuningVast[id]; }
  }

  // ---------- type trap voorstellen uit de tekening ----------
  // Hoe "taps" een trede is: oppervlak ÷ omhullende rechthoek (1 = rechte trede). Bij een kwartslag worden de treden
  // steeds tapser naar de draai toe en daarna weer recht: elk diepste punt is een draai. Een spiltrap is overal even taps.
  function guessType(parts) {
    const tr = parts.filter(x => x.type === 'trede' && x.include !== false).sort((a, b) => (a.nr || 0) - (b.nr || 0));
    if (tr.length < 2) return 'Rechte steektrap';
    const r = tr.map(x => { const a = Math.abs(ZP.geom.area(x.poly)); const bb = ZP.geom.bbox(x.poly); return a / (bb.w * bb.h); });
    const w = r.filter(v => v < 0.93);
    if (!w.length) return 'Rechte steektrap';
    if (w.length >= r.length * 0.8 && Math.max(...w) - Math.min(...w) < 0.12) return 'Spiltrap';
    const mins = [];
    for (let i = 0; i < r.length; i++) {
      if (r[i] >= 0.85 || (i > 0 && r[i] > r[i - 1]) || (i < r.length - 1 && r[i] > r[i + 1])) continue;
      const prev = mins[mins.length - 1];
      if (prev !== undefined && Math.max(...r.slice(prev, i + 1)) - Math.max(r[prev], r[i]) < 0.1) { if (r[i] < r[prev]) mins[mins.length - 1] = i; continue; }
      mins.push(i);
    }
    return mins.length >= 2 ? 'Dubbele kwartslag' : 'Kwartslag';
  }

  // ---------- complete begroting van een project ----------
  // purchase: inkooplijst uit de indeling (of null); estimate: houtschatting {bedrag, m3} als er nog geen indeling is
  function begroting(C, p, purchase, estimate) {
    const B = p.begroting = p.begroting || {};
    B.qty = B.qty || {}; B.ovr = B.ovr || {}; B.bew = B.bew || []; B.bal = B.bal || []; B.klant = B.klant || {}; B.stairs = B.stairs || {};
    // trap meerdere keren uitvoeren: onderdelen tellen zo vaak mee (stair.aantal)
    const T = C.tarief, inc = ZP.parts.metAantal(p.parts.filter(x => x.include !== false), p.stairs);
    const q = (key, auto) => (B.qty[key] !== undefined && B.qty[key] !== null && B.qty[key] !== '' ? +B.qty[key] : auto);
    const secs = [], warn = [];
    // regel: arbeid (uren × tarief) + materiaal; met vaste prijs: bedrag = vaste prijs × aantal (geen opslag, kostprijs ter controle)
    const line = (sec, key, label, opts) => {
      const o = Object.assign({ qty: 0, unit: '', u: 0, mat: 0, tarief: T.werk, note: '', edit: true, montage: false, cat: 'normaal', vast: null }, opts);
      const qty = o.fixedQty !== undefined ? o.fixedQty : q(key, o.qty);
      const uren = qty * (o.u || 0), arbeid = uren * o.tarief, mat = qty * (o.mat || 0), kost = arbeid + mat;
      const vast = o.vast && o.vast.vast > 0 ? o.vast : null;
      const totaal = vast ? qty * vast.vast : kost;
      const ov = B.ovr[key]; const def = ov !== undefined && ov !== null && ov !== '' ? +ov : totaal;
      const L = { key, label, qty, auto: o.qty, unit: o.unit, u: o.u, uren, arbeid, mat, kost, totaal, def, ovr: ov, note: o.note, edit: o.edit, montage: o.montage, cat: vast ? 'vast' : o.cat, vast, extra: o.extra };
      if (vast && vast.teLaag && qty) warn.push(`${label}: vaste prijs ${eur(vast.vast)} ligt onder kostprijs + marge (${eur(vast.min)}).`);
      sec.lines.push(L); return L;
    };
    const sec = (title, sub) => { const s = { title, sub, lines: [] }; secs.push(s); return s; };
    const houtUitIndeling = !!purchase;

    // 1. trap per trap (type trap bepaalt de tredennorm)
    const s1 = sec('Trap – werkplaats', 'Uren uit het Excel-bestand × uurtarief. Het hout staat bij "Hout, afwerking en beslag".');
    for (const st of p.stairs.length ? p.stairs : [{ id: null, name: p.name }]) {
      const pp = st.id ? inc.filter(x => x.stair === st.id) : inc;
      const cfg = B.stairs[st.id || '-'] = B.stairs[st.id || '-'] || {};
      cfg.type = cfg.type || guessType(pp.filter(x => !(x.kopie > 1)));
      // vorm bomen: 'auto' = per boom uit de tekening (ZP.parts.vorm), of handmatig Recht/Gebogen voor alle bomen van die soort.
      // Oude projecten bewaarden altijd 'Recht' als standaard → wordt 'auto'; 'Gebogen' was een eigen keuze en blijft.
      if (!cfg.vormV) { for (const f of ['boomVorm', 'keepVorm']) if (cfg[f] !== 'Gebogen') cfg[f] = 'auto'; cfg.vormV = 1; }
      cfg.boomVorm = cfg.boomVorm || 'auto'; cfg.keepVorm = cfg.keepVorm || 'auto';
      const nx = ZP.parts.aantalVan(st), pre = (p.stairs.length > 1 ? st.name + ' – ' : '') + (nx > 1 ? nx + ' × trap – ' : ''), k = (s) => (st.id || '-') + ':' + s;
      const cnt = (t) => pp.filter(x => x.type === t).length, len = (t) => pp.filter(x => x.type === t).reduce((a, x) => a + x.L, 0) / 1000;
      const nT = cnt('trede');
      // houtsoort-factor op de werkplaats-uren (C.houtFactor, Materialenlijst): gemiddelde over de stukken van de regel
      const hf = (list) => houtFactor(C, p, list), hfN = (f) => (Math.abs(f - 1) > 0.001 ? `houtsoort × ${f2(f)}` : '');
      const noot = (...a) => a.filter(Boolean).join(' · ');
      const typeKies = { stair: st.id || '-', field: 'type', options: C.traptypes, value: cfg.type };
      const trL = pp.filter(x => x.type === 'trede'), fT = hf(trL);
      if (C.tredenApart && C.tredeNorm) {
        // treden recht en verdreven apart (instelling; verdreven uit de tekening of eigen keuze per trede, B.verdreven)
        const vd = (x) => { const e = (B.verdreven || {})[String(x.id).split('*')[0]]; return e ? e === 'Verdreven' : isVerdreven(x); };
        let eerste = true;
        for (const soort of ['Recht', 'Verdreven']) {
          const l2 = trL.filter(x => vd(x) === (soort === 'Verdreven')); if (!l2.length && !B.qty[k('treden:' + soort)] && !(eerste && soort === 'Verdreven')) continue;
          line(s1, k('treden:' + soort), pre + 'Treden – ' + soort.toLowerCase(), { qty: l2.length, unit: 'treden', u: tredeSoortU(C, soort) * hf(l2), extra: eerste ? typeKies : undefined, note: noot(soort === 'Verdreven' ? 'verdreven uit de tekening' : '', hfN(hf(l2))) });
          eerste = false;
        }
      } else
      // één regel per trap; norm per type trap (het aandeel verdreven treden zit in het type)
      line(s1, k('treden'), pre + 'Treden', { qty: nT, unit: 'treden', u: tredeU(C, cfg.type) * fT, extra: typeKies, note: noot(C.treden[cfg.type] > 0 ? '' : 'type nog niet gemeten: gemiddelde', hfN(fT)) });
      // stootborden: norm per type trap (C.stootbordType), anders de algemene norm per stootbord
      if (cnt('stootbord') || B.qty[k('stootb')]) { const sb = pp.filter(x => x.type === 'stootbord'), fS = hf(sb), uT = +((C.stootbordType || {})[cfg.type]) || 0;
        line(s1, k('stootb'), pre + 'Stootborden', { qty: cnt('stootbord'), unit: 'stuks', u: (uT > 0 ? uT : C.stootbord) * fS, note: noot(uT > 0 ? 'norm voor ' + cfg.type.toLowerCase() : 'algemene norm (nog geen norm voor ' + cfg.type.toLowerCase() + ')', hfN(fS)) }); }
      // bomen: vorm per kant en per vlucht uit de configurator (B.boomVormen, sleutel type|Links|2), anders één vorm per soort
      // configurator (B.boomVormen) gaat voor; dan de keuze in de begroting; bij 'auto' wat de tekening zegt (onbekend = recht)
      // eigen keuze per boom (B.boomVormen['id:<onderdeel>'], begroting) gaat voor alles; kopieën (trap × aantal) volgen het origineel
      const vormVan = (x, std) => { const m = B.boomVormen || {}; return m['id:' + String(x.id).split('*')[0]] || m[x.type + '|' + x.side + '|' + x.nr] || m[x.type + '|' + x.side] || (std !== 'auto' ? std : ZP.parts.vorm(x) || 'Recht'); };
      const VORMKEUZE = [['auto', 'Uit tekening'], ...VORMEN];
      for (const [kind, key, lab, field] of [['trapboom', 'boom', 'Trapbomen', 'boomVorm'], ['keepboom', 'keep', 'Keepbomen', 'keepVorm']]) {
        const list = pp.filter(x => x.type === kind), std = cfg[field];
        // per boom te kiezen in de begroting (alleen de originelen, niet de kopieën van trap × aantal)
        const bomen = list.filter(x => !(x.kopie > 1)).map(x => ({ id: String(x.id).split('*')[0], lab: (x.side ? x.side.toLowerCase() : '') + (x.nr ? ' #' + x.nr : '') || (x.dispName || x.name), vorm: vormVan(x, std), eigen: (B.boomVormen || {})['id:' + String(x.id).split('*')[0]] || '' }));
        const kies = { stair: st.id || '-', field, options: VORMKEUZE, value: std, bomen };
        const bron = std === 'auto' && !B.boomVormen ? 'herkend uit de tekening' : '';
        const vormen = VORMEN.filter(vm => list.some(x => vormVan(x, std) === vm));
        if (vormen.length > 1) {
          vormen.forEach((vorm, i) => {
            const l2 = list.filter(x => vormVan(x, std) === vorm);
            line(s1, k(key + ':' + vorm), pre + lab + ' – ' + vorm.toLowerCase(), { qty: +(l2.reduce((a, x) => a + x.L, 0) / 1000).toFixed(2), unit: 'm', u: boomU(C, kind, vorm) * hf(l2),
              extra: i === 0 ? kies : undefined, note: noot([...new Set(l2.map(x => (x.side ? x.side.toLowerCase() : '') + (x.nr ? ' #' + x.nr : '')))].join(', ') + (bron ? ' (' + bron + ')' : ''), hfN(hf(l2))) });
          });
        } else if (list.length || B.qty[k(key)]) {
          const vorm = vormen[0] || (std !== 'auto' ? std : 'Recht');
          line(s1, k(key), pre + lab + (std === 'auto' && list.length ? ' – ' + vorm.toLowerCase() : ''), { qty: +len(kind).toFixed(2), unit: 'm', u: boomU(C, kind, vorm) * hf(list), extra: kies, note: noot(bron && list.length ? bron : '', hfN(hf(list))) });
        }
      }
      // versie 11: nesten frezen / keepen zagen per trede, per boom (aantal treden × aantal bomen van die soort, links/rechts);
      // norm per boom naar zijn vorm (een kant is gebogen als een deel ervan gebogen is)
      for (const [kind, lab, key, field] of [['trapboom', 'Trapbomen – nesten frezen', 'nest', 'boomVorm'], ['keepboom', 'Keepbomen – keepen zagen', 'keep', 'keepVorm']]) {
        const list = pp.filter(x => x.type === kind); if (!C[kind + 'Tred'] || (!list.length && !B.qty[k(key)])) continue;
        const sides = [...new Set(list.map(x => x.side).filter(Boolean))], nB = sides.length || Math.min(2, list.length);
        const vSide = sides.length ? sides.map(s => list.some(x => x.side === s && vormVan(x, cfg[field]) === 'Gebogen') ? 'Gebogen' : 'Recht')
          : Array(nB || 1).fill(list.some(x => vormVan(x, cfg[field]) === 'Gebogen') ? 'Gebogen' : (cfg[field] === 'Gebogen' ? 'Gebogen' : 'Recht'));
        const u = vSide.reduce((a, vm) => a + boomTredU(C, kind, vm), 0) / vSide.length, nG = vSide.filter(vm => vm === 'Gebogen').length;
        line(s1, k(key), pre + lab, { qty: nT * nB, unit: 'treden', u: u * hf(list), note: noot(`${nT} treden × ${nB} ${nB === 1 ? 'boom' : 'bomen'}${nG ? ` (${nG === vSide.length ? 'gebogen' : nG + ' gebogen'})` : ''} (normbestand: per trede)`, hfN(hf(list))) });
      }
      // spil: norm per tred die de spil bedient – voor élke spil waar treden op aansluiten (spiltrap, maar ook een hoek- of bordesspil).
      // Uit de tekening (3D-model: trede binnen 20 mm van de spil), per spil zelf aan te passen (B.spilTreden[spil]); zonder 3D-model
      // alle treden (zoals voorheen). Spillen zonder treden: per stuk (spilsoort eindspil). Spillen per soort uit de configurator gaan voor.
      if ((cnt('spil') || B.qty[k('spil')]) && !(B.spillen && cfg.type !== 'Spiltrap')) {
        const orig = (l) => l.filter(x => !(x.kopie > 1)), spO = orig(pp.filter(x => x.type === 'spil')), trO = orig(trL), fSp = hf(pp.filter(x => x.type === 'spil'));
        const heeftMesh = (x) => x.mesh && x.mesh.length, metMesh = spO.some(heeftMesh) && trO.some(heeftMesh);
        const spillen = spO.map(sp => { const b = String(sp.id).split('*')[0], eigen = (B.spilTreden || {})[b];
          const auto = metMesh ? (heeftMesh(sp) ? trO.filter(t => heeftMesh(t) && meshDichtbij(sp, t, 20)).length : 0) : null;
          return { id: b, lab: sp.dispName || sp.name, auto, eigen, n: eigen !== undefined && eigen !== null && eigen !== '' ? +eigen : auto }; });
        const perSpil = spillen.every(s => s.n !== null);
        const nTr = perSpil ? spillen.reduce((a, s) => a + s.n, 0) * nx : (cnt('spil') ? nT : 0);
        line(s1, k('spil'), pre + 'Spil – treden die de spil bedient', { qty: nTr, unit: 'treden', u: C.spil * fSp, extra: { spillen, stair: st.id || '-' },
          note: noot(perSpil ? spillen.map(s => `${s.lab}: ${s.n}`).join(', ') + (metMesh ? ' (uit de tekening)' : '') : 'geen 3D-model: alle treden geteld', 'norm per tred die de spil bedient', hfN(fSp)) });
        const los = perSpil ? spillen.filter(s => !(s.n > 0)).length * nx : 0, se = (C.spilSoorten || {}).eind || {};
        if ((los || B.qty[k('spillos')]) && !B.spillen) line(s1, k('spillos'), pre + 'Spillen zonder treden', { qty: los, unit: 'stuks', u: (+se.u || 0) * fSp, mat: houtUitIndeling ? 0 : +se.mat || 0,
          vast: se.vast > 0 ? check(C, se.vast, (+se.u || 0) * T.werk + (+se.mat || 0), se.vastKost) : null, note: 'per stuk (prijs van de eindspil, Prijzen → Spillen)' });
      }
      // opzetten/voorbereiden: vaste prijs per trap (C.opzetten.prijs; uren = de bewaakte kostprijs, later uit de metingen)
      { const oz = C.opzetten || {}, pr = +((oz.perType || {})[cfg.type]) || +oz.prijs || 0;
        if (pr > 0 || B.qty[k('opzet')]) line(s1, k('opzet'), pre + 'Voorbereiding (uitzetten, mallen, machines instellen)', { qty: 1, unit: 'trap', u: +oz.u || 0, vast: pr > 0 ? check(C, pr, (+oz.u || 0) * T.werk, oz.kost) : null, note: 'vaste prijs per trap' + (+oz.u > 0 ? ` · bewaakt met ${f1(oz.u)} uur` : '') }); }
      // normbestand versie 11: afwerken per onderdeel met de norm van de gekozen afwerking (olie kost meer tijd dan wit gegrond)
      if (C.afwNorm) {
        const B0 = B.afw || {}, afwVan = (t) => B0[t] || (t === 'trede' || t === 'leuning' ? B0.treden : B0.rest) || (afwByName(C, C.afwStd[t === 'trede' || t === 'leuning' ? 'treden' : 'rest']) || {}).id;
        const naam = (id) => (C.afwerkingen.find(a => a.id === id) || {}).naam || '?';
        const stootPlaat = pp.filter(x => x.type === 'stootbord').some(x => geenAfw(C, x.material)) || geenAfw(C, (p.typeMaterial || {}).stootbord);
        // eigen afwerking per stuk (Uitvoering: B.afwStuk[onderdeel]) → eigen regel per afwijkende afwerking (sleutel …:<afwerking>)
        const perStuk = (t, perM) => { const m = new Map(); for (const x of pp.filter(y => y.type === t)) { const id = afwVanStuk(C, B, x) || afwVan(t); m.set(id, (m.get(id) || 0) + (perM ? x.L / 1000 : 1)); } return m; };
        const regels = [['trede', 'Treden afwerken', perStuk('trede'), 'treden', 'afw:trede'],
          ['stootbord', 'Stootborden afwerken', stootPlaat ? new Map() : perStuk('stootbord'), 'stuks', 'afw:stootbord', stootPlaat ? 'plaatmateriaal (multiplex): niet afwerken' : ''],
          ['trapboom', 'Trapbomen afwerken', perStuk('trapboom', true), 'm', 'afw:trapboom'], ['keepboom', 'Keepbomen afwerken', perStuk('keepboom', true), 'm', 'afw:keepboom'],
          ['spil', 'Spil afwerken', new Map(cnt('spil') ? [[afwVan('spil'), nT]] : []), 'treden', 'afw:spil'], ['leuning', 'Leuning afwerken', perStuk('leuning', true), 'm', 'afw:leuning']];
        for (const [t, lab, groepen, unit, key, note] of regels) {
          const std = afwVan(t); if (!groepen.has(std)) groepen.set(std, 0);
          for (const [id, n] of groepen) {
            const qty = unit === 'm' ? +n.toFixed(2) : n, u = afwU(C, id, t), kk = id === std ? key : key + ':' + id;
            if (!(qty > 0 && u > 0) && !B.qty[k(kk)]) continue;
            line(s1, k(kk), pre + lab + ' – ' + naam(id), { qty, unit, u, note: note || `${f2(u)} u per ${unit === 'm' ? 'm' : unit === 'stuks' ? 'stootbord' : 'tred'} (normbestand)${id === std ? '' : ' · eigen keuze per stuk'}` });
          }
        }
      }
    }
    // spillen per soort (eind-, hoek-, tussenspil) met eigen stukprijs
    if (B.spillen) for (const [s, lab] of [['eind', 'Eindspillen'], ['hoek', 'Hoekspillen'], ['tussen', 'Tussenspillen']]) {
      const sp = (C.spilSoorten || {})[s] || {}; if (!(+B.spillen[s] > 0) && !(B.qty['spil:' + s] > 0)) continue;
      const v0 = sp.vast > 0 ? check(C, sp.vast, (+sp.u || 0) * T.werk + (+sp.mat || 0), sp.vastKost) : null;
      line(s1, 'spil:' + s, 'Trapspillen – ' + lab.toLowerCase(), { qty: +B.spillen[s] || 0, unit: 'stuks', u: +sp.u || 0, mat: +sp.mat || 0, vast: v0, note: 'trap en getekende balustrades' });
    }

    // 2. leuning en balustrade (prijs per meter, exclusief ophangen/plaatsen: dat staat bij montage en kan de klant zelf doen)
    const s2 = sec('Leuning en balustrade', 'Per meter, exclusief ophangen/plaatsen (staat bij Montage). Bij een vaste prijs bewaakt de app de kostprijs.');
    B.leuning = B.leuning || { profiel: 'Rond profiel', vorm: 'Recht' }; B.leun = B.leun || [];
    if (!B.leuning.hout || !(C.leuningHout || []).includes(B.leuning.hout)) B.leuning.hout = leunHoutVan(C, p);
    const leunM = inc.filter(x => x.type === 'leuning').reduce((a, x) => a + x.L, 0) / 1000;
    // één leuningregel: prijs per meter voor profiel × vorm × houtsoort (vaste prijs = incl. ophangen)
    const leunLine = (key, label, cfg, qo, uitIndeling) => {
      const lp = leuningPerM(C, cfg.profiel, cfg.vorm, cfg.hout), lv0 = C.leuningVast[leunKey(cfg.profiel, cfg.vorm, cfg.hout)];
      const lv = lv0 ? check(C, lv0.prijs, lp.maken, lv0.kost) : null, mat = uitIndeling ? 0 : lp.mat;
      const L = line(s2, key, label, Object.assign({ unit: 'm', u: lp.u, mat, vast: lv, extra: { leuning: cfg },
        note: (cfg.hout ? cfg.hout + ' · ' : '') + (lv ? `vaste prijs ${eur(lv.vast)}/m excl. ophangen · kostprijs ${eur(lp.maken)}/m · marge ${f1(lv.marge * 100)}%` : `kostprijs maken ${eur(lp.u * T.werk + mat)}/m${uitIndeling ? ' (hout in de inkooplijst)' : ''}`) }, qo));
      if (L.qty && !uitIndeling && !lp.mat && !lv) warn.push(`${label}: geen houtprijs voor ${cfg.profiel} in ${cfg.hout || '?'} (Prijzen en normen → Leuning).`);
      return L;
    };
    // hout van de getekende leuning zit in de inkooplijst als die er is; extra leuningen (niet getekend) altijd met hout per meter
    // per kant (configurator: B.leuningKant per "Links"/"Rechts") als de tekening de kant van de leuning kent
    const lk = B.leuningKant || {}, leunParts = inc.filter(x => x.type === 'leuning'), mOf = (l) => +(l.reduce((a, x) => a + x.L, 0) / 1000).toFixed(2);
    const leunLines = [];
    // recht of gebogen per leuningstuk: eigen keuze per stuk (B.boomVormen['id:…'], Uitvoering) → uit de tekening (B.leuning.auto)
    // → de keuze voor alle leuningen. Verschillende vormen = een regel per vorm (de eerste houdt de sleutel "leuning").
    const lVorm = (x) => (B.boomVormen || {})['id:' + String(x.id).split('*')[0]] || (B.leuning.auto ? leunVormTekening(p, B, x) : B.leuning.vorm);
    const leunPerVorm = (list) => {
      const vormen = VORMEN.filter(v => list.some(x => lVorm(x) === v)).sort((a, b) => (b === B.leuning.vorm) - (a === B.leuning.vorm));
      if (vormen.length < 2) { const v = vormen[0] || B.leuning.vorm;
        return void leunLines.push(leunLine('leuning', 'Leuning', v === B.leuning.vorm ? B.leuning : Object.assign({}, B.leuning, { vorm: v }), { qty: mOf(list) }, houtUitIndeling && list.length > 0)); }
      vormen.forEach((v, i) => leunLines.push(leunLine(i ? 'leuning:' + v : 'leuning', 'Leuning – ' + v.toLowerCase(), v === B.leuning.vorm ? B.leuning : Object.assign({}, B.leuning, { vorm: v }), { qty: mOf(list.filter(x => lVorm(x) === v)) }, houtUitIndeling)));
    };
    if (Object.keys(lk).length && leunParts.some(x => lk[x.side])) {
      for (const side of Object.keys(lk)) {
        const l2 = leunParts.filter(x => x.side === side); if (!l2.length) continue;
        leunLines.push(leunLine('leuning:' + side, `Leuning ${side.toLowerCase()} (${lk[side].plaats === 'muur' ? 'muur' : 'vrij'})`, Object.assign({}, B.leuning, lk[side]), { qty: mOf(l2), extra: {} }, houtUitIndeling));
      }
      const rest = leunParts.filter(x => !lk[x.side]);
      if (rest.length) leunPerVorm(rest);
    } else leunPerVorm(leunParts);
    const extraLeun = B.leun.map(l => ({ l, L: leunLine('leun:' + l.id, 'Leuning – ' + l.profiel.toLowerCase(), l, { fixedQty: +l.m || 0, extra: { leuning: l, extraLeun: l } }, false) }));
    const hasBal = inc.some(x => x.type === 'baluster');
    for (const bl of B.bal) {
      const ov = balVloerVan(B, bl), r = balRegel(C, balEffectief(B, bl)), pm = balustradePerM(C, r.cfg, bl.plaats);
      const bv = check(C, r.vast, pm.kost - pm.plaatsen, r.vastKost);
      // spijlhout zit al in de inkooplijst als de balusters getekend en ingedeeld zijn
      const matM = (houtUitIndeling && hasBal ? 0 : pm.matSp) + pm.slofMat;
      line(s2, 'bal:' + bl.id, 'Balustrade – ' + (bl.vloer ? bl.vloer + ' – ' : bl.kant ? bl.kant + ' – ' : '') + pm.spijl.naam, { fixedQty: +bl.m || 0, unit: 'm', u: pm.uren, mat: matM, vast: bv, extra: { bal: bl, cfg: r.cfg, spijl: pm.spijl, vloerKeuze: ov },
        note: `norm: maken + afwerken (grondverven) met ${pm.spijlStd.naam.toLowerCase()} · ${f1(pm.perM)} spijlen/m · tussenruimte ${r.cfg.tussen} mm${r.cfg.onderslof ? ' · met onderslof' : ''}${r.t ? ' · ' + (r.same ? 'volgens ' + r.t.naam : 'eigen samenstelling') : ''}${bv ? ` · vaste prijs ${eur(bv.vast)}/m excl. plaatsen · kostprijs ${eur(pm.kost - pm.plaatsen)}/m · marge ${f1(bv.marge * 100)}%` : ` · kostprijs ${eur(pm.kost - pm.plaatsen)}/m excl. plaatsen`}` });
      // ander spijltje dan standaard: meerprijs per stuk (zonder norm, geen opslag)
      if (pm.meer && !bv) { const n = Math.ceil(pm.perM * (+bl.m || 0));
        line(s2, 'balmeer:' + bl.id, `Meerprijs spijltjes – ${pm.spijl.naam}`, { fixedQty: n, unit: 'stuks', vast: { vast: pm.meer }, edit: false, note: `${eur(pm.meer)} per stuk t.o.v. ${pm.spijlStd.naam.toLowerCase()}` }); }
    }
    // getekende spijltjes (balusters in de tekening): gekozen spijltype (B.spijl, Uitvoering); een ander type dan het
    // standaardspijltje = meerprijs per stuk, net als bij een balustrade per meter
    { const nTek = inc.filter(x => x.type === 'baluster').length, std = balStdVan(C), sp = B.spijl && C.spijltypes.find(s => s.id === B.spijl);
      if (nTek && sp && sp.id !== std.spijl && +sp.meer > 0) line(s2, 'balmeer:tek', `Meerprijs getekende spijltjes – ${sp.naam}`, { fixedQty: nTek, unit: 'stuks', vast: { vast: +sp.meer }, edit: false, extra: { spijl: sp }, note: `${eur(sp.meer)} per stuk t.o.v. het standaardspijltje` }); }
    const nSpijl = B.bal.reduce((a, bl) => a + balustradePerM(C, balRegel(C, balEffectief(B, bl)).cfg).perM * (+bl.m || 0), 0);
    const leunTot = leunM + B.leun.reduce((a, l) => a + (+l.m || 0), 0);

    // 3. speciale bewerkingen (eventueel tegen vaste prijs per eenheid)
    const s3 = sec('Speciale bewerkingen', 'Uren uit Excel × uurtarief + materiaal, of de vaste prijs per eenheid.');
    // bewerking "alleen als optie op de offerte" (bw.optie, Uitvoering): niet in het totaal, wel als meerprijs (r.opties)
    const optieBew = [];
    for (const bw of B.bew) {
      const b = C.bewerkingen.find(x => x.id === bw.id); if (!b) continue;
      const v = check(C, b.vast, bewKost(C, b), b.vastKost);
      if (bw.optie) { optieBew.push({ bw, b, v }); continue; }
      // optie van één trap (Uitvoering, "Trappen wijken van elkaar af"): trapnaam erbij als het project meer trappen heeft
      const trapN = bw.trap && p.stairs.length > 1 ? (p.stairs.find(s => s.id === bw.trap) || {}).name : '';
      line(s3, 'bew:' + bw.key, b.naam + (trapN ? ' – ' + trapN : ''), { fixedQty: +bw.n || 0, unit: b.eenheid.replace(/^per /, ''), u: b.u, mat: b.mat, vast: v, extra: { bew: bw },
        note: b.onderdeel + ' · ' + (v ? `vaste prijs ${eur(v.vast)}` : `kostprijs ${eur(bewKost(C, b))}`) + ' ' + b.eenheid + (bw.parts && bw.parts.length ? ' · op ' + partList(p, bw.parts) : '') });
    }

    // 4. hout, afwerking en beslag
    const s4 = sec('Hout, afwerking en beslag', 'Materiaalprijzen uit de app.');
    if (purchase) {
      const tot = purchase.reduce((a, e) => a + e.n * e.price, 0) + (purchase.glue ? purchase.glue.total : 0);
      line(s4, 'hout', 'Hout volgens inkooplijst (indeling)', { fixedQty: 1, unit: 'post', mat: tot, note: purchase.reduce((a, e) => a + e.n, 0) + ' planken' + (purchase.glue ? ' + lijmkosten' : ''), edit: false });
      // restmateriaal dat terug op de plank gaat: een percentage van de waarde van de bruikbare reststukken eraf
      // (purchase.rest = waarde uit de indeling; percentage per project B.restPct, anders C.tarief.restPct)
      const rp = B.restPct !== undefined && B.restPct !== '' ? +B.restPct : +T.restPct || 0, rw = +(purchase.rest || {}).waarde || 0;
      if (rw > 0 && (rp > 0 || B.restPct !== undefined)) line(s4, 'houtrest', 'Restmateriaal terug', { fixedQty: 1, unit: 'post', mat: -rw * rp, edit: false, extra: { rest: true, pct: rp, waarde: rw, n: purchase.rest.n },
        note: `${f1(rp * 100).replace(/,0$/, '')}% van ${eur(rw)} aan bruikbare reststukken (${purchase.rest.n} stuks)` });
    } else if (estimate) {
      line(s4, 'hout', 'Hout – schatting (bereken de indeling voor de exacte inkoop)', { fixedQty: 1, unit: 'post', mat: estimate.bedrag, note: `${f1(estimate.m3 * 1000)} dm³ netto × gemiddelde m³-prijs × afvalfactor ${f1(T.afval)}`, edit: false });
      warn.push('Het hout is geschat. Bereken de indeling voor de exacte inkooplijst.');
    }
    const opp = (list) => list.reduce((a, x) => a + 2 * Math.abs(ZP.geom.area(x.poly)) / 1e6 + 2 * (x.L + x.W) * x.thickness / 1e6, 0);
    B.afw = B.afw || {};
    // afwerking per soort onderdeel, zoals de houtsoort (wens gebruiker): B.afw[type]; zonder eigen keuze de oude groepskeuze
    // (B.afw.treden voor treden en leuning, B.afw.rest voor de rest) en anders de standaard
    const afwIdVan = (t) => { const ok = (id) => id && C.afwerkingen.some(a => a.id === id) ? id : null, g = t === 'trede' || t === 'leuning' ? 'treden' : 'rest';
      return ok(B.afw[t]) || ok(B.afw[g]) || (afwByName(C, C.afwStd[g] || C.afwStd.rest) || {}).id; };
    const afwRegels = Object.keys(ZP.parts.TYPES).sort((a, b) => ZP.parts.TYPES[a].order - ZP.parts.TYPES[b].order)
      .filter(t => inc.some(x => x.type === t)).map(t => [t, ZP.parts.TYPES[t].label.toLowerCase(), inc.filter(x => x.type === t)]);
    // normbestand versie 11: niet-afgewerkt plaatmateriaal (multiplex stootborden) telt niet mee; de uren per m² gelden alleen voor
    // delen zonder eigen afwerknorm (leuning, balusters …), de rest staat als "… afwerken" bij Trap – werkplaats
    const AFW_EIGEN = ['trede', 'stootbord', 'trapboom', 'keepboom', 'spil', 'leuning'];
    for (const [k, lab, list0] of afwRegels) {
      const std = afwIdVan(k);
      const lijst = C.afwNorm ? list0.filter(x => !(x.type === 'stootbord' && (geenAfw(C, x.material) || geenAfw(C, (p.typeMaterial || {}).stootbord)))) : list0;
      // eigen afwerking per stuk (B.afwStuk) → eigen regel "afw:<soort>:<afwerking>"; de regel van de soort blijft altijd staan (keuzelijst)
      const groepen = new Map([[std, []]]);
      for (const x of lijst) { const id = afwVanStuk(C, B, x) || std; if (!groepen.has(id)) groepen.set(id, []); groepen.get(id).push(x); }
      for (const [id, list] of groepen) {
        const a = C.afwerkingen.find(x => x.id === id), eigen = id !== std;
        const m2 = opp(list), mU = C.afwNorm && m2 ? opp(list.filter(x => !AFW_EIGEN.includes(x.type))) / m2 : 1;
        line(s4, 'afw:' + k + (eigen ? ':' + id : ''), 'Afwerking ' + lab + ' – ' + (a ? a.naam : '?'), { qty: +m2.toFixed(1), unit: 'm²', u: a ? (+a.uM2 || 0) * mU : 0, mat: afwMat(a),
          extra: eigen ? { afwStuk: k, value: id, n: list.length } : { afw: k, value: a ? a.id : '' }, note: (eigen ? `eigen keuze voor ${list.length} ${list.length === 1 ? 'stuk' : 'stuks'} · ` : '') + (a && a.dekking ? `${a.lagen} lagen, ${a.dekking} m²/liter, ${eur(a.prijsL)}/liter${a.uM2 && mU > 0 ? `, ${a.uM2} u/m² extra` : ''}` : '') + (C.afwNorm ? ' · uren afwerken per onderdeel bij Trap – werkplaats' : '') });
      }
    }
    const nTr = inc.filter(x => x.type === 'trede').length, nTrap = Math.max(1, p.stairs.reduce((a, s) => a + ZP.parts.aantalVan(s), 0));
    const perMult = { 'per tred': nTr, 'per trap': nTrap, 'per m leuning': leunTot, 'per spijl': nSpijl, 'per stuk': 0 };
    // gekozen leuningdrager vervangt de standaard muurleuninghouder uit het beslag.
    // Trappen wijken van elkaar af (trappenApart): per trap B.dragerTrap[sid] = {id ('' = zoals het project, 'std' = standaard houder), kanten}
    const apartT = trappenApart(p), drP = B.drager || null;
    const drVan = (sid) => { const o = apartT && sid ? (B.dragerTrap || {})[sid] : null;
      const id = o && o.id ? (o.id === 'std' ? '' : o.id) : (drP && drP.id) || '';
      return { id: (C.dragers || []).some(d => d.id === id) ? id : '', kanten: o && o.kanten ? o.kanten : (drP && drP.kanten) || null }; };
    const dr = drP && (C.dragers || []).find(d => d.id === drP.id);
    // aantal dragers per getekend leuningstuk (regel gebruiker): tot 1,70 m 2, tot 3 m 3, langer ±70 cm onderling (minimaal 4)
    const dragersVoor = (m) => (m <= 0 ? 0 : m <= 1.7 ? 2 : m <= 3 ? 3 : Math.max(4, Math.round(m / 0.7)));
    // alleen een muurleuning krijgt dragers; een leuning op een balustrade niet (regel gebruiker).
    // Muur of vrij per kant: gekozen drager-kanten → keuze per kant (leuningKant) → balusters aan die kant in de tekening = vrij.
    // Leuning zonder kant: muur als er geen balusters getekend zijn. Extra leuningen (B.leun, bv. een muurleuning) = muur.
    const balKant = (side) => inc.some(x => x.type === 'baluster' && x.side === side);
    const isMuur = (x) => { const k = drVan(x.stair).kanten; return !x.side ? !inc.some(y => y.type === 'baluster') : k ? k.includes(x.side) : lk[x.side] ? lk[x.side].plaats === 'muur' : !balKant(x.side); };
    const stukken = [...leunParts.filter(isMuur).map(x => ({ side: x.side, m: x.L / 1000, d: drVan(x.stair) })), ...B.leun.map(l => ({ side: null, m: +l.m || 0, d: drVan('') }))].filter(x => x.m > 0);
    const telDragers = (list) => list.reduce((a, x) => a + dragersVoor(x.m), 0);
    const dragerUitleg = 'per leuningstuk: tot 1,70 m 2, tot 3 m 3, langer ±70 cm onderling';
    // welke stukken krijgen een gekozen drager: leuning aan de muurkant(en) uit de tekening; zonder kant in de tekening alle muurleuning
    const heeftKant = leunParts.some(x => x.side), metDrager = (x) => !(x.d.kanten && heeftKant) || x.d.kanten.includes(x.side);
    // per soort drager één regel (de keuze van het project houdt de sleutel "drager"; een andere soort van een trap: drager:<id>)
    const soorten = [...new Set([...(dr ? [dr.id] : []), ...stukken.filter(x => x.d.id).map(x => x.d.id)])].sort((a, b) => (b === (dr && dr.id)) - (a === (dr && dr.id)));
    for (const id of soorten) { const d = C.dragers.find(x => x.id === id), proj = dr && id === dr.id;
      const trappen = apartT ? [...new Set(leunParts.filter(x => drVan(x.stair).id === id).map(x => (p.stairs.find(s => s.id === x.stair) || {}).name).filter(Boolean))] : [];
      line(s4, proj ? 'drager' : 'drager:' + id, 'Leuningdragers – ' + d.naam, { qty: telDragers(stukken.filter(x => x.d.id === id && metDrager(x))), unit: 'stuks', mat: +d.prijs || 0, extra: { drager: proj ? B.drager : { id } },
        note: dragerUitleg + ', alleen de muurleuning (leuning op een balustrade heeft geen dragers)' + (trappen.length && soorten.length > 1 ? ' · ' + trappen.join(', ') : '') }); }
    // stukken zonder gekozen drager: standaard muurleuninghouder uit het beslag
    const zonder = stukken.filter(x => !x.d.id);
    for (const s of C.beslag) {
      const houder = /muurleuninghouder/i.test(s.naam) && s.per === 'per m leuning';
      if (/muurleuninghouder/i.test(s.naam) && (houder ? (stukken.length ? !zonder.length : !!dr) : dr)) continue;
      const auto = houder ? telDragers(zonder) : Math.round(s.std * (perMult[s.per] || 0) * 10) / 10;
      if (!auto && !(B.qty['bs:' + s.id] > 0)) continue;
      line(s4, 'bs:' + s.id, s.naam, { qty: auto, unit: s.eenheid, mat: s.prijs, note: houder ? dragerUitleg + ', alleen de muurleuning' : `${s.std} ${s.per}` });
    }

    // 5. montage en transport (ophangen/plaatsen vervalt waar een vaste prijs dat al bevat)
    const s5 = sec('Montage en transport', 'Montagenormen uit Excel × montagetarief.');
    // zonder montage (alleen leveren): montageregels automatisch 0, één rit
    const mo = (key, label, auto, u, unit, note) => line(s5, key, label, { qty: B.geenMontage ? 0 : auto, unit, u, tarief: T.montage, montage: true, note: B.geenMontage ? 'alleen leveren, geen montage' : note });
    mo('zetten', 'Trap zetten', nTrap, C.montage.zetten, 'trap');
    if (B.sloop || B.qty.sloop) line(s5, 'sloop', 'Oude trap verwijderen', { qty: B.sloop ? nTrap : 0, unit: 'trap', u: C.montage.sloop || 0, tarief: T.montage, montage: true });
    // ophangen/plaatsen altijd apart (ook bij een vaste meterprijs: die is exclusief montage); vervalt als de klant het zelf doet
    // (B.zelf.leuning / B.zelf.balustrade voor alles, of per extra leuning / balustrade: zelf = true)
    const zelf = B.zelf || {};
    for (const L of leunLines) if ((L.qty > 0 || (L.key === 'leuning' && B.qty.ophangen)) && !zelf.leuning)
      mo(L.key === 'leuning' ? 'ophangen' : 'ophangen:' + L.key, L.key === 'leuning' ? 'Leuning ophangen' : L.label.replace(/^Leuning/, 'Leuning ophangen'), +L.qty.toFixed(2), C.montage.leuningOphangen, 'm');
    for (const { l, L } of extraLeun) if (L.qty > 0 && !zelf.leuning && !l.zelf) mo('ophangen:' + l.id, 'Leuning ophangen – ' + l.profiel.toLowerCase(), L.qty, C.montage.leuningOphangen, 'm');
    for (const bl of B.bal) {
      if (zelf.balustrade || bl.zelf) continue;
      mo('plaats:' + bl.id, 'Balustrade plaatsen – ' + (bl.plaats === 'verdieping' ? 'op de verdieping' : 'op de boom'), +bl.m || 0, bl.plaats === 'verdieping' ? C.montage.balVerdieping : C.montage.balBoom, 'm');
    }
    mo('aftimmering', 'Aftimmering trapgat', 0, C.montage.aftimmering, 'm');
    mo('trapgat', 'Trapgat aanpassen', 0, C.montage.trapgat, 'keer');
    const ritten = q('ritten', B.geenMontage ? 1 : 2), km = q('km', 0), reis = q('reistijd', 0);
    line(s5, 'reis', 'Reistijd', { fixedQty: ritten, unit: 'ritten', u: reis, tarief: T.montage, montage: true, edit: false, note: `${ritten} ritten × ${f1(reis)} uur` });
    // kilometers zijn een doorberekende kostenpost: geen opslag op materiaal
    line(s5, 'kmverg', 'Kilometervergoeding', { fixedQty: ritten * 2 * km, unit: 'km', mat: T.km, edit: false, cat: 'transport', note: `${ritten} ritten × 2 × ${km} km` });

    // samenvatting
    const all = secs.flatMap(s => s.lines);
    const sum = (f) => all.reduce((a, l) => a + (f(l) || 0), 0);
    const normaal = all.filter(l => l.cat === 'normaal');
    const arbeid = normaal.reduce((a, l) => a + l.arbeid, 0), mat = normaal.reduce((a, l) => a + l.mat, 0);
    const transport = sum(l => (l.cat === 'transport' ? l.totaal : 0)), vast = sum(l => (l.cat === 'vast' ? l.totaal : 0));
    const corr = sum(l => l.def - l.totaal);
    const kostprijs = sum(l => l.kost);                                   // werkelijke kosten (ook achter vaste prijzen)
    const opA = B.opslagArbeid !== undefined && B.opslagArbeid !== '' ? +B.opslagArbeid : T.opslagArbeid;
    const opM = B.opslagMat !== undefined && B.opslagMat !== '' ? +B.opslagMat : T.opslagMat;
    const btw = B.btw !== undefined && B.btw !== '' ? +B.btw : T.btw;
    const korting = +B.korting || 0;
    const sub = arbeid + mat + transport + vast + corr;
    const excl = sub + arbeid * opA + mat * opM - korting;
    const marge = excl - kostprijs;
    if (excl > 0 && marge < kostprijs * (+T.minMarge || 0) - 0.005) warn.push(`Marge ${eur(marge)} (${f1(marge / (kostprijs || 1) * 100)}%) ligt onder de minimale marge van ${f1((T.minMarge || 0) * 100)}%.`);
    // meerprijs van de opties: vaste prijs, of kostprijs met dezelfde opslagen als de rest
    const opties = optieBew.map(({ bw, b, v }) => { const n = +bw.n || 0, vast = v && v.vast > 0 ? v.vast : 0;
      const ex = vast ? n * vast : n * ((+b.u || 0) * T.werk * (1 + opA) + (+b.mat || 0) * (1 + opM));
      return { key: bw.key, id: b.id, label: b.naam + (n !== 1 ? ` (${f2(n).replace(/,00$/, '')} ${b.eenheid.replace(/^per /, '')})` : ''), n, excl: ex, incl: ex * (1 + btw) }; });
    return { secs, warn, opties, houtUitIndeling, geschat: !purchase && !!estimate,
      tot: { urenWerk: sum(l => l.montage ? 0 : l.uren), urenMontage: sum(l => l.montage ? l.uren : 0), arbeid, mat, transport, vast, corr, sub, kostprijs, opA, opM, opslagA: arbeid * opA, opslagM: mat * opM, korting, excl, marge, btw, btwBedrag: excl * btw, incl: excl * (1 + btw), perTrede: nTr ? excl / nTr : 0 } };
  }
  // korte lijst van onderdeelnamen, bv. "Trede #1, Trede #2 … (+5)"
  const partList = (p, ids) => { const n = ids.map(id => p.parts.find(x => x.id === id)).filter(Boolean).map(x => x.dispName || x.name); return n.slice(0, 4).join(', ') + (n.length > 4 ? ` … (+${n.length - 4})` : ''); };
  const eur = (v) => '€ ' + (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f1 = (v) => (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const f2 = (v) => (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Excel inlezen: alleen de uren ----------
  // Gelezen op kopteksten en labels, niet op vaste cellen: regels toevoegen in het Excel-bestand mag.
  // Items worden op naam gekoppeld: materiaalprijzen, vaste prijzen en tekeningen uit de app blijven behouden.
  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Excel-lezer kon niet geladen worden (internet nodig).')); document.head.appendChild(s); });
  }
  async function importXlsx(C, buf, fileName) {
    const X = await loadXlsxLib();
    const wb = X.read(buf, { type: 'array' });
    const rows = (name) => { const ws = wb.Sheets[name]; return ws ? X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) : null; };
    const num = (v) => (typeof v === 'number' ? v : (v === '' || v === null || v === undefined ? null : (isNaN(parseFloat(String(v).replace(',', '.'))) ? null : parseFloat(String(v).replace(',', '.')))));
    const col = (c) => c.charCodeAt(0) - 65, uu = (v) => (num(v) > 0 ? num(v) : null);
    const got = [], warn = [], nieuw = [];
    const norm = rows('Norm');
    if (!norm) throw new Error('Blad "Norm" niet gevonden. Is dit het normtijden-bestand?');
    const secStart = (re) => norm.findIndex(r => re.test(String(r[0] || '')));
    const secRows = (re) => { const i = secStart(re); if (i < 0) return []; const out = []; for (let j = i + 1; j < norm.length; j++) { const a = String(norm[j][0] || ''); if (/^[A-I]\.\s/.test(a)) break; out.push(norm[j]); } return out; };
    // versie 11: treden per soort (recht/verdreven) en normen zonder afwerken; kolommen op kopregel zoeken
    const kop = (re) => { const i = secStart(re); return i < 0 ? [] : (norm[i + 1] || []).map(x => String(x).toLowerCase().trim()); };
    const kol = (h, re) => h.findIndex(x => re.test(x));
    const v11 = kop(/^A\.\s*Norm treden/i).some(x => /^soort trede/.test(x));
    if (v11) {
      const hA = kop(/^A\.\s*Norm treden/i), kS = kol(hA, /^sleutel/), kT = kol(hA, /^totaal uur per tred/);
      C.tredeNorm = {};
      for (const r of secRows(/^A\.\s*Norm treden/i).slice(1)) { const key = String(r[kS] || '').trim(); if (!key) continue; if (key === 'GEM') C.tredeNormGem = uu(r[kT]); else C.tredeNorm[key] = uu(r[kT]); }
      const hB = kop(/^B\.\s*Norm stootborden/i), kB = kol(hB, /^totaal uur per stootbord/);
      for (const r of secRows(/^B\.\s*Norm stootborden/i)) if (/^stootborden/i.test(String(r[0])) && uu(r[kB])) C.stootbord = uu(r[kB]);
      // bomen: per meter (zonder nesten/keepen) + per trede (nesten frezen / keepen zagen)
      const vormen11 = (re, kind) => { const h = kop(re), s = kol(h, /^sleutel/), t = kol(h, /^totaal uur per meter/), pt = kol(h, /^uren per trede/);
        C[kind + 'Tred'] = pt >= 0 ? {} : null;
        for (const r of secRows(re).slice(1)) { const key = String(r[s] || '').trim(); if (!key) continue;
          if (key === 'GEM') { if (uu(r[t])) C[kind + 'Gem'] = uu(r[t]); if (pt >= 0) C[kind + 'TredGem'] = uu(r[pt]); }
          else { C[kind][key] = uu(r[t]); if (pt >= 0) C[kind + 'Tred'][key] = uu(r[pt]); } } };
      vormen11(/^C\.\s*Norm trapbomen/i, 'trapboom'); vormen11(/^D\.\s*Norm keepbomen/i, 'keepboom');
      const hE = kop(/^E\.\s*Norm spil/i), kE = kol(hE, /^totaal uur per tred/);
      for (const r of secRows(/^E\.\s*Norm spil/i)) if (/^spil/i.test(String(r[0])) && uu(r[kE])) C.spil = uu(r[kE]);
      // H. afwerken per soort afwerking en per onderdeel
      const hH = kop(/^H\.\s*Norm afwerken/i), kH = { trede: kol(hH, /^uren per tred$/), stootbord: kol(hH, /^uren per stootbord/), trapboom: kol(hH, /^uren per m trapboom/), keepboom: kol(hH, /^uren per m keepboom/), spil: kol(hH, /^uren per tred spil/), leuning: kol(hH, /^uren per m leuning/) };
      C.afwNorm = {};
      // alleen regels met minstens één getal: uitlegtekst onder de tabel is geen afwerking
      for (const r of secRows(/^H\.\s*Norm afwerken/i).slice(1)) { const naam = String(r[0] || '').trim(); if (!naam || !Object.values(kH).some(i => i >= 0 && num(r[i]) !== null)) continue; const o = {}; for (const [k, i] of Object.entries(kH)) o[k] = i >= 0 ? num(r[i]) || 0 : 0; C.afwNorm[naam] = o; }
      // Instellingen: materialen die niet worden afgewerkt (kolom "Afwerken nodig?" = Nee, bv. multiplex)
      const ins = rows('Instellingen') || [], hi = ins.findIndex(r => r.some(x => /^afwerken nodig/i.test(String(x).trim())));
      if (hi >= 0) { const ki = ins[hi].findIndex(x => /^afwerken nodig/i.test(String(x).trim())); C.geenAfwerking = ins.slice(hi + 1).filter(r => String(r[0] || '').trim() && /^nee$/i.test(String(r[ki] || '').trim())).map(r => String(r[0]).trim()); }
      C.normVersie = 11;
      got.push('treden (recht/verdreven)', 'afwerken per afwerking (' + Object.keys(C.afwNorm).length + ')');
    } else {
      for (const r of secRows(/^A\.\s*Norm treden/i)) {
        const key = String(r[col('J')] || '').trim(); if (!key) continue;
        if (key === 'GEM') { if (uu(r[col('H')])) C.tredenGem = uu(r[col('H')]); }
        else { C.treden[key] = uu(r[col('H')]); if (!C.traptypes.includes(key)) C.traptypes.push(key); }
      }
      got.push('treden');
      for (const r of secRows(/^B\.\s*Norm stootborden/i)) if (/^stootborden/i.test(String(r[0])) && uu(r[col('F')])) C.stootbord = uu(r[col('F')]);
      const vormen = (re, kind) => { for (const r of secRows(re)) { const key = String(r[col('J')] || '').trim(); if (!key) continue; if (key === 'GEM') { if (uu(r[col('H')])) C[kind + 'Gem'] = uu(r[col('H')]); } else C[kind][key] = uu(r[col('H')]); } };
      vormen(/^C\.\s*Norm trapbomen/i, 'trapboom'); vormen(/^D\.\s*Norm keepbomen/i, 'keepboom');
      for (const r of secRows(/^E\.\s*Norm spil/i)) if (/^spil/i.test(String(r[0])) && uu(r[col('G')])) C.spil = uu(r[col('G')]);
      // ouder normbestand: afwerken zit in de normen, geen aparte afwerknormen
      C.tredeNorm = null; C.afwNorm = null; C.geenAfwerking = []; C.trapboomTred = null; C.keepboomTred = null; C.normVersie = 10;
    }
    for (const r of secRows(/^F\.\s*Norm balustrade/i)) {
      // spaties rond profielnaam/vorm weg ("Sleutelgat profiel |Recht"), anders ontstaat een tweede profiel
      const a = String(r[0] || ''), key = String(r[col('F')] || '').split('|').map(x => x.trim()).join('|');
      if (/^onderslof/i.test(a)) { if (uu(r[col('C')])) C.onderslof = uu(r[col('C')]); }
      else if (/^grondverven/i.test(a)) { if (uu(r[col('C')])) C.grondverven = uu(r[col('C')]); }
      else if (/^spil schaven/i.test(a)) { if (uu(r[col('C')])) C.spilSchaven = uu(r[col('C')]); }
      else if (key.includes('|')) {
        if (key.startsWith('GEM|')) C.leuningGem[key.slice(4)] = uu(r[col('D')]);
        else { C.leuning[key] = uu(r[col('D')]); const prof = key.split('|')[0]; if (prof && !C.profielen.includes(prof)) { C.profielen.push(prof); if (!C.leuningMat[prof] || typeof C.leuningMat[prof] !== 'object') C.leuningMat[prof] = {}; } }
      }
    }
    // opruimen na eerder inlezen: profielnamen met spaties samenvoegen met de nette naam
    const netK = (k) => k.split('|').map(x => x.trim()).join('|');
    C.profielen = [...new Set(C.profielen.map(x => String(x).trim()))];
    for (const obj of [C.leuning, C.leuningMat, C.leuningVast]) for (const k of Object.keys(obj || {})) {
      const n = netK(k); if (n === k) continue;
      const leeg = (x) => x === null || x === undefined || (typeof x === 'object' && !Object.keys(x).length);
      if (leeg(obj[n])) obj[n] = obj[k];
      delete obj[k];
    }
    got.push('bomen, spil, leuning');
    const mon = { 'trap zetten': 'zetten', 'leuningen ophangen': 'leuningOphangen', 'balustrade plaatsen – op de boom': 'balBoom', 'balustrade plaatsen – op de verdieping': 'balVerdieping', 'aftimmering trapgat': 'aftimmering', 'trapgat aanpassen': 'trapgat' };
    for (const r of secRows(/^G\.\s*Norm montage/i)) { const a = String(r[0] || '').toLowerCase(); for (const [lab, k] of Object.entries(mon)) if (a.startsWith(lab) && uu(r[col('D')])) C.montage[k] = uu(r[col('D')]); }
    got.push('montage');
    // tabel met kopregel lezen: {kolomnaam-regex: veld}
    const table = (sheet, firstHead, cols) => {
      const t = rows(sheet); if (!t) return null;
      const h = t.findIndex(r => new RegExp('^' + firstHead + '$', 'i').test(String(r[0] || '').trim())); if (h < 0) return null;
      const hdr = t[h].map(x => String(x).toLowerCase().trim());
      const idx = {}; for (const [k, re] of Object.entries(cols)) idx[k] = hdr.findIndex(x => re.test(x));
      const out = [];
      for (let j = h + 1; j < t.length; j++) { const naam = String(t[j][0] || '').trim(); if (!naam) continue; const o = { naam }; for (const [k, i] of Object.entries(idx)) o[k] = i >= 0 ? t[j][i] : ''; out.push(o); }
      return out;
    };
    // samenvoegen op naam: uren uit Excel, de rest (prijzen, vaste prijs, tekening) uit de app
    const merge = (list, src, fill, mk) => list ? src.map(r => { const old = list.find(x => x.naam === r.naam); if (!old) nieuw.push(r.naam); return Object.assign(old ? Object.assign({}, old) : mk(r), { naam: r.naam }, fill(r)); }) : null;
    const bw = table('Bewerkingen', 'bewerking', { onderdeel: /^onderdeel/, eenheid: /^eenheid/, u: /norm uren per eenheid/ });
    if (bw && bw.length) { C.bewerkingen = merge(C.bewerkingen, bw, r => ({ onderdeel: String(r.onderdeel || 'Overig'), eenheid: String(r.eenheid || 'per stuk'), u: num(r.u) || 0 }), () => ({ id: uid('b'), mat: 0 })); got.push(bw.length + ' bewerkingen'); }
    else warn.push('blad Bewerkingen niet gevonden');
    // meerprijs per stuk (kolom "Meerprijs per stuk"): een getal in Excel gaat voor, leeg = de waarde uit de app blijft
    const sp = table('Spijlen', 'spijltype', { u: /norm uren per spijl/, meer: /^meerprijs/ });
    if (sp && sp.length) { C.spijltypes = merge(C.spijltypes, sp, r => Object.assign({ u: num(r.u) || 0 }, num(r.meer) !== null ? { meer: num(r.meer) } : {}), () => ({ id: uid('sp'), breedte: 40, mat: 0, meer: 0 })); got.push(sp.length + ' spijltypes'); }
    else warn.push('blad Spijlen niet gevonden (oudere versie): spijltypes niet bijgewerkt');
    const af = table('Afwerking', 'afwerking', { uM2: /extra uren per m/ });
    if (af && af.length) { C.afwerkingen = merge(C.afwerkingen, af, r => ({ uM2: num(r.uM2) || 0 }), () => ({ id: uid('af'), product: '', prijsL: 0, dekking: 0, lagen: 1 })); got.push(af.length + ' afwerkingen'); }
    // balustrades verwijzen naar een spijltype dat niet meer bestaat: eerste type nemen
    for (const b of C.balustrades) if (!C.spijltypes.some(s => s.id === b.spijl)) b.spijl = (C.spijltypes[0] || {}).id;
    const now = new Date();
    C.sourceFile = fileName; C.sourceDate = now.toISOString();
    C.source = `${fileName} (ingelezen ${now.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })})`;
    return { got, warn, nieuw };
  }

  // ---------- normen in de app bewerken (PLAN fase 7) ----------
  // Elke norm heeft een pad ("montage::zetten", "treden::Kwartslag", "bew::<id>", "spijl::<id>", "afw::<id>", "afwNorm::<naam>::trede").
  // C.normBron[pad] = {bron: 'hand'|'gemeten', datum, excel: waarde uit Excel}: zo'n norm wordt bij opnieuw inlezen van Excel
  // niet overschreven (de Excel-waarde wordt wel onthouden, zodat terugzetten kan). Zonder vermelding = bron Excel.
  const NS = '::';
  function normRef(C, pad) {
    const k = pad.split(NS);
    if (k[0] === 'bew' || k[0] === 'spijl' || k[0] === 'afw') { const o = (k[0] === 'bew' ? C.bewerkingen : k[0] === 'spijl' ? C.spijltypes : C.afwerkingen).find(x => x.id === k[1]); return o ? [o, k[0] === 'afw' ? 'uM2' : 'u'] : null; }
    let o = C; for (const s of k.slice(0, -1)) { if (o[s] === null || typeof o[s] !== 'object') o[s] = {}; o = o[s]; }
    return [o, k[k.length - 1]];
  }
  const normGet = (C, pad) => { const r = normRef(C, pad); return r ? r[0][r[1]] : null; };
  function normSet(C, pad, v, bron = 'hand', meer) {
    const r = normRef(C, pad); if (!r) return;
    C.normBron = C.normBron || {};
    const e = C.normBron[pad] || { excel: r[0][r[1]] === undefined ? null : r[0][r[1]] };
    C.normBron[pad] = Object.assign(e, { bron, datum: new Date().toISOString().slice(0, 10) }, meer || {});
    r[0][r[1]] = v;
  }
  function normTerug(C, pad) { const e = (C.normBron || {})[pad], r = normRef(C, pad); if (!e) return; if (r) r[0][r[1]] = e.excel; delete C.normBron[pad]; }
  // rond het inlezen van Excel: eigen normen bewaren en daarna terugzetten (de nieuwe Excel-waarde wordt de "excel" van die norm)
  const normBewaar = (C) => Object.keys(C.normBron || {}).map(pad => [pad, normGet(C, pad)]);
  function normHerstel(C, lijst) { for (const [pad, v] of lijst) { const r = normRef(C, pad), e = (C.normBron || {})[pad]; if (!r || !e) continue; e.excel = r[0][r[1]] === undefined ? null : r[0][r[1]]; r[0][r[1]] = v; } }
  const normBronVan = (C, pad) => (C.normBron || {})[pad] || null;

  return { afwGemeten, normGet, normSet, normTerug, normBewaar, normHerstel, normBronVan, NS, houtFactor, defaults, ensure, TRAPTYPES, VORMEN, PROFIELEN, STATUS, tredeU, tredeSoortU, afwU, afwVanStuk, afwVanPart, geenAfw, isVerdreven, boomU, boomTredU, leuningU, bewKost, afwMat, afwPrijs, leuningPerM, leunKey, leunHoutVan, balRegel, trappenApart, stukVorm, leunVormTekening, balVloerVan, balEffectief, balustradePerM, balStdVan, balStdPrijs, check, signalen, setVast, guessType, begroting, importXlsx, uid };
})();
