// 3D van een trap uit de configurator, nog zonder tekening: opgebouwd uit het model (StairDesigner Model 1–10), de
// verdiepingshoogte en het geschatte aantal treden, met per kant de boom (trap-/keep-/muurboom), leuning, balustrade,
// spillen, en de getekende balustrades op de verdieping. Een schets, niet op maat. Assen: x/y = plattegrond (mm), z = hoogte.
ZP.cf3d = (function () {
  // draai: W = draai van 90° met verdreven treden, L = bordes met draai
  const DRAAI = { m2: 'W', m3: 'W', m4: 'W', m5: 'W', m6: 'W', m7: 'L', m8: 'L', m9: 'L', m10: 'L' };
  const add = (a, b, f = 1) => [a[0] + b[0] * f, a[1] + b[1] * f];
  // loop-opbouw uit de maten: recht = [S]; L = [S, draai, S]; U = [S, draai, S(kop), draai, S]; S = lengte van het rechte stuk
  function lopen(v, B) {
    const m = v.maten || {}, CF = ZP.config, d = DRAAI[v.model] || 'W', vorm = CF.vormVan(v);
    if (vorm === 'recht') return [['S', Math.max(300, +m.lengte || 3000)]];
    if (vorm === 'L') return [['S', Math.max(0, (+m.a || 2600) - B)], [d], ['S', Math.max(0, (+m.b || 2400) - B)]];
    return [['S', Math.max(0, (+m.a || 2200) - B)], [d], ['S', Math.max(0, (+m.kop || 2000) - 2 * B)], [d], ['S', Math.max(0, (+m.c || 2200) - B)]];
  }

  // ---------- geometrie (zonder three.js, ook te testen) ----------
  // treden: [{poly (plattegrond), z (bovenkant)}]; kanten.links/rechts: punten langs de rand met de hoogte van de neus;
  // hoeken: binnenhoeken van draaien/bordessen (hoekspil); H = vloerhoogte; eind = looprichting bovenaan
  function opbouw(v) {
    const sch = ZP.config.schatting(v), o = sch.optrede, rechtsom = v.richting !== 'links';
    const B = Math.max(500, +((v.maten || {}).breedte) || 850);
    const plan = lopen(v, B);
    const nWind = plan.filter(s => s[0] === 'W').length * 3, nBordes = plan.filter(s => s[0] === 'L').length;
    const sLen = plan.map(s => (s[0] === 'S' ? s[1] : 0)), totS = sLen.reduce((x, y) => x + y, 0) || 1;
    const nRecht = Math.max(1, (sch.n - 1) - nWind - nBordes);   // bovenste optrede = de vloer
    // treden over de rechte stukken verdelen naar lengte (grootste rest); een stuk ≥ 150 mm krijgt minstens één trede
    const exact = sLen.map(l => (l >= 150 ? l / totS * nRecht : 0)), delen = exact.map(x => (x ? Math.max(1, Math.floor(x)) : 0));
    for (let rest = nRecht - delen.reduce((x, y) => x + y, 0), guard = 0; rest !== 0 && guard < 50; guard++) {
      const kand = exact.map((x, i) => [x ? x - delen[i] : -Infinity, i]).sort((p, q) => (rest > 0 ? q[0] - p[0] : p[0] - q[0]));
      const i = kand.find(([d, j]) => exact[j] && (rest > 0 || delen[j] > 1)); if (!i) break; delen[i[1]] += rest > 0 ? 1 : -1; rest += rest > 0 ? -1 : 1;
    }
    let c = [0, 0], h = [0, 1], z = 0;
    const r = () => [h[1], -h[0]];                 // rechts van de looprichting
    const treden = [], kanten = { links: [], rechts: [] }, hoeken = [];
    // looplijn (zoals StairDesigner): rechte trap in het midden; met een draai op vaste afstand van de binnenkant (de draaikant),
    // als boog rond de binnenhoek. Op die boog zijn de verdreven treden even breed.
    const heeftDraai = plan.some(s => s[0] !== 'S'), sD = rechtsom ? 1 : -1;
    const rL = heeftDraai ? Math.min(B / 2, Math.max(250, +((v.maten || {}).looplijn) || 400)) : B / 2;
    const looplijn = [], lp = () => add(c, r(), sD * (B / 2 - rL));
    looplijn.push(lp());
    const kant = (p, q) => { kanten.links.push({ p, z: z }); kanten.rechts.push({ p: q, z: z }); };
    kant(add(c, r(), -B / 2), add(c, r(), B / 2));
    const aantreden = [];
    plan.forEach(([soort], si) => {
      if (soort === 'S') {
        // aantrede uit de maat van dit rechte stuk; een stuk zonder treden (te kort) wordt overbrugd
        const a = delen[si] ? sLen[si] / delen[si] : 0; if (a) aantreden.push(a);
        if (!delen[si] && sLen[si] > 0) { c = add(c, h, sLen[si]); kant(add(c, r(), -B / 2), add(c, r(), B / 2)); }
        for (let i = 0; i < delen[si]; i++) {
          z += o; const L = add(c, r(), -B / 2), R = add(c, r(), B / 2);
          treden.push({ poly: [L, R, add(R, h, a), add(L, h, a)], z });
          c = add(c, h, a); kant(add(c, r(), -B / 2), add(c, r(), B / 2));
        }
        return;
      }
      // draai (rechtsom = naar rechts): binnenhoek P aan de draaikant, buitenrand = andere zijkant + voorkant van het vak
      const s = rechtsom ? 1 : -1, rr = r(), P = add(c, rr, s * B / 2), buiten0 = add(c, rr, -s * B / 2), hoekB = add(buiten0, h, B), hoekV = add(P, h, B);
      hoeken.push({ p: P, z: z });
      // looplijn: boog van 90° rond de binnenhoek P met straal rL
      { const uit0 = [-s * rr[0], -s * rr[1]]; looplijn.push(lp()); for (let i = 1; i <= 12; i++) { const t = i / 12 * Math.PI / 2; looplijn.push(add(P, add([uit0[0] * Math.cos(t), uit0[1] * Math.cos(t)], h, Math.sin(t)), rL)); } }
      if (soort === 'W') {
        // drie verdreven treden: stralen vanuit P onder 0°, 30°, 60°, 90°
        const uit = [-s * rr[0], -s * rr[1]];          // van P naar de buitenkant
        const op = (t) => { const d = add([uit[0] * Math.cos(t), uit[1] * Math.cos(t)], h, Math.sin(t)); const tt = Math.cos(t) >= Math.sin(t) ? B / Math.cos(t) : B / Math.sin(t); return add(P, d, tt); };
        for (let k = 0; k < 3; k++) {
          z += o; const t0 = k * Math.PI / 6, t1 = (k + 1) * Math.PI / 6, q0 = op(t0), q1 = op(t1);
          const poly = [P, q0]; if (t0 < Math.PI / 4 && t1 > Math.PI / 4) poly.push(hoekB); poly.push(q1);
          treden.push({ poly, z });
          const L = rechtsom ? q1 : P, R = rechtsom ? P : q1; kanten.links.push({ p: L, z }); kanten.rechts.push({ p: R, z });
        }
      } else {
        // bordes: één vlak W × W op de hoogte van één trede
        z += o; treden.push({ poly: [buiten0, P, hoekV, hoekB], z, bordes: true });
        const L = rechtsom ? hoekB : P, R = rechtsom ? P : hoekB; kanten.links.push({ p: L, z }); kanten.rechts.push({ p: R, z });
      }
      // verder in de nieuwe richting vanaf het midden van de uitgang
      c = add(P, h, B / 2); h = rechtsom ? rr : [-rr[0], -rr[1]];
      kant(add(c, r(), -B / 2), add(c, r(), B / 2));
    });
    looplijn.push(lp());
    const xs = treden.flatMap(t => t.poly.map(p => p[0])), ys = treden.flatMap(t => t.poly.map(p => p[1]));
    const bbox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    return { treden, kanten, hoeken, H: sch.H, n: sch.n, optrede: o, bbox, eind: h, breedte: B, aantrede: aantreden.length ? aantreden.reduce((x, y) => x + y, 0) / aantreden.length : 0, aantreden,
      looplijn, looplijnAfstand: rL };
  }

  // ---------- three.js ----------
  let V = null;
  async function mount(el, v, C) {
    await ZP.view3d.load(); const THREE = window.THREE;
    const sig = JSON.stringify([v, C.tarief && 1]);
    if (!V || V.sig !== sig) { const cam = V && { p: V.camera.position.clone(), t: V.controls.target.clone() }; dispose(); V = build(THREE, v, C, sig); if (cam) { V.camera.position.copy(cam.p); V.controls.target.copy(cam.t); } }
    if (V.renderer.domElement.parentNode !== el) el.appendChild(V.renderer.domElement);
    resize(); return V;
  }
  function build(THREE, v, C, sig) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4efe6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const camera = new THREE.PerspectiveCamera(35, 1, 10, 100000); camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-1, -2, 3); scene.add(sun);
    const { group } = bouwModel(THREE, v, C); scene.add(group);
    return opzet(THREE, scene, renderer, camera, group, sig);
  }
  // de trap (met vloeren, muren en balustrades) als THREE.Group; ook voor de tekening op de specificatiestaat (ZP.spec3d).
  // userData.zp op het materiaal: {hout, afw} = houtsoort en afwerking, {omg} = vloer/muur, {metaal}; maten = balustradestukken
  function bouwModel(THREE, v, C) {
    const ob = opbouw(v), CF = ZP.config, DW = ZP.drawings, maten = [];
    const afwN = (id) => (C.afwerkingen.find(x => x.id === id) || {}).naam || '';
    const kleur = (hout, afw) => { const c = new THREE.Color(DW.woodColor(CF.houtNaam(hout), afw).f); c.zp = { hout: CF.houtNaam(hout), afw }; return c; };
    const mat = (col, opts) => { const m = new THREE.MeshLambertMaterial(Object.assign({ color: col, side: THREE.DoubleSide }, opts || {})); m.userData.zp = col && col.zp ? col.zp : col === 0xb8bec4 ? { metaal: true } : { omg: true }; return m; };
    const edge = (mesh) => { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: 0x5b3f24, transparent: true, opacity: 0.45 }))); return mesh; };
    const group = new THREE.Group();
    // plat vlak (polygoon) met dikte, bovenkant op z
    const plaat = (poly, z, dikte, m) => { const sh = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth: dikte, bevelEnabled: false }); const me = new THREE.Mesh(g, m); me.position.z = z - dikte; return edge(me); };
    // balk van A naar B (3D punten) met doorsnede w × d
    const balk = (A, Bp, w, d, m) => { const a = new THREE.Vector3(...A), b = new THREE.Vector3(...Bp), len = a.distanceTo(b); if (len < 1) return null;
      const me = new THREE.Mesh(new THREE.BoxGeometry(w, d, len), m); me.position.copy(a.clone().add(b).multiplyScalar(0.5)); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize()); return edge(me); };
    const cil = (A, Bp, r, m) => { const a = new THREE.Vector3(...A), b = new THREE.Vector3(...Bp), len = a.distanceTo(b); if (len < 1) return null;
      const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m); me.position.copy(a.clone().add(b).multiplyScalar(0.5)); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return me; };
    // verticaal vlak tussen twee punten in de plattegrond, onderkant/bovenkant per punt (boom, stootbord, muur)
    const wand = (P, Q, a0, a1, b0, b1, m) => { const g = new THREE.BufferGeometry(), vtx = [P[0], P[1], a1, Q[0], Q[1], b1, Q[0], Q[1], b0, P[0], P[1], a0];
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(j => vtx.slice(j * 3, j * 3 + 3)), 3)); g.computeVertexNormals(); return new THREE.Mesh(g, m); };
    // vloer onder en de verdiepingsvloer rondom het trapgat
    const bb = ob.bbox, m = 900;
    group.add(plaat([[bb.x0 - m, bb.y0 - m - 1200], [bb.x1 + m, bb.y0 - m - 1200], [bb.x1 + m, bb.y1 + m], [bb.x0 - m, bb.y1 + m]], 0, 20, mat(0xd9d2c5)));
    const vloer = mat(0xe8e2d6, { transparent: true, opacity: 0.4, depthWrite: false });
    // een vloer met trapgat op de verdiepingshoogte, en op elke andere vloer met een getekende balustrade (bv. zolder)
    // raster van de stap Verdiepingen (mm, y omlaag, trap linksboven op b.trap) → plattegrond hier (trap linksboven = bb.x0, bb.y1)
    const naar3d = (b) => { const tp = CF.trapPos(b); return (pt) => [bb.x0 + (pt[0] - tp.x), bb.y1 - (pt[1] - tp.y)]; };
    // vloer met een gat (polygoon): THREE.Shape met hole
    const vloerMetGat = (gat, zv) => {
      const xs = gat.map(p => p[0]).concat([bb.x0, bb.x1]), ys = gat.map(p => p[1]).concat([bb.y0, bb.y1]);
      const o = [[Math.min(...xs) - m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.max(...ys) + m], [Math.min(...xs) - m, Math.max(...ys) + m]];
      const sh = new THREE.Shape(o.map(p => new THREE.Vector2(p[0], p[1]))); sh.holes.push(new THREE.Path(gat.map(p => new THREE.Vector2(p[0], p[1]))));
      const me = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 200, bevelEnabled: false }), vloer); me.position.z = zv - 200; group.add(edge(me));
    };
    // per getekende vloer het eigen trapgat; anders een gat ter grootte van de trap
    const metGat = (v.vloerBal || []).filter(b => b.trapgat && (b.punten.length > 1 || b.trap || CF.tgEigen(b.trapgat)));
    const peilen = new Set();
    // keldertrap (een vloer op peil ≤ 0, bv. de begane grond): de trap begint in de kelder, peil 0 = bovenkant van de trap
    const heeft = (b) => b.hoogte !== '' && b.hoogte != null && isFinite(+b.hoogte);
    const off = (v.vloerBal || []).some(b => heeft(b) && +b.hoogte <= 0) ? ob.H : 0, zVan = (b) => (heeft(b) ? +b.hoogte : ob.H) + off;
    for (const b of metGat) { const z0 = zVan(b); if (peilen.has(z0)) continue; peilen.add(z0); vloerMetGat(CF.tgHoeken(b.trapgat).map(naar3d(b)), z0); }
    if (!peilen.has(ob.H)) vloerMetGat([[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]], ob.H);
    // treden (en stootborden bij een dichte trap)
    const mT = mat(kleur(v.houtTrede, afwN(v.afwTreden)));
    const mStoot = mat(kleur(CF.houtVan(v, 'stootbord'), afwN(CF.afwVan(v, 'stootbord'))));
    for (const t of ob.treden) {
      group.add(plaat(t.poly, t.z, 40, mT));
      // stootbord onder de voorkant van de trede (eerste rand van de polygoon)
      if (!v.open) group.add(edge(wand(t.poly[0], t.poly[1], t.z - ob.optrede, t.z - 40, t.z - ob.optrede, t.z - 40, mStoot)));
    }
    // per kant: boom, muur, leuning, balustrade
    const SIDE = { links: 'Links', rechts: 'Rechts' };
    for (const k of ['links', 'rechts']) {
      const e = CF.kant(v, k), pts = ob.kanten[k].filter((q, i, l) => !i || Math.hypot(q.p[0] - l[i - 1].p[0], q.p[1] - l[i - 1].p[1]) > 1 || q.z !== l[i - 1].z);
      const mB = mat(kleur(e.hout, afwN(CF.afwVan(v, e.soort))));
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], Bq = pts[i]; if (Math.hypot(Bq.p[0] - A.p[0], Bq.p[1] - A.p[1]) < 5) continue;
        // boom als plaat langs de rand: trapboom/muurboom met de treden erin, keepboom eronder
        if (e.boom !== 'geen') { const top = e.boom === 'keepboom' ? -45 : 60, hgt = 260; group.add(edge(wand(A.p, Bq.p, A.z + top - hgt, A.z + top, Bq.z + top - hgt, Bq.z + top, mB))); }
        // muur langs deze kant (licht, half doorzichtig)
        if (e.leuning === 'muur' || e.boom === 'muurboom') group.add(wand(A.p, Bq.p, 0, A.z + 1800, 0, Bq.z + 1800, mat(0xece7df, { transparent: true, opacity: 0.35, depthWrite: false })));
      }
      // leuning op 900 mm boven de neus; bij vrij: spijlen eronder
      if (e.leuning !== 'geen' && pts.length > 1) {
        const mL = mat(kleur(e.lh, afwN(CF.afwVan(v, 'leuning')))), sp = C.spijltypes.find(x => x.id === e.spijl) || { breedte: 40, naam: '' };
        const mS = /rvs|staal/i.test(sp.naam) ? mat(0xb8bec4) : mat(kleur(CF.houtVan(v, 'baluster'), afwN(CF.afwVan(v, 'baluster'))));
        for (let i = 1; i < pts.length; i++) {
          const A = pts[i - 1], Bq = pts[i]; const L = Math.hypot(Bq.p[0] - A.p[0], Bq.p[1] - A.p[1]); if (L < 5) continue;
          const c = cil([A.p[0], A.p[1], A.z + 900], [Bq.p[0], Bq.p[1], Bq.z + 900], 28, mL); if (c) group.add(c);
          if (e.leuning === 'vrij') {
            const stap = (+sp.breedte || 40) + (+v.bal.tussen || 100), w = Math.max(14, +sp.breedte || 40);
            for (let d = stap / 2; d < L; d += stap) { const f = d / L, x = A.p[0] + (Bq.p[0] - A.p[0]) * f, y = A.p[1] + (Bq.p[1] - A.p[1]) * f, z0 = A.z + (Bq.z - A.z) * f;
              const s = /rond|rvs/i.test(sp.naam) ? cil([x, y, z0 + (v.bal.onderslof ? 60 : 0)], [x, y, z0 + 875], w / 2, mS) : balk([x, y, z0 + (v.bal.onderslof ? 60 : 0)], [x, y, z0 + 875], w, w, mS); if (s) group.add(s); }
          }
        }
      }
    }
    // spillen: eind (begin en eind van een vrije kant), hoek (binnenhoek van draaien en bordessen)
    const mSp = mat(kleur(CF.houtVan(v, 'spil'), afwN(CF.afwVan(v, 'spil')))), sm = +v.spillen.maat || 90;
    const spil = (p, z0, z1) => { const s = v.spillen.vorm === 'Rond' ? cil([p[0], p[1], z0], [p[0], p[1], z1], sm / 2, mSp) : balk([p[0], p[1], z0], [p[0], p[1], z1], sm, v.spillen.vorm === 'Rechthoekig' ? sm * 0.6 : sm, mSp); if (s) group.add(s); };
    for (const k of CF.vrijeKanten(v)) {
      const pts = ob.kanten[k];
      if (v.spillen.eind && pts.length) { spil(pts[0].p, 0, pts[0].z + 1050); spil(pts[pts.length - 1].p, pts[pts.length - 1].z - 300, pts[pts.length - 1].z + 1050); }
    }
    if (v.spillen.hoek && CF.vrijeKanten(v).length) for (const hk of ob.hoeken) spil(hk.p, Math.max(0, hk.z - 600), hk.z + 1200);
    // balustrades op de verdieping: het trapgat van de tekening valt samen met de omtrek van de trap
    for (const b of v.vloerBal || []) {
      const g = b.trapgat; if (!g || b.punten.length < 2) continue;
      const map = naar3d(b);
      const sp = C.spijltypes.find(x => x.id === b.spijl) || { breedte: 40 }, mS = mat(kleur(CF.houtVan(v, 'baluster'), afwN(CF.afwVan(v, 'baluster')))), mL = mat(kleur(b.leuning.hout, afwN(CF.afwVan(v, 'leuning'))));
      const P = b.punten.map(map), z = zVan(b);
      for (let i = 1; i < P.length; i++) maten.push({ a: [P[i - 1][0], P[i - 1][1], z], b: [P[i][0], P[i][1], z] });
      P.forEach(p => spil(p, z, z + 1050));
      for (let i = 1; i < P.length; i++) {
        const A = P[i - 1], Q = P[i], L = Math.hypot(Q[0] - A[0], Q[1] - A[1]); if (L < 5) continue;
        const c = cil([A[0], A[1], z + 1000], [Q[0], Q[1], z + 1000], 28, mL); if (c) group.add(c);
        if (b.onderslof) group.add(edge(wand(A, Q, z, z + 60, z, z + 60, mS)));
        const stap = (+sp.breedte || 40) + (+b.tussen || 100), w = Math.max(14, +sp.breedte || 40);
        for (let d = stap; d < L - stap / 2; d += stap) { const x = A[0] + (Q[0] - A[0]) * d / L, y = A[1] + (Q[1] - A[1]) * d / L; const s = balk([x, y, z + (b.onderslof ? 60 : 0)], [x, y, z + 975], w, w, mS); if (s) group.add(s); }
      }
    }
    return { group, maten, ob };
  }
  function opzet(THREE, scene, renderer, camera, group, sig) {
    const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const rad = Math.max(size.x, size.y, size.z) || 3000;
    // afstand zo dat de hele opstelling (ook een zolder) in beeld past
    const sph = box.getBoundingSphere(new THREE.Sphere()), dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.82;
    const kijk = (dx, dy, dz) => { const d = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(dist); return [c.x + d.x, c.y + d.y, c.z + d.z]; };
    camera.position.set(...kijk(0.75, -1.05, 0.35)); camera.lookAt(c);
    const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.target.copy(c); controls.enableDamping = true; controls.update();
    const view = { sig, scene, renderer, camera, controls, center: c, radius: rad, kijk, raf: 0 };
    const loop = () => { view.raf = requestAnimationFrame(loop); if (!renderer.domElement.isConnected) return; controls.update(); renderer.render(scene, camera); };
    loop(); window.addEventListener('resize', resize);
    return view;
  }
  function resize() { if (!V) return; const el = V.renderer.domElement.parentNode; if (!el) return; const w = el.clientWidth || 400, h = el.clientHeight || 320; V.renderer.setSize(w, h); V.camera.aspect = w / h; V.camera.updateProjectionMatrix(); }
  function setView(kind) {
    if (!V) return; const c = V.center;
    const pos = { iso: V.kijk(0.75, -1.05, 0.35), top: V.kijk(0, -0.001, 1), front: V.kijk(0, -1, 0.05), side: V.kijk(1, 0, 0.05) }[kind] || null;
    if (pos) { V.camera.position.set(...pos); V.controls.target.copy(c); V.controls.update(); }
  }
  function dispose() { if (!V) return; cancelAnimationFrame(V.raf); V.renderer.dispose(); if (V.renderer.domElement.parentNode) V.renderer.domElement.remove(); V = null; }
  return { opbouw, mount, setView, dispose, bouwModel };
})();
