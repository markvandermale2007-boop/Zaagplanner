// Configurator: de trap samen met de klant vastleggen, nog zonder tekening. Opgebouwd zoals StairDesigner:
// een model (Model 1–10 of een andere vorm), standaardkeuzes voor de hele trap, en per kant (links/rechts, gezien naar boven
// lopend) en per vlucht afwijken: boom (trapboom/keepboom/muurboom/geen), recht of gebogen, houtsoort, leuning.
// Alleen keuzes, geen aantallen. Na het inlezen van de tekening zet toepassen() de gekozen variant over naar het project
// (houtsoort per onderdeel, per kant en per vlucht) en de begroting; de aantallen komen dan uit de tekening.
// Data per project: p.config = { klant, fotos[], stap, varianten[], actief, gekozen, toegepast, meldingen[] }.
ZP.config = (function () {
  const CO = ZP.cost, M = ZP.materials;
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);

  // volgorde zoals een trap wordt opgebouwd (en zoals StairDesigner): vorm → constructie per kant → leuning → balustrade
  // en spillen → verdiepingen → hout en afwerking (dan is bekend welke onderdelen er zijn) → extra's → overzicht
  // van grof naar fijn: vorm → basiskeuzes (open/dicht, hout en afwerking per onderdeel) → kanten → leuning → balustrade
  // → verdiepingen → spijltjes (pas laat) → extra's → overzicht. Sleutel 'hout' = Basiskeuzes (oude projecten blijven werken).
  // 'schets' = de plattegrond met de pen (iPad) schetsen, direct na de klant; herkend model en maten gaan naar Vorm en maten
  const STAPPEN = [['klant', 'Klant'], ['schets', 'Schets'], ['type', 'Maten en hoogte'], ['hout', 'Basiskeuzes'], ['kanten', 'Bomen en kanten'], ['leuning', 'Leuning'], ['balustrade', 'Balustrade en spillen'], ['vloeren', 'Verdiepingen'], ['spijl', 'Spijltjes'], ['extras', 'Extra’s en montage'], ['overzicht', 'Overzicht']];
  // stap niet van toepassing bij deze variant (wordt in de stappenbalk gemarkeerd, blijft wel te openen)
  const nvt = (v, stap) => (stap === 'leuning' && !KANT.some(([k]) => v.kanten[k].leuning !== 'geen')) ? 'geen leuning gekozen'
    : (stap === 'spijl' && !vrijeKanten(v).length && !(v.vloerBal || []).length) ? 'geen balustrade' : '';
  // rechte en verdreven treden (wigvormig, in de draai) uit de opbouw van het model – zelfde toets als bij de tekening (CO.isVerdreven)
  function tredenSoort(v) {
    // totaal = de schatting (incl. de bovenste trede); verdreven = de wigvormige treden van de opbouw
    const n = schatting(v).n;
    try { const nV = ZP.cf3d.opbouw(v).treden.filter(t => !t.bordes && CO.isVerdreven(t)).length; return { n, verdreven: nV, recht: n - nV }; }
    catch (e) { return { n, verdreven: 0, recht: n }; }
  }
  // 'Kelder' = vloer onder de begane grond (peil −verdiepingshoogte); bij een keldertrap komen trapgat en balustrade op de begane grond
  const VLOEREN = ['Kelder', 'Begane grond', '1e verdieping', '2e verdieping', '3e verdieping', 'Zolder', 'Vide / overloop'];
  const TIPS = {
    klant: 'Maak foto’s van het trapgat, de aansluiting boven en de muren: handig bij het tekenen.',
    schets: 'Pen = tekenen, één vinger = schuiven, twee vingers = zoomen. Teken de looplijn van onder naar boven: dan herkent de app model, looprichting en maten.',
    type: 'Het type trap komt uit de tekening (StairDesigner). Hier alleen looprichting, maten en hoogte; de looprichting is de draairichting naar boven lopend.',
    kanten: 'Links en rechts zoals in StairDesigner: gezien als u naar boven loopt. Per vlucht afwijken kan onder "Per vlucht".',
    hout: 'Grof naar fijn: eerst open of dicht, dan één houtsoort en afwerking voor alles, daarna per onderdeel afwijken. Per kant of vlucht afwijken doet u bij Bomen en kanten.',
    spijl: 'Het spijltje kiest u pas als de rest vastligt; per kant of per verdiepingsbalustrade kan een ander spijltje.',
    leuning: 'Standaard voor alle leuningen. Waar de leuning komt (muur of vrije zijde) kiest u per kant bij Kanten.',
    balustrade: 'Bouwbesluit: openingen maximaal 100 mm. Spillen: eindspil onder en boven, hoekspil bij een draai of bordes, tussenspil op lange stukken.',
    vloeren: 'Klik de hoekpunten langs de rand van het trapgat; maten daarna exact invullen. Begin en eind krijgen een eindspil, knikpunten een hoekspil.',
    extras: 'Speciale bewerkingen worden later per tred, meter of stuk uit de tekening geteld.',
    overzicht: 'Vergelijk varianten naast elkaar en kies er één. Na het inlezen van de tekening rekent de app de prijs uit.',
  };
  // modellen zoals StairDesigner (Nieuwe trap › Modellen), gekoppeld aan de uurnorm per type trap uit Excel
  const MODELLEN = [
    { k: 'm1', naam: 'Rechte trap', sub: 'Model 1 · één rechte loop', norm: 'Rechte steektrap', vl: 1, groep: 'Zonder bordes' },
    { k: 'm2', naam: 'Kwartslag (L)', sub: 'Model 2 · draai van 90°', norm: 'Kwartslag', vl: 2, groep: 'Zonder bordes' },
    { k: 'm3', naam: 'Dubbele kwartslag (U)', sub: 'Model 3 · twee draaien, 180°', norm: 'Dubbele kwartslag', vl: 3, groep: 'Zonder bordes' },
    { k: 'm4', naam: 'Kwart boven', sub: 'Model 4 · recht, verdreven bovenin', norm: 'Kwartslag', vl: 2, groep: 'Zonder bordes' },
    { k: 'm5', naam: 'Kwart onder', sub: 'Model 5 · verdreven onderin', norm: 'Kwartslag', vl: 2, groep: 'Zonder bordes' },
    { k: 'm6', naam: 'Halve draai', sub: 'Model 6 · compact, 180°', norm: 'Dubbele kwartslag', vl: 2, groep: 'Zonder bordes' },
    { k: 'm7', naam: 'L met bordes', sub: 'Model 7 · kwart met bordes', norm: 'Bordestrap', vl: 2, groep: 'Met bordes', bordes: true },
    { k: 'm8', naam: 'U met bordes', sub: 'Model 8 · 180° met bordes', norm: 'Bordestrap', vl: 3, groep: 'Met bordes', bordes: true },
    { k: 'm9', naam: 'Kwart boven met bordes', sub: 'Model 9 · bordes bovenin', norm: 'Bordestrap', vl: 2, groep: 'Met bordes', bordes: true },
    { k: 'm10', naam: 'Halve draai met bordes', sub: 'Model 10 · compact met bordes', norm: 'Bordestrap', vl: 2, groep: 'Met bordes', bordes: true },
  ];
  const modelVan = (v) => MODELLEN.find(m => m.k === v.model) || MODELLEN[1];
  // alleen de modellen van StairDesigner; oudere keuzes (type trap of een vervallen vorm) naar het dichtstbijzijnde model
  const VAN_TYPE = { 'Rechte steektrap': 'm1', 'Kwartslag': 'm2', 'Dubbele kwartslag': 'm3', 'Bordestrap': 'm7', 'Spiltrap': 'm6', 'S-trap': 'm3', 'Zoldertrap / steile trap': 'm1',
    spil: 'm6', s: 'm3', zolder: 'm1' };
  // migratie: oude varianten met vorm "kuip" / type "Kuiptrap" (bestaat niet meer) worden model 6 (spiltrap)
  VAN_TYPE.Kuiptrap = VAN_TYPE.kuip = 'm6';
  const TYPE_INFO = Object.fromEntries(MODELLEN.map(m => [m.norm, m.sub]));
  const RICHTING = [['rechts', 'Rechtsom'], ['links', 'Linksom']];
  const KANT = [['links', 'Linker kant', 'Links'], ['rechts', 'Rechter kant', 'Rechts']];        // [sleutel, label, kant in de tekening]
  const BOMEN = [['trapboom', 'Trapboom', 'treden ingefreesd'], ['keepboom', 'Keepboom', 'treden erop'], ['muurboom', 'Muurboom', 'trapboom tegen de muur'], ['geen', 'Geen boom', 'bv. op spillen']];
  const LEUNING_PLAATS = [['geen', 'Geen leuning'], ['muur', 'Aan de muur'], ['vrij', 'Vrij (balustrade)']];
  const SPILSOORTEN = [['eind', 'Eindspil', 'onder- en bovenaan'], ['hoek', 'Hoekspil', 'bij een draai of bordes'], ['tussen', 'Tussenspil', 'op lange stukken']];
  // een muurboom is een trapboom tegen de muur (zelfde uren en hout)
  const boomSoort = (b) => (b === 'keepboom' ? 'keepboom' : 'trapboom');

  // houtsoorten uit de materialenlijst (hele houtsoort) en plank soorten (houtsoort › plank soort, met dikte)
  function houtKeuzes(materials) {
    const woods = [...new Set(materials.map(m => M.canonMaterial(m.material)))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return woods.map(w => ({ hout: w, soorten: [...new Set(materials.filter(m => M.canonMaterial(m.material) === w && m.sub).map(m => M.fullName(m)))].sort() }));
  }
  const houtNaam = (v) => String(v || '').split(' › ')[0];
  // houtsoort per soort onderdeel (leeg = zelfde als de treden), volgorde als de materiaalstijl van StairDesigner
  const HOUT_SOORTEN = [['stootbord', 'Stootborden'], ['trapboom', 'Trapbomen'], ['keepboom', 'Keepbomen'], ['spil', 'Spillen'], ['baluster', 'Balusters'], ['bordes', 'Bordes'], ['overig', 'Overige delen']];
  const houtVan = (v, t) => (t === 'trede' ? v.houtTrede : ((v.hout || {})[t] || v.houtTrede)) || '';
  // afwerking per soort onderdeel: treden = afwTreden; de rest volgt afwRest tenzij v.afw[soort] iets anders zegt
  const AFW_SOORTEN = [['leuning', 'Leuning'], ...HOUT_SOORTEN];
  const afwVan = (v, t) => (t === 'trede' ? v.afwTreden : ((v.afw || {})[t] || v.afwRest || v.afwTreden)) || '';

  // ---------- per kant en per vlucht: wat geldt er (leeg = standaard) ----------
  function kant(v, k) {
    const s = v.kanten[k], L = v.leuning;
    return { boom: s.boom, soort: boomSoort(s.boom), vorm: s.vorm || 'Recht', hout: s.hout || houtVan(v, boomSoort(s.boom)), leuning: s.leuning,
      lp: s.leuningProfiel || L.profiel, lh: s.leuningHout || L.hout, lv: s.leuningVorm || L.vorm, spijl: s.spijl || v.bal.spijl };
  }
  function vlucht(v, k, n) {
    const e = kant(v, k), o = (v.kanten[k].vluchten || {})[n] || {};
    const boom = o.boom || e.boom;
    return { boom, soort: boomSoort(boom), vorm: o.vorm || e.vorm, hout: o.hout || (o.boom && o.boom !== e.boom ? houtVan(v, boomSoort(boom)) : e.hout), afwijkend: !!(o.boom || o.vorm || o.hout) };
  }
  const vluchtNrs = (v) => Array.from({ length: Math.max(1, +v.vluchten || 1) }, (_, i) => i + 1);
  const vrijeKanten = (v) => KANT.filter(([k]) => v.kanten[k].leuning === 'vrij').map(([k]) => k);
  const muurKanten = (v) => KANT.filter(([k]) => v.kanten[k].leuning === 'muur').map(([k]) => k);
  const heeftBal = (v) => vrijeKanten(v).length > 0;
  // alle boomsoorten die ergens gebruikt worden (kant of vlucht)
  const boomSoorten = (v) => new Set(KANT.flatMap(([k]) => vluchtNrs(v).map(n => vlucht(v, k, n))).filter(x => x.boom !== 'geen').map(x => x.soort));
  const soortenVan = (v) => { const bs = boomSoorten(v);
    return HOUT_SOORTEN.filter(([t]) => (t !== 'stootbord' || !v.open) && (t !== 'trapboom' || bs.has('trapboom')) && (t !== 'keepboom' || bs.has('keepboom'))
      && (t !== 'baluster' || heeftBal(v) || v.vloerBal.length) && (t !== 'bordes' || modelVan(v).bordes)); };

  function nieuweKant(boom, vorm, leuning) { return { boom: boom || 'trapboom', vorm: vorm || 'Recht', hout: '', leuning: leuning || 'geen', leuningProfiel: '', leuningHout: '', leuningVorm: '', spijl: '', vluchten: {} }; }
  function nieuweVariant(C, materials, naam) {
    const hk = houtKeuzes(materials), hout = hk.length ? hk[0].hout : '';
    const afw = (n) => (C.afwerkingen.find(a => a.naam === n) || C.afwerkingen[0] || {}).id || '';
    const lh = (C.leuningHout || []).find(h => h.toLowerCase() === hout.toLowerCase()) || (C.leuningHout || [])[0] || '';
    return { id: uid('v'), naam: naam || 'A', model: 'm2', type: 'Kwartslag', vluchten: 2, richting: 'rechts', open: false,
      kanten: { links: nieuweKant('trapboom', 'Recht', 'muur'), rechts: nieuweKant('trapboom', 'Recht', 'vrij') },
      houtTrede: hout, hout: {}, afw: {}, afwTreden: afw(C.afwStd.treden), afwRest: afw(C.afwStd.rest),
      leuning: { profiel: C.profielen[0] || 'Rond profiel', vorm: 'Recht', hout: lh, drager: ((C.dragers || [])[0] || {}).id || '' },
      bal: { spijl: (C.spijltypes[0] || {}).id || '', tussen: 100, onderslof: true },
      spillen: { eind: true, hoek: true, tussen: false, vorm: 'Vierkant', maat: 90 },
      vloerBal: [], extras: [], montage: true, sloop: false, notitie: '' };
  }
  // oudere varianten omzetten (één boom/leuning voor de hele trap → per kant; type → model)
  function upgrade(v) {
    v.vloerBal = v.vloerBal || []; v.afw = v.afw || {};
    if (!v.hout) {
      v.hout = {};
      if (v.houtRest) for (const t of ['trapboom', 'keepboom', 'spil', 'baluster', 'overig']) v.hout[t] = v.houtRest;
      if (v.houtStoot || v.houtRest) v.hout.stootbord = v.houtStoot || v.houtRest;
      delete v.houtRest; delete v.houtStoot;
    }
    if (!MODELLEN.some(m => m.k === v.model)) { v.model = VAN_TYPE[v.model] || VAN_TYPE[v.type] || 'm2'; v.vluchten = 0; }
    if (!v.vluchten) v.vluchten = modelVan(v).vl;
    if (!v.kanten) {
      // aanname: rechtsom draaiend ligt de vrije zijde (binnenbocht) rechts en de muur links; met één tik om te draaien
      const vrij = v.richting === 'links' ? 'links' : 'rechts', muur = vrij === 'links' ? 'rechts' : 'links', lk = (v.leuning || {}).kant || 'muur';
      v.kanten = { links: nieuweKant(v.boom, v.boomVorm), rechts: nieuweKant(v.boom, v.boomVorm) };
      if (lk === 'muur' || lk === 'beide') v.kanten[muur].leuning = 'muur';
      if (lk === 'vrij' || lk === 'beide' || (v.bal && v.bal.aan)) v.kanten[vrij].leuning = 'vrij';
    }
    for (const [k] of KANT) v.kanten[k].vluchten = v.kanten[k].vluchten || {};
    if (!v.hoogte) v.hoogte = 2700;
    if (!v.maten || !MAATVELDEN[vormVan(v)].every(([k]) => +v.maten[k] > 0)) { v.maten = { breedte: (v.maten || {}).breedte || 850 }; v.maten = matenVoorstel(v); }
    v.spillen = v.spillen || { eind: true, hoek: true, tussen: false, vorm: 'Vierkant', maat: 90 };
    v.type = modelVan(v).norm;
    for (const b of v.vloerBal) { if (!b.trapgat) b.trapgat = trapgatStd(v); if (b.hoogte === undefined) b.hoogte = vloerHoogte(v, b.vloer); }
    delete v.boom; delete v.boomVorm; if (v.leuning) delete v.leuning.kant; if (v.bal) { delete v.bal.aan; delete v.bal.overloop; }
  }
  function ensure(p, C, materials) {
    const c = p.config = p.config || {};
    c.klant = c.klant || {}; c.fotos = c.fotos || []; c.stap = c.stap || 'klant'; c.varianten = c.varianten || [];
    if (!c.varianten.length) c.varianten.push(nieuweVariant(C, materials, 'A'));
    for (const v of c.varianten) upgrade(v);
    if (!STAPPEN.some(s => s[0] === c.stap)) c.stap = 'klant';
    if (!c.varianten.some(v => v.id === c.actief)) c.actief = c.varianten[0].id;
    if (c.gekozen && !c.varianten.some(v => v.id === c.gekozen)) c.gekozen = null;
    return c;
  }
  const actief = (p) => p.config.varianten.find(v => v.id === p.config.actief) || p.config.varianten[0];
  const gekozen = (p) => (p.config && p.config.gekozen ? p.config.varianten.find(v => v.id === p.config.gekozen) : null);
  // variant kopiëren (B, C, …)
  function kopie(p, v) {
    const n = JSON.parse(JSON.stringify(v)); n.id = uid('v');
    const used = new Set(p.config.varianten.map(x => x.naam)); let ch = 65; while (used.has(String.fromCharCode(ch))) ch++;
    n.naam = String.fromCharCode(ch); p.config.varianten.push(n); p.config.actief = n.id; return n;
  }
  // ---------- schatting van het aantal treden uit de verdiepingshoogte (zoals StairDesigner: aantal treden = aantal optreden) ----------
  // optrede zo dat hij binnen het Bouwbesluit (nieuwbouw: ≤ 188 mm) blijft, aantrede uit de stapmaat 2·optrede + aantrede ≈ 630 mm
  // (Hollandse formule, zoals StairDesigner); het aantal treden is met de hand te overschrijven (bv. renovatie)
  function schatting(v) {
    const H = Math.max(500, +v.hoogte || 2700);
    const n = +v.treden > 1 ? Math.round(+v.treden) : Math.max(2, Math.ceil(H / 188 - 1e-9));
    const o = H / n, a = Math.min(300, Math.max(200, 630 - 2 * o));
    return { H, n, optrede: o, aantrede: a, stap: 2 * o + a, handmatig: +v.treden > 1, bbOptrede: o <= 188.5, bbAantrede: a >= 220 };
  }
  // ---------- maten (zoals StairDesigner bij Nieuwe trap: lengte per loop, breedte) ----------
  // vorm per model: recht (lengte), L (loop 1 en loop 2, elk inclusief de draai), U (loop 1, kop, loop 3)
  const VORM = { m1: 'recht', m2: 'L', m4: 'L', m5: 'L', m7: 'L', m9: 'L', m3: 'U', m6: 'U', m8: 'U', m10: 'U' };
  const MATEN_STD = { m1: { lengte: 3000 }, m2: { a: 2600, b: 2400 }, m4: { a: 3100, b: 1300 }, m5: { a: 1300, b: 3100 }, m7: { a: 2600, b: 2600 }, m9: { a: 3100, b: 1400 },
    m3: { a: 2200, kop: 2000, c: 2200 }, m6: { a: 2300, kop: 1700, c: 2300 }, m8: { a: 2200, kop: 2000, c: 2200 }, m10: { a: 2300, kop: 1700, c: 2300 } };
  const MAATVELDEN = {
    recht: [['lengte', 'Lengte', 'van de onderste trede tot de vloer']],
    L: [['a', 'Lengte loop 1', 'incl. de draai'], ['b', 'Lengte loop 2', 'incl. de draai']],
    U: [['a', 'Lengte loop 1', 'incl. de draai'], ['kop', 'Breedte kop', 'buitenmaat over de draaien'], ['c', 'Lengte loop 3', 'incl. de draai']],
  };
  const vormVan = (v) => VORM[v.model] || 'L';
  function matenStd(model, breedte) { return Object.assign({ breedte: breedte || 850 }, MATEN_STD[model] || MATEN_STD.m2); }
  // lengtes voorstellen bij een gewenste aantrede: rechte treden = treden − verdreven (3 per draai) − bordessen,
  // verdeeld over de lopen zoals het model (bv. Model 4: lange eerste loop); kop van een U = 2 × breedte + één trede (compact: geen)
  const VERDELING = { m2: [0.55, 0.45], m4: [0.9, 0.1], m5: [0.1, 0.9], m7: [0.55, 0.45], m9: [0.9, 0.1] };
  function matenVoorstel(v, aantrede = 250) {
    const B = +(v.maten || {}).breedte || 850, n = schatting(v).n, vorm = vormVan(v), bordes = modelVan(v).bordes;
    const draaien = vorm === 'recht' ? 0 : vorm === 'L' ? 1 : 2, nRecht = Math.max(1, n - 1 - draaien * (bordes ? 1 : 3)), S = nRecht * aantrede;
    if (vorm === 'recht') return { breedte: B, lengte: Math.round(S) };
    if (vorm === 'L') { const [p, q] = VERDELING[v.model] || [0.5, 0.5]; const s1 = Math.max(aantrede, Math.round(S * p / aantrede) * aantrede); return { breedte: B, a: Math.round(s1 + B), b: Math.round(Math.max(aantrede, S - s1) + B) }; }
    // in hele treden: kop één trede (compact: geen), de rest over loop 1 en 3 (oneven: loop 1 één trede meer)
    const mid = v.model === 'm6' || v.model === 'm10' ? 0 : 1, k = Math.max(2, nRecht - mid), k1 = Math.ceil(k / 2);
    return { breedte: B, a: Math.round(k1 * aantrede + B), kop: Math.round(2 * B + mid * aantrede), c: Math.round((k - k1) * aantrede + B) };
  }
  function zetModel(v, k) { v.model = k; v.type = modelVan(v).norm; v.vluchten = modelVan(v).vl; v.maten = { breedte: (v.maten || {}).breedte || 850 }; v.maten = matenVoorstel(v); }

  // ---------- balustrades op verdiepingsvloeren (getekend op een raster; punten in mm) ----------
  // Het trapgat staat in de tekening (met de plattegrond van het model), zodat de balustrade er langs kan.
  // bx = breedte (links-rechts), by = lengte (in de looprichting); aankomst = de kant waar de trap boven uitkomt (open).
  const ZIJDEN = [['boven', 'Boven'], ['rechts', 'Rechts'], ['onder', 'Onder'], ['links', 'Links']];
  // trapgat = buitenmaat van de trap op maat (uit de opbouw), aankomst = de richting waarin de trap boven uitkomt
  function trapgatStd(v) {
    const ob = ZP.cf3d.opbouw(v), b = ob.bbox, e = ob.eind;
    const aankomst = Math.abs(e[1]) > Math.abs(e[0]) ? (e[1] > 0 ? 'boven' : 'onder') : (e[0] > 0 ? 'rechts' : 'links');
    return { x: 1000, y: 1000, bx: Math.round(b.x1 - b.x0), by: Math.round(b.y1 - b.y0), aankomst };
  }
  // vloerpeil: 1e verdieping op de verdiepingshoogte, 2e verdieping/zolder één verdieping hoger (aan te passen)
  function vloerHoogte(v, vloer) {
    const H = +v.hoogte || 2700, n = String(vloer || '').toLowerCase();
    return /kelder/.test(n) ? -H : /begane/.test(n) ? 0 : /3e/.test(n) ? 3 * H : /2e|zolder/.test(n) ? 2 * H : H;
  }
  function nieuweVloerBal(C, v, vloer) {
    return { id: uid('vb'), vloer: vloer || '1e verdieping', hoogte: vloerHoogte(v, vloer || '1e verdieping'), punten: [], trapgat: trapgatStd(v), spijl: v.bal.spijl || (C.spijltypes[0] || {}).id || '', tussen: +v.bal.tussen || 100, onderslof: v.bal.onderslof !== false,
      leuning: { profiel: v.leuning.profiel || C.profielen[0], hout: v.leuning.hout || (C.leuningHout || [])[0] || '' } };
  }
  // hoeken van het trapgat: een rechthoek (x, y, bx, by; met de klok mee vanaf linksboven) of een eigen vorm (g.punten, ≥ 3).
  // Zijde i loopt van hoek i naar i+1. Het trapgat staat los van de trap: de trap ligt op b.trap {x, y} (linksboven, op ware grootte).
  const tgEigen = (g) => !!(g && g.punten && g.punten.length >= 3);
  const tgHoeken = (g) => (tgEigen(g) ? g.punten.map(p => p.slice()) : [[g.x, g.y], [g.x + g.bx, g.y], [g.x + g.bx, g.y + g.by], [g.x, g.y + g.by]]);
  // de aankomstzijde: bij een rechthoek de gekozen zijde, bij een eigen vorm de zijde die het verst in die richting ligt
  function tgAankomst(g) {
    const c = tgHoeken(g), n = c.length;
    if (!tgEigen(g)) return ZIJDEN.findIndex(z => z[0] === g.aankomst);
    const dir = { boven: [0, -1], onder: [0, 1], links: [-1, 0], rechts: [1, 0] }[g.aankomst] || [0, -1];
    let best = 0, bv = -Infinity;
    for (let i = 0; i < n; i++) { const a = c[i], b = c[(i + 1) % n], m = (a[0] + b[0]) / 2 * dir[0] + (a[1] + b[1]) / 2 * dir[1]; if (m > bv + 1) { bv = m; best = i; } }
    return best;
  }
  const trapPos = (b) => b.trap || { x: b.trapgat.x, y: b.trapgat.y };
  // snelle vormen rond het trapgat; de aankomstzijde blijft open
  const VB_VORMEN = [['u', 'Rondom – aankomst open'], ['l1', 'L – 2 zijden'], ['l2', 'L – andere 2 zijden'], ['een', '1 zijde (tegenover)']];
  function vbVorm(b, soort) {
    const c = tgHoeken(b.trapgat), n = c.length, a = tgAankomst(b.trapgat), h = (i) => c[(a + i) % n].slice(), k = Math.max(1, Math.floor(n / 2));
    b.punten = { u: Array.from({ length: n }, (_, i) => h(i + 1)), l1: [h(1), h(2), h(3)], l2: [h(n - 2), h(n - 1), h(n)], een: [h(k), h(k + 1)] }[soort] || b.punten;
  }
  const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const vbLengte = (b) => b.punten.reduce((s, p, i) => (i ? s + segLen(b.punten[i - 1], p) : 0), 0);   // mm
  const vbCfg = (b) => ({ spijl: b.spijl, tussen: +b.tussen || 100, onderslof: !!b.onderslof });
  // spillen van een getekende balustrade: eindspil op begin en eind, hoekspil op elk knikpunt
  const vbSpillen = (b) => (b.punten.length < 2 ? { eind: 0, hoek: 0 } : { eind: 2, hoek: b.punten.length - 2 });

  const balCfg = (v, spijl) => ({ spijl: spijl || v.bal.spijl, tussen: +v.bal.tussen || 100, onderslof: !!v.bal.onderslof });
  const balTypeCfg = (C, g) => C.balustrades.find(b => b.spijl === g.spijl && (+b.tussen || 100) === g.tussen && !!b.onderslof === g.onderslof) || null;
  const balType = (C, v) => balTypeCfg(C, balCfg(v));

  // ---------- prijzen per eenheid (verkoop excl. BTW: arbeid en materiaal met opslag, vaste prijs zoals ingesteld) ----------
  function prijzen(C, v) {
    const T = C.tarief, W = T.werk, rows = [];
    const add = (groep, key, naam, eenheid, arbeid, mat, vast, note) => rows.push({ groep, key, naam, eenheid, arbeid, mat, vast: vast > 0 ? +vast : null, note: note || '',
      prijs: vast > 0 ? +vast : arbeid * (1 + (+T.opslagArbeid || 0)) + mat * (1 + (+T.opslagMat || 0)) });
    // per combinatie één regel, met de kanten/vluchten waar hij voorkomt
    const waar = (lijst) => (lijst.length === 2 && lijst.every(x => !x.includes('vlucht')) ? 'beide kanten' : lijst.join(', '));
    // normbestand versie 11: afwerken per onderdeel volgens de gekozen afwerking (olie kost meer tijd dan wit gegrond)
    const metAfw = !!C.afwNorm, afwNm = (t) => (C.afwerkingen.find(a => a.id === afwVan(v, t)) || {}).naam || '';
    // opbouw zoals het projectblad in Excel (versie 11): 1 treden (recht/verdreven), 2 stootborden, 3 trapbomen, 4 keepbomen,
    // 5 spil, 6 leuning, 7 speciale bewerkingen, 8 overig materiaal (afwerkproduct), 9 montage. Afwerken zit per onderdeel in de uren.
    const ts = tredenSoort(v), uAfwT = CO.afwU(C, v.afwTreden, 'trede'), afwTxt = (t) => (metAfw ? ' · incl. afwerken (' + afwNm(t) + ')' : '');
    // één regel treden met de norm per type trap (verdreven treden zitten in het type; alleen de tekening toont ze apart)
    add('1 · Treden', 'trede', 'Trede maken – ' + modelVan(v).naam, 'per tred', (CO.tredeU(C, v.type) + uAfwT) * W, 0, null, `± ${ts.n} treden${ts.verdreven ? ` (${ts.verdreven} verdreven)` : ''}${afwTxt('trede')} · hout volgt uit de indeling`);
    const stootPlaat = CO.geenAfw(C, houtVan(v, 'stootbord'));
    if (!v.open) add('2 · Stootborden', 'stootbord', 'Stootbord', 'per stuk', ((+C.stootbord || 0) + (stootPlaat ? 0 : CO.afwU(C, afwVan(v, 'stootbord'), 'stootbord'))) * W, 0, null, `± ${ts.n} stuks (één per trede)` + (metAfw ? (stootPlaat ? ' · plaatmateriaal: niet afwerken' : afwTxt('stootbord')) : ''));
    const bomen = new Map();
    for (const [k] of KANT) for (const n of vluchtNrs(v)) {
      const x = vlucht(v, k, n); if (x.boom === 'geen') continue;
      const key = x.boom + '|' + x.vorm; if (!bomen.has(key)) bomen.set(key, { x, waar: new Set() });
      bomen.get(key).waar.add(k + (x.afwijkend ? ' vlucht ' + n : ''));
    }
    for (const [key, { x, waar: w }] of bomen) {
      const g = x.soort === 'keepboom' ? '4 · Keepbomen' : '3 · Trapbomen', nm = `${BOMEN.find(b => b[0] === x.boom)[1]} – ${x.vorm.toLowerCase()}`;
      add(g, 'boom:' + key, nm, 'per m', (CO.boomU(C, x.soort, x.vorm) + CO.afwU(C, afwVan(v, x.soort), x.soort)) * W, 0, null, waar([...w]) + ' · aftekenen, zagen, kanten, schuren' + (metAfw ? ', afwerken' : ''));
      // per trede in de boom: nesten frezen (trapboom) of keepen zagen (keepboom) – zoals de norm per trede in Excel
      const uT = CO.boomTredU(C, x.soort, x.vorm);
      if (uT) add(g, 'boomT:' + key, `${nm} – ${x.soort === 'keepboom' ? 'keepen zagen' : 'nesten frezen'}`, 'per tred per boom', uT * W, 0, null, `± ${ts.n} treden × ${w.size} ${w.size === 1 ? 'boom' : 'bomen'}`);
    }
    if (v.type === 'Spiltrap') add('5 · Spil', 'spil', 'Spil (spiltrap)', 'per tred', ((+C.spil || 0) + CO.afwU(C, afwVan(v, 'spil'), 'spil')) * W, 0, null, afwTxt('spil').replace(/^ · /, ''));
    // leuningen per kant (gelijke keuzes samen)
    const leun = new Map();
    for (const [k, lab] of KANT) { const e = kant(v, k); if (e.leuning === 'geen') continue;
      const key = [e.lp, e.lv, e.lh].join('|'); if (!leun.has(key)) leun.set(key, { e, waar: [] }); leun.get(key).waar.push(lab.toLowerCase() + (e.leuning === 'muur' ? ' (muur)' : ' (vrij)')); }
    for (const [key, { e, waar: w }] of leun) {
      const pm = CO.leuningPerM(C, e.lp, e.lv, e.lh), lv = C.leuningVast[CO.leunKey(e.lp, e.lv, e.lh)];
      add('6 · Leuning', 'leuning:' + key, `Leuning ${e.lp.toLowerCase()} – ${e.lv.toLowerCase()}${e.lh ? ', ' + e.lh : ''}`, 'per m', (pm.u + CO.afwU(C, afwVan(v, 'leuning'), 'leuning')) * W + pm.ophangen, pm.mat, lv && lv.prijs, 'incl. ophangen' + (C.afwNorm ? ' en afwerken' : '') + ' · ' + w.join(', '));
    }
    const d = muurKanten(v).length && (C.dragers || []).find(x => x.id === v.leuning.drager);
    if (d) add('6 · Leuning', 'drager', 'Leuningdrager – ' + d.naam, 'per stuk', 0, +d.prijs || 0, null, 'per leuningstuk aan de muur: tot 1,70 m 2, tot 3 m 3, langer ±70 cm onderling');
    const bal = new Map();
    for (const k of vrijeKanten(v)) { const sp = kant(v, k).spijl; if (!bal.has(sp)) bal.set(sp, []); bal.get(sp).push(k === 'links' ? 'linkerkant' : 'rechterkant'); }
    for (const [sp, w] of bal) {
      const g = balCfg(v, sp), pm = CO.balustradePerM(C, g, 'boom'), t = balTypeCfg(C, g);
      add('Balustrade en spillen', 'bal:' + sp, 'Balustrade – ' + pm.spijl.naam, 'per m', pm.uren * W + pm.plaatsen, pm.matSp + pm.bevM + pm.slofMat, t && t.vast, `${pm.perM.toFixed(1).replace('.', ',')} spijlen/m${v.bal.onderslof ? ', met onderslof' : ''}, excl. leuning · ${w.join(', ')}`);
      // ander spijltje dan standaard: meerprijs per stuk (zonder norm), hier omgerekend per meter
      if (pm.meerSp > 0 && !(t && t.vast)) add('Balustrade en spillen', 'balmeer:' + sp, 'Meerprijs spijltjes – ' + pm.spijl.naam, 'per m', 0, 0, pm.meerSp, `${pm.perM.toFixed(1).replace('.', ',')} spijlen/m × € ${String(pm.meer).replace('.', ',')} per stuk`);
    }
    // spillen per soort (per stuk)
    const SP = C.spilSoorten || {};
    for (const [s, lab, sub] of SPILSOORTEN) if (v.spillen[s] && SP[s]) add('Balustrade en spillen', 'spil:' + s, `${lab} – ${v.spillen.vorm.toLowerCase()} ${v.spillen.maat} mm`, 'per stuk', (+SP[s].u || 0) * W, +SP[s].mat || 0, SP[s].vast, sub);
    // getekende balustrades op de verdiepingen: prijs per meter incl. leuning (meters al bekend)
    for (const b of v.vloerBal || []) {
      const m = vbLengte(b) / 1000; if (!m) continue;
      const pm = CO.balustradePerM(C, vbCfg(b), 'verdieping'), t = balTypeCfg(C, vbCfg(b)), sps = vbSpillen(b);
      const lp = CO.leuningPerM(C, b.leuning.profiel, 'Recht', b.leuning.hout), lv = C.leuningVast[CO.leunKey(b.leuning.profiel, 'Recht', b.leuning.hout)];
      add('Verdiepingen', 'vb:' + b.id, `Balustrade ${b.vloer} – ${pm.spijl.naam}`, 'per m', pm.uren * W + pm.plaatsen, pm.matSp + pm.bevM + pm.slofMat, t && t.vast, `${m.toFixed(2).replace('.', ',')} m getekend, ${sps.eind} eind- en ${sps.hoek} hoekspillen, excl. leuning`);
      add('Verdiepingen', 'vbl:' + b.id, `Leuning ${b.vloer} – ${b.leuning.profiel.toLowerCase()}${b.leuning.hout ? ', ' + b.leuning.hout : ''}`, 'per m', lp.u * W + lp.ophangen, lp.mat, lv && lv.prijs, 'op de balustrade');
    }
    const afw = (id) => C.afwerkingen.find(a => a.id === id);
    const aT = afw(v.afwTreden), aR = afw(v.afwRest || v.afwTreden);
    // 7 speciale bewerkingen (extra's)
    for (const id of v.extras) { const b = C.bewerkingen.find(x => x.id === id); if (b) add('7 · Speciale bewerkingen', 'bew:' + id, b.naam, b.eenheid, (+b.u || 0) * W, +b.mat || 0, b.vast); }
    // 8 overig materiaal: het afwerkproduct (de uren afwerken van treden, stootborden, bomen, spil en leuning zitten al in die regels)
    if (aT) add('8 · Overig materiaal (afwerking)', 'afwT', 'Afwerking treden – ' + aT.naam, 'per m²', C.afwNorm ? 0 : (+aT.uM2 || 0) * W, CO.afwMat(aT), null, C.afwNorm ? 'product; uren afwerken per tred' : '');
    if (aR) add('8 · Overig materiaal (afwerking)', 'afwR', 'Afwerking overige delen – ' + aR.naam, 'per m²', (+aR.uM2 || 0) * W, CO.afwMat(aR), null, C.afwNorm ? 'product + uren voor delen zonder eigen afwerknorm' : '');
    for (const [t, lab] of AFW_SOORTEN) { const id = (v.afw || {})[t], a = id && id !== (v.afwRest || v.afwTreden) && afw(id);
      if (a) add('8 · Overig materiaal (afwerking)', 'afw:' + t, `Afwerking ${lab.toLowerCase()} – ${a.naam}`, 'per m²', (+a.uM2 || 0) * W, CO.afwMat(a)); }
    if (v.montage) add('9 · Montage', 'zetten', 'Trap zetten', 'per trap', (+C.montage.zetten || 0) * T.montage, 0);
    if (v.sloop) add('9 · Montage', 'sloop', 'Oude trap verwijderen', 'per trap', (+C.montage.sloop || 0) * T.montage, 0);
    return rows;
  }

  // ---------- keuzes als leesbaar overzicht (voor het overzicht, de vergelijking en de afdruk) ----------
  function samenvatting(C, v) {
    const afw = (id) => (C.afwerkingen.find(a => a.id === id) || {}).naam || '–';
    const spN = (id) => (C.spijltypes.find(s => s.id === id) || {}).naam || '–', d = (C.dragers || []).find(x => x.id === v.leuning.drager) || {};
    const ex = v.extras.map(id => (C.bewerkingen.find(b => b.id === id) || {}).naam).filter(Boolean);
    const boomTxt = (x) => (x.boom === 'geen' ? 'Geen boom' : `${BOMEN.find(b => b[0] === x.boom)[1]}, ${x.vorm.toLowerCase()}, ${houtNaam(x.hout) || '–'}`);
    const kantGroep = ([k, lab]) => { const e = kant(v, k);
      const afwijk = vluchtNrs(v).map(n => [n, vlucht(v, k, n)]).filter(([, x]) => x.afwijkend);
      return [lab, [['Boom', boomTxt(e)], ...afwijk.map(([n, x]) => ['Vlucht ' + n, boomTxt(x)]),
        ['Leuning', e.leuning === 'geen' ? 'Geen' : `${e.leuning === 'muur' ? 'Aan de muur' : 'Vrij, op balustrade'} · ${e.lp.toLowerCase()}, ${e.lv.toLowerCase()}, ${e.lh || '–'}`],
        ...(e.leuning === 'vrij' ? [['Spijl', spN(e.spijl)]] : [])]]; };
    return [
      ['Trap', [['Model', `${modelVan(v).naam} (${modelVan(v).sub.split(' · ')[0]})`], ['Looprichting', v.richting === 'links' ? 'Linksom' : 'Rechtsom'], ['Vluchten', String(v.vluchten)],
        ['Maten', MAATVELDEN[vormVan(v)].map(([k, lab]) => `${lab.toLowerCase()} ${v.maten[k]}`).join(' · ') + ` · breedte ${v.maten.breedte} mm`],
        ['Verdiepingshoogte', `${schatting(v).H} mm`], ['Treden', `${schatting(v).handmatig ? '' : '± '}${schatting(v).n} (optrede ${Math.round(schatting(v).optrede)} mm, aantrede ± ${Math.round(schatting(v).aantrede)} mm)`], ['Open of dicht', v.open ? 'Open (zonder stootborden)' : 'Dicht (met stootborden)']]],
      ...KANT.map(kantGroep),
      ['Leuning (standaard)', [['Profiel', v.leuning.profiel], ['Vorm', v.leuning.vorm], ['Houtsoort', v.leuning.hout || '–'], ...(muurKanten(v).length ? [['Leuningdrager', d.naam || '–']] : [])]],
      ['Balustrade en spillen', [...(heeftBal(v) ? [['Spijl', spN(v.bal.spijl)], ['Tussenruimte', v.bal.tussen + ' mm'], ['Onderslof', v.bal.onderslof ? 'Ja' : 'Nee']] : [['Balustrade langs de trap', 'Geen']]),
        ['Spillen', SPILSOORTEN.filter(([s]) => v.spillen[s]).map(([, l]) => l.toLowerCase()).join(', ') || 'geen'], ['Spil doorsnede', `${v.spillen.vorm}, ${v.spillen.maat} mm`]]],
      ['Verdiepingen', (v.vloerBal || []).length ? v.vloerBal.map(b => { const s = C.spijltypes.find(x => x.id === b.spijl) || {};
        return [b.vloer + (v.vloerBal.filter(x => x.vloer === b.vloer).length > 1 ? ' (' + (v.vloerBal.filter(x => x.vloer === b.vloer).indexOf(b) + 1) + ')' : ''), `${(vbLengte(b) / 1000).toFixed(2).replace('.', ',')} m op ${b.hoogte} mm · ${s.naam || '–'} · ${b.tussen} mm${b.onderslof ? ' · onderslof' : ''} · leuning ${b.leuning.profiel.toLowerCase()}`]; }) : [['Balustrade op verdieping', 'Geen']]],
      ['Hout en afwerking', [['Hout treden', houtNaam(v.houtTrede) || '–'], ['Afwerking treden', afw(v.afwTreden)], ...soortenVan(v).filter(([t]) => t !== 'overig' || (v.hout || {}).overig).map(([t, lab]) => ['Hout ' + lab.toLowerCase(), (v.hout || {})[t] ? houtNaam(v.hout[t]) : 'zelfde als treden']),
        ['Afwerking overige', afw(v.afwRest || v.afwTreden)],
        ...AFW_SOORTEN.filter(([t]) => (v.afw || {})[t] && v.afw[t] !== (v.afwRest || v.afwTreden)).map(([t, lab]) => ['Afwerking ' + lab.toLowerCase(), afw(v.afw[t])])]],
      ['Extra’s', [['Bewerkingen', ex.length ? ex.join(', ') : 'Geen'], ['Montage', v.montage ? 'Ja, wij plaatsen de trap' : 'Nee, alleen leveren'], ['Oude trap verwijderen', v.sloop ? 'Ja' : 'Nee']]],
    ];
  }
  // labels die tussen twee varianten verschillen
  function verschillen(C, a, b) {
    const fa = new Map(samenvatting(C, a).flatMap(([g, l]) => l.map(([k, x]) => [g + '|' + k, x])));
    const out = new Set(); for (const [g, l] of samenvatting(C, b)) for (const [k, x] of l) if (fa.get(g + '|' + k) !== x) out.add(g + '|' + k);
    for (const k of fa.keys()) if (!samenvatting(C, b).some(([g, l]) => l.some(([kk]) => g + '|' + kk === k))) out.add(k);
    return out;
  }

  // ---------- na de tekening: automatisch aantal voor een bewerking ----------
  function autoAantal(p, b) {
    const inc = ZP.parts.metAantal(p.parts.filter(x => x.include !== false), p.stairs), m = (f) => Math.round(inc.filter(f).reduce((a, x) => a + x.L, 0) / 100) / 10;
    if (b.eenheid === 'per tred') return inc.filter(x => x.type === 'trede').length;
    if (b.eenheid === 'per trap') return Math.max(1, p.stairs.reduce((a, s) => a + ZP.parts.aantalVan(s), 0));
    if (b.eenheid === 'per m' && /leuning/i.test(b.onderdeel)) return m(x => x.type === 'leuning');
    if (b.eenheid === 'per m' && /boom/i.test(b.onderdeel)) return m(x => x.type === 'trapboom' || x.type === 'keepboom');
    if (b.eenheid === 'per stuk' && /stootbord/i.test(b.onderdeel)) return inc.filter(x => x.type === 'stootbord').length;
    if (b.eenheid === 'per stuk' && /spil/i.test(b.onderdeel)) return inc.filter(x => x.type === 'spil').length || 1;
    return 1;
  }
  const meters = (list) => Math.round(list.reduce((a, x) => a + x.L, 0) / 10) / 100;

  // ---------- gekozen variant overzetten naar het project en de begroting ----------
  function toepassen(p, v, C, materials) {
    const hk = houtKeuzes(materials), woods = new Set(hk.map(h => h.hout.toLowerCase()));
    const ok = (h) => h && woods.has(houtNaam(h).toLowerCase());
    // onderdelen × aantal keer uitvoeren; verdiepingsbalustrades gaan mee met het grootste aantal (bv. 3 dezelfde woningen)
    const inc = ZP.parts.metAantal(p.parts.filter(x => x.include !== false), p.stairs), keer = Math.max(1, ...p.stairs.map(ZP.parts.aantalVan));
    // houtsoort: per soort onderdeel, dan per kant (type|Links) en per vlucht (type|Links|2) – zoals de namen in de tekening
    const tm = p.typeMaterial = {};
    const set = (t, h) => { if (ok(h)) tm[t] = h; };
    set('trede', v.houtTrede);
    for (const [t] of HOUT_SOORTEN) set(t, houtVan(v, t));
    const leunHout = (h) => (ok(h) ? hk.find(x => x.hout.toLowerCase() === houtNaam(h).toLowerCase()).hout : '');
    set('leuning', leunHout(v.leuning.hout) || v.houtTrede);
    const vormen = {};
    for (const [k, , side] of KANT) {
      const e = kant(v, k);
      if (e.boom !== 'geen') { set(e.soort + '|' + side, e.hout); vormen[e.soort + '|' + side] = e.vorm; }
      if (e.leuning !== 'geen') set('leuning|' + side, leunHout(e.lh));
      for (const n of vluchtNrs(v)) { const x = vlucht(v, k, n); if (x.boom === 'geen' || !x.afwijkend) continue; set(x.soort + '|' + side + '|' + n, x.hout); vormen[x.soort + '|' + side + '|' + n] = x.vorm; }
    }

    const B = p.begroting = p.begroting || {};
    B.stairs = B.stairs || {}; B.qty = B.qty || {}; B.bal = B.bal || []; B.bew = B.bew || []; B.klant = B.klant || {};
    const vStd = kant(v, 'links').boom !== 'geen' ? kant(v, 'links').vorm : kant(v, 'rechts').vorm;
    // type trap: de ingelezen tekening gaat voor de keuze in de configurator (wens gebruiker)
    const typeVan = (st) => { const tr = inc.filter(x => !(x.kopie > 1) && (st.id === '-' || !x.stair || x.stair === st.id)); return tr.some(x => x.type === 'trede') ? CO.guessType(tr) : v.type; };
    for (const st of p.stairs.length ? p.stairs : [{ id: '-' }]) B.stairs[st.id] = Object.assign(B.stairs[st.id] || {}, { type: (B.stairs[st.id] || {}).typeHand ? B.stairs[st.id].type : typeVan(st), boomVorm: vStd, keepVorm: vStd, vormV: 1 });
    const spiltrap = Object.values(B.stairs).some(s => s.type === 'Spiltrap');
    B.boomVormen = vormen;
    B.afw = { treden: v.afwTreden, rest: v.afwRest || v.afwTreden };
    // per soort onderdeel waar de afwerking afwijkt van de standaard in de begroting (leuning hoort daar bij de treden)
    for (const [t] of AFW_SOORTEN) { const id = afwVan(v, t), std = t === 'leuning' ? v.afwTreden : B.afw.rest; if (id && id !== std) B.afw[t] = id; }
    B.leuning = { profiel: v.leuning.profiel, vorm: v.leuning.vorm, hout: v.leuning.hout };
    B.leuningKant = {};
    for (const [k, , side] of KANT) { const e = kant(v, k); if (e.leuning !== 'geen') B.leuningKant[side] = { profiel: e.lp, vorm: e.lv, hout: e.lh, plaats: e.leuning }; }
    const geenLeuning = !Object.keys(B.leuningKant).length;
    if (geenLeuning) B.qty.leuning = 0; else if (B.qty.leuning === 0) delete B.qty.leuning;
    const mk = muurKanten(v), lk = KANT.filter(([k]) => v.kanten[k].leuning !== 'geen').length;
    B.drager = mk.length && v.leuning.drager ? { id: v.leuning.drager, kanten: mk.map(k => KANT.find(x => x[0] === k)[2]), deel: lk ? mk.length / lk : 1 } : null;
    // regels uit een eerdere overzetting vervangen; zelf toegevoegde regels blijven staan
    B.leun = (B.leun || []).filter(l => !l.cfg);
    B.bal = B.bal.filter(b => !b.cfg); B.bew = B.bew.filter(b => !b.cfg);
    // balustrade per vrije kant: meters van de leuning aan die kant in de tekening
    const leunAll = inc.filter(x => x.type === 'leuning'), lm = meters(leunAll);
    for (const k of vrijeKanten(v)) {
      const side = KANT.find(x => x[0] === k)[2], eigen = leunAll.filter(x => x.side === side);
      const m = eigen.length ? meters(eigen) : (leunAll.some(x => x.side) ? 0 : Math.round(lm / Math.max(1, lk) * 100) / 100);
      const g = balCfg(v, kant(v, k).spijl), t = balTypeCfg(C, g);
      B.bal.push(Object.assign({ id: uid('bb'), type: t ? t.id : '', m, plaats: 'boom', kant: k === 'links' ? 'linkerkant' : 'rechterkant', cfg: true }, g));
    }
    // getekende balustrades op de verdiepingen: meters uit de configurator, met eigen leuning
    const sp = { eind: 0, hoek: 0, tussen: 0 };
    for (const b of v.vloerBal || []) {
      const m = Math.round(vbLengte(b) * keer / 10) / 100; if (!m) continue;
      const t = balTypeCfg(C, vbCfg(b)), s = vbSpillen(b);
      B.bal.push(Object.assign({ id: uid('bb'), type: t ? t.id : '', m, plaats: 'verdieping', cfg: true, vloer: b.vloer }, vbCfg(b)));
      B.leun.push({ id: uid('bl'), profiel: b.leuning.profiel, vorm: 'Recht', hout: b.leuning.hout, m, cfg: true });
      if (v.spillen.eind) sp.eind += s.eind * keer; if (v.spillen.hoek) sp.hoek += s.hoek * keer; else if (v.spillen.tussen) sp.tussen += s.hoek * keer;
    }
    // spillen van de trap uit de tekening: eerst de eindspillen, de rest hoekspil (of tussenspil)
    const nSp = inc.filter(x => x.type === 'spil').length, nSp1 = inc.filter(x => x.type === 'spil' && !(x.kopie > 1)).length;
    if (nSp && v.type !== 'Spiltrap' && !spiltrap) {
      const e = v.spillen.eind ? Math.min(2, nSp1) * keer : 0; sp.eind += e;   // 2 eindspillen per uitvoering
      if (v.spillen.hoek) sp.hoek += nSp - e; else if (v.spillen.tussen) sp.tussen += nSp - e;
    }
    B.spillen = sp;
    for (const id of v.extras) { const b = C.bewerkingen.find(x => x.id === id); if (b) B.bew.push({ key: uid('k'), id, n: autoAantal(p, b), cfg: true }); }
    B.geenMontage = !v.montage; B.sloop = !!v.sloop;
    const k = p.config.klant || {};
    for (const f of ['naam', 'adres', 'plaats', 'tel']) if (k[f] && !B.klant[f]) B.klant[f] = k[f];
    if (k.notitie && !B.klant.notitie) B.klant.notitie = k.notitie;
    p.config.toegepast = { variant: v.id, naam: v.naam, op: new Date().toISOString() };
    p.config.meldingen = controle(p, v, C, materials);
    return p.config.meldingen;
  }

  // ---------- tekening tegen de keuzes ----------
  function controle(p, v, C, materials) {
    const inc = p.parts.filter(x => x.include !== false), out = [];
    if (!inc.length) return out;
    const n = (t, side) => inc.filter(x => x.type === t && (!side || x.side === side)).length;
    const warn = (text) => out.push({ kind: 'warn', text }), info = (text) => out.push({ kind: 'info', text });
    if (!v.open && !n('stootbord')) warn('Gekozen: dichte trap, maar er staan geen stootborden in de tekening.');
    if (v.open && n('stootbord')) warn(`Gekozen: open trap, maar de tekening heeft ${n('stootbord')} stootborden. Vink ze uit bij Controleren als ze niet nodig zijn.`);
    const nT = n('trede'), sch = schatting(v);
    if (nT && Math.abs(nT - sch.n) > 1) info(`In de configurator geschat: ${sch.n} treden; de tekening heeft er ${nT}.`);
    const g = CO.guessType(inc);
    if (g !== v.type && !['Bordestrap', 'S-trap', 'Zoldertrap / steile trap'].includes(v.type)) info(`Gekozen: ${modelVan(v).naam.toLowerCase()}; de tekening is een ${g.toLowerCase()}. De begroting rekent met de tekening (type aan te passen bij Begroting).`);
    // per kant: boom en leuning zoals in de tekening (namen "Trapboom Links #2", "Leuning Rechts #1")
    const metKant = inc.some(x => (x.type === 'trapboom' || x.type === 'keepboom' || x.type === 'leuning') && x.side);
    for (const [k, lab, side] of KANT) {
      const e = kant(v, k), lb = lab.toLowerCase();
      if (metKant) {
        if (e.boom === 'geen' && (n('trapboom', side) || n('keepboom', side))) info(`Gekozen: geen boom aan de ${lb}, maar de tekening heeft er een.`);
        if (e.boom !== 'geen' && e.soort === 'keepboom' && n('trapboom', side) && !n('keepboom', side)) info(`Gekozen: keepboom aan de ${lb}, de tekening heeft een trapboom.`);
        if (e.boom !== 'geen' && e.soort === 'trapboom' && n('keepboom', side) && !n('trapboom', side)) info(`Gekozen: ${e.boom} aan de ${lb}, de tekening heeft een keepboom.`);
        if (e.leuning !== 'geen' && !n('leuning', side)) warn(`Gekozen: leuning aan de ${lb}, maar er is geen leuning ${side.toLowerCase()} getekend: vul de meters in bij Begroting.`);
        if (e.leuning === 'geen' && n('leuning', side)) info(`Gekozen: geen leuning aan de ${lb}, maar de tekening heeft er een.`);
      }
    }
    if (!metKant) {
      const bs = boomSoorten(v);
      if (!bs.has('trapboom') && n('trapboom')) info('Gekozen: geen trapbomen, de tekening heeft trapbomen.');
      if (!bs.has('keepboom') && n('keepboom')) info('Gekozen: geen keepbomen, de tekening heeft keepbomen.');
      if (KANT.some(([k]) => v.kanten[k].leuning !== 'geen') && !n('leuning')) warn('Er staat geen leuning in de tekening: vul de meters leuning in bij Begroting.');
    }
    if (heeftBal(v) && !n('baluster') && !n('leuning')) warn('Balustrade gekozen, maar er is geen leuning of baluster getekend: vul de meters balustrade in bij Begroting.');
    const woods = houtKeuzes(materials).map(h => h.hout.toLowerCase());
    for (const [lab, h] of [['treden', v.houtTrede], ...HOUT_SOORTEN.map(([t, l]) => [l.toLowerCase(), (v.hout || {})[t]]), ...KANT.map(([k, l]) => [l.toLowerCase(), v.kanten[k].hout])]) if (h && !woods.includes(houtNaam(h).toLowerCase())) warn(`Houtsoort ${houtNaam(h)} (${lab}) staat niet in de materialenlijst.`);
    return out;
  }

  // ---------- schets met de pen (iPad): v.schets = { lijnen: [{ s: soort, w: dikte mm, p: [[x, y, druk 0–100], …] }] } ----------
  // Coördinaten in mm, y omlaag (zoals op het scherm). Soorten: omtrek (buitenkant trap), loop (looplijn, van onder naar boven),
  // gat (trapgat), vrij (notities). schetsHerken() zet de looplijn om in model, looprichting en maten.
  const SCHETS_SOORTEN = [['omtrek', 'Omtrek trap'], ['loop', 'Looplijn'], ['gat', 'Trapgat'], ['vrij', 'Notitie']];
  // Ramer–Douglas–Peucker: punten weglaten die minder dan tol van de lijn afwijken
  function vereenvoudig(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const d = (p, a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L : Math.hypot(p[0] - a[0], p[1] - a[1]); };
    let max = 0, idx = 0; for (let i = 1; i < pts.length - 1; i++) { const x = d(pts[i], pts[0], pts[pts.length - 1]); if (x > max) { max = x; idx = i; } }
    if (max <= tol) return [pts[0], pts[pts.length - 1]];
    return vereenvoudig(pts.slice(0, idx + 1), tol).slice(0, -1).concat(vereenvoudig(pts.slice(idx), tol));
  }
  const lengte = (pts) => pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  // looplijn → rechte, haakse stukken. Een trap is haaks: de lijn wordt om de 30 mm bemonsterd, per punt de richting bepaald
  // (gemiddeld over ± 90 mm tegen bibberen) en vastgezet op de dichtstbijzijnde van vier haakse richtingen (de hoofdrichting
  // volgt uit de tekening zelf, dus scheef tekenen mag). Opeenvolgende punten met dezelfde richting vormen een stuk; korte stukjes
  // (haakjes, bibberen) vervallen. Per stuk een rechte lijn door het midden van dat stuk; de hoekpunten zijn de snijpunten,
  // zodat een boog in de draai (zoals de looplijn van StairDesigner) dezelfde maten geeft als een scherpe hoek.
  function looplijnStukken(pts) {
    const tot = lengte(pts); if (tot < 200) return [];
    const st = 30, s = [pts[0]];
    for (let i = 1, rest = 0; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = st - rest;
      while (d <= L) { s.push([a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]); d += st; }
      rest = L - (d - st);
    }
    if (s.length < 3) s.push(pts[pts.length - 1]);
    const w = 3, phi = s.map((_, i) => { const a = s[Math.max(0, i - w)], b = s[Math.min(s.length - 1, i + w)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
    let C = 0, S = 0; for (const f of phi) { C += Math.cos(4 * f); S += Math.sin(4 * f); }
    const t0 = Math.atan2(S, C) / 4, q = phi.map(f => (((Math.round((f - t0) / (Math.PI / 2)) % 4) + 4) % 4));
    // stukken (runs) van dezelfde richting; korte stukken weg (en buren met dezelfde richting samenvoegen)
    let runs = [];
    q.forEach((r, i) => { const l = runs[runs.length - 1]; if (l && l.r === r) l.j = i; else runs.push({ r, i, j: i }); });
    const min = Math.max(200, tot * 0.07) / st;
    for (let ok = false; !ok;) {
      ok = true;
      const k = runs.reduce((m, x, i) => (x.j - x.i < runs[m].j - runs[m].i ? i : m), 0);
      if (runs.length > 1 && runs[k].j - runs[k].i + 1 < min) {
        ok = false; const x = runs[k], vo = runs[k - 1], na = runs[k + 1];
        if (vo && na && vo.r === na.r) { vo.j = na.j; runs.splice(k, 2); }
        else if (vo && (!na || vo.j - vo.i >= na.j - na.i)) { vo.j = x.j; runs.splice(k, 1); }
        else { na.i = x.i; runs.splice(k, 1); }
      }
    }
    // per stuk een lijn: richting u (haaks vastgezet), positie = mediaan dwars op de richting over het middelste deel van het stuk
    const lijnen = runs.map(x => {
      const f = t0 + x.r * Math.PI / 2, u = [Math.cos(f), Math.sin(f)], n = [-u[1], u[0]], m = Math.floor((x.j - x.i) * 0.25);
      const c = s.slice(x.i + m, x.j - m + 1).map(p => p[0] * n[0] + p[1] * n[1]).sort((a, b) => a - b);
      return { r: x.r, u, n, c: c[Math.floor(c.length / 2)] };
    });
    const op = (l, p) => { const d = p[0] * l.n[0] + p[1] * l.n[1] - l.c; return [p[0] - d * l.n[0], p[1] - d * l.n[1]]; };
    const k = [op(lijnen[0], s[0])];
    for (let i = 1; i < lijnen.length; i++) {
      const a = lijnen[i - 1], b = lijnen[i], det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
      if (Math.abs(det) < 1e-6) { k.omkeer = true; k.push(op(a, s[runs[i].i])); continue; }    // terug in dezelfde lijn: geen trapvorm
      k.push([(a.c * b.n[1] - a.n[1] * b.c) / det, (a.n[0] * b.c - a.c * b.n[0]) / det]);
    }
    k.push(op(lijnen[lijnen.length - 1], s[s.length - 1]));
    return k;
  }
  // afstand langs een straal vanuit p in richting d tot de dichtstbijzijnde lijn van de omtrek (of Infinity)
  function straal(p, d, lijnen) {
    let best = Infinity;
    for (const l of lijnen) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den, s = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
      if (t > 1 && s >= 0 && s <= 1 && t < best) best = t;
    }
    return best;
  }
  const r10 = (x) => Math.round(x / 10) * 10;
  function schetsHerken(schets, v) {
    const L = ((schets && schets.lijnen) || []).filter(l => l.p && l.p.length > 1), van = (s) => L.filter(l => l.s === s).map(l => l.p.map(q => [q[0], q[1]]));
    const loop = van('loop'), omtrek = van('omtrek'), gat = van('gat');
    const B0 = +((v && v.maten) || {}).breedte || 850, uit = { ok: false, lijnen: L.length };
    // trapgat: omhullende van de lijnen "trapgat"
    if (gat.length) { const ps = gat.flat(), xs = ps.map(q => q[0]), ys = ps.map(q => q[1]); uit.gat = { x: r10(Math.min(...xs)), y: r10(Math.min(...ys)), bx: r10(Math.max(...xs) - Math.min(...xs)), by: r10(Math.max(...ys) - Math.min(...ys)) }; }
    if (!loop.length && !omtrek.length) { uit.melding = L.length ? 'Teken de looplijn (van onder naar boven) of de omtrek van de trap om de vorm te herkennen.' : 'Nog niets getekend.'; return uit; }
    if (!loop.length) {
      // alleen de omtrek: een (bijna) rechthoek is een rechte trap; andere vormen hebben de looplijn nodig voor de looprichting
      const ps = omtrek.flat(), xs = ps.map(q => q[0]), ys = ps.map(q => q[1]), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      const opp = Math.abs(ps.reduce((a, q, i) => { const r = ps[(i + 1) % ps.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
      if (w * h > 0 && opp / (w * h) > 0.8 && Math.max(w, h) > 1.6 * Math.min(w, h)) {
        Object.assign(uit, { ok: true, bron: 'omtrek', vorm: 'recht', model: 'm1', richting: (v && v.richting) || 'rechts', breedte: r10(Math.min(w, h)), maten: { lengte: r10(Math.max(w, h)) }, stukken: [] });
        uit.melding = 'Rechte trap herkend uit de omtrek.'; return uit;
      }
      uit.melding = 'Teken ook de looplijn (van onder naar boven): daaruit volgen de vorm en de looprichting.'; return uit;
    }
    // looplijnen in tekenvolgorde achter elkaar (ook als in delen getekend)
    const pts = loop.reduce((a, l) => a.concat(l), []), k = looplijnStukken(pts), n = k.length - 1;
    if (n < 1) { uit.melding = 'De looplijn is te kort.'; return uit; }
    if (k.omkeer) { uit.melding = 'De looplijn keert om zonder dwarsstuk; teken één lijn van onder naar boven.'; uit.stukken = k; return uit; }
    if (n > 3) { uit.melding = `De looplijn heeft ${n - 1} bochten; de modellen hebben er hoogstens twee. Teken één doorgaande lijn van onder naar boven.`; uit.stukken = k; return uit; }
    const seg = k.slice(1).map((q, i) => ({ a: k[i], b: q, L: Math.hypot(q[0] - k[i][0], q[1] - k[i][1]), d: [(q[0] - k[i][0]) / (Math.hypot(q[0] - k[i][0], q[1] - k[i][1]) || 1), (q[1] - k[i][1]) / (Math.hypot(q[0] - k[i][0], q[1] - k[i][1]) || 1)] }));
    const kruis = (i) => seg[i].d[0] * seg[i + 1].d[1] - seg[i].d[1] * seg[i + 1].d[0];   // > 0 = bocht naar rechts (y omlaag)
    if (n === 3 && Math.sign(kruis(0)) !== Math.sign(kruis(1))) { uit.melding = 'De looplijn draait eerst de ene en dan de andere kant op (S-vorm); dat model bestaat niet. Teken een L of U.'; uit.stukken = k; return uit; }
    // breedte: haaks op het langste stuk naar beide kanten tot de omtrek
    let B = B0, bBron = 'variant';
    if (omtrek.length) {
      const s = seg.reduce((a, x) => (x.L > a.L ? x : a)), m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], nrm = [-s.d[1], s.d[0]];
      const d1 = straal(m, nrm, omtrek), d2 = straal(m, [-nrm[0], -nrm[1]], omtrek), som = isFinite(d1) && isFinite(d2) ? d1 + d2 : isFinite(d1) ? 2 * d1 : isFinite(d2) ? 2 * d2 : 0;
      if (som >= 500 && som <= 2000) { B = r10(som); bBron = 'omtrek'; }
    }
    const vorm = n === 1 ? 'recht' : n === 2 ? 'L' : 'U', cur = v && v.model, bordes = cur && (MODELLEN.find(m => m.k === cur) || {}).bordes && VORM[cur] === vorm;
    const s = seg.map(x => x.L), richting = n === 1 ? ((v && v.richting) || 'rechts') : kruis(0) > 0 ? 'rechts' : 'links';
    let model, maten;
    if (vorm === 'recht') { model = 'm1'; maten = { lengte: r10(s[0]) }; }
    else if (vorm === 'L') {
      maten = { a: r10(s[0] + B / 2), b: r10(s[1] + B / 2) };
      model = bordes ? (maten.b < 0.4 * maten.a ? 'm9' : 'm7') : maten.b < 0.4 * maten.a ? 'm4' : maten.a < 0.4 * maten.b ? 'm5' : 'm2';
    } else {
      maten = { a: r10(s[0] + B / 2), kop: r10(s[1] + B), c: r10(s[2] + B / 2) };
      const compact = maten.kop < 2 * B + 150; model = bordes ? (compact ? 'm10' : 'm8') : compact ? 'm6' : 'm3';
    }
    Object.assign(uit, { ok: true, bron: 'looplijn', vorm, model, richting, breedte: B, breedteBron: bBron, maten, stukken: k });
    uit.melding = `${(MODELLEN.find(m => m.k === model) || {}).naam || vorm} herkend${vorm !== 'recht' ? (richting === 'rechts' ? ', rechtsom' : ', linksom') : ''}.`;
    return uit;
  }
  // herkende vorm in de variant zetten: model, looprichting en maten (de schets zelf blijft bewaard)
  function schetsToepassen(v, h) {
    if (!h || !h.ok) return false;
    zetModel(v, h.model);
    v.maten = Object.assign({ breedte: h.breedte }, h.maten);
    if (h.vorm !== 'recht') v.richting = h.richting;
    return true;
  }

  return { STAPPEN, nvt, SCHETS_SOORTEN, schetsHerken, schetsToepassen, vereenvoudig, tredenSoort, VLOEREN, ZIJDEN, VB_VORMEN, vbVorm, tgHoeken, tgEigen, tgAankomst, trapPos, trapgatStd, MODELLEN, KANT, BOMEN, LEUNING_PLAATS, SPILSOORTEN, RICHTING, TIPS, TYPE_INFO, HOUT_SOORTEN, AFW_SOORTEN, afwVan,
    modelVan, zetModel, schatting, VORM, MAATVELDEN, vormVan, matenStd, matenVoorstel, vloerHoogte, kant, vlucht, vluchtNrs, vrijeKanten, muurKanten, heeftBal, boomSoort, nieuweKant,
    nieuweVloerBal, vbLengte, vbSpillen, segLen, houtVan, soortenVan, houtKeuzes, houtNaam, nieuweVariant, ensure, actief, gekozen, kopie,
    balCfg, balType, prijzen, samenvatting, verschillen, autoAantal, toepassen, controle };
})();
