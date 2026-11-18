// Tekeningblad van de specificatiestaat (eerste blad van de afdruk, A4 liggend): 3D-beeld (zelf te draaien), boven- en zijaanzicht
// met maten, en houtsoort/afwerking. Realistisch via ZP.spec3d (nerf per houtsoort, wit gegrond = wit, licht en schaduw).
// Vakken verschuiven (balk) en groter/kleiner maken (hoekje rechtsonder); bewaard in p.begroting.specTek {vak{k:{x,y,w,h}} (% van het blad), cam, kant, uit{}}.
const SPT_VAKKEN = [['d3', '3D-beeld'], ['boven', 'Bovenaanzicht'], ['zij', 'Zijaanzicht'], ['leg', 'Houtsoort en afwerking']];
const SPT_STD = { d3: { x: 1, y: 1, w: 48.5, h: 48 }, boven: { x: 50.5, y: 1, w: 48.5, h: 48 }, zij: { x: 1, y: 51, w: 48.5, h: 48 }, leg: { x: 50.5, y: 51, w: 48.5, h: 48 } };
// pagina = A4 liggend min de marges (277 × 178 mm afgedrukt): bovenaan de kop van de specificatiestaat (logo, ± 30 mm),
// daaronder het blad met de vakken (277 × 148 mm)
const SPT_RATIO = 148 / 277;
const SPT_PX = 2000;             // breedte van het blad in pixels voor de plaatjes
let sptStaat = { sig: '', pid: '', M: null, img: {}, bezig: null, fout: '' };

