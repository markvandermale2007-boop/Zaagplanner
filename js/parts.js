// Onderdelen: gemeenschappelijk model voor alle invoerbronnen.
// Elk onderdeel heeft een lokale contour in mm waarbij de nerf langs x loopt en de contour bij (0,0) begint.
// Bij treden ligt de neus op y = 0 (onderkant), de rest van de trede ligt erboven.
ZP.parts = (function () {
  const G = ZP.geom;

  const TYPES = {
    trede: { label: 'Treden', order: 1 },
    stootbord: { label: 'Stootborden', order: 2 },
    trapboom: { label: 'Trapbomen', order: 3 },
    // keepboom: alternatief voor de trapboom (treden liggen óp de uitgezaagde kepen); niet in elke trap
    keepboom: { label: 'Keepbomen', order: 4 },
    leuning: { label: 'Leuningen', order: 5 },
    spil: { label: 'Spillen', order: 6 },
    baluster: { label: 'Balusters', order: 7 },
    // bordes: breed tussenplateau, meestal verlijmd uit meerdere planken
    bordes: { label: 'Bordes', order: 8 },
    overig: { label: 'Overig', order: 9 },
  };

  // "Trede #7", "Trede7", "Trapboom Rechts2", "Keepboom Links #1", "Uitgevouwen Leuning Links" -> {type, side, nr}
  function parseName(name) {
    const s = String(name).trim();
    const m = s.match(/^(Uitgevouwen\s+)?(Trede|Stootbord|Trapboom|Keep\s*boom|Kepboom|Leuning|Trapspil|Spil|Baluster|Bordes)\s*(Links|Rechts)?\s*#?\s*(\d+)?/i);
    if (!m) return { type: 'overig', side: '', nr: 0 };
    const w = m[2].toLowerCase().replace(/\s+/g, '');
    const type = w === 'trapspil' ? 'spil' : w === 'kepboom' ? 'keepboom' : w;
    const side = m[3] ? m[3][0].toUpperCase() + m[3].slice(1).toLowerCase() : '';
    return { type, side, nr: m[4] ? +m[4] : 0 };
  }
  function canonicalName(type, side, nr) {
    const base = { trede: 'Trede', stootbord: 'Stootbord', trapboom: 'Trapboom', keepboom: 'Keepboom', leuning: 'Leuning', spil: 'Trapspil', baluster: 'Baluster', bordes: 'Bordes', overig: 'Onderdeel' }[type];
    return base + (side ? ' ' + side : '') + ' #' + nr;
  }

  // Bouw een onderdeel uit een contour in mm (willekeurige ligging).
  // opts.nose: [p, q] eindpunten van de neuslijn in dezelfde coördinaten (alleen treden).
  function fromContour(base, contour, opts = {}) {
    let poly = G.ccw(G.simplify(contour, 0.2));
    let ang;
    if (opts.nose) {
      const [p, q] = opts.nose;
      ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    } else ang = G.minAreaRectAngle(poly);
    poly = G.rotate(poly, -ang);
    if (opts.nose) {
      // neus moet onder liggen: de neuslijn (na rotatie) moet de laagste y hebben
      const [p, q] = opts.nose.map(pt => G.rotate([pt], -ang)[0]);
      const b = G.bbox(poly);
      const ny = (p[1] + q[1]) / 2;
      if (Math.abs(ny - b.y0) > Math.abs(ny - b.y1)) poly = G.rot180(poly);
    }
    poly = G.normalize(poly);
    return finish(Object.assign({}, base), poly, !!opts.nose);
  }
  function rect(base, L, W) {
    return finish(Object.assign({}, base), [[0, 0], [L, 0], [L, W], [0, W]], base.type === 'trede');
  }
  function finish(part, poly, hasNose) {
    const b = G.bbox(poly);
    part.poly = poly.map(([x, y]) => [round(x), round(y)]);
    part.L = round(b.w); part.W = round(b.h);
    part.netArea = Math.abs(G.area(poly));
    part.hasNose = part.type === 'trede' && hasNose !== false;
    if (part.hasNose) part.noseSpan = noseSpan(part.poly);
    part.volume = part.netArea * part.thickness / 1e6; // dm³
    part.include = part.include !== false;
    part.make = part.make || 'auto';
    part.warnings = part.warnings || [];
    part.id = part.id || (part.type + '-' + (part.side || '') + '-' + part.nr + '-' + Math.random().toString(36).slice(2, 7));
    return part;
  }
  function round(v) { return Math.round(v * 10) / 10; }
  // deel van de onderrand dat werkelijk op y=0 ligt (de neuslijn)
  function noseSpan(poly) {
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.abs(a[1]) < 0.6 && Math.abs(b[1]) < 0.6) { x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]); }
    }
    return x0 < x1 ? [x0, x1] : null;
  }

  // Neus omzetten: trede 180° draaien in het eigen vlak zodat de achterkant de neus wordt.
  function flipNose(part) {
    const poly = G.normalize(G.rot180(part.poly));
    part.noseManual = !part.noseManual;
    part.warnings = part.warnings.filter(w => !/neus/i.test(w));
    return finish(part, poly, true);
  }

  // Zoek de neuslijn: lange rechte rand waarvan de buitennormaal het best naar 'towards' wijst.
  function findNoseEdge(poly, towards) {
    const P = G.ccw(G.simplify(poly, 0.3));
    const c = G.centroid(P);
    const dir = [towards[0] - c[0], towards[1] - c[1]]; const dl = Math.hypot(dir[0], dir[1]) || 1;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const L = G.dist(a, b); if (L < 50) continue;
      const n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; // buitennormaal bij ccw
      const al = (n[0] * dir[0] + n[1] * dir[1]) / dl;
      const score = L * Math.max(0, al) ** 3;
      if (score > bestScore) { bestScore = score; best = [a, b]; }
    }
    return best;
  }

  // Neus uit de ligging van het stootbord: de lange rand evenwijdig aan het stootbord, er het dichtst bij.
  function noseFromRiser(poly, riser) {
    const P = G.ccw(G.simplify(poly, 0.3));
    const ra = G.minAreaRectAngle(riser), rc = G.centroid(riser);
    let best = null, bestD = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const L = G.dist(a, b); if (L < 40) continue;
      let d = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) - ra) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
      if (d > 0.1) continue; // niet evenwijdig
      const dd = G.distPointSeg(rc, a, b) - L * 1e-3;
      if (dd < bestD) { bestD = dd; best = [a, b]; }
    }
    return best;
  }

  function groupKey(part) { return (part.material || '?') + '|' + part.thickness; }

  function sortParts(parts) {
    return parts.slice().sort((a, b) => String(a.stair || '').localeCompare(String(b.stair || ''), undefined, { numeric: true }) || (TYPES[a.type].order - TYPES[b.type].order) || (a.side || '').localeCompare(b.side || '') || a.nr - b.nr);
  }

  // trap meerdere keren uitvoeren (stair.aantal): elk onderdeel komt er zo vaak in voor; de 1e houdt zijn id,
  // de kopieën krijgen id "…*2", "…*3" en in de naam "(2/3)". Voor indeling, inkoop en begroting.
  const aantalVan = (s) => Math.max(1, Math.round(+(s && s.aantal) || 1));
  function metAantal(parts, stairs) {
    const n = new Map((stairs || []).map(s => [s.id, aantalVan(s)]));
    if (![...n.values()].some(k => k > 1)) return parts;
    const out = [];
    for (const p of parts) {
      const k = n.get(p.stair) || 1;
      if (k < 2) { out.push(p); continue; }
      for (let i = 1; i <= k; i++) out.push(Object.assign({}, p, { id: i === 1 ? p.id : p.id + '*' + i, kopie: i,
        name: `${p.name} (${i}/${k})`, dispName: `${p.dispName || p.name} (${i}/${k})` }));
    }
    return out;
  }

  // Recht of gebogen (trapboom/keepboom/leuning), gelezen uit de tekening: 'Gebogen' | 'Recht' | null (geen tekening).
  // DXF: een recht onderdeel past in de dikte (alle punten binnen dikte + marge langs de normaal van een groot vlak);
  // gebogen = nergens zo plat. PDF: StairDesigner tekent een gebogen onderdeel als "Uitgevouwen …" (curved bij inlezen).
  const vormCache = new WeakMap();
  function meshGebogen(m, dikte) {
    const tr = [];
    for (let i = 0; i + 8 < m.length; i += 9) {
      const u = [m[i + 3] - m[i], m[i + 4] - m[i + 1], m[i + 5] - m[i + 2]], v = [m[i + 6] - m[i], m[i + 7] - m[i + 1], m[i + 8] - m[i + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]);
      if (l > 0) tr.push({ a: l, n: n.map(x => x / l) });
    }
    tr.sort((a, b) => b.a - a.a);
    let plat = Infinity;
    for (const t of tr.slice(0, 30)) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i + 2 < m.length; i += 3) { const d = m[i] * t.n[0] + m[i + 1] * t.n[1] + m[i + 2] * t.n[2]; if (d < lo) lo = d; if (d > hi) hi = d; }
      plat = Math.min(plat, hi - lo);
    }
    const t = +dikte > 0 ? +dikte : 40;
    return plat > t + Math.max(10, 0.25 * t);
  }
  function vorm(p) {
    if (!p) return null;
    if (p.curved) return 'Gebogen';
    if (p.mesh && p.mesh.length >= 9) {
      if (!vormCache.has(p.mesh)) vormCache.set(p.mesh, meshGebogen(p.mesh, p.thickness));
      return vormCache.get(p.mesh) ? 'Gebogen' : 'Recht';
    }
    return p.source === 'pdf' || p.source === 'dxf' ? 'Recht' : null;
  }

  return { TYPES, parseName, canonicalName, fromContour, rect, finish, flipNose, findNoseEdge, noseFromRiser, groupKey, sortParts, noseSpan, aantalVan, metAantal, vorm };
})();
