// Configurator-stap Schets: de plattegrond van de trap (en het trapgat) met de pen tekenen, bv. met de Apple Pencil op de iPad.
// Pen (en muis) = tekenen, met druk; vinger = schuiven, twee vingers = zoomen (handpalm op het scherm doet niets).
// Herkennen (looplijn → model, looprichting, maten) staat in ZP.config.schetsHerken. Bewaard bij de variant: v.schets.
ui.skTool = 'loop'; ui.skVinger = false; ui.skView = null; ui.skPen = false;
const SK_KLEUR = { omtrek: '#3b2a1a', loop: '#9c5a24', gat: '#2f6f9f', vrij: '#7d7368' };
const SK_PX = { omtrek: 3.2, loop: 4.2, gat: 3.2, vrij: 2.2 };     // lijndikte in schermpixels bij gemiddelde druk
const SK_R = 10 / 16;                                                 // hoogte/breedte van het tekenvlak (gelijk aan de CSS)
const skStd = () => ({ x: -1000, y: -1000, w: 9000 });
// beeld passend om de lijnen (minstens 3 m breed)
function skFit(lijnen) {
  const ps = (lijnen || []).flatMap(l => l.p); if (!ps.length) return skStd();
  const xs = ps.map(q => q[0]), ys = ps.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(3000, (x1 - x0) * 1.3, (y1 - y0) * 1.3 / SK_R);
  return { x: Math.round((x0 + x1) / 2 - w / 2), y: Math.round((y0 + y1) / 2 - w * SK_R / 2), w: Math.round(w) };
}
// één lijn als gevuld vlak met een breedte die met de druk meegaat (pen); begin en eind rond
function skLijn(l, i) {
  const pts = l.p, kl = SK_KLEUR[l.s] || SK_KLEUR.vrij, br = (q) => l.w * (0.35 + 0.65 * ((q[2] === undefined ? 50 : q[2]) / 100)) / 2;
  const f = (x) => Math.round(x * 10) / 10;
  let s = '';
  if (pts.length === 1) s = `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="${f(br(pts[0]))}"/>`;
  else {
    const L = [], R = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, r = br(pts[k]);
      L.push(f(pts[k][0] + nx * r) + ' ' + f(pts[k][1] + ny * r)); R.push(f(pts[k][0] - nx * r) + ' ' + f(pts[k][1] - ny * r));
    }
    s = `<path d="M${L.join('L')}L${R.reverse().join('L')}z"/><circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="${f(br(pts[0]))}"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="${f(br(pts[pts.length - 1]))}"/>`;
    // looplijn: pijlpunt aan het eind (naar boven lopend)
    if (l.s === 'loop') {
      const q = pts[pts.length - 1], p0 = pts.slice().reverse().find(x => Math.hypot(x[0] - q[0], x[1] - q[1]) > l.w * 3) || pts[0], d = Math.hypot(q[0] - p0[0], q[1] - p0[1]) || 1;
      const ux = (q[0] - p0[0]) / d, uy = (q[1] - p0[1]) / d, k = l.w * 4;
      s += `<path d="M${f(q[0] + ux * k * 0.6)} ${f(q[1] + uy * k * 0.6)}L${f(q[0] - ux * k * 0.6 - uy * k * 0.6)} ${f(q[1] - uy * k * 0.6 + ux * k * 0.6)}L${f(q[0] - ux * k * 0.6 + uy * k * 0.6)} ${f(q[1] - uy * k * 0.6 - ux * k * 0.6)}z"/>`;
    }
  }
  return `<g class="sk-l sk-${l.s}" data-i="${i}" fill="${kl}">${s}</g>`;
}
// de schets als SVG: edit = groot tekenvlak met raster (1 m, 10 cm) en de herkenning erover; anders passend (overzicht, afdruk)
function skSvg(sch, o = {}) {
  const lijnen = (sch && sch.lijnen) || [];
  const vw = o.edit ? (o.view || skStd()) : skFit(lijnen), h = vw.w * SK_R, fs = Math.max(60, vw.w / 50);
  let s = '';
  if (o.edit) s += `<defs><pattern id="skg1" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" class="sk-g1"/></pattern>
      <pattern id="skg2" width="1000" height="1000" patternUnits="userSpaceOnUse"><rect width="1000" height="1000" fill="url(#skg1)"/><path d="M1000 0H0V1000" fill="none" class="sk-g2"/></pattern></defs>
      <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#skg2)" class="sk-bg"/>`;
  s += lijnen.map(skLijn).join('');
  // herkenning: rechte stukken van de looplijn met hun lengte, en het trapgat
  const H = o.herk;
  if (H && H.stukken && H.stukken.length > 1) {
    s += `<path class="sk-herk" d="M${H.stukken.map(q => Math.round(q[0]) + ' ' + Math.round(q[1])).join('L')}"/>`;
    H.stukken.slice(1).forEach((q, i) => { const a = H.stukken[i], L = Math.hypot(q[0] - a[0], q[1] - a[1]), d = L || 1, nx = -(q[1] - a[1]) / d, ny = (q[0] - a[0]) / d;
      s += `<text class="sk-maat" x="${Math.round((a[0] + q[0]) / 2 + nx * fs * 1.2)}" y="${Math.round((a[1] + q[1]) / 2 + ny * fs * 1.2)}" font-size="${Math.round(fs)}" text-anchor="middle" dominant-baseline="middle">${f0(L)}</text>`; });
  }
  if (H && H.gat) s += `<rect class="sk-gatherk" x="${H.gat.x}" y="${H.gat.y}" width="${H.gat.bx}" height="${H.gat.by}"/><text class="sk-maat gat" x="${H.gat.x + H.gat.bx / 2}" y="${H.gat.y - fs * 0.8}" font-size="${Math.round(fs)}" text-anchor="middle">trapgat ${f0(H.gat.bx)} × ${f0(H.gat.by)}</text>`;
  if (!o.edit && !lijnen.length) s += `<text x="${vw.x + vw.w / 2}" y="${vw.y + h / 2}" font-size="${Math.round(fs * 2)}" text-anchor="middle" class="sk-leeg">geen schets</text>`;
  return `<svg class="sk-svg ${o.edit ? 'edit' : 'sk-mini'} ${o.cls || ''}" viewBox="${vw.x} ${vw.y} ${vw.w} ${Math.round(h)}" preserveAspectRatio="xMidYMid meet" ${o.edit ? '' : 'aria-hidden="true"'}>${s}</svg>`;
}
const heeftSchets = (v) => !!(v && v.schets && (v.schets.lijnen || []).length);

