// Geometrie: polygonen als [[x,y],...] (gesloten, zonder herhaald eindpunt).
window.ZP = window.ZP || {};
ZP.geom = (function () {
  const EPS = 1e-9;

  function area(p) { // getekend oppervlak (positief = tegen de klok in)
    let a = 0;
    for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; }
    return a / 2;
  }
  function ccw(p) { return area(p) < 0 ? p.slice().reverse() : p; }
  function bbox(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  function translate(p, dx, dy) { return p.map(([x, y]) => [x + dx, y + dy]); }
  function rotate(p, ang, cx = 0, cy = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return p.map(([x, y]) => { const u = x - cx, v = y - cy; return [cx + u * c - v * s, cy + u * s + v * c]; });
  }
  function rot180(p) { return p.map(([x, y]) => [-x, -y]); }
  function mirrorX(p) { return p.map(([x, y]) => [-x, y]).reverse(); }
  function normalize(p) { const b = bbox(p); return translate(p, -b.x0, -b.y0); }
  function centroid(p) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % n], f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < EPS) { const b = bbox(p); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    return [cx / (3 * a), cy / (3 * a)];
  }

  // Punten die (bijna) op één lijn liggen samenvoegen; korte stukjes van bogen blijven staan.
  function simplify(p, tol = 0.3) {
    let pts = p.slice();
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        if (distPointSeg(b, a, c) < tol || dist(a, b) < 0.05) { pts.splice(i, 1); changed = true; i--; }
      }
    }
    return pts;
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function distPointSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L < EPS ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function segsIntersect(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function pointInPoly(pt, p) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Kleinste afstand tussen twee polygonen (0 bij overlap). Stopt vroeg zodra < limit.
  function polyDistance(A, B, limit = 0) {
    for (let i = 0; i < A.length; i++) {
      const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) if (segsIntersect(a1, a2, B[j], B[(j + 1) % B.length])) return 0;
    }
    if (pointInPoly(A[0], B) || pointInPoly(B[0], A)) return 0;
    let m = Infinity;
    for (let i = 0; i < A.length; i++) {
      const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) {
        const b = B[j], b2 = B[(j + 1) % B.length];
        const d = Math.min(distPointSeg(b, a1, a2), distPointSeg(a1, b, b2));
        if (d < m) { m = d; if (m < limit) return m; }
      }
    }
    return m;
  }

  // Polygon knippen op een horizontale band y0..y1 (Sutherland-Hodgman, twee halfvlakken).
  function clipY(p, y0, y1) {
    const clip = (pts, keep, inter) => {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i], prev = pts[(i - 1 + pts.length) % pts.length];
        const ci = keep(cur), pi = keep(prev);
        if (ci) { if (!pi) out.push(inter(prev, cur)); out.push(cur); } else if (pi) out.push(inter(prev, cur));
      }
      return out;
    };
    const atY = (y) => (a, b) => { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y]; };
    let r = clip(p, q => q[1] >= y0, atY(y0));
    if (r.length) r = clip(r, q => q[1] <= y1, atY(y1));
    return r.length >= 3 ? r : null;
  }

  // Lijnstukken samenvoegen tot gesloten lussen (eindpunten binnen tol).
  function segmentsToLoops(segs, tol = 0.5) {
    const key = (p) => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
    const nodes = new Map(); // sleutel -> {p, edges:[segIdx]}
    const node = (p) => {
      // zoek ook in buurcellen
      const kx = Math.round(p[0] / tol), ky = Math.round(p[1] / tol);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const n = nodes.get((kx + dx) + ',' + (ky + dy));
        if (n && dist(n.p, p) <= tol) return n;
      }
      const n = { p, edges: [], k: key(p) }; nodes.set(n.k, n); return n;
    };
    const edges = segs.filter(s => dist(s[0], s[1]) > 1e-6).map(s => ({ a: node(s[0]), b: node(s[1]), used: false }));
    edges.forEach((e, i) => { e.a.edges.push(i); e.b.edges.push(i); });
    const loops = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].used) continue;
      // Volg een pad; alleen knopen met precies 2 lijnen tellen als doorlopende contour.
      const path = [edges[i].a]; let cur = edges[i].b; edges[i].used = true; let prevEdge = i; let ok = true;
      const start = edges[i].a;
      while (cur !== start) {
        path.push(cur);
        const nxt = cur.edges.filter(j => j !== prevEdge && !edges[j].used);
        if (nxt.length === 0) { ok = false; break; }
        // bij vertakking: kies de lijn die het minst afbuigt
        let j = nxt[0];
        if (nxt.length > 1) {
          const pp = path[path.length - 2].p, cp = cur.p;
          const din = Math.atan2(cp[1] - pp[1], cp[0] - pp[0]);
          let best = Infinity;
          for (const k of nxt) {
            const o = edges[k].a === cur ? edges[k].b : edges[k].a;
            let d = Math.abs(Math.atan2(o.p[1] - cp[1], o.p[0] - cp[0]) - din); if (d > Math.PI) d = 2 * Math.PI - d;
            if (d < best) { best = d; j = k; }
          }
        }
        edges[j].used = true; prevEdge = j;
        cur = edges[j].a === cur ? edges[j].b : edges[j].a;
        if (path.length > 5000) { ok = false; break; }
      }
      if (ok && path.length >= 3) loops.push(path.map(n => n.p));
    }
    return loops;
  }

  // Vlakken van een lijnennetwerk: aangrenzende delen (bijv. twee leuningdelen met een gedeelde naad)
  // komen als aparte lussen terug. Losse uitlopers (maatlijnen) worden eerst weggesnoeid.
  function segmentsToFaces(segs, tol = 0.5) {
    const nodes = [];
    const grid = new Map();
    const node = (p) => {
      const kx = Math.round(p[0] / tol), ky = Math.round(p[1] / tol);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const n = grid.get((kx + dx) + ',' + (ky + dy));
        if (n !== undefined && dist(nodes[n].p, p) <= tol) return n;
      }
      nodes.push({ p, nb: new Set() }); grid.set(kx + ',' + ky, nodes.length - 1); return nodes.length - 1;
    };
    for (const s of segs) { const a = node(s[0]), b = node(s[1]); if (a !== b) { nodes[a].nb.add(b); nodes[b].nb.add(a); } }
    // snoeien
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((n, i) => { if (n.nb.size === 1) { for (const j of n.nb) nodes[j].nb.delete(i); n.nb.clear(); changed = true; } });
    }
    const sorted = nodes.map((n) => [...n.nb].sort((a, b) =>
      Math.atan2(nodes[a].p[1] - n.p[1], nodes[a].p[0] - n.p[0]) - Math.atan2(nodes[b].p[1] - n.p[1], nodes[b].p[0] - n.p[0])));
    const used = new Set(); const faces = [];
    for (let u = 0; u < nodes.length; u++) for (const v of sorted[u]) {
      if (used.has(u + '>' + v)) continue;
      const face = []; let a = u, b = v, guard = 0;
      while (!used.has(a + '>' + b) && guard++ < 20000) {
        used.add(a + '>' + b); face.push(nodes[a].p);
        const lst = sorted[b], k = lst.indexOf(a);
        const c = lst[(k - 1 + lst.length) % lst.length]; // rechtsaf: vlak blijft links
        a = b; b = c;
      }
      if (face.length >= 3 && area(face) > 0) faces.push(face);
    }
    return faces;
  }

  // Minimale omhullende rechthoek (roterende schuifmaat over de convexe romp). Geeft hoek terug zodat
  // na rotate(p, -ang) de lange zijde langs x ligt.
  function hull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function minAreaRectAngle(p) {
    const h = hull(p); let best = { a: Infinity, ang: 0 };
    for (let i = 0; i < h.length; i++) {
      const q = h[i], r = h[(i + 1) % h.length];
      const ang = Math.atan2(r[1] - q[1], r[0] - q[0]);
      const b = bbox(rotate(h, -ang));
      const ar = b.w * b.h;
      if (ar < best.a - 1e-6) best = { a: ar, ang: b.w >= b.h ? ang : ang + Math.PI / 2 };
    }
    return best.ang;
  }

  // Polygon "oprekken": overmaat aan de kopse kanten (x) en aan de zijkanten (y).
  // Punten links/rechts van het midden schuiven naar buiten; voor y alleen de opgegeven zijden.
  function grow(p, dxEnds, dyLow, dyHigh) {
    const b = bbox(p), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return p.map(([x, y]) => [x + (x < cx ? -dxEnds : dxEnds), y + (y < cy ? -dyLow : dyHigh)]);
  }

  function svgPath(p, sx = 1, sy = 1, ox = 0, oy = 0) {
    return 'M' + p.map(([x, y]) => (ox + x * sx).toFixed(2) + ' ' + (oy + y * sy).toFixed(2)).join('L') + 'Z';
  }

  return { area, ccw, bbox, translate, rotate, rot180, mirrorX, normalize, centroid, simplify, dist, distPointSeg,
    segsIntersect, pointInPoly, polyDistance, clipY, segmentsToLoops, segmentsToFaces, hull, minAreaRectAngle, grow, svgPath };
})();
