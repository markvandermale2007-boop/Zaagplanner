// Opstelling (in de 3D van de begroting): ingelezen trappen per verdieping plaatsen, vloeren met trapgat,
// wanden (met kleur) en balustrades tekenen op de plattegrond per verdieping. Logica in js/opstelling.js (ZP.ops).
ui.opsTool = 'wand'; ui.opsVl = null; ui.opsStart = null; ui.opsBal = null;
const OPS_KLEUREN = ['#ece6dc', '#ffffff', '#d9d4cb', '#b9c3c9', '#d8c3a5', '#9aa79a', '#4b4b4b'];
const opsVloer = (o) => o.vloeren.find(v => v.id === ui.opsVl) || o.vloeren.find(v => v.gat) || o.vloeren[0];
// ongedaan maken: kopie van de opstelling vóór elke wijziging (per project, max. 40)
ui.opsUndo = [];
function opsBewaar(p) { ui.opsUndo.push({ pid: p.id, s: JSON.stringify(p.opstelling) }); if (ui.opsUndo.length > 40) ui.opsUndo.shift(); }
const opsUndoN = (p) => ui.opsUndo.filter(u => u.pid === p.id).length;
// afstand van punt q tot lijnstuk a–b (mm)
const opsAfst = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
const opsPeilBoven =(o, vl) => { const n = o.vloeren.filter(v => v.z > vl.z).sort((a, b) => a.z - b.z)[0]; return n ? n.z - vl.z : 2600; };

