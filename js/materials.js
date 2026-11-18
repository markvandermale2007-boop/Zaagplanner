// Materialenlijst (koopbare maten met prijs) en instellingen (profiel).
ZP.materials = (function () {
  let seq = 0;
  const uid = () => 'm' + Date.now().toString(36) + (seq++).toString(36);

  // Voorbeeldlijst: prijzen zijn indicatief en moeten door de gebruiker worden ingevuld.
  function defaults() {
    const rows = [];
    const add = (o) => rows.push(Object.assign({ id: uid(), supplier: '', available: null, stock: false, priceMode: 'm3', types: null }, o));
    // houtsoort › plank soort (met bruto/netto dikte) › maten. Welk onderdeel waarvan komt, kies je per project bij Hout.
    for (const w of [200, 250, 300, 350, 400]) for (const l of [1000, 1200, 1500, 2000, 2500, 3000, 3500, 4000])
      add({ material: 'Eiken', sub: 'Massief 50 mm', grossT: 50, netT: 40, width: w, length: l, price: 2600 });
    for (const w of [200, 220]) for (const l of [1000, 1500, 2000, 2500, 3000])
      add({ material: 'Eiken', sub: 'Massief 15 mm', grossT: 15, netT: 12, width: w, length: l, price: 2400 });
    for (const l of [1500, 2000, 3000, 4000, 5000])
      add({ material: 'Eiken', sub: 'Massief 100 mm', grossT: 100, netT: 90, width: 100, length: l, price: 3200 });
    for (const l of [2000, 3000])
      add({ material: 'Eiken', sub: 'Massief 22 mm', grossT: 22, netT: 18, width: 55, length: l, price: 2800 });
    return rows;
  }

  // Opschonen naar houtsoort › plank soort › maten: geen onderdelen meer per regel, elke regel een plank soort,
  // één dikte per plank soort, en dubbele regels (van de oude indeling per onderdeel) samengevoegd.
  function normalize(rows, defName = 'Plank', keepTypes = false) {
    const out = [], seen = new Set(), thick = new Map();
    for (const r0 of rows) {
      const r = Object.assign({}, r0, keepTypes ? {} : { types: null });
      delete r.kind;
      if (!r.sub) r.sub = `${defName} ${r.grossT} mm`;
      const sk = canonMaterial(r.material) + '|' + r.sub, tk = r.grossT + '|' + r.netT;
      if (!thick.has(sk)) thick.set(sk, tk);
      else if (thick.get(sk) !== tk) r.sub = `${r.sub} (${r.grossT}/${r.netT})`; // plank soort met afwijkende dikte apart
      const k = [canonMaterial(r.material), r.sub, r.grossT, r.netT, r.width, r.length, r.price, r.priceMode, !!r.stock, r.available ?? '', (r.types || []).join(',')].join('|');
      if (seen.has(k)) continue;
      seen.add(k); out.push(r);
    }
    return out;
  }

  // Voor welke onderdeelsoorten een maat gebruikt mag worden. Leeg/ontbrekend = alle soorten.
  const TYPE_KEYS = ['trede', 'stootbord', 'trapboom', 'keepboom', 'leuning', 'spil', 'baluster', 'bordes', 'overig'];

  // De materialenlijst is ingedeeld als materiaal › onderdeel › planken/platen. Elke regel hoort bij één onderdeel.
  // Trapbomen en keepbomen delen hun planken (de keepboom is een alternatief voor de trapboom).
  const PARTS = [
    { key: 'trede', label: 'Treden', types: ['trede'] },
    { key: 'stootbord', label: 'Stootborden', types: ['stootbord'] },
    { key: 'boom', label: 'Trapbomen en keepbomen', types: ['trapboom', 'keepboom'] },
    { key: 'leuning', label: 'Leuningen', types: ['leuning'] },
    { key: 'spil', label: 'Spillen', types: ['spil'] },
    { key: 'baluster', label: 'Balusters', types: ['baluster'] },
    { key: 'overig', label: 'Overig', types: ['overig'] },
    { key: 'alle', label: 'Alle onderdelen', types: null },
  ];
  function partOf(m) {
    if (!m.types || !m.types.length) return 'alle';
    const p = PARTS.find(p => p.types && p.types.length === m.types.length && p.types.every(t => m.types.includes(t)));
    return p ? p.key : 'alle';
  }
  // Regels die voor meerdere onderdelen gelden worden opgesplitst: één regel per onderdeel.
  // Bij het indelen worden gelijke planken weer samengevoegd (zie mergeStocks), zodat treden, bomen en leuningen
  // van dezelfde dikte nog steeds uit dezelfde plank kunnen komen.
  function splitByPart(rows) {
    const out = [];
    for (const r of rows) {
      if (!r.kind) r.kind = 'plank';
      if (!r.types || !r.types.length || PARTS.some(p => p.types && p.types.length === r.types.length && p.types.every(t => r.types.includes(t)))) { out.push(r); continue; }
      let first = true;
      for (const p of PARTS) {
        if (!p.types || !p.types.some(t => r.types.includes(t))) continue;
        out.push(Object.assign({}, r, { id: first ? r.id : uid(), types: p.types.slice() })); first = false;
      }
    }
    return out;
  }
  // Gelijke maten (zelfde materiaal, dikte, breedte, lengte en prijs) uit verschillende onderdelen worden één
  // inkoopmaat die voor al die onderdelen mag. Eigen voorraad wordt nooit samengevoegd (dat zijn echte planken).
  function mergeStocks(rows) {
    const map = new Map(), out = [];
    for (const r of rows) {
      const k = r.stock ? 'S' + r.id : [fullName(r), r.kind || 'plank', r.grossT, r.netT, r.width, r.length, boardPrice(r).toFixed(2), r.available ?? ''].join('|');
      const e = map.get(k);
      if (!e) { const c = Object.assign({}, r, { ids: [r.id], types: r.types ? r.types.slice() : null }); map.set(k, c); out.push(c); continue; }
      e.ids.push(r.id);
      if (!e.types || !r.types) e.types = null; else for (const t of r.types) if (!e.types.includes(t)) e.types.push(t);
    }
    return out;
  }
  function allows(m, type) {
    if (!m.types || !m.types.length) return true;
    const t = type === 'lamel' ? 'trede' : type;
    // een bordes wordt gemaakt zoals treden: plank soorten die voor treden mogen, mogen ook voor een bordes
    if (t === 'bordes') return m.types.includes('bordes') || m.types.includes('trede');
    return m.types.includes(t);
  }
  // "treden, trapbomen" -> ['trede','trapboom']; leeg of "alle" -> null
  function parseTypes(s) {
    const txt = String(s || '').toLowerCase().trim();
    if (!txt || /^alle?/.test(txt)) return null;
    const words = { trede: 'trede', stootbord: 'stootbord', keep: 'keepboom', boom: 'trapboom', bomen: 'trapboom', leuning: 'leuning', spil: 'spil', baluster: 'baluster', overig: 'overig' };
    const out = [];
    for (const part of txt.split(/[,;\/|+ ]+/)) for (const k of Object.keys(words)) {
      if (!part.includes(k)) continue;
      if ((k === 'boom' || k === 'bomen') && part.includes('keep')) continue; // "keepbomen" is geen trapboom
      if (!out.includes(words[k])) out.push(words[k]);
    }
    return out.length ? out : null;
  }
  function typesText(m) {
    if (!m.types || !m.types.length) return 'alle';
    return m.types.map(t => ZP.parts.TYPES[t] ? ZP.parts.TYPES[t].label.toLowerCase() : t).join(', ');
  }

  function boardPrice(m) {
    const p = +m.price || 0;
    if (m.priceMode === 'stuk') return p;
    if (m.priceMode === 'm1') return p * m.length / 1000;
    if (m.priceMode === 'm2') return p * m.width * m.length / 1e6;
    if (m.priceMode === 'dm3') return p * m.grossT * m.width * m.length / 1e6;
    return p * m.grossT * m.width * m.length / 1e9; // m3
  }
  // dm³ ingekocht; een verlijmd paneel telt als de planken waaruit het bestaat
  function boardVolume(m) { return m.panel ? m.panel.planks.reduce((a, p) => a + p.grossT * p.width * p.length / 1e6, 0) : m.grossT * m.width * m.length / 1e6; }

  // "2-Eiken" -> "Eiken"; koppeltabel heeft voorrang.
  function canonMaterial(name, map) {
    const n = String(name || '').trim();
    if (map && map[n]) return map[n];
    return n.replace(/^\d+\s*-\s*/, '');
  }
  // Plank soorten binnen een houtsoort (bv. Rustiek eiken › Panelen 40 mm, Rustiek eiken › Massief 50 mm).
  // Volledige naam = houtsoort › plank soort. Kies je in een project alleen de houtsoort, dan mogen alle plank soorten;
  // kies je een plank soort, dan alleen die.
  const SEP = ' › ';
  function fullName(m) { const c = canonMaterial(m.material); return m.sub ? c + SEP + m.sub : c; }
  function matches(m, wanted) {
    if (!wanted) return false;
    return wanted.includes(SEP) ? fullName(m) === wanted : canonMaterial(m.material) === wanted;
  }

  // Excel/CSV inlezen (ook rechtstreeks geplakt uit Excel: tab-gescheiden). Kopregel vereist, volgorde vrij:
  // houtsoort; plank soort; bruto dikte; netto dikte; breedte; lengte; prijs; per (stuk|m1|m2|m3|dm3); voorraad; leverancier
  const CSV_HEAD = ['houtsoort', 'plank soort', 'bruto dikte', 'netto dikte', 'breedte', 'lengte', 'prijs', 'per', 'voorraad', 'leverancier', 'geschikt voor'];
  function parseUnit(s) {
    const t = String(s || '').toLowerCase().replace(/\s/g, '');
    if (/dm3|dm³/.test(t)) return 'dm3';
    if (/m3|m³|kuub/.test(t)) return 'm3';
    if (/m2|m²/.test(t)) return 'm2';
    if (/m1|m¹|strek|meter/.test(t)) return 'm1';
    if (/st|plank|paneel/.test(t)) return 'stuk';
    return null;
  }
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const h0 = lines[0];
    const sep = h0.includes('\t') ? '\t' : (h0.match(/;/g) || []).length >= (h0.match(/,/g) || []).length ? ';' : ',';
    const head = h0.split(sep).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
    const ci = { mat: col('houtsoort', 'materiaal', 'material'), sub: col('plank soort', 'planksoort', 'plank-soort', 'soort plank', 'submap', 'kwaliteit', 'variant'),
      gt: col('bruto'), nt: col('netto'), w: col('breedte', 'width'), l: col('lengte', 'length'),
      p: col('prijs', 'price'), pm: head.findIndex(h => /^(per|eenheid|unit)$|prijs per/.test(h)), st: col('voorraad', 'op voorraad'), s: col('leverancier', 'supplier'), t: col('geschikt voor', 'onderdelen', 'onderdeel') };
    const n = (v) => { const x = parseFloat(String(v || '').replace(/[€\s"]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isNaN(x) ? null : x; };
    const rows = [];
    for (const line of lines.slice(1)) {
      const c = line.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
      const lens = String(c[ci.l] || '').split(/[\/|+]/).map(n).filter(Boolean);
      for (const length of lens.length ? lens : [null]) {
        const stockN = ci.st >= 0 ? n(c[ci.st]) : null;
        const r = { id: uid(), material: c[ci.mat] || 'Eiken', sub: ci.sub >= 0 ? c[ci.sub] || '' : '', grossT: n(c[ci.gt]), netT: n(c[ci.nt]), width: n(c[ci.w]), length,
          price: n(c[ci.p]) || 0, priceMode: parseUnit(c[ci.pm]) || 'm3',
          available: stockN > 0 ? stockN : null, stock: stockN > 0, supplier: ci.s >= 0 ? c[ci.s] || '' : '', types: ci.t >= 0 ? parseTypes(c[ci.t]) : null };
        // plank soort ook in de naam als "Beuken › paneel" / "Beuken > paneel"
        const mm = String(r.material).split(/\s*[›>]\s*/);
        r.material = mm[0]; if (!r.sub) r.sub = mm[1] || '';
        if (!r.netT && r.grossT) r.netT = r.grossT;
        if (!r.grossT && r.netT) r.grossT = r.netT;
        if (r.width && r.length && r.netT) rows.push(r);
      }
    }
    return normalize(rows, 'Plank', true);
  }
  function toCsv(rows) {
    const unit = { m3: 'm3', m2: 'm2', m1: 'm1', dm3: 'dm3', stuk: 'stuk' };
    return [CSV_HEAD.join(';')].concat(rows.map(m => [canonMaterial(m.material), m.sub || '', m.grossT, m.netT, m.width, m.length,
      String(m.price).replace('.', ','), unit[m.priceMode] || 'm3', m.stock ? (m.available || 1) : '', m.supplier || '', m.types && m.types.length ? typesText(m) : ''].join(';'))).join('\r\n');
  }

  function defaultSettings() {
    return {
      kerf: { trede: 5, lamel: 5, stootbord: 3, trapboom: 4, keepboom: 4, leuning: 4, spil: 4, baluster: 3, bordes: 5, overig: 4 },
      overLen: 10, overWidth: 3, endTrim: 50,
      minRemnant: { L: 400, W: 120 }, remnantFactor: 0.5,
      treadMode: 'auto', // per materiaal: 'breed' | 'verlijmd' | 'auto'
      // verlijmen in de breedte: planken naast elkaar tot een paneel; allowance = breedteverlies per naad (vlakken),
      // seamCost = lijmkosten per naad per strekkende meter; lamelWidth alleen voor 'lamellen per trede'
      glue: { minFirstSeam: 120, lamelWidth: 0, allowance: 5, seamCost: 2 },
      mirrorAllowed: false,
      // middenlijn: op brede planken ook een rij treden in het midden, met de neus op één gezaagde rechte lijn
      midLine: { enabled: false, minWidth: 600 },
      // spillen: 'auto' = massief als er dik genoeg hout is, anders in de dikte verlijmd uit lagen; allowance = schaafmarge
      spil: { mode: 'auto', allowance: 5 },
      contour: true, // indelen op echte contour (fase 2) i.p.v. omhullende rechthoek
      timeBudget: 4, // seconden per groep voor verbeteren
      soft: { treadBoards: 3, treadJump: 4, stringerSplit: 2 }, // strafpunten in €
      materialMap: {},
    };
  }

  return { defaults, normalize, toCsv, CSV_HEAD, TYPE_KEYS, PARTS, partOf, splitByPart, mergeStocks, allows, parseTypes, typesText, fullName, matches, SEP, boardPrice, boardVolume, canonMaterial, parseCsv, defaultSettings, uid };
})();