function cfStapSchets(v) {
  const sch = v.schets || { lijnen: [] }, H = CF.schetsHerken(sch, v);
  if (!ui.skView) ui.skView = sch.lijnen.length ? skFit(sch.lijnen) : skStd();
  const tool = (k, lab) => `<button class="${ui.skTool === k ? 'on' : ''}" data-act="sktool" data-v="${k}" aria-pressed="${ui.skTool === k}">${k === 'gum' ? '<i class="sk-gumico">⌫</i>' : `<i class="sk-dot" style="background:${SK_KLEUR[k]}"></i>`}${lab}</button>`;
  const bar = `<div class="sk-bar"><div class="cf-seg sk-tools">${CF.SCHETS_SOORTEN.map(([k, lab]) => tool(k, lab)).join('')}${tool('gum', 'Gum')}</div>
    <span class="sk-acties"><button class="small" data-act="skundo" ${sch.lijnen.length ? '' : 'disabled'}>↶ Laatste lijn weg</button><button class="small" data-act="skfit">Passend</button>
      <button class="small ghost" data-act="skwis" ${sch.lijnen.length ? '' : 'disabled'}>Wissen</button>
      <label class="cf-switch" title="Zonder pen met de vinger tekenen; schuiven en zoomen dan met twee vingers"><input type="checkbox" data-bind="skvinger" ${ui.skVinger ? 'checked' : ''}><span></span>Vinger tekent</label></span></div>`;
  const uitleg = { omtrek: 'Omtrek: de buitenkant van de trap (geeft de breedte).', loop: 'Looplijn: één lijn door het midden, van de onderste trede naar boven. Daaruit volgen vorm, looprichting en lengtes.', gat: 'Trapgat: de rand van het gat in de vloer.', vrij: 'Notitie: vrij schetsen of schrijven (wordt niet herkend).', gum: 'Gum: over een lijn vegen haalt hem weg.' }[ui.skTool];
  const box = `<div class="sk-box ${ui.skTool === 'gum' ? 'gum' : ''}" id="sk">${skSvg(sch, { edit: true, view: ui.skView, herk: H })}
    <span class="sk-schaal">1 hokje = 1 m · klein hokje = 10 cm</span>${sch.lijnen.length ? '' : `<span class="sk-hint">${ui.skPen ? 'Teken met de pen' : 'Teken met de pen (of muis)'} – begin met de looplijn, van onder naar boven</span>`}</div>
    <p class="muted small sk-uitleg">${esc(uitleg)} <span class="sk-gebaren">Pen = tekenen · één vinger = schuiven · twee vingers = zoomen${ui.skVinger ? ' (vinger tekent aan: schuiven met twee vingers)' : ''}</span></p>`;
  // uitkomst van de herkenning, met een plattegrond op maat en één knop om over te nemen
  let herk;
  if (H.ok) {
    const t = JSON.parse(JSON.stringify(v)); CF.schetsToepassen(t, H);
    const ob = ZP.cf3d.opbouw(t), w = ob.bbox.x1 - ob.bbox.x0, hh = ob.bbox.y1 - ob.bbox.y0, m = Math.max(w, hh) * 0.06;
    const velden = CF.MAATVELDEN[H.vorm].map(([k, lab]) => `<span><small>${esc(lab)}</small><b>${f0(H.maten[k])} mm</b></span>`).join('');
    const zelfde = t.model === v.model && t.richting === v.richting && Object.keys(t.maten).every(k => +t.maten[k] === +v.maten[k]);
    herk = `<div class="sk-herkcard ok"><div class="sk-herkpic"><svg class="dw cf-plan cf-plan-op" viewBox="${-m} ${-m} ${w + 2 * m} ${hh + 2 * m}" aria-hidden="true">${trapPlan(t, 0, 0, w, hh)}</svg></div>
      <div class="sk-herktxt"><b class="sk-herkkop">${esc(H.melding)}</b><span class="muted small">${esc(CF.modelVan(t).sub)}</span>
        <div class="sk-maten">${velden}<span><small>Trapbreedte</small><b>${f0(H.breedte)} mm</b><em>${H.breedteBron === 'omtrek' ? 'uit de omtrek' : 'zoals de variant'}</em></span>${H.gat ? `<span><small>Trapgat</small><b>${f0(H.gat.bx)} × ${f0(H.gat.by)}</b></span>` : ''}</div>
        <div class="row wrap">${zelfde ? '<span class="pill ok">staat al zo in de variant</span>' : `<button class="primary" data-act="cfschetsneem">Overnemen in variant ${esc(v.naam)} →</button>`}
          <span class="muted small">Een schets is niet op maat: vul daarna bij Maten en hoogte de gemeten maten in.</span></div></div></div>`;
  } else herk = `<div class="sk-herkcard"><div class="sk-herktxt"><b class="sk-herkkop">Herkennen</b><span>${esc(H.melding || '')}</span>${H.gat ? `<span class="muted small">Trapgat ± ${f0(H.gat.bx)} × ${f0(H.gat.by)} mm</span>` : ''}</div></div>`;
  return cfSec('Trap schetsen', 'Teken de plattegrond zoals u hem ter plekke ziet: de looplijn, de omtrek en het trapgat. De schets blijft bij de variant (overzicht en afdruk).', bar + box) + herk;
}

