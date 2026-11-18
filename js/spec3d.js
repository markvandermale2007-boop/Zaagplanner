// Realistische tekening voor de specificatiestaat: de trap (DXF of configurator) met houtnerf per houtsoort,
// afwerking (wit gegrond = wit), licht en schaduw. Levert plaatjes van het 3D-beeld, boven- en zijaanzicht
// (met maatvoering) en een draaibaar 3D-beeld op het scherm. Gebruikt three.js via ZP.view3d.load().
ZP.spec3d = (function () {
  // getekende nerf; een eigen nerf-afbeelding per houtsoort (ZP.fotos 'nerf:<naam>', Materialenlijst) gaat voor
  const NERVEN = [['grof', 'Grove nerf (eiken, essen)'], ['vlam', 'Vlammen en kwasten (grenen, vuren)'], ['fijn', 'Fijne nerf (beuken, noten, meranti)'], ['geen', 'Geen nerf (plaat, MDF)']];
  const nerfAfb = (hout) => (hout && ZP.fotos ? ZP.fotos.get('nerf', hout) : '') || '';

  // ---------- houtsoort: kleur en nerf (eigen keuze in de Materialenlijst: C.houtKleur[naam] = {kleur, nerf}) ----------
  function stdStijl(naam) {
    const h = String(naam || '').toLowerCase();
    const nerf = /mdf|multiplex|plaat|hdf|spaan/.test(h) ? 'geen' : /grenen|vuren|lariks|douglas/.test(h) ? 'vlam' : /eiken|essen|rustiek|kastanje/.test(h) ? 'grof' : 'fijn';
    return { kleur: /mdf|hdf/.test(h) ? '#c9ae86' : /multiplex|berken/.test(h) ? '#e3c9a0' : ZP.drawings.woodColor(naam, '').f, nerf };
  }
  function stijl(C, naam) {
    const tab = (C && C.houtKleur) || {}, k = Object.keys(tab).find(x => x.toLowerCase() === String(naam || '').toLowerCase());
    const e = (k && tab[k]) || {}, s = stdStijl(naam);
    return { kleur: e.kleur || s.kleur, nerf: e.nerf || s.nerf, eigen: !!(e.kleur || e.nerf) };
  }
  // houtsoort + afwerking → uiterlijk. Dekkend wit (gegrond/gelakt) = wit zonder nerf; olie wit = nerf blijft zichtbaar.
  function uiterlijk(C, hout, afw) {
    const s = stijl(C, hout), a = String(afw || '').toLowerCase();
    const L = { hout: hout || '', afw: afw || '', kleur: s.kleur, nerf: s.nerf === 'foto' ? 'fijn' : s.nerf, ruw: 0.7, wit: 0, donker: 0, verf: false, glans: 0, afb: nerfAfb(hout).length };
    if (/gegrond|grondverf|dekkend|gelakt wit|wit gelakt|gespoten/.test(a) || (/wit/.test(a) && !/olie|wax|beits/.test(a))) {
      L.verf = true; L.nerf = 'geen'; L.afb = 0; const lak = /afgelakt|lak/.test(a); L.kleur = lak ? '#f7f6f2' : '#f2f0ea'; L.ruw = lak ? 0.3 : 0.62;
    } else if (/wit/.test(a)) { L.wit = 0.5; L.ruw = 0.6; }
    else if (/beits|gebeitst/.test(a)) { L.donker = 0.38; L.ruw = 0.5; }
    else if (/lak/.test(a)) { L.ruw = 0.32; L.glans = 0.12; }
    else if (/olie|wax/.test(a)) { L.ruw = 0.55; L.glans = 0.06; }
    else if (/onbehandeld/.test(a)) { L.ruw = 0.85; L.wit = 0.07; }
    L.sleutel = [L.kleur, L.nerf, L.ruw, L.wit, L.donker, L.verf ? 1 : 0, L.glans, L.afb ? L.hout + L.afb : ''].join('|');
    return L;
  }

  // ---------- kleuren ----------
  const hex2 = (h) => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, al) => `rgba(${c[0]},${c[1]},${c[2]},${al == null ? 1 : al})`;
  function basisKleur(L) {
    let c = hex2(L.kleur);
    if (L.glans) c = c.map(v => Math.round(Math.min(255, v * (1 - L.glans * 0.6))));   // olie/lak: iets dieper van kleur
    if (L.wit) c = mix(c, [246, 243, 236], L.wit);
    if (L.donker) c = mix(c, [58, 36, 22], L.donker);
    return c;
  }
  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483646 + 1; }

  // ---------- nerf: getekend op een canvas, naadloos te herhalen (1 × 1 = 1000 × 250 mm) ----------
  function nerfCanvas(L, W, H) {
    W = W || 1024; H = H || 256;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    let seed = hash(L.sleutel); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const base = basisKleur(L), donker = mix(base, [40, 22, 10], L.wit ? 0.22 : 0.42), licht = mix(base, [255, 250, 240], 0.25);
    g.fillStyle = rgb(base); g.fillRect(0, 0, W, H);
    const lijn = (y0, amp, k1, k2, f1, f2, br, kl, al) => {
      for (const dy of [-H, 0, H]) {
        g.beginPath();
        for (let x = 0; x <= W; x += 6) { const y = y0 + dy + amp * Math.sin(2 * Math.PI * k1 * x / W + f1) + amp * 0.45 * Math.sin(2 * Math.PI * k2 * x / W + f2); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
        g.strokeStyle = rgb(kl, al); g.lineWidth = br; g.stroke();
      }
    };
    // brede banden licht/donker (jaarringen van ver)
    for (let i = 0; i < 7; i++) lijn(rnd() * H, 3 + rnd() * 8, 1 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 3), rnd() * 6, rnd() * 6, 8 + rnd() * 22, rnd() < 0.5 ? donker : licht, L.nerf === 'geen' ? 0.03 : 0.07);
    const n = { fijn: 80, grof: 46, vlam: 26, foto: 0, geen: 0 }[L.nerf] || 0;
    for (let i = 0; i < n; i++) {
      const fijn = L.nerf === 'fijn';
      lijn(rnd() * H, (fijn ? 1 : 2) + rnd() * (fijn ? 3 : 6), 1 + Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 5), rnd() * 6, rnd() * 6,
        fijn ? 0.5 + rnd() * 0.9 : 0.8 + rnd() * 2.2, donker, (fijn ? 0.1 : 0.14) + rnd() * (fijn ? 0.14 : 0.28) * (L.wit ? 0.6 : 1));
    }
    // vlammen (dosse gezaagd): geneste bogen, naadloos over de rand
    if (L.nerf === 'vlam' || L.nerf === 'grof') {
      const nv = L.nerf === 'vlam' ? 3 : 2;
      for (let j = 0; j < nv; j++) {
        const cx = rnd() * W, cy = H * (0.25 + rnd() * 0.5), sp = 60 + rnd() * 80, gap = 5 + rnd() * 5;
        for (let r = 1; r < 11; r++) for (const ox of [-W, 0, W]) {
          g.beginPath(); let on = false;
          for (let x = -sp * 4; x <= sp * 4; x += 5) { const y = cy - r * gap + Math.pow(x / (sp * 0.35 + r * 18), 2) * gap * 2.2; if (y < -H || y > 2 * H) { on = false; continue; } if (on) g.lineTo(cx + ox + x, y); else { g.moveTo(cx + ox + x, y); on = true; } }
          g.strokeStyle = rgb(donker, (L.nerf === 'vlam' ? 0.32 : 0.18) * (L.wit ? 0.6 : 1)); g.lineWidth = L.nerf === 'vlam' ? 1.8 : 1.2; g.stroke();
        }
      }
    }
    // eiken: spiegels (korte lichte vlekjes) en poriën
    if (L.nerf === 'grof') {
      for (let i = 0; i < 60; i++) { g.fillStyle = rgb(licht, 0.18 + rnd() * 0.15); const x = rnd() * W, y = rnd() * H; g.beginPath(); g.ellipse(x, y, 6 + rnd() * 18, 1 + rnd() * 1.5, 0, 0, 7); g.fill(); }
      for (let i = 0; i < 1400; i++) { g.fillStyle = rgb(donker, 0.18 + rnd() * 0.2); g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 5, 0.8); }
    }
    // grenen/vuren: kwasten
    if (L.nerf === 'vlam') for (let i = 0; i < 2; i++) {
      const x = rnd() * W, y = rnd() * H, rr = 7 + rnd() * 9;
      for (const ox of [-W, 0, W]) { const gr = g.createRadialGradient(x + ox, y, 1, x + ox, y, rr * 2.2); gr.addColorStop(0, rgb(mix(donker, [30, 15, 5], 0.4), 0.85)); gr.addColorStop(0.45, rgb(donker, 0.5)); gr.addColorStop(1, rgb(donker, 0)); g.fillStyle = gr; g.beginPath(); g.ellipse(x + ox, y, rr * 2.2, rr * 1.3, 0, 0, 7); g.fill(); }
    }
    // fijne ruis (ook bij plaat en verf: niet helemaal vlak)
    for (let i = 0; i < 2500; i++) { g.fillStyle = rgb(rnd() < 0.5 ? donker : licht, 0.04); g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    return cv;
  }

  // ---------- materialen ----------
  const texCache = new Map(), fotoCache = new Map();
  function fotoBeeld(src) {
    if (!fotoCache.has(src)) fotoCache.set(src, new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
    return fotoCache.get(src);
  }
  function textuur(THREE, L, wacht) {
    if (L.verf) return null;
    if (texCache.has(L.sleutel)) return texCache.get(L.sleutel);
    let t;
    const src = L.afb ? nerfAfb(L.hout) : '';
    if (src) {
      // eigen nerf-afbeelding (nerf van links naar rechts); 1 afbeelding = 600 mm langs de nerf. Olie wit / beits erover heen.
      t = new THREE.CanvasTexture(nerfCanvas(L)); wacht.push(fotoBeeld(src).then(im => { if (!im) return;
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
        if (L.wit) { g.fillStyle = `rgba(246,243,236,${L.wit})`; g.fillRect(0, 0, cv.width, cv.height); }
        if (L.donker) { g.fillStyle = `rgba(58,36,22,${L.donker})`; g.fillRect(0, 0, cv.width, cv.height); }
        t.image = cv; t.repeat.set(1000 / 600, 250 / (600 * cv.height / cv.width)); t.needsUpdate = true; }));
    } else t = new THREE.CanvasTexture(nerfCanvas(L));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    texCache.set(L.sleutel, t); return t;
  }
  function houtMat(THREE, L, wacht) {
    const map = textuur(THREE, L, wacht);
    const m = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : new THREE.Color(L.kleur).convertSRGBToLinear(), map, roughness: L.ruw, metalness: 0, side: THREE.DoubleSide });
    if (L.verf) m.color = new THREE.Color(L.kleur).convertSRGBToLinear();
    return m;
  }
  // stalen rand en houtnerf: u langs de nerf (= langste richting van het onderdeel), v dwars erop, in wereld-mm
  function zetUV(THREE, mesh, seed) {
    const g = mesh.geometry, pos = g.attributes.position; if (!pos) return;
    if (!g.attributes.normal) g.computeVertexNormals();
    const nor = g.attributes.normal, n = pos.count, M = mesh.matrixWorld, NM = new THREE.Matrix3().getNormalMatrix(M);
    const P = new Array(n), v = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < n; i++) { P[i] = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M); m.add(P[i]); }
    m.multiplyScalar(1 / n);
    // hoofdrichting via de spreiding (machtsmethode)
    const c = [0, 0, 0, 0, 0, 0];
    for (const p of P) { const x = p.x - m.x, y = p.y - m.y, z = p.z - m.z; c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z; }
    const d = new THREE.Vector3(1, 0.31, 0.17);
    for (let k = 0; k < 24; k++) { d.set(c[0] * d.x + c[1] * d.y + c[2] * d.z, c[1] * d.x + c[3] * d.y + c[4] * d.z, c[2] * d.x + c[4] * d.y + c[5] * d.z); if (d.lengthSq() < 1e-12) { d.set(1, 0, 0); break; } d.normalize(); }
    const uv = new Float32Array(n * 2), nn = new THREE.Vector3(), q = new THREE.Vector3(), alt = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const off = (seed % 997) * 0.173;
    for (let i = 0; i < n; i++) {
      nn.fromBufferAttribute(nor, i).applyMatrix3(NM).normalize();
      q.crossVectors(nn, d); if (q.lengthSq() < 0.05) q.crossVectors(d, alt); q.normalize();
      v.copy(P[i]); uv[2 * i] = v.dot(d) / 1000 + off; uv[2 * i + 1] = v.dot(q) / 250 + off * 0.61;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // ---------- model: groep uit view3d (DXF) of cf3d (configurator), met realistische materialen ----------
  // bron = { project, ops, C, kijk, vloerBal? } of { v, C, kijk }; kijk(info) → {hout, afw, label} | {weg} ; info = {part, type} of zp-label
  function maak(bron) {
    const THREE = window.THREE, wacht = [];
    const r = bron.project ? ZP.view3d.bouwModel(THREE, bron.project, bron.ops, { C: bron.C, zonderOmgeving: bron.zonderOmgeving }) : ZP.cf3d.bouwModel(THREE, bron.v, bron.C);
    const group = r.group, maten = r.maten.slice(), randen = [], omg = [], legenda = new Map(), mats = new Map();
    if (bron.vloerBal) extraBalustrades(THREE, group, bron.vloerBal, maten);
    group.updateMatrixWorld(true);
    let seed = 1;
    const metaal = new THREE.MeshStandardMaterial({ color: 0xc3c8cc, metalness: 0.55, roughness: 0.35 });
    const vloer = new THREE.MeshStandardMaterial({ color: 0xe6e1d8, roughness: 0.95 });
    const glas = (o) => new THREE.MeshStandardMaterial({ color: o.color ? o.color.clone().convertSRGBToLinear() : 0xeeeeee, roughness: 0.95, transparent: true, opacity: Math.min(0.5, o.opacity || 0.4), depthWrite: false, side: THREE.DoubleSide });
    group.traverse(o => {
      if (o.isLineSegments) { randen.push(o); o.material = new THREE.LineBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.5 }); return; }
      if (!o.isMesh) return;
      const zp = (o.material.userData && o.material.userData.zp) || null;
      const info = o.userData && o.userData.id ? { part: o.userData.id, type: o.userData.type } : zp || { omg: true };
      if (info.omg) { omg.push(o); o.material = o.material.transparent ? glas(o.material) : vloer; o.receiveShadow = true; return; }
      if (info.metaal) { o.material = metaal; o.castShadow = o.receiveShadow = true; return; }
      const k = bron.kijk(info) || {};
      if (k.weg) { o.visible = false; o.userData.weg = true; return; }
      const L = uiterlijk(bron.C, k.hout, k.afw);
      if (!mats.has(L.sleutel)) mats.set(L.sleutel, houtMat(THREE, L, wacht));
      o.material = mats.get(L.sleutel); zetUV(THREE, o, seed++ * 7919);
      o.castShadow = o.receiveShadow = true;
      const lk = (L.hout || '–') + '|' + L.afw, e = legenda.get(lk) || { L, labels: new Set() }; if (k.label) e.labels.add(k.label); legenda.set(lk, e);
    });
    // omvang van de trap zelf (zonder vloeren en muren)
    const box = new THREE.Box3();
    group.traverse(o => { if (o.isMesh && o.visible && !omg.includes(o)) box.expandByObject(o); });
    if (box.isEmpty()) box.setFromObject(group);
    return { group, maten, randen, omg, legenda: [...legenda.values()], box, klaar: Promise.all(wacht), scene: null };
  }
  // verdiepingsbalustrades (configurator) bij een DXF-trap zonder opstelling: palen, leuning, spijlen, onderslof
  function extraBalustrades(THREE, group, lijst, maten) {
    const m = (rol) => { const x = new THREE.MeshLambertMaterial({ color: 0xcfa46c }); x.userData.zp = { rol }; return x; };
    const mL = m('leuning'), mP = m('spil'), mS = m('baluster');
    const balk = (x, y, z0, z1, w, d, mat, rot) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, d, z1 - z0), mat); me.position.set(x, y, (z0 + z1) / 2); me.rotation.z = rot || 0; group.add(me); };
    for (const b of lijst) {
      const P = b.punten, z = b.z;
      P.forEach(q => balk(q[0], q[1], z, z + 1050, 90, 90, mP));
      for (let i = 1; i < P.length; i++) {
        const A = P[i - 1], Q = P[i], L = Math.hypot(Q[0] - A[0], Q[1] - A[1]); if (L < 10) continue; const rot = Math.atan2(Q[1] - A[1], Q[0] - A[0]);
        maten.push({ a: [A[0], A[1], z], b: [Q[0], Q[1], z] });
        balk((A[0] + Q[0]) / 2, (A[1] + Q[1]) / 2, z + 975, z + 1030, L, 65, mL, rot);
        if (b.onderslof) balk((A[0] + Q[0]) / 2, (A[1] + Q[1]) / 2, z, z + 60, L, 60, mS, rot);
        const w = Math.max(14, +b.breedte || 40), stap = w + (+b.tussen || 100);
        for (let s = stap; s < L - stap / 2; s += stap) balk(A[0] + (Q[0] - A[0]) * s / L, A[1] + (Q[1] - A[1]) * s / L, z + (b.onderslof ? 60 : 0), z + 975, w, w, mS, rot);
      }
    }
  }

  // ---------- scène met licht, schaduw en een vloer die de schaduw opvangt ----------
  function scene(M) {
    if (M.scene) return M.scene;
    const THREE = window.THREE, s = new THREE.Scene(); s.background = new THREE.Color(0xffffff);
    s.add(M.group);
    const c = M.box.getCenter(new THREE.Vector3()), sz = M.box.getSize(new THREE.Vector3()), r = Math.max(sz.x, sz.y, sz.z, 1000);
    s.add(new THREE.HemisphereLight(0xfffcf5, 0xb3a58f, 0.75));
    s.add(new THREE.AmbientLight(0xffffff, 0.12));
    const zon = new THREE.DirectionalLight(0xfff6e8, 1.05); zon.position.set(c.x - r * 0.7, c.y - r * 1.1, c.z + r * 1.8); zon.target.position.copy(c);
    zon.castShadow = true; zon.shadow.mapSize.set(2048, 2048); zon.shadow.bias = -0.0004; zon.shadow.normalBias = 2;
    Object.assign(zon.shadow.camera, { left: -r * 1.3, right: r * 1.3, top: r * 1.3, bottom: -r * 1.3, near: 1, far: r * 6 }); zon.shadow.camera.updateProjectionMatrix();
    s.add(zon, zon.target);
    const bij = new THREE.DirectionalLight(0xe8f0ff, 0.3); bij.position.set(c.x + r, c.y + r * 0.6, c.z + r * 0.8); s.add(bij);
    // schaduwvloer onder de trap (alleen in het 3D-beeld)
    const grond = new THREE.Mesh(new THREE.PlaneGeometry(r * 8, r * 8), new THREE.ShadowMaterial({ opacity: 0.2 }));
    grond.position.set(c.x, c.y, M.box.min.z - 1); grond.receiveShadow = true; s.add(grond);
    M.grond = grond; M.scene = s; return s;
  }
  let R = null;
  function renderer() {
    const THREE = window.THREE;
    if (!R) { R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.08; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; }
    return R;
  }
  // standaard 3D-standpunt: schuin van voren, iets van boven
  function stdCam(M, asp) {
    const THREE = window.THREE, c = M.box.getCenter(new THREE.Vector3()), sph = M.box.getBoundingSphere(new THREE.Sphere());
    const half = Math.min(THREE.MathUtils.degToRad(16), Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * (asp || 1.4)));
    const d = sph.radius / Math.sin(half) * 0.92, dir = new THREE.Vector3(-0.75, -1.05, 0.45).normalize().multiplyScalar(d);
    return { p: [c.x + dir.x, c.y + dir.y, c.z + dir.z], t: [c.x, c.y, c.z] };
  }
  function perspCam(M, w, h, cam) {
    const THREE = window.THREE, k = cam || stdCam(M, w / h), C = new THREE.PerspectiveCamera(32, w / h, 10, 200000);
    C.up.set(0, 0, 1); C.position.set(...k.p); C.lookAt(new THREE.Vector3(...k.t)); C.updateMatrixWorld(); return C;
  }
  // orthografisch boven- of zijaanzicht, passend in w × h met ruimte voor de maten
  function orthoCam(M, soort, w, h, kant) {
    const THREE = window.THREE, b = M.box, c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), r = Math.max(sz.x, sz.y, sz.z) * 4 + 5000;
    const C = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, r * 3);
    if (soort === 'boven') { C.position.set(c.x, c.y, c.z + r); C.up.set(0, 1, 0); if (sz.y > sz.x * 1.15 && w >= h) C.up.set(-1, 0, 0); }
    // kant 0/1 = zijaanzicht (langs de lange kant, van beide kanten), 2/3 = vooraanzicht (langs de korte kant)
    else { const langsX = (sz.x >= sz.y) !== ((kant || 0) % 4 >= 2), s = (kant || 0) % 2 ? 1 : -1; C.position.set(c.x + (langsX ? 0 : -s * r), c.y + (langsX ? s * r : 0), c.z); C.up.set(0, 0, 1); }
    C.lookAt(c); C.updateMatrixWorld();
    // halve breedte/hoogte uit de hoekpunten in camerarichting
    const inv = C.matrixWorldInverse; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const X of [b.min.x, b.max.x]) for (const Y of [b.min.y, b.max.y]) for (const Z of [b.min.z, b.max.z]) { const q = new THREE.Vector3(X, Y, Z).applyMatrix4(inv); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    // vaste rand in pixels voor maatlijn + getal (zelfde fs als maatSvg), zodat de maten nooit over de tekening vallen
    const pad = maatPad(w), bw = (x1 - x0) * 1.03 || 1000, bh = (y1 - y0) * 1.03 || 1000;
    const sc = Math.max(bw / Math.max(40, w - 2 * pad), bh / Math.max(40, h - 2 * pad)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    Object.assign(C, { left: cx - w * sc / 2, right: cx + w * sc / 2, top: cy + h * sc / 2, bottom: cy - h * sc / 2 }); C.updateProjectionMatrix();
    C.userData.pxPerMm = 1 / sc; return C;
  }
  // één plaatje: soort '3d' | 'boven' | 'zij'
  function beeld(M, soort, w, h, opts) {
    const THREE = window.THREE, o = opts || {}, s = scene(M), rd = renderer();
    // alleen bepaalde onderdelen (o.ids = Set van onderdeel-id's, bv. één trap van twee boven elkaar): de rest tijdelijk verbergen
    // en de omvang (voor uitsnede en maten) op die onderdelen zetten
    let terug = null;
    if (o.ids) {
      const oudBox = M.box, verborgen = [], box = new THREE.Box3();
      M.group.traverse(x => { if (!x.isMesh || M.omg.includes(x)) return;
        const zien = x.userData && x.userData.id !== undefined && o.ids.has(String(x.userData.id)) && !x.userData.weg;
        if (x.visible && !zien) { x.visible = false; verborgen.push(x); }
        if (x.visible) box.expandByObject(x); });
      if (!box.isEmpty()) M.box = box;
      terug = () => { for (const x of verborgen) x.visible = true; M.box = oudBox; };
    }
    const cam = soort === '3d' ? perspCam(M, w, h, o.cam) : orthoCam(M, soort, w, h, o.kant);
    const in3d = soort === '3d';
    for (const x of M.omg) x.visible = in3d && o.omgeving !== false;
    M.grond.visible = in3d;
    for (const l of M.randen) l.material.opacity = in3d ? 0.1 : 0.55;
    rd.setPixelRatio(1); rd.setSize(w, h, false); rd.render(s, cam);
    const url = rd.domElement.toDataURL('image/png');
    const proj = (p) => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(cam); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
    const uit = { url, w, h, soort, svg: in3d ? '' : maatSvg(M, soort, w, h, proj, cam) };
    if (terug) terug();
    return uit;
  }

  // ---------- maatvoering (SVG over het plaatje, zelfde pixels) ----------
  const maatFs = (w) => Math.max(12, Math.round(w / 46));
  const maatPad = (w) => maatFs(w) * 3.9;   // hulplijn tot maatlijn (2,2) + getal (0,75 + halve tekst) + witruimte
  function maatSvg(M, soort, w, h, proj, cam) {
    const b = M.box, fs = maatFs(w), mm = (v) => String(Math.round(v));
    let out = '';
    const maat = (A, B, uit, tekst) => {   // A, B in px; uit = normaal (px) naar buiten
      const [nx, ny] = uit, a1 = [A[0] + nx, A[1] + ny], b1 = [B[0] + nx, B[1] + ny], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 8) return;
      const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, t = fs * 0.45;
      out += `<path d="M${A[0]},${A[1]}L${a1[0] + nx * 0.15},${a1[1] + ny * 0.15}M${B[0]},${B[1]}L${b1[0] + nx * 0.15},${b1[1] + ny * 0.15}" class="sp-hulp"/>`;
      out += `<path d="M${a1[0]},${a1[1]}L${b1[0]},${b1[1]}M${a1[0] - t * (ux - uy)},${a1[1] - t * (uy + ux)}L${a1[0] + t * (ux - uy)},${a1[1] + t * (uy + ux)}M${b1[0] - t * (ux - uy)},${b1[1] - t * (uy + ux)}L${b1[0] + t * (ux - uy)},${b1[1] + t * (uy + ux)}" class="sp-maat"/>`;
      let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      // getal net buiten de maatlijn (weg van de tekening)
      const nl = Math.hypot(nx, ny) || 1, mx = (a1[0] + b1[0]) / 2 + nx / nl * fs * 0.75, my = (a1[1] + b1[1]) / 2 + ny / nl * fs * 0.75;
      out += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" dominant-baseline="central" font-size="${fs}">${tekst}</text>`;
    };
    // buitenmaten: kader van de trap in pixels
    const pts = []; for (const X of [b.min.x, b.max.x]) for (const Y of [b.min.y, b.max.y]) for (const Z of [b.min.z, b.max.z]) pts.push(proj([X, Y, Z]));
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    const k = cam.userData.pxPerMm, gap = fs * 2.2;
    maat([x0, y1], [x1, y1], [0, gap], mm((x1 - x0) / k));
    maat([x0, y0], [x0, y1], [-gap, 0], mm((y1 - y0) / k));
    // geen maten van de balustrades (op wens: die zijn niet exact genoeg); alleen de buitenmaten, buiten de tekening
    return `<svg class="sp-maten" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out}</svg>`;
  }

  // ---------- draaibaar 3D-beeld op het scherm (eigen renderer; standpunt terug via onCam) ----------
  let LV = null;
  function live(el, M, cam, onCam) {
    const THREE = window.THREE;
    if (!LV || LV.M !== M) {
      if (LV) LV.stop();
      const rd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); rd.outputEncoding = THREE.sRGBEncoding; rd.toneMapping = THREE.ACESFilmicToneMapping; rd.toneMappingExposure = 1.08; rd.shadowMap.enabled = true; rd.shadowMap.type = THREE.PCFSoftShadowMap;
      rd.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const k = cam || stdCam(M, (el.clientWidth || 4) / (el.clientHeight || 3)), C = new THREE.PerspectiveCamera(32, 1, 10, 200000); C.up.set(0, 0, 1); C.position.set(...k.p);
      const ctl = new THREE.OrbitControls(C, rd.domElement); ctl.target.set(...k.t); ctl.enableDamping = true; ctl.screenSpacePanning = true; ctl.update();
      ctl.addEventListener('end', () => { if (LV && LV.onCam) LV.onCam({ p: C.position.toArray().map(Math.round), t: ctl.target.toArray().map(Math.round) }); });
      let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); if (!rd.domElement.isConnected) return; ctl.update();
        for (const x of M.omg) x.visible = true; M.grond.visible = true; for (const l of M.randen) l.material.opacity = 0.1; rd.render(scene(M), C); };
      LV = { M, rd, C, ctl, stop: () => { cancelAnimationFrame(raf); ctl.dispose(); rd.dispose(); rd.domElement.remove(); } };
      loop();
    }
    LV.onCam = onCam;
    if (LV.rd.domElement.parentNode !== el) el.appendChild(LV.rd.domElement);
    const w = el.clientWidth || 400, h = el.clientHeight || 300; LV.rd.setSize(w, h); LV.C.aspect = w / h; LV.C.updateProjectionMatrix();
    return LV;
  }
  function zetCam(cam) { if (!LV) return; const k = cam || stdCam(LV.M, LV.C.aspect); LV.C.position.set(...k.p); LV.ctl.target.set(...k.t); LV.ctl.update(); }
  // beeld verticaal verschuiven (richting = +1: trap omhoog in beeld, −1: omlaag); stap = 8% van de grootte van de trap.
  // Vanaf het bewaarde standpunt (anders het draaibare beeld / standaard); het draaibare beeld gaat mee. Geeft het nieuwe standpunt terug.
  function schuif(M, cam, richting) {
    const THREE = window.THREE, live = LV && LV.M === M;
    const k = cam || (live ? { p: LV.C.position.toArray(), t: LV.ctl.target.toArray() } : stdCam(M, 1.4));
    const P = new THREE.Vector3(...k.p), T = new THREE.Vector3(...k.t);
    // "omhoog" op het scherm: loodrecht op de kijkrichting, in het vlak met de verticale as
    const kijk = T.clone().sub(P).normalize(), up = new THREE.Vector3(0, 0, 1);
    const scherm = up.clone().sub(kijk.clone().multiplyScalar(up.dot(kijk))); if (scherm.lengthSq() < 1e-6) scherm.set(0, 1, 0); scherm.normalize();
    const d = scherm.multiplyScalar(-richting * M.box.getBoundingSphere(new THREE.Sphere()).radius * 0.16);
    P.add(d); T.add(d);
    const nieuw = { p: P.toArray().map(Math.round), t: T.toArray().map(Math.round) };
    if (live) { LV.C.position.copy(P); LV.ctl.target.copy(T); LV.ctl.update(); }
    return nieuw;
  }
  // stalen van de houtsoort (klein plaatje voor de legenda en de Materialenlijst)
  const stalen = new Map();
  function staal(C, hout, afw, w, h) {
    const L = uiterlijk(C, hout, afw), k = L.sleutel + w + 'x' + h; if (stalen.has(k)) return stalen.get(k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    const foto = L.afb && nerfAfb(L.hout);
    if (L.verf) { g.fillStyle = L.kleur; g.fillRect(0, 0, w, h); }
    else if (foto && !L.wit && !L.donker) return foto;
    else g.drawImage(nerfCanvas(L), 0, 0, 1024 * h / 256 * 1.6, h * 1.6);
    const u = cv.toDataURL('image/png'); stalen.set(k, u); return u;
  }
  function wis() { for (const t of texCache.values()) t.dispose(); texCache.clear(); stalen.clear(); if (LV) { LV.stop(); LV = null; } }

  return { NERVEN, nerfAfb, stijl, stdStijl, uiterlijk, nerfCanvas, maak, beeld, live, zetCam, schuif, stdCam, staal, wis, load: () => ZP.view3d.load() };
})();