// plattegrond van één verdieping (raster in mm, y omlaag): trappen die hier beginnen (vol) en hier aankomen (licht),
// trapgat, wanden en balustrades van deze vloer; klikken = tekenen met het gekozen gereedschap
function opsSvg(p, o, vl, edit) {
  const O = ZP.ops, c = C();
  const trappen = Object.entries(o.trappen).filter(([sid]) => p.stairs.some(s => s.id === sid));
  const hier = trappen.filter(([, t]) => Math.abs((t.z || 0) - vl.z) < 5), aan = trappen.filter(([, t]) => Math.abs((t.z || 0) + (t.h || 0) - vl.z) < 5);
  const wanden = o.wanden.filter(w => w.vloer === vl.id), bals = o.balustrades.filter(b => b.vloer === vl.id), gat = O.gatHoeken(vl.gat);
  // label boven de trap die hier begint, onder de trap die hier aankomt (vallen anders over elkaar)
  const voet = (lijst, cls) => lijst.map(([sid, t]) => { const T = O.trafo(O.metMesh(p, sid), t), onder = cls === 'ops-aan';
    return O.voetafdruk(p, sid, t).map(h => `<path d="M${h.map(q => q.map(Math.round).join(' ')).join('L')}z" class="${cls}"/>`).join('')
      + `<text x="${t.x + 60}" y="${onder ? t.y + T.d + 200 : t.y - 80}" class="ops-tlbl ${onder ? 'aan' : ''}">${onder ? 'komt aan: ' : ''}${esc(stairCode(p, sid))} · ${esc((p.stairs.find(s => s.id === sid) || {}).name || '')}</text>`; }).join('');
  // omvang
  const pts = [...gat, ...wanden.flatMap(w => [w.a, w.b]), ...bals.flatMap(b => b.punten)];
  for (const [sid, t] of hier.concat(aan)) for (const h of O.voetafdruk(p, sid, t)) pts.push(...h);
  const W = Math.max(6000, ...pts.map(q => Math.ceil((q[0] + 1500) / 1000) * 1000)), H = Math.max(5000, ...pts.map(q => Math.ceil((q[1] + 1500) / 1000) * 1000));
  let s = `<rect x="0" y="0" width="${W}" height="${H}" class="vb-bg"/>`;
  if (edit) {
    for (let x = 0; x <= W; x += 100) s += `<path d="M${x} 0V${H}" class="${x % 1000 ? 'vb-g1' : 'vb-g2'}"/>`;
    for (let y = 0; y <= H; y += 100) s += `<path d="M0 ${y}H${W}" class="${y % 1000 ? 'vb-g1' : 'vb-g2'}"/>`;
    for (let x = 1000; x < W; x += 1000) s += `<text x="${x + 30}" y="160" class="vb-ax">${x / 1000} m</text>`;
    for (let y = 1000; y < H; y += 1000) s += `<text x="30" y="${y - 30}" class="vb-ax">${y / 1000} m</text>`;
  }
  if (gat.length >= 3) s += `<path d="M${gat.map(q => q.join(' ')).join('L')}z" class="vb-gat"/>`;
  s += voet(aan, 'ops-aan') + voet(hier, 'ops-hier');
  for (const w of wanden) {
    s += `<path d="M${w.a.join(' ')}L${w.b.join(' ')}" class="ops-wandrand" stroke-width="${(+w.d || 100) + 24}"/><path d="M${w.a.join(' ')}L${w.b.join(' ')}" class="ops-wand" stroke="${esc(w.kleur || o.wandKleur)}" stroke-width="${+w.d || 100}"/>`;
    const L = Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])), mx = (w.a[0] + w.b[0]) / 2, my = (w.a[1] + w.b[1]) / 2;
    if (edit) s += `<text x="${mx}" y="${my - 110}" class="vb-maat" text-anchor="middle">${L}</text>`;
  }
  for (const b of bals) {
    const sp = c.spijltypes.find(x => x.id === b.spijl) || { breedte: 40 }, step = (+sp.breedte || 40) + (+b.tussen || 100);
    for (let i = 1; i < b.punten.length; i++) { const A = b.punten[i - 1], Q = b.punten[i], L = Math.hypot(Q[0] - A[0], Q[1] - A[1]); if (!L) continue;
      s += `<path d="M${A.join(' ')}L${Q.join(' ')}" class="vb-line ${b.id === ui.opsBal ? 'act' : ''}"/>`;
      for (let d = step; d < L - step / 2; d += step) s += `<circle cx="${A[0] + (Q[0] - A[0]) * d / L}" cy="${A[1] + (Q[1] - A[1]) * d / L}" r="${Math.max(12, (+sp.breedte || 40) / 2)}" class="vb-spijl"/>`; }
    b.punten.forEach(([x, y]) => { s += `<rect x="${x - 50}" y="${y - 50}" width="100" height="100" class="vb-paal"/>`; });
  }
  if (edit) {
    const hnd = (q, k, id, i, tip) => `<circle cx="${q[0]}" cy="${q[1]}" r="110" class="vb-handle ops-h ${k}" data-k="${k}" data-id="${id}" data-i="${i}"><title>${tip}</title></circle>`;
    if (ui.opsTool === 'wand') for (const w of wanden) s += hnd(w.a, 'wa', w.id, 0, 'Slepen = verplaatsen') + hnd(w.b, 'wb', w.id, 1, 'Slepen = verplaatsen');
    if (ui.opsTool === 'bal') for (const b of bals) b.punten.forEach((q, i) => { s += hnd(q, 'bal', b.id, i, 'Slepen = verplaatsen, dubbelklik = weghalen'); });
    if (ui.opsTool === 'gat' && vl.gat && vl.gat.punten) vl.gat.punten.forEach((q, i) => { s += hnd(q, 'gat', vl.id, i, 'Slepen = verplaatsen, dubbelklik = weghalen'); });
    if (ui.opsTool === 'wand' && ui.opsStart) s += `<circle cx="${ui.opsStart[0]}" cy="${ui.opsStart[1]}" r="90" class="ops-start"/>`;
  }
  return `<svg class="vb-svg ops-svg ${edit && ui.opsTool === 'wis' ? 'ops-wis' : ''}" viewBox="0 0 ${W} ${H}" ${edit ? `data-act="opsklik" data-v="${vl.id}"` : 'aria-hidden="true"'}>${s}</svg>`;
}
// klikpunt: raster 50 mm, vastklikken op wand-eindpunten, hoeken van trapgat en trap, haaks t.o.v. het vorige punt
function opsSnap(p, o, vl, q, prev) {
  let x = Math.round(q.x / 50) * 50, y = Math.round(q.y / 50) * 50;
  const vast = [...ZP.ops.gatHoeken(vl.gat), ...o.wanden.filter(w => w.vloer === vl.id).flatMap(w => [w.a, w.b])];
  for (const [sid, t] of Object.entries(o.trappen)) if (p.stairs.some(s => s.id === sid)) { const T = ZP.ops.trafo(ZP.ops.metMesh(p, sid), t); vast.push([t.x, t.y], [t.x + T.w, t.y], [t.x + T.w, t.y + T.d], [t.x, t.y + T.d]); }
  const hit = vast.find(h => Math.hypot(h[0] - q.x, h[1] - q.y) < 160); if (hit) return [Math.round(hit[0]), Math.round(hit[1])];
  if (prev) { const dx = x - prev[0], dy = y - prev[1]; if (Math.abs(dy) < Math.abs(dx) * 0.14) y = prev[1]; else if (Math.abs(dx) < Math.abs(dy) * 0.14) x = prev[0]; }
  return [Math.max(0, x), Math.max(0, y)];
}
function opsCard(p) {
  const o = ZP.ops.ensure(p), c = C(), vl = opsVloer(o); ui.opsVl = vl.id;
  const ni = (bind, attrs, val, w = 'w4') => `<input class="${w} num" data-bind="${bind}" ${attrs} value="${Math.round(+val || 0)}">`;
  const trappen = Object.entries(o.trappen).filter(([sid]) => p.stairs.some(s => s.id === sid)).map(([sid, t]) => { const st = p.stairs.find(s => s.id === sid);
    return `<tr><th>${esc(stairCode(p, sid))} · ${esc(st.name)}</th><td>${ni('opstrap', `data-s="${sid}" data-f="x"`, t.x)}</td><td>${ni('opstrap', `data-s="${sid}" data-f="y"`, t.y)}</td>
      <td>${ni('opstrap', `data-s="${sid}" data-f="z"`, t.z, 'w5')}</td><td><select data-bind="opstrap" data-s="${sid}" data-f="rot">${ZP.ops.ROT.map(r => `<option value="${r}" ${+t.rot === r ? 'selected' : ''}>${r}°</option>`).join('')}</select></td>
      <td class="muted small">${f0(t.h)} mm → peil ${f0((t.z || 0) + (t.h || 0))}</td></tr>`; }).join('');
  const tabs = o.vloeren.map(v => `<button class="cf-vbtab ${v === vl ? 'on' : ''}" data-act="opsvl" data-v="${v.id}"><span><b>${esc(v.naam)}</b><small>peil ${f1(v.z / 1000)} m</small></span></button>`).join('')
    + `<button class="small" data-act="opsvladd" title="Extra vloer (bv. zolder zonder trap)">+ Vloer</button>`
    + (ZP.ops.kelder(o) ? '' : `<button class="small" data-act="opskelder" title="Keldervloer onder de begane grond; de keldertrap komt uit in de begane grond (trapgat en balustrade daar)">+ Kelder</button>`);
  const g = vl.gat, eigen = !!(g && g.punten), tool = (k, lab) => `<button class="${ui.opsTool === k ? 'on' : ''}" data-act="opstool" data-v="${k}">${lab}</button>`;
  // de onderste vloer (kelder, of de begane grond zonder kelder) heeft geen trapgat
  const onderste = vl === o.vloeren[0];
  const kelderTrappen = vl.kelder || vl.z < 0 ? Object.entries(o.trappen).filter(([sid]) => p.stairs.some(s => s.id === sid)) : [];
  const kelderHtml = kelderTrappen.length ? `<div class="cf-vbgat ops-kelder"><b>Keldertrap</b>${kelderTrappen.map(([sid, t]) => Math.abs((t.z || 0) - vl.z) < 5
      ? `<span class="small">${esc(stairCode(p, sid))} begint hier</span> <button class="small ghost" data-act="opskeldertrap" data-v="${sid}" data-k="0">terug naar begane grond</button>`
      : `<button class="small" data-act="opskeldertrap" data-v="${sid}" data-k="1" title="Deze trap begint in de kelder en komt uit in de begane grond (trapgat en balustrade daar)">${esc(stairCode(p, sid))} · ${esc((p.stairs.find(s => s.id === sid) || {}).name || '')} = keldertrap</button>`).join(' ')}</div>` : '';
  const gatHtml = onderste ? `<span class="muted small">${esc(vl.naam.toLowerCase())}: onderste vloer, geen trapgat</span>` : !g ? `<span class="muted small">geen trapgat</span> <button class="small" data-act="opsgatstd" data-v="${vl.id}">Trapgat volgens trap</button>`
    : `<div class="cf-seg"><button class="${!eigen ? 'on' : ''}" data-act="opsgatvorm" data-v="recht">Rechthoek</button><button class="${eigen ? 'on' : ''}" data-act="opsgatvorm" data-v="eigen">Eigen vorm</button></div>
      ${eigen ? `<span class="muted small">${g.punten.length} hoekpunten – teken met "Trapgat"</span>` : `<label>x ${ni('opsgat', 'data-f="x"', g.x)}</label><label>y ${ni('opsgat', 'data-f="y"', g.y)}</label><label>breedte ${ni('opsgat', 'data-f="bx"', g.bx, 'w5')}</label><label>lengte ${ni('opsgat', 'data-f="by"', g.by, 'w5')}</label>`}
      <button class="small ghost" data-act="opsgatstd" data-v="${vl.id}" title="Trapgat = voetafdruk van de trap die hier uitkomt">volgens trap</button><button class="small ghost" data-act="opsgatweg" data-v="${vl.id}">geen trapgat</button>`;
  const wanden = o.wanden.filter(w => w.vloer === vl.id).map(w => `<tr><td><input type="color" data-bind="opswand" data-id="${w.id}" data-f="kleur" value="${esc(w.kleur || o.wandKleur)}" title="Kleur van deze wand"></td>
      <td>${ni('opswand', `data-id="${w.id}" data-f="a.0"`, w.a[0])} ${ni('opswand', `data-id="${w.id}" data-f="a.1"`, w.a[1])}</td><td>${ni('opswand', `data-id="${w.id}" data-f="b.0"`, w.b[0])} ${ni('opswand', `data-id="${w.id}" data-f="b.1"`, w.b[1])}</td>
      <td class="num">${f0(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]))}</td>
      <td>${ni('opswand', `data-id="${w.id}" data-f="za"`, w.za)} ${ni('opswand', `data-id="${w.id}" data-f="zb"`, w.zb == null ? w.za : w.zb)}</td>
      <td>${ni('opswand', `data-id="${w.id}" data-f="h"`, w.h)} ${ni('opswand', `data-id="${w.id}" data-f="hb"`, w.hb == null ? w.h : w.hb)}</td><td>${ni('opswand', `data-id="${w.id}" data-f="d"`, w.d, 'w3')}</td>
      <td><button class="ghost small" data-act="opswanddel" data-v="${w.id}" title="Wand weghalen">✕</button></td></tr>`).join('');
  const bals = o.balustrades.filter(b => b.vloer === vl.id).map(b => `<tr class="${b.id === ui.opsBal ? 'on' : ''}"><td><a href="#" data-act="opsbalsel" data-v="${b.id}">${f2(ZP.ops.lengte(b.punten) / 1000)} m</a></td>
      <td><select data-bind="opsbal" data-id="${b.id}" data-f="spijl">${opts(c.spijltypes.map(s => [s.id, s.naam]), b.spijl)}</select></td><td>${ni('opsbal', `data-id="${b.id}" data-f="tussen"`, b.tussen, 'w3')} mm</td>
      <td><label><input type="checkbox" data-bind="opsbal" data-id="${b.id}" data-f="onderslof" ${b.onderslof ? 'checked' : ''}> onderslof</label></td><td><button class="ghost small" data-act="opsbaldel" data-v="${b.id}" title="Balustrade weghalen">✕</button></td></tr>`).join('');
  const tip = { wand: ui.opsStart ? 'Klik het eindpunt van de wand (de volgende wand begint daar). Klaar? Klik "Stop" of druk Esc.' : 'Klik het begin van een wand, dan het eind. Punten klikken vast op het raster, de trap en andere wanden.',
    bal: 'Klik de hoekpunten van de balustrade. "Nieuwe balustrade" begint een losse. Dubbelklik op een hoekpunt = punt weg.', gat: 'Klik de hoekpunten van het trapgat (eigen vorm).',
    wis: 'Klik op een wand of balustrade om hem weg te halen. Per ongeluk? "Ongedaan maken".' }[ui.opsTool];
  const nU = opsUndoN(p);
  return `<div class="ops">
    <h4>Trappen plaatsen</h4><p class="muted small">Elke trap uit StairDesigner op zijn plek: x/y = linksboven in de plattegrond, onderkant = vloerpeil waar de trap begint. Zo staat bv. de zoldertrap boven de verdiepingstrap.</p>
    <table class="tbl ops-trap"><thead><tr><th>Trap</th><th>x</th><th>y</th><th>onderkant (peil)</th><th>draaiing</th><th>hoogte</th></tr></thead><tbody>${trappen}</tbody></table>
    <h4>Verdiepingen</h4><div class="cf-vbtabs">${tabs}</div>
    <div class="ops-vl"><label>Naam <input data-bind="opsvl" data-f="naam" value="${esc(vl.naam)}"></label><label>Peil ${ni('opsvl', 'data-f="z"', vl.z, 'w5')} mm</label>${vl.z ? `<button class="ghost small danger" data-act="opsvldel" data-v="${vl.id}">Vloer weghalen</button>` : ''}</div>
    ${kelderHtml}<div class="cf-vbgat"><b>Trapgat</b>${gatHtml}</div>
    <div class="cf-vbgat"><b>Tekenen</b><div class="cf-seg">${tool('wand', 'Wand')}${tool('bal', 'Balustrade')}${!onderste && g ? tool('gat', 'Trapgat') : ''}${tool('wis', '⌫ Gum')}</div>
      <button class="small" data-act="opsundo" ${nU ? '' : 'disabled'} title="Laatste wijziging in de opstelling terugdraaien">↶ Ongedaan maken${nU ? ` (${nU})` : ''}</button>
      ${ui.opsTool === 'wand' && ui.opsStart ? '<button class="small" data-act="opsstop">Stop</button>' : ''}${ui.opsTool === 'bal' ? '<button class="small" data-act="opsbalnieuw">Nieuwe balustrade</button>' : ''}<span class="muted small">${tip}</span></div>
    <div class="cf-vbcanvas ops-canvas">${opsSvg(p, o, vl, true)}</div>
    <div class="row wrap"><b class="small">Wanden op ${esc(vl.naam.toLowerCase())}</b><span class="small">kleur voor alle wanden</span>${OPS_KLEUREN.map(k => `<button class="ops-kl ${k === o.wandKleur ? 'on' : ''}" style="background:${k}" data-act="opskleur" data-v="${k}" title="${k}"></button>`).join('')}<input type="color" data-bind="opskleur" value="${esc(o.wandKleur)}" title="Eigen kleur"></div>
    ${wanden ? `<table class="tbl ops-tbl"><thead><tr><th>kleur</th><th>begin x · y</th><th>eind x · y</th><th class="num">lengte</th><th title="Hoogte van de onderkant boven de vloer, bij het begin en bij het eind. Verschillend = de wand loopt schuin mee met de trap of keepboom.">onderkant z begin · eind</th><th title="Hoogte van de wand bij het begin en bij het eind">hoogte begin · eind</th><th>dikte</th><th></th></tr></thead><tbody>${wanden}</tbody></table>
    <p class="muted small">Wand langs de trap of keepboom: geef begin en eind een andere onderkant (z) of hoogte, dan loopt de wand schuin mee. Bijvoorbeeld onderkant 0 · 2700 en hoogte 1000 · 1000 = een strook van 1 m die met de trap mee omhoog loopt.</p>` : '<p class="muted small">Nog geen wanden op deze vloer.</p>'}
    <b class="small">Balustrades op ${esc(vl.naam.toLowerCase())}</b> <span class="muted small">komen als "op de verdieping" in de begroting</span>
    ${bals ? `<table class="tbl ops-tbl"><tbody>${bals}</tbody></table>` : '<p class="muted small">Nog geen balustrades op deze vloer.</p>'}
    ${CONFIGURATOR && p.config && p.config.toegepast && (CF.gekozen(p) || {}).vloerBal && CF.gekozen(p).vloerBal.length ? `<button class="small" data-act="opsvancfg" title="Balustrades uit de configurator, geplaatst bij de trap die op die vloer uitkomt">Balustrades uit de configurator overnemen</button>` : ''}
  </div>`;
}
// slepen van eindpunten (wand) en hoekpunten (balustrade, trapgat); dubbelklik = punt weg
function bindOps() {
  const box = document.querySelector('.ops-canvas'); if (!box) return;
  const p = proj(), o = p && p.opstelling; if (!o) return;
  const ptOf = (k, id, i) => k === 'wa' || k === 'wb' ? o.wanden.find(w => w.id === id) : k === 'bal' ? o.balustrades.find(b => b.id === id) : o.vloeren.find(v => v.id === id);
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.ops-h'); if (!h) return; e.preventDefault();
    const k = h.dataset.k, id = h.dataset.id, i = +h.dataset.i, x = ptOf(k, id), vl = opsVloer(o); if (!x) return;
    const move = (ev) => { const svg = box.querySelector('svg'); if (!svg) return; const q = vbPunt(svg, ev); if (!ui.opsDrag) opsBewaar(p);
      if (k === 'wa') x.a = opsSnap(p, o, vl, q, x.b); else if (k === 'wb') x.b = opsSnap(p, o, vl, q, x.a);
      else if (k === 'bal') x.punten[i] = opsSnap(p, o, vl, q, x.punten[i - 1]); else x.gat.punten[i] = opsSnap(p, o, vl, q, x.gat.punten[i - 1]);
      ui.opsDrag = true; box.innerHTML = opsSvg(p, o, vl, true); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (ui.opsDrag) { ZP.ops.naarBegroting(p, C()); save(); render(); } setTimeout(() => { ui.opsDrag = false; }, 0); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  box.addEventListener('dblclick', (e) => { const h = e.target.closest('.ops-h'); if (!h) return; const k = h.dataset.k, x = ptOf(k, h.dataset.id);
    if (k === 'bal' || k === 'gat') opsBewaar(p);
    if (k === 'bal') x.punten.splice(+h.dataset.i, 1); else if (k === 'gat') x.gat.punten.splice(+h.dataset.i, 1); else return; ZP.ops.naarBegroting(p, C()); save(); render(); });
}

CLICK.push(function click_opstelling(a, t, v, p, e) {
  const o = p && p.opstelling, vl = o && opsVloer(o);
  if (o && ['opskleur', 'opsvladd', 'opskelder', 'opsgatstd', 'opsgatweg', 'opsgatvorm', 'opsvancfg'].includes(a)) opsBewaar(p);
  switch (a) {
    case 'opsaan': { const x = ZP.ops.ensure(p); x.aan = !x.aan; ui.opsStart = null; save(); render(); break; }
    case 'opsvl': ui.opsVl = v; ui.opsStart = null; ui.opsBal = null; render(); break;
    case 'opstool': ui.opsTool = v; ui.opsStart = null; render(); break;
    case 'opsstop': ui.opsStart = null; render(); break;
    case 'opsklik': {
      if (!o || !t.getScreenCTM || ui.opsDrag || e.target.closest('.ops-h')) break;
      const q = vbPunt(t, e);
      if (ui.opsTool === 'wis') {
        // dichtstbijzijnde wand of balustrade onder de klik weghalen
        const qq = [q.x, q.y]; let best = null;
        for (const w of o.wanden) if (w.vloer === vl.id) { const d = opsAfst(qq, w.a, w.b) - (+w.d || 100) / 2; if (d < 120 && (!best || d < best.d)) best = { d, w }; }
        for (const b of o.balustrades) if (b.vloer === vl.id) for (let i = 0; i < b.punten.length; i++) { const d = opsAfst(qq, b.punten[Math.max(0, i - 1)], b.punten[i]) - 50; if (d < 120 && (!best || d < best.d)) best = { d, b }; }
        if (!best) { ui.msg = { text: 'Hier ligt geen wand of balustrade. Klik op de lijn zelf.', kind: 'warn' }; render(); break; }
        opsBewaar(p);
        if (best.w) o.wanden = o.wanden.filter(x => x !== best.w); else { o.balustrades = o.balustrades.filter(x => x !== best.b); if (ui.opsBal === best.b.id) ui.opsBal = null; ZP.ops.naarBegroting(p, C()); }
        ui.msg = { text: best.w ? 'Wand weggehaald.' : 'Balustrade weggehaald.', kind: 'ok' }; save(); render(); break;
      }
      if (ui.opsTool === 'wand') {
        const pt = opsSnap(p, o, vl, q, ui.opsStart);
        if (!ui.opsStart) { ui.opsStart = pt; render(); break; }
        if (pt[0] === ui.opsStart[0] && pt[1] === ui.opsStart[1]) { ui.opsStart = null; render(); break; }
        opsBewaar(p); o.wanden.push({ id: ZP.ops.uid('w'), vloer: vl.id, a: ui.opsStart, b: pt, h: opsPeilBoven(o, vl), d: 100, kleur: o.wandKleur }); ui.opsStart = pt; save(); render(); break;
      }
      opsBewaar(p);
      if (ui.opsTool === 'gat' && vl.gat) { vl.gat.punten = vl.gat.punten || []; vl.gat.punten.push(opsSnap(p, o, vl, q, vl.gat.punten[vl.gat.punten.length - 1])); save(); render(); break; }
      // balustrade: punt erbij aan de gekozen balustrade (of een nieuwe)
      let b = o.balustrades.find(x => x.id === ui.opsBal && x.vloer === vl.id);
      if (!b) { const c = C(); b = { id: ZP.ops.uid('ob'), vloer: vl.id, punten: [], spijl: (c.spijltypes[0] || {}).id || '', tussen: 100, onderslof: true }; o.balustrades.push(b); ui.opsBal = b.id; }
      b.punten.push(opsSnap(p, o, vl, q, b.punten[b.punten.length - 1])); ZP.ops.naarBegroting(p, C()); save(); render(); break;
    }
    case 'opsundo': {
      const i = ui.opsUndo.map(u => u.pid).lastIndexOf(p.id); if (i < 0) break;
      // zelfde object houden (andere code houdt er een verwijzing naar vast), inhoud terugzetten
      const u = ui.opsUndo.splice(i, 1)[0], terug = JSON.parse(u.s); for (const k of Object.keys(o)) delete o[k]; Object.assign(o, terug); ui.opsStart = null;
      if (!p.opstelling.balustrades.some(b => b.id === ui.opsBal)) ui.opsBal = null;
      ZP.ops.naarBegroting(p, C()); ui.msg = { text: 'Laatste wijziging ongedaan gemaakt.', kind: 'ok' }; save(); render(); break;
    }
    case 'opsbalnieuw': ui.opsBal = null; ui.opsTool = 'bal'; render(); break;
    case 'opsbalsel': ui.opsBal = v; ui.opsTool = 'bal'; render(); break;
    case 'opsbaldel': opsBewaar(p); o.balustrades = o.balustrades.filter(b => b.id !== v); ZP.ops.naarBegroting(p, C()); save(); render(); break;
    case 'opswanddel': opsBewaar(p); o.wanden = o.wanden.filter(w => w.id !== v); save(); render(); break;
    case 'opskleur': o.wandKleur = v; for (const w of o.wanden) w.kleur = v; save(); render(); break;
    case 'opsvladd': { const top = o.vloeren[o.vloeren.length - 1], n = { id: ZP.ops.uid('vl'), naam: 'Vloer ' + (o.vloeren.length), z: (top ? top.z : 0) + 2700, gat: null }; o.vloeren.push(n); ui.opsVl = n.id; save(); render(); break; }
    case 'opskelder': { const k = ZP.ops.kelderErbij(p); ui.opsVl = k.id; ui.opsStart = null;
      ui.msg = { text: 'Keldervloer toegevoegd. Kies hieronder welke trap naar de kelder gaat; het trapgat komt dan in de begane grond.', kind: 'ok' }; save(); render(); break; }
    case 'opskeldertrap': { const k = ZP.ops.kelder(o), tr = o.trappen[v]; if (!k || !tr) break; opsBewaar(p);
      // keldertrap: kelderpeil = −trap hoogte, zodat de trap precies in de begane grond uitkomt
      if (t.dataset.k === '1') { k.z = -(tr.h || 2600); ZP.ops.trapNaarPeil(p, v, k.z); ui.opsVl = k.id; } else ZP.ops.trapNaarPeil(p, v, 0);
      ZP.ops.naarBegroting(p, C()); save(); render(); break; }
    case 'opsvldel': if (o.vloeren.find(x => x.id === v && x.z < 0)) { if (confirm('De keldervloer met zijn wanden en balustrades weghalen? Een keldertrap gaat terug naar de begane grond.')) { opsBewaar(p); ZP.ops.kelderWeg(p); ui.opsVl = null; ZP.ops.naarBegroting(p, C()); save(); render(); } break; }
      if (confirm('Deze vloer met zijn wanden en balustrades weghalen?')) { opsBewaar(p); o.vloeren = o.vloeren.filter(x => x.id !== v); o.wanden = o.wanden.filter(w => w.vloer !== v); o.balustrades = o.balustrades.filter(b => b.vloer !== v); ui.opsVl = null; ZP.ops.naarBegroting(p, C()); save(); render(); } break;
    case 'opsgatstd': { const x = o.vloeren.find(y => y.id === v); if (x) ZP.ops.gatVolgensTrap(p, x); if (x && !x.gat) x.gat = { x: 1000, y: 1000, bx: 1000, by: 2500 }; save(); render(); break; }
    case 'opsgatweg': { const x = o.vloeren.find(y => y.id === v); if (x) x.gat = null; save(); render(); break; }
    case 'opsgatvorm': {
      const g = vl.gat; if (!g) break;
      if (v === 'eigen') { if (!g.punten) g.punten = ZP.ops.gatHoeken(g); ui.opsTool = 'gat'; }
      else if (g.punten) { const xs = g.punten.map(q => q[0]), ys = g.punten.map(q => q[1]); Object.assign(g, { x: Math.min(...xs), y: Math.min(...ys), bx: Math.max(...xs) - Math.min(...xs), by: Math.max(...ys) - Math.min(...ys) }); delete g.punten; if (ui.opsTool === 'gat') ui.opsTool = 'wand'; }
      save(); render(); break;
    }
    case 'opsvancfg': {
      // balustrades van de configurator: hun raster ligt t.o.v. de trap (b.trap); hier geplaatst t.o.v. de trap die op die vloer uitkomt
      const vv = CF.gekozen(p); if (!vv) break; let n = 0;
      for (const b of vv.vloerBal) {
        if (b.punten.length < 2) continue;
        const doel = o.vloeren.find(x => x.naam.toLowerCase() === String(b.vloer).toLowerCase()) || o.vloeren.find(x => Math.abs(x.z - (+b.hoogte || 0)) < 5) || o.vloeren.find(x => x.gat);
        if (!doel) continue;
        const sid = doel.trap || Object.keys(o.trappen)[0], t = o.trappen[sid], tp = CF.trapPos(b);
        o.balustrades = o.balustrades.filter(x => x.cfg !== b.id);
        o.balustrades.push({ id: ZP.ops.uid('ob'), cfg: b.id, vloer: doel.id, punten: b.punten.map(q => [Math.round(q[0] - tp.x + t.x), Math.round(q[1] - tp.y + t.y)]), spijl: b.spijl, tussen: b.tussen, onderslof: b.onderslof }); n++;
      }
      ZP.ops.naarBegroting(p, C()); ui.msg = { text: `${n} balustrade(s) overgenomen uit de configurator.`, kind: 'ok' }; save(); render(); break;
    }
    default: return false;
  }
});
CHANGE.push(function change_opstelling(b, t, p, part, numv) {
  const o = p && p.opstelling; if (!o || !/^ops/.test(b)) return false;
  const vl = opsVloer(o), n = Math.round(numv(t.value)); opsBewaar(p);
  switch (b) {
    case 'opstrap': { const x = o.trappen[t.dataset.s]; if (!x) break;
      // vloer bovenaan de trap verhuist mee met de hoogte (of valt samen met een vloer die daar al ligt, bv. de begane grond bij een keldertrap)
      if (t.dataset.f === 'z') ZP.ops.trapNaarPeil(p, t.dataset.s, n); else x[t.dataset.f] = n;
      ZP.ops.naarBegroting(p, C()); break; }
    case 'opsvl': if (t.dataset.f === 'naam') vl.naam = t.value;
      // kelder blijft onder de begane grond, de andere vloeren erboven
      else if (vl.z < 0) vl.z = Math.min(-100, n);
      else if (vl.z > 0) vl.z = Math.max(100, n);
      o.vloeren.sort((a, c) => a.z - c.z); break;
    case 'opsgat': if (vl.gat) vl.gat[t.dataset.f] = /^b/.test(t.dataset.f) ? Math.max(100, n) : Math.max(0, n); break;
    case 'opswand': { const w = o.wanden.find(x => x.id === t.dataset.id); if (!w) break; const f = t.dataset.f;
      if (f === 'kleur') w.kleur = t.value; else if (/\./.test(f)) { const [k, i] = f.split('.'); w[k][+i] = Math.max(0, n); }
      else if (f === 'za' || f === 'zb') { if (w.za == null) w.za = 0; if (w.zb == null) w.zb = w.za; w[f] = Math.max(-20000, Math.min(20000, n)); }
      else { if (f === 'h' && w.hb == null) w.hb = +w.h || 2600; w[f] = Math.max(f === 'd' ? 20 : 100, n); } break; }
    case 'opsbal': { const x = o.balustrades.find(y => y.id === t.dataset.id); if (!x) break; const f = t.dataset.f; x[f] = f === 'onderslof' ? t.checked : f === 'tussen' ? Math.max(20, n) : t.value; ZP.ops.naarBegroting(p, C()); break; }
    case 'opskleur': o.wandKleur = t.value; for (const w of o.wanden) w.kleur = t.value; break;
    default: return false;
  }
});
