// 3D-weergave van de trap uit de DXF (driehoeken per onderdeel). three.js wordt pas geladen als de weergave opent.
// Klik = onderdeel selecteren (Shift/Ctrl = meerdere), slepen = draaien, scrollen = zoomen, rechts slepen = schuiven.
ZP.view3d = (function () {
  const COL = { trede: 0xd9a86a, stootbord: 0xe8d6b4, trapboom: 0xb98552, keepboom: 0xa98f62, leuning: 0xcf9d6c, spil: 0xa8754a, baluster: 0xd8c39a, overig: 0xc9b79a };
  let lib = null;
  function load() {
    if (lib) return lib;
    const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('3D-bibliotheek kon niet geladen worden (internet nodig).')); document.head.appendChild(s); });
    lib = add('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
      .then(() => add('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'))
      .catch(e => { lib = null; throw e; });
    return lib;
  }

  // één weergave die tussen het opnieuw opbouwen van het scherm bewaard blijft
  let V = null;
  async function mount(el, project, opts) {
    await load();
    const THREE = window.THREE;
    let ops = project.opstelling && project.opstelling.aan ? project.opstelling : null;
    // geen opstelling, wel gekoppelde trappen (zoldertrap boven verdiepingstrap): boven elkaar tonen, zonder vloeren en wanden
    const stapel = !ops && ZP.ops ? ZP.ops.stapel(project) : null;
    if (stapel) { ops = stapel; opts = Object.assign({}, opts || {}, { zonderOmgeving: true }); }
    const sig = project.id + ':' + project.parts.filter(x => x.mesh).map(x => x.id).join(',') + (ops ? JSON.stringify(ops) + JSON.stringify((opts || {}).kleuren || 0) : '');
    // bij een wijziging in de opstelling opnieuw opbouwen, maar de camera laten staan
    if (!V || V.sig !== sig) { const cam = V && V.ops && ops ? { p: V.camera.position.clone(), t: V.controls.target.clone() } : null; if (V) dispose(); V = build(THREE, project, sig, ops, opts || {}); if (cam) { V.camera.position.copy(cam.p); V.controls.target.copy(cam.t); V.controls.update(); } }
    V.opts = opts;
    if (V.renderer.domElement.parentNode !== el) el.appendChild(V.renderer.domElement);
    resize(); paint(); return V;
  }
  function build(THREE, project, sig, ops, opts) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf7f2ea);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const camera = new THREE.PerspectiveCamera(35, 1, 10, 100000); camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(-1, -2, 3); scene.add(sun);
    const { group, meshes } = bouwModel(THREE, project, ops, opts); scene.add(group);
    const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    return opzet(THREE, scene, renderer, camera, group, meshes, sig, c, size);
  }
  // alleen de onderdelen (en de opstelling) als THREE.Group; ook gebruikt voor de tekening op de specificatiestaat (ZP.spec3d)
  // maten = getekende balustrades [{a:[x,y,z], b:[x,y,z]}] voor de maatvoering op het bovenaanzicht
  function bouwModel(THREE, project, ops, opts) {
    const group = new THREE.Group(), meshes = [], maten = [];
    // zonder opstelling: trappen naast elkaar (elke DXF heeft zijn eigen nulpunt); met opstelling: op hun plaats en hoogte
    let offset = 0;
    for (const st of project.stairs.length ? project.stairs : [{ id: undefined }]) {
      const ps = project.parts.filter(x => x.mesh && (st.id === undefined || x.stair === st.id));
      if (!ps.length) continue;
      let x0 = Infinity, x1 = -Infinity;
      for (const p of ps) for (let i = 0; i < p.mesh.length; i += 3) { x0 = Math.min(x0, p.mesh[i]); x1 = Math.max(x1, p.mesh[i]); }
      const T = ops && ops.trappen[st.id] ? ZP.ops.trafo(ps.filter(x => x.include !== false), ops.trappen[st.id]) : null;
      for (const p of ps) {
        const pos = new Float32Array(p.mesh.length);
        for (let i = 0; i < p.mesh.length; i += 3) {
          if (T) { const q = T.p3(p.mesh[i], p.mesh[i + 1], p.mesh[i + 2]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; }
          else { pos[i] = p.mesh[i] - x0 + offset; pos[i + 1] = p.mesh[i + 1]; pos[i + 2] = p.mesh[i + 2]; }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
        const m = new THREE.MeshLambertMaterial({ color: COL[p.type] || COL.overig, side: THREE.DoubleSide, flatShading: true });
        const mesh = new THREE.Mesh(g, m); mesh.userData = { id: p.id, name: p.dispName || p.name, type: p.type, base: COL[p.type] || COL.overig };
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), new THREE.LineBasicMaterial({ color: 0x5b3f24, transparent: true, opacity: 0.55 }));
        mesh.add(edges); group.add(mesh); meshes.push(mesh);
      }
      offset += (x1 - x0) + 1200;
    }
    // zonderOmgeving: alleen de plaats en hoogte van de trappen gebruiken (gekoppelde trappen boven elkaar), geen vloeren/wanden
    if (ops && !(opts && opts.zonderOmgeving)) bouwOpstelling(THREE, group, ops, opts || {}, maten);
    return { group, meshes, maten };
  }
  function opzet(THREE, scene, renderer, camera, group, meshes, sig, c, size) {
    const r = Math.max(size.x, size.y, size.z) || 1000;
    camera.position.set(c.x - r * 0.95, c.y - r * 1.15, c.z + r * 0.6); camera.lookAt(c);
    const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.target.copy(c); controls.enableDamping = true; controls.update();
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let down = null;
    const pick = (e) => { const b = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects(meshes, false)[0]; return hit ? hit.object.userData : null; };
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // slepen = draaien, geen selectie
      const u = pick(e); if (V && V.opts && V.opts.onPick) V.opts.onPick(u ? u.id : null, e.shiftKey || e.ctrlKey || e.metaKey);
    });
    renderer.domElement.addEventListener('pointermove', (e) => { const u = pick(e); renderer.domElement.title = u ? u.name : ''; renderer.domElement.style.cursor = u ? 'pointer' : 'grab'; });
    const view = { sig, scene, renderer, camera, controls, meshes, center: c, radius: r, raf: 0, opts: null };
    // alleen tekenen als de weergave op het scherm staat
    const loop = () => { view.raf = requestAnimationFrame(loop); if (!renderer.domElement.isConnected) return; controls.update(); renderer.render(scene, camera); };
    loop();
    window.addEventListener('resize', resize);
    return view;
  }
  // vloeren met trapgat, wanden (eigen kleur) en balustrades van de opstelling; geen selecteerbare onderdelen
  // userData.zp op het materiaal: {omg} = vloer/wand, {rol: soort onderdeel} = hout, {metaal} (voor ZP.spec3d)
  function bouwOpstelling(THREE, group, o, opts, maten) {
    const O = ZP.ops, C = opts.C || {}, lam = (col, x, zp) => { const m = new THREE.MeshLambertMaterial(Object.assign({ color: col, side: THREE.DoubleSide }, x || {})); m.userData.zp = zp || { omg: true }; return m; };
    const rand = (m) => { m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), new THREE.LineBasicMaterial({ color: 0x6b5a48, transparent: true, opacity: 0.35 }))); return m; };
    // omvang van de vloeren: alles wat getekend is, plus een rand
    const pts = [];
    for (const vl of o.vloeren) pts.push(...O.gatHoeken(vl.gat));
    for (const w of o.wanden) pts.push(w.a, w.b);
    for (const b of o.balustrades) pts.push(...b.punten);
    for (const id of Object.keys(o.trappen)) { const t = o.trappen[id]; pts.push([t.x, t.y], [t.x + 4000, t.y + 4000]); }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), m = 1000;
    const R = [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
    // de onderste vloer (begane grond, of de kelder) dicht en dun; de vloeren erboven half doorzichtig met trapgat
    const laagste = Math.min(...o.vloeren.map(v => v.z));
    for (const vl of o.vloeren) {
      const sh = new THREE.Shape([[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]].map(q => new THREE.Vector2(q[0], -q[1])));
      const gat = vl.z > laagste ? O.gatHoeken(vl.gat) : []; if (gat.length >= 3) sh.holes.push(new THREE.Path(gat.map(q => new THREE.Vector2(q[0], -q[1]))));
      const boven = vl.z > laagste, d = boven ? 200 : 30, me = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }),
        boven ? lam(0xe3dccf, { transparent: true, opacity: 0.45, depthWrite: false }) : lam(0xd6cfc2));
      me.position.z = vl.z - d; group.add(rand(me));
    }
    const peil = (id) => (o.vloeren.find(v => v.id === id) || { z: 0 }).z;
    // wand: grondvorm uit ZP.ops.wandVorm (lijn = vlak tegen de trap, dikte naar de zijde, hoeken dicht); per uiteinde een eigen
    // onderkant (za/zb, t.o.v. de vloer) en hoogte (h/hb): zo loopt een wand schuin mee met een trap- of keepboom
    for (const w of o.wanden) {
      const V = O.wandVorm(o, w); if (!V || V.R.L < 10) continue;
      const Z = O.wandZ(w), z = peil(w.vloer);
      const hoek = V.vlak.map(q => { const t = Math.max(0, Math.min(1, ((q[0] - w.a[0]) * V.R.ux + (q[1] - w.a[1]) * V.R.uy) / V.R.L)), o0 = Z.za + (Z.zb - Z.za) * t;
        return { x: q[0], y: -q[1], z0: z + o0, z1: z + o0 + Z.h + (Z.hb - Z.h) * t }; });
      const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c), quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
      const lo = hoek.map(q => [q.x, q.y, q.z0]), hi = hoek.map(q => [q.x, q.y, q.z1]);
      quad(lo[0], lo[1], lo[2], lo[3]); quad(hi[0], hi[1], hi[2], hi[3]);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(lo[i], lo[j], hi[j], hi[i]); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      group.add(rand(new THREE.Mesh(geo, lam(new THREE.Color(w.kleur || o.wandKleur || '#ece6dc'), { transparent: true, opacity: 0.92 }))));
    }
    // balustrade: palen op de hoekpunten, leuning op 1000, spijlen, onderslof
    const hout = lam(0xcfa46c, null, { rol: 'leuning' }), paal = lam(0xb88a5a, null, { rol: 'spil' }), spijlH = lam(0xcfa46c, null, { rol: 'baluster' });
    for (const b of o.balustrades) {
      const z = peil(b.vloer), P = b.punten.map(q => O.naar3d(q)), sp = (C.spijltypes || []).find(x => x.id === b.spijl) || { breedte: 40, naam: '' };
      for (let i = 1; i < P.length; i++) if (maten) maten.push({ a: [P[i - 1][0], P[i - 1][1], z], b: [P[i][0], P[i][1], z] });
      const box3 = (x, y, z0, z1, w, dd, mat, rot) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, dd, z1 - z0), mat); me.position.set(x, y, (z0 + z1) / 2); if (rot) me.rotation.z = rot; group.add(me); };
      P.forEach(q => box3(q[0], q[1], z, z + 1050, 90, 90, paal));
      for (let i = 1; i < P.length; i++) {
        const A = P[i - 1], Q = P[i], L = Math.hypot(Q[0] - A[0], Q[1] - A[1]); if (L < 10) continue; const rot = Math.atan2(Q[1] - A[1], Q[0] - A[0]);
        box3((A[0] + Q[0]) / 2, (A[1] + Q[1]) / 2, z + 975, z + 1025, L, 60, hout, rot);
        if (b.onderslof) box3((A[0] + Q[0]) / 2, (A[1] + Q[1]) / 2, z, z + 60, L, 60, hout, rot);
        const stap = (+sp.breedte || 40) + (+b.tussen || 100), w = Math.max(14, +sp.breedte || 40), mS = /rvs|staal/i.test(sp.naam) ? lam(0xb8bec4, null, { metaal: true }) : spijlH;
        for (let s = stap; s < L - stap / 2; s += stap) box3(A[0] + (Q[0] - A[0]) * s / L, A[1] + (Q[1] - A[1]) * s / L, z + (b.onderslof ? 60 : 0), z + 975, w, w, mS, rot);
      }
    }
  }
  function resize() {
    if (!V) return; const el = V.renderer.domElement.parentNode; if (!el) return;
    const w = el.clientWidth || 600, h = el.clientHeight || 420;
    V.renderer.setSize(w, h); V.camera.aspect = w / h; V.camera.updateProjectionMatrix();
  }
  // kleuren: geselecteerd = accent, met bewerking = groenig, anders houtkleur
  function paint() {
    if (!V) return; const o = V.opts || {}, sel = o.selected || new Set(), withBew = o.withBew || new Set();
    for (const m of V.meshes) {
      const id = m.userData.id;
      m.material.color.setHex(sel.has(id) ? 0x2b6cb0 : withBew.has(id) ? 0x7fb27f : m.userData.base);
      m.material.emissive && m.material.emissive.setHex(sel.has(id) ? 0x112244 : 0x000000);
    }
  }
  function setView(kind) {
    if (!V) return; const c = V.center, r = V.radius, cam = V.camera;
    const pos = { iso: [c.x - r * 0.95, c.y - r * 1.15, c.z + r * 0.6], top: [c.x, c.y - 1, c.z + r * 1.8], front: [c.x, c.y - r * 1.8, c.z], side: [c.x - r * 1.8, c.y, c.z] }[kind] || null;
    if (!pos) return; cam.position.set(...pos); V.controls.target.copy(c); V.controls.update();
  }
  // schermpositie (clientX/Y) van het midden van een onderdeel, bv. voor tests
  function screenPos(id) {
    if (!V) return null; const m = V.meshes.find(x => x.userData.id === id); if (!m) return null;
    m.geometry.computeBoundingSphere(); const v = m.geometry.boundingSphere.center.clone().project(V.camera);
    const b = V.renderer.domElement.getBoundingClientRect();
    return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
  }
  function snapshot() { return V ? V.renderer.domElement.toDataURL('image/png') : null; }
  function dispose() { if (!V) return; cancelAnimationFrame(V.raf); V.renderer.dispose(); if (V.renderer.domElement.parentNode) V.renderer.domElement.remove(); V = null; }
  const hasMesh = (p) => p.parts.some(x => x.mesh && x.mesh.length);
  return { load, mount, paint, setView, snapshot, dispose, hasMesh, screenPos, bouwModel };
})();
