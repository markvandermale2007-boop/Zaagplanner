// StairDesigner-PDF inlezen met pdf.js: onderdeelpagina's, materiaal, dikte, contouren en de zaaglijst.
ZP.pdfimport = (function () {
  const G = ZP.geom, P = ZP.parts;
  const MM_PER_PT = 25.4 / 72;

  function ensurePdfJs() {
    if (!window.pdfjsLib) throw new Error('pdf.js is niet geladen (internetverbinding nodig voor de eerste keer).');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function mul(m, n) { // m * n (pdf-matrices)
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  // Alle gestreepte lijnstukken van een pagina, per kleur, in pt (paginacoördinaten).
  async function pageSegments(page) {
    const ol = await page.getOperatorList();
    const O = pdfjsLib.OPS;
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let color = '0,0,0';
    let pending = []; const out = {};
    for (let i = 0; i < ol.fnArray.length; i++) {
      const f = ol.fnArray[i], a = ol.argsArray[i];
      if (f === O.save) stack.push([ctm, color]);
      else if (f === O.restore) { const s = stack.pop(); if (s) [ctm, color] = s; }
      else if (f === O.transform) ctm = mul(ctm, a);
      else if (f === O.setStrokeRGBColor) color = Array.from(a).map(v => Math.round(v)).join(',');
      else if (f === O.setStrokeGray) { const g = Math.round(a[0] * 255); color = g + ',' + g + ',' + g; }
      else if (f === O.constructPath) {
        const ops = a[0], args = a[1]; let k = 0, cur = null, start = null;
        for (const op of ops) {
          if (op === O.moveTo) { cur = ap(ctm, args[k], args[k + 1]); start = cur; k += 2; }
          else if (op === O.lineTo) { const p = ap(ctm, args[k], args[k + 1]); k += 2; if (cur) pending.push([cur, p]); cur = p; }
          else if (op === O.curveTo) { const p = ap(ctm, args[k + 4], args[k + 5]); k += 6; if (cur) pending.push([cur, p]); cur = p; }
          else if (op === O.curveTo2 || op === O.curveTo3) { const p = ap(ctm, args[k + 2], args[k + 3]); k += 4; if (cur) pending.push([cur, p]); cur = p; }
          else if (op === O.rectangle) {
            const [x, y, w, h] = [args[k], args[k + 1], args[k + 2], args[k + 3]]; k += 4;
            const q = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)];
            for (let j = 0; j < 4; j++) pending.push([q[j], q[(j + 1) % 4]]);
          } else if (op === O.closePath) { if (cur && start) pending.push([cur, start]); cur = start; }
        }
      } else if (f === O.stroke || f === O.closeStroke || f === O.fillStroke || f === O.eoFillStroke || f === O.closeFillStroke) {
        (out[color] = out[color] || []).push(...pending); pending = [];
      } else if (f === O.endPath || f === O.fill || f === O.eoFill) pending = [];
    }
    return out;
  }

  // Plattegrond-pagina (eerste blad van StairDesigner): de tekening letterlijk overnemen – lijnen als paden (met bogen), per kleur
  // (z = zwart: de trap, g = grijs/gestippeld: maat- en looplijnen) en alle getallen (maten, tredenummers) met plaats, hoek en
  // grootte, in pt met y omhoog. De app tekent dit opnieuw in de eigen stijl (spectekening.js sptPlanSvg): werkt voor elke trapvorm.
  // Alles boven de onderste regel koptekst (titelblok, "Optrede hoogte …") blijft buiten de tekening; de kopgegevens gaan mee als info.
  // lijnstukken splitsen op hun onderlinge kruispunten (ook waar een eindpunt óp een andere lijn ligt)
  function splitsOpKruising(segs, tol) {
    const uit = [];
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i], rx = b[0] - a[0], ry = b[1] - a[1], L = Math.hypot(rx, ry); if (L < 1e-6) continue;
      const ts = [0, 1];
      for (let j = 0; j < segs.length; j++) { if (j === i) continue;
        const [c, e] = segs[j], sx = e[0] - c[0], sy = e[1] - c[1], Ls = Math.hypot(sx, sy), den = rx * sy - ry * sx; if (Ls < 1e-6 || Math.abs(den) < 1e-9) continue;
        const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
        if (t > tol / L && t < 1 - tol / L && u >= -tol / Ls && u <= 1 + tol / Ls) ts.push(t); }
      ts.sort((p, q) => p - q);
      for (let k = 1; k < ts.length; k++) if (ts[k] - ts[k - 1] > 1e-6) uit.push([[a[0] + rx * ts[k - 1], a[1] + ry * ts[k - 1]], [a[0] + rx * ts[k], a[1] + ry * ts[k]]]);
    }
    return uit;
  }
  async function pagePlan(page) {
    const tc = await page.getTextContent(), r1 = (v) => Math.round(v * 10) / 10;
    const txt = tc.items.filter(t => t.str.trim()).map(t => ({ s: t.str.trim(), x: t.transform[4], y: t.transform[5], a: Math.round(Math.atan2(t.transform[1], t.transform[0]) * 180 / Math.PI), h: Math.hypot(t.transform[0], t.transform[1]), w: t.width || 0 }));
    const getal = (s) => /^\d+([.,]\d+)?$/.test(s), kop = txt.filter(t => !getal(t.s));
    const yKop = kop.length ? Math.min(...kop.map(t => t.y)) - 4 : Infinity;
    const tekst = txt.filter(t => getal(t.s) && t.y < yKop);
    const ol = await page.getOperatorList(), O = pdfjsLib.OPS;
    let ctm = [1, 0, 0, 1, 0, 0], kleur = 'z', streep = false; const stack = [], paden = [], segs = [];
    let d = '', pts = [], koorden = [];
    for (let i = 0; i < ol.fnArray.length; i++) {
      const f = ol.fnArray[i], a = ol.argsArray[i];
      if (f === O.save) stack.push([ctm, kleur, streep]);
      else if (f === O.restore) { const s = stack.pop(); if (s) [ctm, kleur, streep] = s; }
      else if (f === O.transform) ctm = mul(ctm, a);
      else if (f === O.setStrokeRGBColor) kleur = a[0] + a[1] + a[2] > 150 ? 'g' : 'z';
      else if (f === O.setStrokeGray) kleur = a[0] > 0.2 ? 'g' : 'z';
      else if (f === O.setDash) streep = !!(a[0] && a[0].length);
      else if (f === O.constructPath) {
        const ops = a[0], args = a[1]; let k = 0, cur = null, start = null;
        const P2 = (x, y) => { const q = ap(ctm, x, y); pts.push(q); return q; }, fm = (q) => r1(q[0]) + ' ' + r1(q[1]);
        for (const op of ops) {
          if (op === O.moveTo) { cur = P2(args[k], args[k + 1]); start = cur; k += 2; d += 'M' + fm(cur); }
          else if (op === O.lineTo) { const q = P2(args[k], args[k + 1]); k += 2; if (cur) koorden.push([cur, q]); cur = q; d += 'L' + fm(q); }
          else if (op === O.curveTo) { const c1 = P2(args[k], args[k + 1]), c2 = P2(args[k + 2], args[k + 3]), q = P2(args[k + 4], args[k + 5]); k += 6; if (cur) koorden.push([cur, q]); cur = q; d += 'C' + fm(c1) + ' ' + fm(c2) + ' ' + fm(q); }
          else if (op === O.curveTo2) { const c2 = P2(args[k], args[k + 1]), q = P2(args[k + 2], args[k + 3]); k += 4; d += 'C' + fm(cur || c2) + ' ' + fm(c2) + ' ' + fm(q); if (cur) koorden.push([cur, q]); cur = q; }
          else if (op === O.curveTo3) { const c1 = P2(args[k], args[k + 1]), q = P2(args[k + 2], args[k + 3]); k += 4; d += 'C' + fm(c1) + ' ' + fm(q) + ' ' + fm(q); if (cur) koorden.push([cur, q]); cur = q; }
          else if (op === O.rectangle) { const [x, y, w, h] = [args[k], args[k + 1], args[k + 2], args[k + 3]]; k += 4;
            const q = [P2(x, y), P2(x + w, y), P2(x + w, y + h), P2(x, y + h)]; d += 'M' + q.map(fm).join('L') + 'Z'; for (let j = 0; j < 4; j++) koorden.push([q[j], q[(j + 1) % 4]]); cur = start = q[0]; }
          else if (op === O.closePath) { if (cur && start) koorden.push([cur, start]); cur = start; d += 'Z'; }
        }
      } else if (f === O.stroke || f === O.closeStroke || f === O.fillStroke || f === O.eoFillStroke || f === O.closeFillStroke) {
        if (d && pts.length && pts.every(q => q[1] < yKop)) { paden.push({ c: kleur === 'g' || streep ? 'g' : 'z', s: streep ? 1 : 0, d }); if (kleur === 'z' && !streep) segs.push(...koorden); }
        d = ''; pts = []; koorden = [];
      } else if (f === O.endPath || f === O.fill || f === O.eoFill) { d = ''; pts = []; koorden = []; }
    }
    if (paden.length < 5 || !tekst.length) return null;
    // vlakken tussen de zwarte lijnen (treden, bomen, spillen) om met de houtkleur te vullen
    // De tredelijnen eindigen óp de boomlijnen (T-kruisingen): eerst alle lijnen op hun kruispunten splitsen, dan de vlakken zoeken.
    // Gevuld worden de vlakken binnen de omvang van de trap zelf (gesloten vormen + vlakken met een tredenummer), niet de
    // stroken tussen maatlijnen buiten de trap.
    let vlakken = [];
    try {
      const schoon = (l) => l.map(x => G.simplify(x, 0.05)).filter(x => x.length >= 3 && Math.abs(G.area(x)) > 4);
      const dicht = schoon(G.segmentsToFaces(segs, 0.35)), alle = schoon(G.segmentsToFaces(splitsOpKruising(segs, 0.4), 0.35));
      const nTr = parseInt((kop.find(x => /^aantal treden/i.test(x.s)) ? (txt.filter(u => getal(u.s) && Math.abs(u.y - kop.find(x => /^aantal treden/i.test(x.s)).y) < 2)[0] || {}).s : '') || '99', 10) || 99;
      const nummers = tekst.filter(t => !t.a && /^\d+$/.test(t.s) && +t.s >= 1 && +t.s <= nTr);
      const kern = dicht.concat(alle.filter(l => nummers.some(t => G.pointInPoly([t.x + t.w / 2, t.y + t.h / 3], l))));
      if (kern.length) {
        const kb = kern.map(l => G.bbox(l)).reduce((a, q) => ({ x0: Math.min(a.x0, q.x0), y0: Math.min(a.y0, q.y0), x1: Math.max(a.x1, q.x1), y1: Math.max(a.y1, q.y1) }));
        vlakken = alle.filter(l => { const q = G.bbox(l); return q.x0 >= kb.x0 - 1 && q.y0 >= kb.y0 - 1 && q.x1 <= kb.x1 + 1 && q.y1 <= kb.y1 + 1; }).map(l => l.map(q => [r1(q[0]), r1(q[1])]));
      }
    } catch (e) { vlakken = []; }
    // omhullende van lijnen en getallen
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, zie = (x, y) => { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); };
    for (const pd of paden) { const n = pd.d.match(/-?\d+(\.\d+)?/g).map(Number); for (let j = 0; j + 1 < n.length; j += 2) zie(n[j], n[j + 1]); }
    for (const t of tekst) { zie(t.x - 2, t.y - 2); zie(t.x + (t.a ? t.h : t.w) + 2, t.y + (t.a ? t.w : t.h) + 2); }
    // kopgegevens (optrede, aantrede, aantal treden …): label met de waarde rechts ervan op dezelfde regel
    const info = {}, waarde = (lab) => { const t = kop.find(x => x.s.toLowerCase().startsWith(lab)); if (!t) return ''; const r = txt.filter(u => u !== t && Math.abs(u.y - t.y) < 2 && u.x > t.x + 1).sort((p, q) => p.x - q.x)[0]; return r ? r.s : ''; };
    for (const [k, lab] of [['optrede', 'optrede'], ['aantrede', 'aantrede'], ['treden', 'aantal treden'], ['hoogte', 'verdiepings'], ['stap', 'stap']]) { const v = waarde(lab); if (v) info[k] = v; }
    const schaal = (kop.find(t => /^Schaal:/i.test(t.s)) || { s: '' }).s.split(':').pop().trim();
    return { v: 1, paden, vlakken, tekst: tekst.map(t => ({ s: t.s, x: r1(t.x), y: r1(t.y), a: t.a, h: r1(t.h) })), box: [r1(b.x0), r1(b.y0), r1(b.x1), r1(b.y1)], schaal, info };
  }
  async function pageText(page) {
    const tc = await page.getTextContent();
    return tc.items.filter(t => t.str.trim()).map(t => ({ s: t.str.trim(), x: t.transform[4], y: t.transform[5] }));
  }
  // Waarde rechts van een label op dezelfde regel ("Materiaal | 2-Eiken"); per kolom (x-volgorde) teruggegeven.
  function labelValues(items, label) {
    const res = [];
    for (const t of items) if (t.s === label) {
      const right = items.filter(u => Math.abs(u.y - t.y) < 2 && u.x > t.x + 1).sort((a, b) => a.x - b.x)[0];
      if (right) res.push({ v: right.s, x: t.x });
    }
    return res.sort((a, b) => a.x - b.x).map(r => r.v);
  }
  const dims = (s) => { const m = String(s).replace(/,/g, '.').match(/([\d.]+)\s*[×x]\s*([\d.]+)(?:\s*[×x]\s*([\d.]+))?/); return m ? m.slice(1).filter(Boolean).map(Number) : null; };
  const num = (s) => { const m = String(s).replace(',', '.').match(/[\d.]+/); return m ? +m[0] : null; };

  // Zaaglijst-pagina('s): Onderdeel | Materiaal | Afmetingen | Zaaglijst Volume | Netto Volume
  function parseSawList(items) {
    const rows = {};
    for (const t of items) { const k = Math.round(t.y); (rows[k] = rows[k] || []).push(t); }
    const list = [];
    for (const k of Object.keys(rows)) {
      const r = rows[k].sort((a, b) => a.x - b.x).map(t => t.s);
      if (r.length < 4) continue;
      const pn = P.parseName(r[0]); if (pn.type === 'overig') continue;
      const d = dims(r[2]); if (!d) continue;
      const vols = r.slice(3).map(num);
      list.push({ name: P.canonicalName(pn.type, pn.side, pn.nr), ...pn, material: r[1], dims: d, gross: vols[0], net: vols[1] });
    }
    return list;
  }

  // Lussen zoeken in lijnen van één kleur; geeft lussen in pt terug, grootste eerst, zonder gaten.
  function loopsOf(segs, minArea = 30, faces = false) {
    if (!segs) return [];
    let loops = (faces ? G.segmentsToFaces(segs, 0.35) : G.segmentsToLoops(segs, 0.35)).map(l => G.ccw(G.simplify(l, 0.05)))
      .filter(l => l.length >= 3 && Math.abs(G.area(l)) > minArea);
    loops.sort((a, b) => Math.abs(G.area(b)) - Math.abs(G.area(a)));
    // binnenliggende lussen (gaten, details) weglaten
    const outer = [];
    for (const l of loops) if (!outer.some(o => G.pointInPoly(l[0], o) && G.pointInPoly(G.centroid(l), o))) outer.push(l);
    return outer;
  }

  // Schaal ijken: de maatlijnen staan langs de pagina-assen, dus de omhullende op de pagina (pt) tegen de
  // afmetingen (mm), in beide oriëntaties; daarna de minimale omhullende als reserve (schuin getekende delen).
  // De schaalaanduiding is het startpunt: wijkt de ijking meer dan 3% af, dan geldt de schaalaanduiding.
  function calibrate(loop, L, W, nominal) {
    const tries = [];
    const ab = G.bbox(loop);
    const ang = G.minAreaRectAngle(loop), rb = G.bbox(G.rotate(loop, -ang));
    for (const [w, h] of [[ab.w, ab.h], [ab.h, ab.w], [Math.max(rb.w, rb.h), Math.min(rb.w, rb.h)]]) {
      const s1 = L / w, s2 = W / h, s = (L + W) / (w + h);
      tries.push({ s, err: Math.max(Math.abs(s1 - s), Math.abs(s2 - s)) / s });
    }
    tries.sort((a, b) => a.err - b.err);
    let { s, err } = tries[0];
    let usedNominal = false;
    if (nominal && (err > 0.03 || Math.abs(s - nominal) / nominal > 0.03)) {
      // meet terug met de schaalaanduiding
      const nb = [ab.w * nominal, ab.h * nominal, Math.max(rb.w, rb.h) * nominal, Math.min(rb.w, rb.h) * nominal];
      const e1 = Math.max(Math.abs(nb[0] - L) / L, Math.abs(nb[1] - W) / W), e2 = Math.max(Math.abs(nb[1] - L) / L, Math.abs(nb[0] - W) / W),
        e3 = Math.max(Math.abs(nb[2] - L) / L, Math.abs(nb[3] - W) / W);
      const en = Math.min(e1, e2, e3);
      if (en < err || Math.abs(s - nominal) / nominal > 0.03) { s = nominal; err = en; usedNominal = true; }
    }
    return { s, err, usedNominal, nominalErr: nominal ? Math.abs(s - nominal) / nominal : 0 };
  }
  // Kaders van de titelbalk e.d. herkennen: lussen waarin koptekst staat.
  function isFrame(loop, items) {
    const b = G.bbox(loop);
    return items.some(t => /^(Page|Pagina)\s+\d|StairDesigner/i.test(t.s) && t.x >= b.x0 - 1 && t.x <= b.x1 + 1 && t.y >= b.y0 - 1 && t.y <= b.y1 + 1);
  }

  async function read(arrayBuffer, onProgress) {
    ensurePdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const result = { project: '', pages: [], sawList: [], parts: [], warnings: [], summary: [] };
    const pageInfos = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress && onProgress(i, doc.numPages);
      const page = await doc.getPage(i);
      const items = await pageText(page);
      const title = items.find(t => /^(Trap|Project)\b/i.test(t.s) && !/^Trap(boom|spil)/i.test(t.s));
      if (title && !result.project) result.project = title.s;
      if (items.some(t => t.s === 'Zaaglijst')) { result.sawList.push(...parseSawList(items)); continue; }
      if (items.some(t => t.s === 'Samenvatting')) { result.summary = parseSummary(items); continue; }
      const head = items.find(t => /^(Uitgevouwen\s+)?(Trede|Trapboom|Keep\s*boom|Kepboom|Leuning|Trapspil|Baluster|Stootbord)\b/i.test(t.s) && !/:/.test(t.s));
      // pagina zonder onderdeel maar met een schaal = de plattegrond (eerste blad): tekening met maten bewaren voor het tekeningblad
      if (!head) { if (!result.plan && items.some(t => /^Schaal:/i.test(t.s))) { try { result.plan = await pagePlan(page); } catch (e) { /* geen plattegrond: dan het eigen bovenaanzicht */ } } continue; }
      const scaleTxt = items.find(t => /^Schaal:/i.test(t.s));
      const scaleN = scaleTxt ? num(scaleTxt.s.split(':').pop()) : null;
      pageInfos.push({ i, page, items, head: head.s, scaleN, segs: await pageSegments(page),
        materials: labelValues(items, 'Materiaal'), afm: labelValues(items, 'Afmetingen').map(dims),
        dikte: labelValues(items, 'Dikte').map(num) });
    }
    const zl = new Map(result.sawList.map(z => [z.name, z]));
    const done = new Set();

    for (const pi of pageInfos) {
      const pn = P.parseName(pi.head);
      const nominal = pi.scaleN ? MM_PER_PT * pi.scaleN : null;
      const black = loopsOf(pi.segs['0,0,0']).filter(l => !isFrame(l, pi.items));
      result.pages.push({ i: pi.i, head: pi.head, loops: black.length });
      if (pn.type === 'spil' || pn.type === 'baluster') continue; // prisma: uit de zaaglijst
      if (pn.type === 'leuning' && /uitgevouwen/i.test(pi.head)) {
        // meerdere leuningdelen op één pagina: koppelen aan zaaglijst op volgorde van grootte
        const cands = result.sawList.filter(z => z.type === 'leuning' && z.side === pn.side);
        const loops = loopsOf(pi.segs['0,0,0'], 30, true).filter(l => !isFrame(l, pi.items)).slice(0, cands.length);
        const sized = loops.map(l => ({ l, len: Math.max(G.bbox(G.rotate(l, -G.minAreaRectAngle(l))).w, G.bbox(G.rotate(l, -G.minAreaRectAngle(l))).h) }));
        const zs = cands.slice().sort((a, b) => b.dims[0] - a.dims[0]);
        sized.sort((a, b) => b.len - a.len);
        sized.forEach((s, k) => {
          const z = zs[k]; if (!z) return;
          const cal = nominal ? { s: nominal, err: 0 } : calibrate(s.l, z.dims[0], z.dims[1], null);
          const base = { name: z.name, type: 'leuning', side: z.side, nr: z.nr, material: z.material, thickness: z.dims[2], source: 'pdf', page: pi.i, curved: true, warnings: [] };
          if (cal.err > 0.03) base.warnings.push(`Contour wijkt ${(cal.err * 100).toFixed(1)}% af van zaaglijstmaat; controleer.`);
          const contour = s.l.map(([x, y]) => [x * cal.s, y * cal.s]);
          result.parts.push(P.fromContour(base, contour)); done.add(z.name);
        });
        continue;
      }
      const name = P.canonicalName(pn.type, pn.side, pn.nr);
      const z = zl.get(name);
      const afm = pi.afm[0] || (z && z.dims);
      if (!afm) { result.warnings.push(`${pi.head}: geen afmetingen gevonden.`); continue; }
      const thickness = pi.dikte[0] || (z && z.dims[2]) || null;
      const material = pi.materials[0] || (z && z.material) || '';
      // kies de lus die het best bij de afmetingen past
      let best = null;
      for (const l of black.slice(0, 6)) {
        const c = calibrate(l, afm[0], afm[1], nominal);
        const score = c.err + (nominal ? c.nominalErr * 0.5 : 0);
        if (!best || score < best.score) best = { l, c, score };
      }
      const base = { name, type: pn.type, side: pn.side, nr: pn.nr, material, thickness, source: 'pdf', page: pi.i, warnings: [] };
      if (/uitgevouwen/i.test(pi.head)) base.curved = true;   // gebogen onderdeel (uitslag getekend)
      if (!best) { result.warnings.push(`${name}: geen contour gevonden, rechthoek gebruikt.`); result.parts.push(P.rect(base, afm[0], afm[1])); done.add(name); continue; }
      if (best.c.err > 0.03) base.warnings.push(`Maatlijnen en contour verschillen ${(best.c.err * 100).toFixed(1)}%.`);
      const s = best.c.s;
      const contour = best.l.map(([x, y]) => [x * s, y * s]);
      let opts = {};
      if (pn.type === 'trede') {
        // voorkant: de rand boven het stootbord (grijze lus onder de trede)
        const grey = loopsOf(pi.segs['128,128,128'], 2).filter(g => G.pointInPoly(G.centroid(g), best.l));
        if (grey.length) {
          const g = grey[0].map(([x, y]) => [x * s, y * s]);
          opts.nose = P.noseFromRiser(contour, g);
          if (opts.nose) base.noseFrom = 'stootbord';
        }
        if (!opts.nose) { base.warnings.push('Neus niet herkend (geen stootbord in de tekening); langste rand gekozen, controleer.'); opts.nose = longestEdge(contour); base.noseFrom = 'gok'; }
      }
      result.parts.push(P.fromContour(base, contour, opts)); done.add(name);
    }
    // Onderdelen zonder eigen tekening (stootborden, spillen, balusters) als rechthoek uit de zaaglijst
    for (const z of result.sawList) {
      if (done.has(z.name)) continue;
      const d = z.dims;
      let L, W, t;
      if (z.type === 'spil' || z.type === 'baluster') { L = d[2]; W = Math.max(d[0], d[1]); t = Math.min(d[0], d[1]); }
      else { L = d[0]; W = d[1]; t = d[2]; }
      result.parts.push(P.rect({ name: z.name, type: z.type, side: z.side, nr: z.nr, material: z.material, thickness: t, source: 'zaaglijst', warnings: [] }, L, W));
    }
    checkAgainstSawList(result.parts, result.sawList);
    return result;
  }

  function longestEdge(p) {
    let best = null, bl = 0;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], l = G.dist(a, b); if (l > bl) { bl = l; best = [a, b]; } }
    return best;
  }

  function parseSummary(items) {
    const rows = {};
    for (const t of items) { const k = Math.round(t.y); (rows[k] = rows[k] || []).push(t); }
    return Object.values(rows).map(r => r.sort((a, b) => a.x - b.x).map(t => t.s)).filter(r => r.some(s => /dm³/.test(s)) && r[0] !== 'Totaal')
      .map(r => ({ group: r[0], material: r[1], gross: num(r[2]), net: num(r[3]) }));
  }

  // Omhullende maat en netto volume vergelijken met de PDF-zaaglijst (±3%). De tekening wint.
  function checkAgainstSawList(parts, sawList, tol = 0.03) {
    const zl = new Map(sawList.map(z => [z.name, z]));
    for (const p of parts) {
      const z = zl.get(p.name); if (!z) continue;
      p.sawList = { dims: z.dims, gross: z.gross, net: z.net };
      if (p.source === 'zaaglijst') continue;
      const L = z.dims[0], W = z.dims[1];
      const dl = Math.abs(p.L - L) / L, dw = Math.abs(p.W - W) / W, dv = z.net ? Math.abs(p.volume - z.net) / z.net : 0;
      const msgs = [];
      if (dl > tol || dw > tol) msgs.push(`omhullende ${p.L.toFixed(0)}×${p.W.toFixed(0)} i.p.v. ${L}×${W}`);
      if (dv > tol) msgs.push(`netto ${p.volume.toFixed(2)} i.p.v. ${z.net} dm³`);
      if (msgs.length) p.warnings.push('Wijkt af van PDF-zaaglijst: ' + msgs.join(', ') + ' (tekening aangehouden).');
    }
  }

  return { read, parseSawList, checkAgainstSawList, pageSegments, loopsOf };
})();