// ---------- tekenen: pointer events (pen, muis, vingers) ----------
function bindSchets() {
  const box = document.getElementById('sk'); if (!box) return;
  const p = proj(), v = CF.actief(p);
  const svg = () => box.querySelector('svg'), vw = ui.skView;
  const ptrs = new Map();
  let teken = null, live = null, gebaar = null;
  // alles t.o.v. het tekenvlak zelf (binnen de rand van de kader)
  const rect = () => { const s = svg(); return (s || box).getBoundingClientRect(); };
  const mmpp = () => vw.w / (rect().width || 1);
  const naarWereld = (cx, cy) => { const r = rect(); return [vw.x + (cx - r.left) * mmpp(), vw.y + (cy - r.top) * mmpp()]; };
  const zetView = () => { const s = svg(); if (s) s.setAttribute('viewBox', `${vw.x} ${vw.y} ${vw.w} ${Math.round(vw.w * SK_R)}`); };
  const zoom = (f, cx, cy) => { const [wx, wy] = naarWereld(cx, cy), r = rect(), w = Math.max(1200, Math.min(60000, vw.w * f));
    vw.w = w; vw.x = wx - (cx - r.left) * w / r.width; vw.y = wy - (cy - r.top) * w / r.width; zetView(); };
  const druk = (e) => (e.pointerType === 'pen' ? Math.round(Math.max(0.05, e.pressure || 0.5) * 100) : 50);
  // gum: lijnen binnen bereik van het punt weghalen
  const wis = (e) => {
    const [x, y] = naarWereld(e.clientX, e.clientY), L = v.schets.lijnen, r0 = 14 * mmpp();
    const dSeg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
    for (let i = L.length - 1; i >= 0; i--) { const q = L[i].p, r = r0 + L[i].w / 2;
      if (q.length === 1 ? Math.hypot(x - q[0][0], y - q[0][1]) < r : q.slice(1).some((b, k) => dSeg(q[k], b) < r)) { L.splice(i, 1); teken.gewist = true; const g = box.querySelector(`.sk-l[data-i="${i}"]`); if (g) g.remove(); } }
  };
  const begin = (e) => {
    v.schets = v.schets || { lijnen: [] };
    teken = { id: e.pointerId, type: e.pointerType, gum: ui.skTool === 'gum' || (e.pointerType === 'pen' && (e.buttons & 32)), pts: [], soort: ui.skTool };
    if (teken.gum) return wis(e);
    const [x, y] = naarWereld(e.clientX, e.clientY); teken.pts.push([x, y, druk(e)]);
    live = document.createElementNS('http://www.w3.org/2000/svg', 'path'); live.setAttribute('class', 'sk-live');
    live.setAttribute('stroke', SK_KLEUR[teken.soort] || SK_KLEUR.vrij); live.setAttribute('stroke-width', SK_PX[teken.soort] * mmpp());
    live.setAttribute('d', `M${x} ${y}`); svg().appendChild(live);
  };
  const verder = (e) => {
    if (teken.gum) return wis(e);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], min = 0.8 * mmpp();
    for (const c of (evs.length ? evs : [e])) { const [x, y] = naarWereld(c.clientX, c.clientY), l = teken.pts[teken.pts.length - 1];
      if (Math.hypot(x - l[0], y - l[1]) >= min) teken.pts.push([x, y, druk(c)]); }
    live.setAttribute('d', 'M' + teken.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'));
  };
  const klaar = (bewaar) => {
    const t = teken; teken = null; if (live) { live.remove(); live = null; }
    if (!t) return;
    if (t.gum) { if (t.gewist) { save(); render(); } return; }
    if (!bewaar) return;
    const tol = 0.5 * mmpp(), pts = CF.vereenvoudig(t.pts, tol).map(q => [Math.round(q[0]), Math.round(q[1]), q[2]]);
    v.schets.lijnen.push({ s: t.soort, w: Math.round(SK_PX[t.soort] * mmpp() * 10) / 10, p: pts });
    save(); render();
  };
  // twee vingers: zoomen en schuiven; één vinger: schuiven
  const gebaarStart = () => {
    const t = [...ptrs.values()].filter(x => x.type === 'touch' || x.type === 'mouse');
    if (!t.length) { gebaar = null; return; }
    const c = t.length > 1 ? [(t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2] : [t[0].x, t[0].y];
    gebaar = { n: t.length, c, d: t.length > 1 ? Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) : 0, v: Object.assign({}, vw), w: naarWereld(c[0], c[1]) };
  };
  const gebaarVerder = () => {
    const t = [...ptrs.values()].filter(x => x.type === 'touch' || x.type === 'mouse'); if (!gebaar || t.length !== gebaar.n) return gebaarStart();
    const c = t.length > 1 ? [(t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2] : [t[0].x, t[0].y], r = rect();
    const w = t.length > 1 && gebaar.d > 10 ? Math.max(1200, Math.min(60000, gebaar.v.w * gebaar.d / (Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1))) : gebaar.v.w;
    vw.w = w; vw.x = gebaar.w[0] - (c[0] - r.left) * w / r.width; vw.y = gebaar.w[1] - (c[1] - r.top) * w / r.width; zetView();
  };
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && !ui.skPen) { ui.skPen = true; ui.skVinger = false; const hint = box.querySelector('.sk-hint'); if (hint) hint.textContent = 'Teken met de pen – begin met de looplijn, van onder naar boven'; }
    // handpalm/vinger terwijl de pen tekent: negeren
    if (e.pointerType === 'touch' && teken && teken.type === 'pen') return;
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    if (e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0)) { ptrs.clear(); gebaar = null; if (teken) klaar(false); return begin(e); }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'touch' && ui.skVinger && !ui.skPen && ptrs.size === 1 && !teken) return begin(e);
    // tweede vinger bij tekenen met de vinger: korte lijn vervalt, dan zoomen
    if (teken && teken.type === 'touch') { if (teken.pts.length < 12 || teken.gum) klaar(false); else { const id = teken.id; klaar(true); ptrs.delete(id); return; } }
    gebaarStart();
  });
  box.addEventListener('pointermove', (e) => {
    if (teken && e.pointerId === teken.id) { e.preventDefault(); return verder(e); }
    const q = ptrs.get(e.pointerId); if (!q) return;
    e.preventDefault(); q.x = e.clientX; q.y = e.clientY; gebaarVerder();
  });
  const eind = (e) => {
    if (teken && e.pointerId === teken.id) return klaar(e.type !== 'pointercancel' || teken.pts.length > 3);
    if (ptrs.delete(e.pointerId)) gebaarStart();
  };
  box.addEventListener('pointerup', eind); box.addEventListener('pointercancel', eind);
  box.addEventListener('lostpointercapture', (e) => { if (teken && e.pointerId === teken.id) klaar(true); });
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  // muiswiel = zoomen (computer); rechtermuisknop/middelste knop = schuiven (via ptrs met type mouse)
  box.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  // iOS: geen tekstselectie/vergrootglas bij lang drukken
  box.addEventListener('touchstart', (e) => { if (e.touches.length) e.preventDefault(); }, { passive: false });
}

