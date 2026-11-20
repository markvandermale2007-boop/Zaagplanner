// Opstelling: de ingelezen trappen (3D uit de DXF) in één woning zetten – per trap een plaats, draaiing en vloerhoogte,
// zodat bv. de verdiepingstrap en de zoldertrap boven elkaar staan – met vloeren (trapgat), wanden en balustrades.
// Data per project: p.opstelling = { trappen{stairId:{x,y,z,rot}}, vloeren[{id,naam,z,gat{x,y,bx,by,punten?}|null}],
//   wanden[{id,vloer,a:[x,y],b:[x,y],h,hb,za,zb,d,zijde,kleur}] (zijde: zie wandVorm), balustrades[{id,vloer,punten[],spijl,tussen,onderslof}], wandKleur }.
// Plattegrond (raster) in mm met y omlaag, zoals de stap Verdiepingen van de configurator; 3D: X = x, Y = −y, Z = hoogte.
ZP.ops = (function () {
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);
  const ROT = [0, 90, 180, 270];
  const rotXY = (x, y, r) => (r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
  const metMesh = (p, sid) => p.parts.filter(x => x.mesh && x.mesh.length && x.include !== false && x.stair === sid);
  const trappenMetMesh = (p) => p.stairs.filter(s => metMesh(p, s.id).length);

  // omhullende van een trap na draaien (eigen DXF-coördinaten)
  function box(parts, rot) {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const p of parts) for (let i = 0; i < p.mesh.length; i += 3) {
      const [x, y] = rotXY(p.mesh[i], p.mesh[i + 1], rot), z = p.mesh[i + 2];
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z;
    }
    return b;
  }
  // vloerpeilen uit de treden (zoals StairDesigner): onderste vloer = eerste trede − één optrede, bovenste vloer = bovenkant
  // van de hoogste trede (de weltrede ligt op vloerhoogte, bv. Trede #12 op 2785 mm)
  function peilen(parts) {
    const tops = parts.filter(x => x.type === 'trede').map(x => { let t = -Infinity; for (let i = 2; i < x.mesh.length; i += 3) t = Math.max(t, x.mesh[i]); return t; }).sort((a, b) => a - b);
    const b = box(parts, 0);
    if (tops.length < 2) return { onder: b.z0, boven: b.z1 };
    const opt = (tops[tops.length - 1] - tops[0]) / (tops.length - 1);
    return { onder: tops[0] - opt, boven: tops[tops.length - 1] };
  }
  const hoogte = (parts) => { const pz = peilen(parts); return Math.round(pz.boven - pz.onder) || 2700; };
  // van eigen DXF-coördinaten naar raster (mm, y omlaag) en 3D, voor trap s op plaats t {x, y, z, rot}
  function trafo(parts, t) {
    const b = box(parts, t.rot || 0), z0 = peilen(parts).onder;
    return {
      b, w: b.x1 - b.x0, d: b.y1 - b.y0,
      raster: (x, y) => { const [rx, ry] = rotXY(x, y, t.rot || 0); return [rx - b.x0 + t.x, b.y1 - ry + t.y]; },
      p3: (x, y, z) => { const [rx, ry] = rotXY(x, y, t.rot || 0); return [rx - b.x0 + t.x, -(b.y1 - ry + t.y), z - z0 + (t.z || 0)]; },
    };
  }
  const naar3d = (pt, z) => [pt[0], -pt[1], z || 0];
  // voetafdruk van een onderdeel in het raster (convex omhulsel van de mesh-punten)
  function hull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function voetafdruk(p, sid, t) {
    const parts = metMesh(p, sid), T = trafo(parts, t);
    return parts.filter(x => x.type === 'trede' || x.type === 'bordes').map(x => { const pts = []; for (let i = 0; i < x.mesh.length; i += 3) pts.push(T.raster(x.mesh[i], x.mesh[i + 1])); return hull(pts); });
  }
  // ---------- wanden: de getekende lijn a→b is één vlak van de wand; w.zijde = aan welke kant de wand ligt ----------
  // +1 = links van a→b in het raster (normaal [−uy, ux]), −1 = rechts, 0 = midden op de lijn (oud). Langs een trap ligt de lijn
  // tegen het buitenvlak van de trap-/keepboom en de wand aan de buitenkant: een wand staat altijd tegen de boom, nooit erin.
  const wandRicht = (w) => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); return L < 1 ? null : { L, ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L }; };
  const wandZ = (w) => { const za = +w.za || 0, zb = w.zb == null ? za : +w.zb || 0, h = +w.h || 2600, hb = w.hb == null ? h : +w.hb || h; return { za, zb, h, hb }; };
  // punten (raster) van de houten trapdelen; leuning en balusters niet (een muurleuning zit juist tegen de wand)
  function trapRaster(p, sid, t, cache) {
    if (cache && cache.has(sid)) return cache.get(sid);
    const all = metMesh(p, sid), T = all.length ? trafo(all, t) : null, pts = [];
    if (T) for (const x of all) if (x.type !== 'leuning' && x.type !== 'baluster') for (let i = 0; i < x.mesh.length; i += 3) pts.push(T.raster(x.mesh[i], x.mesh[i + 1]));
    const r = T ? pts : null; if (cache) cache.set(sid, r); return r;
  }
  // wand w tegen de trap leggen als hij erlangs loopt (binnen 300 mm van het buitenvlak, of erin): lijn verschuiven naar het
  // buitenvlak, zijde = weg van de trap. Geeft de zijde (±1), 0 = geen trap langs deze wand, null = mesh ontbreekt (later opnieuw).
  function wandLangsTrap(p, w, cache) {
    const o = p.opstelling, R = wandRicht(w); if (!o || !R) return 0;
    const vl = o.vloeren.find(v => v.id === w.vloer) || { z: 0 }, Z = wandZ(w);
    const z0 = vl.z + Math.min(Z.za, Z.zb), z1 = vl.z + Math.max(Z.za + Z.h, Z.zb + Z.hb);
    let n = 0, som = 0, mx = -Infinity, mn = Infinity, mist = false;
    for (const [sid, t] of Object.entries(o.trappen || {})) {
      if (!(p.stairs || []).some(s => s.id === sid)) continue;
      const tz = t.z || 0; if (Math.min(z1, tz + (t.h || 0)) - Math.max(z0, tz) < 100) continue;   // trap en wand niet op dezelfde hoogte
      const pts = trapRaster(p, sid, t, cache); if (!pts) { mist = true; continue; }
      for (const q of pts) {
        const ex = q[0] - w.a[0], ey = q[1] - w.a[1], a = ex * R.ux + ey * R.uy, s = ex * R.nx + ey * R.ny;
        if (a < -50 || a > R.L + 50 || Math.abs(s) > 600) continue;
        n++; som += s; if (s > mx) mx = s; if (s < mn) mn = s;
      }
    }
    if (!n) { if (mist) return null; if (w.zijde === undefined) w.zijde = 0; return 0; }
    const zijde = som / n < 0 ? 1 : -1, schuif = zijde > 0 ? mx : mn;   // buitenvlak van de trap aan de kant van de wand
    if (Math.abs(schuif) > 300) { if (w.zijde === undefined) w.zijde = 0; return 0; }
    const sx = R.nx * schuif, sy = R.ny * schuif, oudA = w.a, oudB = w.b;
    w.a = [Math.round(w.a[0] + sx), Math.round(w.a[1] + sy)]; w.b = [Math.round(w.b[0] + sx), Math.round(w.b[1] + sy)]; w.zijde = zijde;
    // aansluitende wanden (eindpunt op het oude begin/eind) gaan mee: hun eindpunt naar het snijpunt met de verschoven lijn
    for (const x of o.wanden || []) if (x !== w && x.vloer === w.vloer) for (const k of ['a', 'b']) {
      const oud = [oudA, oudB].find(q => Math.hypot(q[0] - x[k][0], q[1] - x[k][1]) < 2); if (!oud) continue;
      const Q = wandRicht(x), nieuw = oud === oudA ? w.a : w.b;
      const kr = Q ? R.ux * Q.uy - R.uy * Q.ux : 0;
      if (Math.abs(kr) < 0.34) { x[k] = nieuw.slice(); continue; }
      // snijpunt van de lijn van x met de verschoven lijn van w
      const ex = w.a[0] - x.a[0], ey = w.a[1] - x.a[1], r = (ex * R.uy - ey * R.ux) / (Q.ux * R.uy - Q.uy * R.ux);
      x[k] = [Math.round(x.a[0] + Q.ux * r), Math.round(x.a[1] + Q.uy * r)];
    }
    return zijde;
  }
  // grondvorm van een wand in het raster: [begin binnen, eind binnen, eind buiten, begin buiten]; bij een hoek met een andere wand
  // (eindpunten binnen 150 mm) lopen beide randen door tot de verste rand van die wand, zodat de hoek dicht is
  function wandVorm(o, w) {
    const R = wandRicht(w); if (!R) return null;
    const rand = (x) => { const d = +x.d || 100, z = +x.zijde || 0, s0 = z > 0 ? 0 : z < 0 ? -d : -d / 2; return [s0, s0 + d]; };
    const [s0, s1] = rand(w), d = +w.d || 100;
    const buur = (P) => (o.wanden || []).find(x => x !== w && x.vloer === w.vloer && wandRicht(x) && (Math.hypot(x.a[0] - P[0], x.a[1] - P[1]) < 150 || Math.hypot(x.b[0] - P[0], x.b[1] - P[1]) < 150));
    const cr = (a0, a1, b0, b1) => a0 * b1 - a1 * b0;
    const eind = (P, t0, groot) => {
      const x = buur(P); if (!x) return [t0, t0];
      const Q = wandRicht(x), k = cr(R.ux, R.uy, Q.ux, Q.uy); if (Math.abs(k) < 0.34) return [t0, t0];   // (bijna) in elkaars verlengde
      const [r0, r1] = rand(x);
      return [s0, s1].map(s => {
        const ts = [r0, r1].map(r => { const bx = x.a[0] + Q.nx * r - (w.a[0] + R.nx * s), by = x.a[1] + Q.ny * r - (w.a[1] + R.ny * s); return cr(bx, by, Q.ux, Q.uy) / k; });
        const t = groot ? Math.max(...ts) : Math.min(...ts); return Math.abs(t - t0) <= 2 * (d + (+x.d || 100)) ? t : t0;
      });
    };
    const ta = eind(w.a, 0, false), tb = eind(w.b, R.L, true), pt = (t, s) => [w.a[0] + R.ux * t + R.nx * s, w.a[1] + R.uy * t + R.ny * s];
    return { vlak: [pt(ta[0], s0), pt(tb[0], s0), pt(tb[1], s1), pt(ta[1], s1)], R, midden: (s0 + s1) / 2 };
  }
  const VLOERNAMEN = ['Begane grond', '1e verdieping', '2e verdieping', 'Zolder', '4e verdieping'];
  // standaard: trappen boven elkaar op dezelfde plaats; per trap bovenaan een vloer met een trapgat ter grootte van de trap
  function ensure(p) {
    const o = p.opstelling = p.opstelling || {};
    o.trappen = o.trappen || {}; o.vloeren = o.vloeren || []; o.wanden = o.wanden || []; o.balustrades = o.balustrades || []; o.wandKleur = o.wandKleur || '#ece6dc';
    if (!o.vloeren.some(v => v.z === 0)) o.vloeren.push({ id: uid('vl'), naam: 'Begane grond', z: 0, gat: null });
    let z = 0;
    for (const s of trappenMetMesh(p)) {
      const parts = metMesh(p, s.id), H = hoogte(parts);
      if (!o.trappen[s.id]) o.trappen[s.id] = { x: 1000, y: 1000, z, rot: 0 };
      const t = o.trappen[s.id]; t.h = H; z = Math.max(z, (t.z || 0) + H);
      if (!o.vloeren.some(v => v.trap === s.id)) {
        const T = trafo(parts, t), n = o.vloeren.length, daar = o.vloeren.find(v => !v.trap && Math.abs(v.z - ((t.z || 0) + H)) < 5);
        // al een vloer op dat peil (bv. de begane grond boven een keldertrap): die krijgt het trapgat, geen tweede vloer
        if (daar) { daar.trap = s.id; if (!daar.gat) daar.gat = { x: Math.round(t.x), y: Math.round(t.y), bx: Math.round(T.w), by: Math.round(T.d) }; continue; }
        o.vloeren.push({ id: uid('vl'), naam: VLOERNAMEN[n] || n + 'e verdieping', z: (t.z || 0) + H, trap: s.id, gat: { x: Math.round(t.x), y: Math.round(t.y), bx: Math.round(T.w), by: Math.round(T.d) } });
      }
    }
    o.vloeren.sort((a, b) => a.z - b.z);
    // oudere wanden (midden op de lijn, zonder zijde): één keer tegen de trap leggen zodra de meshes er zijn
    if (o.wanden.some(w => w.zijde === undefined)) { const c = new Map(); for (const w of o.wanden) if (w.zijde === undefined) wandLangsTrap(p, w, c); }
    return o;
  }
  // keldervloer: één vloer onder de begane grond (negatief peil); de trap naar de kelder komt uit in de begane grond (daar het trapgat)
  const kelder = (o) => o.vloeren.find(v => v.z < 0);
  function kelderErbij(p) {
    const o = ensure(p); let k = kelder(o); if (k) return k;
    const hs = Object.values(o.trappen).map(t => +t.h || 0).filter(Boolean);
    k = { id: uid('vl'), naam: 'Kelder', z: -(hs.length ? Math.min(...hs) : 2600), kelder: true, gat: null };
    o.vloeren.push(k); o.vloeren.sort((a, b) => a.z - b.z); return k;
  }
  // trap sid laten beginnen op peil z; de vloer waar hij bovenaan uitkomt gaat mee (geen dubbele vloer op hetzelfde peil):
  // ligt er al een vloer op het nieuwe peil, dan krijgt die het trapgat (en de wanden/balustrades van de oude aankomstvloer)
  function trapNaarPeil(p, sid, z) {
    const o = ensure(p), t = o.trappen[sid]; if (!t) return;
    t.z = Math.round(z); const top = t.z + (t.h || 0), oud = o.vloeren.find(v => v.trap === sid);
    const daar = o.vloeren.find(v => v !== oud && Math.abs(v.z - top) < 5);
    if (oud && !daar && oud.z !== 0 && !oud.kelder) { oud.z = top; if (oud.gat) gatVolgensTrap(p, oud); }
    else {
      const nr = o.vloeren.filter(v => v.z > 0 && v.z < top).length + 1;
      const doel = daar || { id: uid('vl'), naam: top < 0 ? 'Kelder' : VLOERNAMEN[nr] || nr + 'e verdieping', z: top, gat: null };
      if (!daar) o.vloeren.push(doel);
      if (oud) {
        delete oud.trap;
        const leeg = !o.wanden.concat(o.balustrades).some(x => x.vloer === oud.id);
        // een lege verdieping die alleen voor deze trap bestond gaat weg; anders (of de begane grond) blijft hij, zonder trapgat
        // als er geen andere trap meer uitkomt
        if (leeg && oud.z !== 0 && !oud.kelder) o.vloeren = o.vloeren.filter(v => v !== oud);
        else if (!Object.keys(o.trappen).some(id => id !== sid && Math.abs((o.trappen[id].z || 0) + (o.trappen[id].h || 0) - oud.z) < 5)) oud.gat = null;
      }
      doel.trap = sid; if (!doel.gat) gatVolgensTrap(p, doel);
    }
    o.vloeren.sort((a, b) => a.z - b.z);
  }
  // kelder weghalen: trappen die in de kelder begonnen gaan terug naar de begane grond
  function kelderWeg(p) {
    const o = ensure(p), k = kelder(o); if (!k) return;
    for (const id of Object.keys(o.trappen)) if (Math.abs((o.trappen[id].z || 0) - k.z) < 5) trapNaarPeil(p, id, 0);
    o.vloeren = o.vloeren.filter(v => v !== k); o.wanden = o.wanden.filter(w => w.vloer !== k.id); o.balustrades = o.balustrades.filter(b => b.vloer !== k.id);
  }
  const gatHoeken = (g) => (!g ? [] : g.punten && g.punten.length >= 3 ? g.punten.map(q => q.slice()) : [[g.x, g.y], [g.x + g.bx, g.y], [g.x + g.bx, g.y + g.by], [g.x, g.y + g.by]]);
  const lengte = (pts) => pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
  // trapgat opnieuw volgens de trap die op deze vloer uitkomt (zijn voetafdruk)
  function gatVolgensTrap(p, vl) {
    const o = ensure(p), sid = vl.trap || Object.keys(o.trappen).find(id => Math.abs((o.trappen[id].z || 0) + (o.trappen[id].h || 0) - vl.z) < 5); if (!sid) return;
    const t = o.trappen[sid], T = trafo(metMesh(p, sid), t);
    vl.gat = { x: Math.round(t.x), y: Math.round(t.y), bx: Math.round(T.w), by: Math.round(T.d) };
  }
  // balustrades uit de opstelling in de begroting (meters per balustrade, plaats verdieping)
  function naarBegroting(p, C) {
    const B = p.begroting = p.begroting || {}; B.bal = (B.bal || []).filter(b => !b.ops);
    for (const b of ensure(p).balustrades) {
      const m = Math.round(lengte(b.punten) / 10) / 100; if (!m) continue;
      const vl = p.opstelling.vloeren.find(v => v.id === b.vloer), g = { spijl: b.spijl, tussen: +b.tussen || 100, onderslof: !!b.onderslof };
      const t = (C.balustrades || []).find(x => x.spijl === g.spijl && (+x.tussen || 100) === g.tussen && !!x.onderslof === g.onderslof);
      B.bal.push(Object.assign({ id: 'bb' + b.id, type: t ? t.id : '', m, plaats: 'verdieping', vloer: vl ? vl.naam : '', ops: b.id }, g));
    }
  }
  // ---------- trappen die bij elkaar horen: boven elkaar (stair.boven = id van de trap eronder; '' = los) ----------
  // Oudere projecten met de opstelling aan en nog geen koppeling: één keer afleiden uit de hoogtes in de opstelling.
  function groepen(p) {
    const st = p.stairs || []; if (st.length < 2) return [st.slice()];
    const o = p.opstelling;
    if (o && o.aan && o.trappen && st.every(s => s.boven === undefined)) for (const s of st) {
      const t = o.trappen[s.id], on = t && (t.z || 0) > 5 ? st.find(x => x !== s && o.trappen[x.id] && Math.abs((o.trappen[x.id].z || 0) + (o.trappen[x.id].h || 0) - t.z) < 60) : null;
      s.boven = on ? on.id : '';
    }
    const onder = (s) => (s.boven ? st.find(x => x.id === s.boven && x !== s) : null);
    const pad = (s) => { const l = [s]; for (let x = onder(s), n = 0; x && n < 20 && !l.includes(x); x = onder(x), n++) l.push(x); return l; };   // s, de trap eronder, …
    const m = new Map();
    for (const s of st) { const w = pad(s).pop(); if (!m.has(w.id)) m.set(w.id, []); m.get(w.id).push(s); }
    return [...m.values()].map(g => g.sort((a, b) => pad(a).length - pad(b).length));   // van onder naar boven
  }
  // plaats en hoogte van gekoppelde trappen zonder de opstelling: boven elkaar, zelfde hoek; groepen naast elkaar
  function stapel(p) {
    const st = trappenMetMesh(p); if (!st.some(s => s.boven && st.some(x => x.id === s.boven && x !== s))) return null;
    const tr = {}; let x = 0;
    for (const g of groepen(Object.assign({}, p, { stairs: st }))) {
      let z = 0, w = 0;
      for (const s of g) { const parts = metMesh(p, s.id); tr[s.id] = { x, y: 0, z, rot: 0 }; z += hoogte(parts); w = Math.max(w, trafo(parts, { x: 0, y: 0, rot: 0 }).w); }
      x += w + 1200;
    }
    return { trappen: tr };
  }

  return { wandLangsTrap, wandVorm, wandZ, groepen, stapel, ROT, rotXY, metMesh, trappenMetMesh, box, peilen, hoogte, trafo, naar3d, hull, voetafdruk, ensure, gatHoeken, gatVolgensTrap, lengte, naarBegroting, uid, kelder, kelderErbij, kelderWeg, trapNaarPeil };
})();