function sptTek(p) {
  const B = p.begroting; B.specTek = B.specTek || {};
  const T = B.specTek; T.vak = T.vak || {}; T.uit = T.uit || {};
  for (const [k] of SPT_VAKKEN) if (!T.vak[k]) T.vak[k] = Object.assign({}, SPT_STD[k]);
  return T;
}
// variant uit de configurator (overgezet, anders de gekozen) – voor een trap zonder DXF en voor de verdiepingsbalustrades
function sptVariant(p) {
  const cfg = p.config; if (!CONFIGURATOR || !cfg || cfg.uit) return null;
  return specVariant(p) || (cfg.varianten || []).find(v => v.id === cfg.gekozen) || null;
}
// afwerking per soort onderdeel zoals de begroting hem rekent (costing: B.afw[type] → treden/rest → standaard)
function sptAfw(p, t) {
  const c = C(), B0 = (p.begroting || {}).afw || {};
  const id = B0[t] || (t === 'trede' || t === 'leuning' ? B0.treden : B0.rest);
  const a = c.afwerkingen.find(x => x.id === id) || c.afwerkingen.find(x => x.naam === c.afwStd[t === 'trede' || t === 'leuning' ? 'treden' : 'rest']);
  return a ? a.naam : '';
}
// balustrades van stap Verdiepingen naast een DXF-trap (zonder opstelling): trap linksboven in het raster = linkerachterhoek van de DXF
function sptVloerBal(p, v) {
  const bal = (v.vloerBal || []).filter(b => b.punten && b.punten.length > 1); if (!bal.length) return null;
  const st = p.stairs[0], ps = p.parts.filter(x => x.mesh && (!st || x.stair === st.id)); let y1 = -Infinity, z1 = -Infinity;
  for (const x of ps) for (let i = 0; i < x.mesh.length; i += 3) { y1 = Math.max(y1, x.mesh[i + 1]); z1 = Math.max(z1, x.mesh[i + 2]); }
  return bal.map(b => { const tp = CF.trapPos(b), sp = C().spijltypes.find(s => s.id === b.spijl) || { breedte: 40 };
    return { punten: b.punten.map(q => [q[0] - tp.x, y1 - (q[1] - tp.y)]), z: +b.hoogte || z1, onderslof: b.onderslof, tussen: b.tussen, breedte: sp.breedte }; });
}
// ---------- trappen die bij elkaar horen (boven elkaar gekoppeld) = één tekeningblad; losse trappen elk een eigen blad ----------
// kopie van het project met alleen de trappen van één groep (deelt de begroting, dus ook de indeling van het blad)
function sptGroepKopie(p, groep) {
  if (!groep || groep.length === p.stairs.length) return p;
  const ids = new Set(groep.map(s => s.id));
  return Object.assign({}, p, { stairs: groep, parts: p.parts.filter(x => ids.has(x.stair)), _kopie: true, _groep: true, _alle: p._alle || p.stairs });
}
// het blad dat nu op het scherm staat: de gekozen groep (ui.sptGroep) van het open project
function sptDoel(p) {
  if (!p || p._kopie) return p;
  const g = ZP.ops.groepen(p); if (g.length < 2) return p;
  return sptGroepKopie(p, g[Math.min(g.length - 1, Math.max(0, ui.sptGroep || 0))]);
}
// trapletter zoals in het hele project (ook in een kopie met alleen een deel van de trappen)
const sptCode = (p, sid) => { const i = (p._alle || p.stairs).findIndex(s => s.id === sid); return i < 0 ? '' : String.fromCharCode(65 + i); };
const sptGroepNaam = (p, g) => g.length > 1 ? 'Trap ' + g.map(s => sptCode(p, s.id)).join(' + ') : g.length ? `Trap ${sptCode(p, g[0].id)} – ${g[0].name}` : '';
function sptBron(p) {
  const c = C(), v = sptVariant(p), fotoSig = [...new Set(db.materials.map(m => CF.houtNaam(m.material)))].map(h => h + ':' + ZP.spec3d.nerfAfb(h).length).join();
  const B0 = p.begroting || {}, basis = [c.houtKleur || {}, fotoSig, c.afwStd, B0.afw || {}, B0.afwTrap || {}, B0.afwStuk || {}];
  if (ZP.view3d.hasMesh(p)) {
    // plaats van de trappen: de opstelling (als die aan staat), anders gekoppelde trappen boven elkaar (zonder vloeren en wanden)
    const aan = !!(p.opstelling && p.opstelling.aan), stapel = aan ? null : ZP.ops.stapel(p);
    const ops = aan ? (ZP.ops.ensure(p), p.opstelling) : stapel;
    const houtVan = (x) => CF.houtNaam(N.materialOf(x, S(), p.typeMaterial));
    const lab = (t) => (P.TYPES[t] || { label: 'Balustrade' }).label;
    // afwerking per stuk zoals gerekend (stuk → trap → soort)
    const afwVan = (x) => (c.afwerkingen.find(a => a.id === CO.afwVanPart(c, p.begroting || {}, x)) || {}).naam || sptAfw(p, x.type);
    const kijk = (i) => {
      if (i.part) { const x = p.parts.find(y => y.id === i.part); if (!x || x.include === false) return { weg: true }; return { hout: houtVan(x), afw: afwVan(x), label: lab(x.type) }; }
      // balustrade uit de opstelling of de configurator: hout zoals de leuning/spijlen van de trap
      const t = i.rol || 'leuning', inc = p.parts.filter(y => y.include !== false);
      const x = inc.find(y => y.type === t) || inc.find(y => y.type === 'leuning') || inc.find(y => y.type === 'trede');
      const h = (t === 'leuning' && (p.begroting.leuning || {}).hout) || (x ? houtVan(x) : '');
      return { hout: h, afw: sptAfw(p, t), label: lab(t) };
    };
    const vloerBal = !ops && v ? sptVloerBal(p, v) : null;
    const sig = JSON.stringify(['dxf', p.id, p.parts.map(x => x.id + (x.include === false ? '-' : '') + (x.mesh ? x.mesh.length : 0)).join(), p.typeMaterial, (p.begroting.leuning || {}).hout, ops, vloerBal, basis]);
    return { project: p, ops, zonderOmgeving: !!stapel, C: c, kijk, vloerBal, sig };
  }
  if (v) {
    // labels per houtsoort+afwerking uit de keuzes van de variant
    const an = (id) => (c.afwerkingen.find(a => a.id === id) || {}).naam || '', lbl = new Map();
    const zet = (h, a, l) => { const k = CF.houtNaam(h) + '|' + an(a), s = lbl.get(k) || new Set(); s.add(l); lbl.set(k, s); };
    zet(v.houtTrede, v.afwTreden, 'Treden');
    for (const [t, l] of CF.soortenVan(v)) if (t !== 'trede') zet(CF.houtVan(v, t), CF.afwVan(v, t), l);
    const kijk = (i) => ({ hout: i.hout, afw: i.afw, label: [...(lbl.get((i.hout || '') + '|' + (i.afw || '')) || [])].join(', ') });
    return { v, C: c, kijk, sig: JSON.stringify(['cf', p.id, v, basis]) };
  }
  return null;
}
const sptPx = (vk) => [Math.max(200, Math.round(vk.w / 100 * SPT_PX)), Math.max(150, Math.round(vk.h / 100 * SPT_PX * SPT_RATIO) - 34)];
// model (eenmalig per invoer) en plaatjes per vak (per maat, standpunt en kant). Eén cache-ingang per invoer (sig), zodat er
// meerdere specificatiestaten tegelijk kunnen zijn (per variant / houtsoort-optie: kopieën met _kopie). sptStaat = laatste van het scherm-project.
const sptCache = new Map();
const sptE = (p) => { const b = sptBron(p); return b ? sptCache.get(b.sig) || null : null; };
async function sptModel(p) {
  const bron = sptBron(p); if (!bron) return null;
  let e = sptCache.get(bron.sig);
  if (e && e.M) { if (!p._kopie) sptStaat = e; return e.M; }
  if (e && e.bezig) return e.bezig;
  e = { sig: bron.sig, pid: p.id, M: null, img: {}, bezig: null, fout: '' }; sptCache.set(bron.sig, e);
  while (sptCache.size > 8) sptCache.delete(sptCache.keys().next().value);
  e.bezig = (async () => { await ZP.spec3d.load(); const M = ZP.spec3d.maak(bron); await M.klaar; e.M = M; e.bezig = null; if (!p._kopie) sptStaat = e; return M; })();
  try { return await e.bezig; } catch (er) { e.bezig = null; e.fout = er.message; if (!p._kopie) sptStaat = e; sptCache.delete(bron.sig); throw er; }
}
// ---------- plattegrond uit de PDF van StairDesigner, opnieuw getekend in de stijl van het tekeningblad ----------
// stair.plan (pdfimport pagePlan): paden (z = trap, g = maat-/looplijnen), vlakken, getallen met plaats/hoek/grootte, in pt (y omhoog).
// Zelfde lijnkleur, lettertype en houtkleur als de andere tekeningen; de maten zijn precies die van StairDesigner.
function sptPlanSvg(pl, kleur) {
  const [x0, y0, x1, y1] = pl.box, pad = 5, W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad, n1 = (v) => (Math.round(v * 10) / 10);
  const grp = `transform="translate(${n1(pad - x0)} ${n1(y1 + pad)}) scale(1 -1)"`;
  const vlak = (pl.vlakken || []).map(l => `<path d="M${l.map(q => q[0] + ' ' + q[1]).join('L')}Z"/>`).join('');
  const lijn = (c) => pl.paden.filter(x => x.c === c).map(x => `<path d="${x.d}"${x.s ? ' class="pl-s"' : ''}/>`).join('');
  const tekst = pl.tekst.map(t => { const X = n1(t.x - x0 + pad), Y = n1(y1 - t.y + pad); return `<text x="${X}" y="${Y}"${t.a ? ` transform="rotate(${-t.a} ${X} ${Y})"` : ''} font-size="${n1(t.h)}">${esc(t.s)}</text>`; }).join('');
  return `<svg class="sp-plan" viewBox="0 0 ${n1(W)} ${n1(H)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plattegrond met maten">
    <g ${grp}><g class="pl-vlak" fill="${kleur || '#e9d3ac'}">${vlak}</g><g class="pl-g">${lijn('g')}</g><g class="pl-z">${lijn('z')}</g></g><g class="pl-t">${tekst}</g></svg>`;
}
// houtkleur van de treden van deze trap (met de afwerking: wit gegrond = wit), zoals in de andere tekeningen
function sptPlanKleur(p, s) {
  const x = p.parts.find(y => y.stair === s.id && y.type === 'trede' && y.include !== false) || p.parts.find(y => y.stair === s.id && y.include !== false); if (!x) return '';
  const c = C(), afw = (c.afwerkingen.find(a => a.id === CO.afwVanPart(c, p.begroting || {}, x)) || {}).naam || '';
  return DW.woodColor(CF.houtNaam(N.materialOf(x, S(), p.typeMaterial)), afw).f;
}
const sptPlanInfo = (pl) => { const i = pl.info || {}; return [i.treden ? i.treden + ' treden' : '', i.optrede ? 'optrede ' + i.optrede : '', i.aantrede ? 'aantrede ' + i.aantrede : '', i.hoogte ? 'verdiepingshoogte ' + i.hoogte : ''].filter(Boolean).join(' · '); };
function sptBeeld(p, k) {
  const e = sptE(p), T = sptTek(p); if (!e || !e.M || k === 'leg') return null;
  const [w, h] = sptPx(T.vak[k]), soort = k === 'd3' ? '3d' : k;
  // meerdere trappen op één blad (boven elkaar): het bovenaanzicht per trap apart, elk met zijn naam en eigen maten
  const trappen = k === 'boven' ? p.stairs.filter(s => p.parts.some(x => x.stair === s.id && x.mesh && x.include !== false)) : [];
  // plattegrond uit de PDF (stair.plan: lijnen en maten van StairDesigner) gaat voor het zelf getekende bovenaanzicht
  const planVan = (s) => (s.plan && s.plan.paden ? sptPlanSvg(s.plan, sptPlanKleur(p, s)) : '');
  const planSl = (s) => (s.plan ? 'P' + s.plan.paden.length + '.' + s.plan.tekst.length + sptPlanKleur(p, s) : '');
  if (trappen.length > 1) {
    const wd = Math.max(200, Math.floor(w / trappen.length)), hd = Math.max(150, h - 44), slm = ['boven-m', w, h, trappen.map(s => s.id + s.name + planSl(s)).join()].join('|');
    if (!e.img[k] || e.img[k].sl !== slm) e.img[k] = { sl: slm, multi: trappen.map(s => { const naam = `Trap ${sptCode(p, s.id)} – ${s.name}`, plan = planVan(s);
      return plan ? { plan, naam, info: sptPlanInfo(s.plan) } : Object.assign(ZP.spec3d.beeld(e.M, 'boven', wd, hd, { ids: new Set(p.parts.filter(x => x.stair === s.id).map(x => String(x.id))) }), { naam }); }) };
    return e.img[k];
  }
  if (trappen.length === 1 && trappen[0].plan && trappen[0].plan.paden) {
    const slp = ['boven-p', planSl(trappen[0])].join('|');
    if (!e.img[k] || e.img[k].sl !== slp) e.img[k] = { sl: slp, plan: planVan(trappen[0]), info: sptPlanInfo(trappen[0].plan) };
    return e.img[k];
  }
  const sl = [k, w, h, k === 'd3' ? JSON.stringify(T.cam || 0) : '', k === 'zij' ? T.kant || 0 : ''].join('|');
  if (!e.img[k] || e.img[k].sl !== sl) e.img[k] = Object.assign(ZP.spec3d.beeld(e.M, soort, w, h, { cam: T.cam, kant: T.kant }), { sl });
  return e.img[k];
}
// alles klaar voor de afdruk (één project of een lijst kopieën)? true = meteen, anders een belofte
function sptVoorAfdruk(lijst) {
  const ps = (Array.isArray(lijst) ? lijst : [lijst]).filter(p => sptBron(p));
  const nodig = (p) => { const T = sptTek(p); SPT_VAKKEN.filter(([k]) => !T.uit[k] && k !== 'leg').forEach(([k]) => sptBeeld(p, k)); };
  if (ps.every(p => { const e = sptE(p); return e && e.M; })) { ps.forEach(nodig); return true; }
  // na elkaar (één renderer)
  return ps.reduce((pr, p) => pr.then(() => sptModel(p).then(() => nodig(p)).catch(() => { /* geen 3D (offline): zonder tekening */ })), Promise.resolve());
}
function sptLegenda(p, print) {
  const e = sptE(p), M = e && e.M, c = C(), K = p.begroting.klant || {};
  const rijen = M ? M.legenda.slice().sort((a, b) => b.labels.size - a.labels.size).map(e => `<li><img class="sp-staal" src="${ZP.spec3d.staal(c, e.L.hout, e.L.afw, 120, 60)}" alt=""><span><b>${esc(e.L.hout || 'Hout')}</b>${e.L.afw ? ' – ' + esc(e.L.afw.toLowerCase()) : ''}${e.labels.size ? `<br><small>${esc([...e.labels].join(', '))}</small>` : ''}</span></li>`).join('') : '';
  return `<div class="sp-leg"><ul>${rijen}</ul>
    <div class="sp-titel"><div><b>${esc(K.naam || p.name)}</b>${K.adres || K.plaats ? '<br>' + esc([K.adres, K.plaats].filter(Boolean).join(', ')) : ''}${p._label ? '<br>' + esc(p._label) : ''}</div>
      <div>${K.nr ? 'Offerte ' + esc(K.nr) + '<br>' : ''}${new Date().toLocaleDateString('nl-NL')}</div><div class="muted">Niet op schaal – maten in mm</div></div></div>`;
}
// vaste kop bovenaan het tekeningblad = precies de kop van de specificatiestaat (specKop, begroting.js); niet te verschuiven
const sptKop = (p, label) => `<div class="sp-kop">${specKop(p, label === undefined ? p._label : label, 'Tekeningen')}</div>`;
function sptInhoud(p, k, print) {
  if (k === 'leg') return sptLegenda(p, print);
  const e = sptE(p), b = e && e.M ? sptBeeld(p, k) : null;
  if (b && b.multi) return `<div class="sp-multi">${b.multi.map(x => `<figure><div class="sp-mb">${x.plan ? x.plan : `<img src="${x.url}" alt="">${x.svg}`}</div><figcaption>${esc(x.naam)}${x.info ? `<small>${esc(x.info)}</small>` : ''}</figcaption></figure>`).join('')}</div>`;
  if (b && b.plan) return `<div class="sp-multi"><figure><div class="sp-mb">${b.plan}</div>${b.info ? `<figcaption><small>${esc(b.info)}</small></figcaption>` : ''}</figure></div>`;
  return b ? `<img src="${b.url}" alt="">${b.svg}` : `<div class="sp-wacht muted small">${(e && e.fout) || sptStaat.fout ? esc((e && e.fout) || sptStaat.fout) : 'Tekening maken…'}</div>`;
}
const sptStyle = (v) => `left:${v.x}%;top:${v.y}%;width:${v.w}%;height:${v.h}%`;
// op het scherm (in de kaart Specificatiestaat)
// titel van een vak: het zijaanzicht heet vooraanzicht als je van de korte kant kijkt
const sptVakTitel = (T, k, t) => (k === 'zij' && (T.kant || 0) % 4 >= 2 ? 'Vooraanzicht' : t);
function sptScherm(p0) {
  const groepen = p0._kopie ? [] : ZP.ops.groepen(p0), p = sptDoel(p0);
  if (!sptBron(p)) return '';
  const T = sptTek(p);
  // meerdere bladen (losse trappen): kiezen welk blad je bekijkt; elk blad wordt apart afgedrukt
  const gi = Math.min(groepen.length - 1, Math.max(0, ui.sptGroep || 0));
  const bladKies = groepen.length > 1 ? `<span class="btngroup sp-bladkies" title="Trappen die niet boven elkaar staan krijgen elk een eigen tekeningblad">${groepen.map((g, i) => `<button class="small ${i === gi ? '' : 'ghost'}" data-act="sptgroep" data-v="${i}">${i === gi ? '✓ ' : ''}Blad ${esc(sptGroepNaam(p0, g))}</button>`).join('')}</span>` : '';
  const knop = (k) => k === 'd3' ? `<button class="ghost small" data-act="sptschuif" data-v="1" title="Trap hoger in het vak schuiven (of slepen met de rechtermuisknop / twee vingers)" aria-label="Omhoog schuiven">▲</button><button class="ghost small" data-act="sptschuif" data-v="-1" title="Trap lager in het vak schuiven" aria-label="Omlaag schuiven">▼</button><button class="ghost small" data-act="sptcam" title="Terug naar het standaard standpunt">Standaard</button>` : k === 'zij' ? `<button class="ghost small" data-act="sptzij" title="Volgende kant: zijaanzicht links/rechts, vooraanzicht voor/achter">Andere kant</button>` : '';
  return `<div class="sp-tekwrap">
    <div class="sp-tekbar"><b>Tekeningblad</b>${bladKies}<span class="muted small">eerste blad van de afdruk · sleep aan de balk om te verschuiven, aan het hoekje om groter of kleiner te maken · draai het 3D-beeld met muis of vinger, ▲ ▼ (of rechtermuisknop / twee vingers) = verschuiven</span>
      <span class="btngroup">${SPT_VAKKEN.map(([k, t]) => `<button class="small ${T.uit[k] ? 'ghost' : ''}" data-act="sptvak" data-v="${k}" title="${T.uit[k] ? 'Weer op het blad zetten' : 'Van het blad halen'}">${T.uit[k] ? '' : '✓ '}${t}</button>`).join('')}</span>
      <button class="ghost small" data-act="sptstd">Indeling herstellen</button></div>
    <div class="sp-pagina">${sptKop(p, groepen.length > 1 ? sptGroepNaam(p0, groepen[gi]) : undefined)}<div class="sp-blad" id="sp-blad">${SPT_VAKKEN.filter(([k]) => !T.uit[k]).map(([k, t]) => `<div class="sp-vak" data-k="${k}" style="${sptStyle(T.vak[k])}">
      <div class="sp-greep" title="Slepen om te verschuiven"><span class="sp-vt">${sptVakTitel(T, k, t)}</span>${knop(k)}</div><div class="sp-inh"><div class="sp-wacht muted small">Tekening maken…</div></div><span class="sp-rek" title="Slepen = groter of kleiner"></span></div>`).join('')}</div></div></div>`;
}
// afdruk: eigen blad vóór de specificaties
function sptPrint(p, label) {
  const e = sptE(p); if (!e || !e.M) return '';
  const T = sptTek(p);
  return `<div class="sp-pagina sp-pagina-p">${sptKop(p, label)}<div class="sp-blad sp-blad-p">${SPT_VAKKEN.filter(([k]) => !T.uit[k]).map(([k, t]) => `<div class="sp-vak" data-k="${k}" style="${sptStyle(T.vak[k])}"><div class="sp-vt">${sptVakTitel(T, k, t)}</div><div class="sp-inh">${sptInhoud(p, k, true)}</div></div>`).join('')}</div></div>`;
}
// vak vullen: 3D = draaibaar beeld, anders plaatje met maten
function sptVul(p, k) {
  const el = document.querySelector(`#sp-blad .sp-vak[data-k="${k}"] .sp-inh`), e = sptE(p); if (!el || !e || !e.M) return;
  if (k === 'd3') {
    if (!el.querySelector('canvas')) el.innerHTML = '';
    ZP.spec3d.live(el, e.M, sptTek(p).cam, (cam) => { const pp = proj(); if (!pp) return; sptTek(pp).cam = cam; save(); });
  } else el.innerHTML = sptInhoud(p, k);
}
function bindSpecBlad() {
  bindSpecTekst();   // teksten van de specificatiestaat (begroting.js)
  const blad = document.getElementById('sp-blad'), p = sptDoel(proj()); if (!blad || !p) return;   // het blad van de gekozen groep trappen
  const T = sptTek(p), kl = (v, a, b) => Math.round(Math.min(b, Math.max(a, v)) * 2) / 2;
  blad.querySelectorAll('.sp-vak').forEach(el => {
    const k = el.dataset.k;
    const start = (e, soort) => {
      if (e.button > 0) return; e.preventDefault(); e.stopPropagation();
      const r = blad.getBoundingClientRect(), v0 = Object.assign({}, T.vak[k]), x0 = e.clientX, y0 = e.clientY, doel = e.currentTarget;
      try { doel.setPointerCapture(e.pointerId); } catch (er) { /* */ } el.classList.add('sleept');
      const mv = (ev) => {
        const dx = (ev.clientX - x0) / r.width * 100, dy = (ev.clientY - y0) / r.height * 100, v = T.vak[k];
        if (soort === 'mv') { v.x = kl(v0.x + dx, 0, 100 - v.w); v.y = kl(v0.y + dy, 0, 100 - v.h); }
        else { v.w = kl(v0.w + dx, 15, 100 - v.x); v.h = kl(v0.h + dy, 15, 100 - v.y); }
        el.style.cssText = sptStyle(v);
        if (k === 'd3' && soort !== 'mv') sptVul(p, k);
      };
      const up = () => { doel.removeEventListener('pointermove', mv); doel.removeEventListener('pointerup', up); doel.removeEventListener('pointercancel', up); el.classList.remove('sleept'); save(); if (soort !== 'mv') sptVul(p, k); };
      doel.addEventListener('pointermove', mv); doel.addEventListener('pointerup', up); doel.addEventListener('pointercancel', up);
    };
    el.querySelector('.sp-greep').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) start(e, 'mv'); });
    el.querySelector('.sp-rek').addEventListener('pointerdown', (e) => start(e, 'rek'));
  });
  const vul = () => { for (const [k] of SPT_VAKKEN) if (!T.uit[k]) sptVul(p, k); };
  const e0 = sptE(p); if (e0 && e0.M) { sptStaat = e0; vul(); }
  else sptModel(p).then(() => { if (document.getElementById('sp-blad') === blad) vul(); }).catch(e => { blad.querySelectorAll('.sp-wacht').forEach(w => { w.textContent = e.message; }); });
}
// Materialenlijst: uiterlijk per houtsoort in de tekening: eigen nerf-afbeelding (ZP.fotos 'nerf:<naam>', gaat voor),
// anders kleur + getekende nerf (C().houtKleur[naam] = {kleur, nerf}); staaltje zoals in de tekening
function houtStijlVeld(wood) {
  const c = C(), s = ZP.spec3d.stijl(c, wood), afb = ZP.spec3d.nerfAfb(wood);
  const nerfKnop = `<label class="btn small ghost" title="Afbeelding van de nerf (nerf van links naar rechts), wordt in de tekening op de specificatiestaat gebruikt">${afb ? 'Andere nerf…' : 'Nerf-afbeelding…'}<input type="file" accept="image/*" data-act="fotoup" data-kind="nerf" data-id="${esc(wood)}" hidden></label>`
    + (afb ? `<button class="ghost small" data-act="fotodel" data-kind="nerf" data-v="${esc(wood)}" title="Nerf-afbeelding weghalen (dan de kleur hiernaast)" aria-label="Nerf-afbeelding weghalen">✕</button>` : '');
  return `<span class="ml-stijl" title="Uiterlijk van ${esc(wood)} in de tekening op de specificatiestaat"><img class="ml-staal" src="${ZP.spec3d.staal(c, wood, '', 96, 40)}" alt="" ${afb ? `data-act="fotozoom" data-kind="nerf" data-v="${esc(wood)}"` : ''}>${nerfKnop}
    ${afb ? '' : `<input type="color" data-bind="mlkleur" data-v="${esc(wood)}" value="${esc(s.kleur)}" aria-label="Kleur van ${esc(wood)}">
    <select class="small" data-bind="mlnerf" data-v="${esc(wood)}" aria-label="Nerf van ${esc(wood)}">${ZP.spec3d.NERVEN.map(([k, t]) => `<option value="${k}" ${k === s.nerf ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    ${s.eigen ? `<button class="ghost small" data-act="mlkleurstd" data-v="${esc(wood)}" title="Standaard kleur en nerf voor deze houtsoort">↺</button>` : ''}`}</span>`;
}
CLICK.push(function click_spt(a, t, v, p) {
  switch (a) {
    case 'mlkleurstd': { const hk = C().houtKleur || {}; delete hk[v]; break; }
    case 'sptcam': delete sptTek(p).cam; ZP.spec3d.zetCam(null); break;
    case 'sptschuif': {
      // 3D-beeld verticaal verschuiven; bewaard in het standpunt (ook voor de afdruk); geen hertekening nodig
      const e = sptE(sptDoel(p)); if (!e || !e.M) return;
      const T = sptTek(p); T.cam = ZP.spec3d.schuif(e.M, T.cam, +v || 1); save(); return;
    }
    // zijaanzicht van links/rechts (0, 1), vooraanzicht van voor/achter (2, 3)
    case 'sptzij': { const T = sptTek(p); T.kant = ((T.kant || 0) + 1) % 4; break; }
    case 'sptgroep': ui.sptGroep = +v || 0; ZP.spec3d.zetCam(null); render(); return;
    case 'sptvak': { const T = sptTek(p); T.uit[v] = !T.uit[v]; if (!T.uit[v]) delete T.uit[v]; break; }
    case 'sptstd': { const T = sptTek(p); T.vak = {}; T.uit = {}; delete T.cam; delete T.kant; sptTek(p); ZP.spec3d.zetCam(null); break; }
    default: return false;
  }
  save(); render();
});
CHANGE.push(function change_spt(b, t) {
  if (b !== 'mlkleur' && b !== 'mlnerf') return false;
  const c = C(), hk = c.houtKleur = c.houtKleur || {}, w = t.dataset.v, s = ZP.spec3d.stijl(c, w);
  hk[w] = Object.assign({ kleur: s.kleur, nerf: s.nerf }, hk[w] || {}, b === 'mlkleur' ? { kleur: t.value } : { nerf: t.value });
});
