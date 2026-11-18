// StairDesigner-DXF (3D-model met 3DFACE-driehoeken per blok) inlezen.
// Elk blok = één onderdeel; bloknaam geeft soort en nummer, laag de groep.
ZP.dxfimport = (function () {
  const G = ZP.geom, P = ZP.parts;

  // --- ruwe DXF-tekst naar secties/entiteiten ---
  function pairs(text) {
    const lines = text.split(/\r?\n/); const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i], 10), lines[i + 1].trim()]);
    return out;
  }
  function entities(pr, from, until) { // lijst {type, codes:[[c,v]]}
    const list = []; let cur = null;
    for (let i = from; i < pr.length; i++) {
      const [c, v] = pr[i];
      if (c === 0) { if (until.includes(v)) return { list, end: i }; cur = { type: v, codes: [] }; list.push(cur); }
      else if (cur) cur.codes.push([c, v]);
    }
    return { list, end: pr.length };
  }
  const get = (e, c, d) => { const f = e.codes.find(x => x[0] === c); return f ? f[1] : d; };
  const num = (e, c, d = 0) => { const v = get(e, c); return v === undefined ? d : parseFloat(v); };

  function parse(text) {
    const pr = pairs(text);
    const blocks = new Map(); const top = [];
    for (let i = 0; i < pr.length; i++) {
      if (pr[i][0] === 0 && pr[i][1] === 'SECTION' && pr[i + 1] && pr[i + 1][1] === 'BLOCKS') {
        let j = i + 2;
        while (j < pr.length && !(pr[j][0] === 0 && pr[j][1] === 'ENDSEC')) {
          if (pr[j][0] === 0 && pr[j][1] === 'BLOCK') {
            const head = entities(pr, j, ['3DFACE', 'INSERT', 'ENDBLK', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'MESH']);
            const hb = head.list[0];
            const name = get(hb, 2, ''), layer = get(hb, 8, '');
            const base = [num(hb, 10), num(hb, 20), num(hb, 30)];
            const body = entities(pr, head.end, ['ENDBLK']);
            blocks.set(name, { name, layer, base, ents: body.list });
            j = body.end + 1;
          } else j++;
        }
      }
      if (pr[i][0] === 0 && pr[i][1] === 'SECTION' && pr[i + 1] && pr[i + 1][1] === 'ENTITIES') {
        top.push(...entities(pr, i + 2, ['ENDSEC']).list);
      }
    }
    return { blocks, top };
  }

  // Transformatie van een INSERT (positie, schaal, rotatie om z).
  function insertXf(e, block) {
    const ins = [num(e, 10), num(e, 20), num(e, 30)];
    const sx = num(e, 41, 1), sy = num(e, 42, 1), sz = num(e, 43, 1), r = num(e, 50, 0) * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r), b = block.base;
    return (p) => { const x = (p[0] - b[0]) * sx, y = (p[1] - b[1]) * sy, z = (p[2] - b[2]) * sz; return [ins[0] + x * c - y * s, ins[1] + x * s + y * c, ins[2] + z]; };
  }

  // Alle onderdeelblokken met hun driehoeken in wereldcoördinaten.
  function collect(model) {
    const parts = [];
    const visit = (blockName, xf, depth) => {
      const b = model.blocks.get(blockName); if (!b || depth > 6) return;
      const tris = [];
      for (const e of b.ents) {
        if (e.type === '3DFACE') {
          const v = [0, 1, 2, 3].map(k => xf([num(e, 10 + k), num(e, 20 + k), num(e, 30 + k)]));
          tris.push([v[0], v[1], v[2]]);
          if (G.dist(v[2], v[3]) > 1e-6 || Math.abs(v[2][2] - v[3][2]) > 1e-6) tris.push([v[0], v[2], v[3]]);
        } else if (e.type === 'INSERT') {
          const child = model.blocks.get(get(e, 2));
          if (child) { const cx = insertXf(e, child); visit(child.name, (p) => xf(cx(p)), depth + 1); }
        }
      }
      if (tris.length) parts.push({ name: b.name, layer: b.layer, tris });
    };
    for (const e of model.top) if (e.type === 'INSERT') { const b = model.blocks.get(get(e, 2)); if (b) visit(b.name, insertXf(e, b), 0); }
    if (!parts.length) for (const b of model.blocks.values()) if (!b.name.startsWith('*')) visit(b.name, p => p, 0);
    // dubbele (geneste én losse) voorkomens van hetzelfde blok samenvoegen
    const seen = new Set();
    return parts.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // Zichtzijde, dikte en omtrek van één onderdeel.
  function analyse(tris, flat) {
    const groups = new Map(); let total = 0;
    for (const t of tris) {
      const c = cross(sub(t[1], t[0]), sub(t[2], t[0])); const a = len(c) / 2; if (a < 1e-6) continue;
      let n = unit(c);
      // normaal en tegenoverliggende normaal in dezelfde groep (boven- en onderkant)
      const flip = n[2] < -1e-6 || (Math.abs(n[2]) <= 1e-6 && (n[1] < -1e-6 || (Math.abs(n[1]) <= 1e-6 && n[0] < 0)));
      const nn = flip ? n.map(v => -v) : n;
      const d = dot(nn, t[0]);
      const key = nn.map(v => Math.round(v * 200)).join(',') + '|' + Math.round(d * 2);
      const g = groups.get(key) || { n: nn, d, area: 0, tris: [] };
      g.area += a; g.tris.push(t); groups.set(key, g); total += a;
    }
    const sorted = [...groups.values()].sort((a, b) => b.area - a.area);
    // treden liggen plat: dan telt het grootste horizontale vlak (ook bij een smalle neuslat)
    const face = (flat && sorted.find(g => Math.abs(g.n[2]) > 0.99)) || sorted[0];
    const n = face.n;
    let lo = Infinity, hi = -Infinity;
    for (const t of tris) for (const p of t) { const d = dot(n, p); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const thickness = Math.round((hi - lo) * 2) / 2;
    // vlak-assen: liggend -> x/y; staand -> horizontaal + verticaal
    let u, v;
    if (Math.abs(n[2]) > 0.9) { u = [1, 0, 0]; v = unit(cross(n, u)); }
    else { u = unit(cross([0, 0, 1], n)); v = unit(cross(n, u)); }
    const to2 = (p) => [dot(p, u), dot(p, v)];
    const outline = boundary(face.tris.map(t => t.map(to2)));
    const curved = face.area < 0.3 * total; // geen dominant plat vlak: gebogen onderdeel
    return { n, u, v, thickness, outline, faceArea: face.area, total, curved, to2 };
  }

  // Randen die maar één keer voorkomen vormen de omtrek van het vlak.
  function boundary(tris2) {
    const key = (p) => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
    const cnt = new Map();
    for (const t of tris2) for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], ka = key(a), kb = key(b); if (ka === kb) continue;
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const e = cnt.get(k); if (e) e.c++; else cnt.set(k, { c: 1, a, b });
    }
    const segs = [...cnt.values()].filter(e => e.c === 1).map(e => [e.a, e.b]);
    const loops = G.segmentsToLoops(segs, 0.05).filter(l => l.length >= 3);
    loops.sort((a, b) => Math.abs(G.area(b)) - Math.abs(G.area(a)));
    return loops[0] || null;
  }

  // Gebogen onderdeel (bijv. gebogen trapboom): uitslag benaderen door de lengte langs de bocht af te wikkelen.
  function unroll(tris) {
    const pts = []; for (const t of tris) for (const p of t) pts.push(p);
    // horizontale hoofdrichting via omhullende in bovenaanzicht, hoogte = z
    const plan = pts.map(p => [p[0], p[1]]);
    const ang = G.minAreaRectAngle(plan);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    // afgewikkelde lengte: voor elk punt de booglengte langs de middellijn in bovenaanzicht
    const rp = pts.map(p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]);
    const xs = rp.map(p => p[0]); const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const N = 60, bins = Array.from({ length: N + 1 }, () => []);
    rp.forEach(p => bins[Math.round((p[0] - x0) / (x1 - x0) * N)].push(p[1]));
    const mid = bins.map(b => b.length ? b.reduce((a, v) => a + v, 0) / b.length : null);
    for (let i = 0; i <= N; i++) if (mid[i] === null) mid[i] = mid[i - 1] !== undefined && mid[i - 1] !== null ? mid[i - 1] : 0;
    const arc = [0]; const dx = (x1 - x0) / N;
    for (let i = 1; i <= N; i++) arc.push(arc[i - 1] + Math.hypot(dx, mid[i] - mid[i - 1]));
    const sAt = (x) => { const f = (x - x0) / dx; const i = Math.min(N - 1, Math.max(0, Math.floor(f))); return arc[i] + (arc[i + 1] - arc[i]) * (f - i); };
    const width = Math.max(...bins.map((b, i) => b.length ? Math.max(...b) - Math.min(...b) : 0));
    const tris2 = tris.map(t => t.map(p => { const q = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; return [sAt(q[0]), q[2]]; }));
    // buitencontour van de projectie: alle driehoeken samen, omtrek van de unie via raster
    return { outline: rasterOutline(tris2), thicknessGuess: width };
  }
  // Omtrek van een vereniging van driehoeken: raster 5 mm, daarna randvolgen.
  function rasterOutline(tris2) {
    const all = tris2.flat(); const b = G.bbox(all), cell = 5;
    const W = Math.ceil(b.w / cell) + 3, H = Math.ceil(b.h / cell) + 3; const grid = new Uint8Array(W * H);
    for (const t of tris2) {
      const tb = G.bbox(t);
      for (let gx = Math.floor((tb.x0 - b.x0) / cell); gx <= Math.ceil((tb.x1 - b.x0) / cell); gx++)
        for (let gy = Math.floor((tb.y0 - b.y0) / cell); gy <= Math.ceil((tb.y1 - b.y0) / cell); gy++) {
          const p = [b.x0 + gx * cell, b.y0 + gy * cell];
          if (G.pointInPoly(p, t) || G.distPointSeg(p, t[0], t[1]) < cell * 0.75 || G.distPointSeg(p, t[1], t[2]) < cell * 0.75 || G.distPointSeg(p, t[2], t[0]) < cell * 0.75)
            grid[(gx + 1) + (gy + 1) * W] = 1;
        }
    }
    const segs = [];
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const v = grid[x + y * W];
      const px = b.x0 + (x - 1.5) * cell, py = b.y0 + (y - 1.5) * cell;
      if (v !== grid[x + 1 + y * W]) segs.push([[px + cell, py], [px + cell, py + cell]]);
      if (v !== grid[x + (y + 1) * W]) segs.push([[px, py + cell], [px + cell, py + cell]]);
    }
    const loops = G.segmentsToLoops(segs, 0.1); loops.sort((a, c) => Math.abs(G.area(c)) - Math.abs(G.area(a)));
    return loops[0] ? G.simplify(loops[0], cell * 0.4) : null;
  }

  function read(text) {
    const model = parse(text);
    const raw = collect(model);
    const result = { project: '', parts: [], warnings: [] };
    const projBlock = [...model.blocks.values()].find(b => !b.name.startsWith('*') && b.ents.some(e => e.type === 'INSERT'));
    if (projBlock) result.project = projBlock.name;
    const info = raw.map(r => {
      const pn = P.parseName(r.name);
      return { r, pn, a: analyse(r.tris, pn.type === 'trede') };
    });
    // centrum van elke trede in bovenaanzicht, voor de voorkant
    const treads = info.filter(x => x.pn.type === 'trede').sort((a, b) => a.pn.nr - b.pn.nr);
    const centre = new Map(treads.map(x => { const pts = x.r.tris.flat(); const b = G.bbox(pts.map(p => [p[0], p[1]])); return [x.pn.nr, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]]; }));
    for (const x of info) {
      const { pn, a, r } = x;
      const base = { name: P.canonicalName(pn.type, pn.side, pn.nr), type: pn.type, side: pn.side, nr: pn.nr, layer: r.layer,
        material: '', thickness: a.thickness, source: 'dxf', warnings: [] };
      let outline = a.outline;
      if (a.curved && pn.type !== 'trede') {
        const u = unroll(r.tris);
        outline = u.outline;
        base.curved = true;
        base.thickness = Math.round(Math.min(a.thickness, u.thicknessGuess) * 2) / 2 || a.thickness;
        base.warnings.push('Gebogen onderdeel: uitslag benaderd door afwikkelen; controleer de maat met de PDF.');
      }
      if (!outline) { result.warnings.push(`${base.name}: geen omtrek gevonden.`); continue; }
      const opts = {};
      if (pn.type === 'trede') {
        const c = centre.get(pn.nr), prev = centre.get(pn.nr - 1), next = centre.get(pn.nr + 1);
        let towards = null;
        if (prev) towards = prev; else if (next) towards = [2 * c[0] - next[0], 2 * c[1] - next[1]];
        if (towards && Math.abs(a.n[2]) > 0.9) {
          const t2 = a.to2([towards[0], towards[1], 0]);
          opts.nose = P.findNoseEdge(outline, t2);
          base.noseFrom = prev ? 'vorige trede' : 'volgende trede';
        }
        if (!opts.nose) { base.warnings.push('Neus niet herkend; controleer.'); opts.nose = null; }
      }
      const part = P.fromContour(base, outline, opts);
      // 3D-model van het onderdeel bewaren (driehoeken, afgerond op hele mm) voor de 3D-weergave
      part.mesh = r.tris.flat(2).map(v => Math.round(v));
      result.parts.push(part);
    }
    return result;
  }

  return { read, parse, collect, analyse };
})();