CLICK.push(function click_schets(a, t, v, p, e) {
  switch (a) {
    case 'sktool': ui.skTool = v; render(); break;
    case 'skfit': { const x = CF.actief(p); ui.skView = skFit((x.schets || {}).lijnen); render(); break; }
    case 'skundo': { const x = CF.actief(p); if (x.schets && x.schets.lijnen.length) { x.schets.lijnen.pop(); save(); } render(); break; }
    case 'skwis': { const x = CF.actief(p); if (x.schets && confirm('De hele schets van deze variant wissen?')) { x.schets.lijnen = []; ui.skView = skStd(); save(); } render(); break; }
    // herkende vorm overnemen (begint met cf: gaat ook automatisch door naar de begroting)
    case 'cfschetsneem': {
      const x = CF.actief(p), h = CF.schetsHerken(x.schets, x);
      if (!CF.schetsToepassen(x, h)) { ui.msg = { text: h.melding || 'Niets herkend.', kind: 'err' }; render(); break; }
      ui.msg = { text: `Overgenomen in variant ${x.naam}: ${CF.modelVan(x).naam}${h.vorm !== 'recht' ? (x.richting === 'rechts' ? ', rechtsom' : ', linksom') : ''}. Vul hier de gemeten maten in.`, kind: 'ok' };
      p.config.stap = 'type'; save(); render(); window.scrollTo(0, 0); break;
    }
    default: return false;
  }
});
CHANGE.push(function change_schets(b, t, p) {
  switch (b) {
    case 'skvinger': ui.skVinger = t.checked; if (t.checked) ui.skPen = false; render(); return 'skip';
    default: return false;
  }
});
