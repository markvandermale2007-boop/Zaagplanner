// Scherm 5 Begroting (incl. 3D-kaart en afdrukversie)
// ---------------- Begroting ----------------
async function readNorms(file) {
  try {
    // eigen normen (handmatig of gemeten) blijven staan: bewaren, Excel inlezen, terugzetten
    const eigen = CO.normBewaar(C());
    const r = await CO.importXlsx(C(), await file.arrayBuffer(), file.name);
    CO.normHerstel(C(), eigen);
    const n = CO.signalen(C()).length;
    ui.msg = { text: `Uren ingelezen uit ${file.name}: ${r.got.join(', ')}.` + (eigen.length ? ` ${eigen.length} eigen ${eigen.length === 1 ? 'norm is' : 'normen zijn'} niet overschreven.` : '') + (r.nieuw.length ? ` Nieuw: ${r.nieuw.join(', ')} – vul hiervoor de materiaalprijs in.` : '') + (r.warn.length ? ' Let op: ' + r.warn.join('; ') + '.' : '') + (n ? ` ${n} vaste ${n === 1 ? 'prijs is' : 'prijzen zijn'} nu te laag.` : ''), kind: r.warn.length || n ? 'err' : 'ok' };
    save();
  } catch (err) { ui.msg = { text: 'Excel niet ingelezen: ' + err.message, kind: 'err' }; }
  render();
}
// het gekozen Excel-bestand onthouden (alleen de verwijzing, in deze browser)
const handleStore = {
  db: () => new Promise((res, rej) => { const q = indexedDB.open('zaagplanner', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }),
  async set(h) { try { const d = await this.db(); d.transaction('kv', 'readwrite').objectStore('kv').put(h, 'normHandle'); } catch (e) { /* niet beschikbaar */ } },
  async get() { try { const d = await this.db(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('normHandle'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } },
};
handleStore.get().then(h => { if (h) { ui.normHandle = h; if (ui.screen === 'prijzen') render(); } });
function purchaseOf(p) { const l = layouts(p); if (!l.length) return null; const pl = LY.purchaseList(l); pl.rest = restWaarde(l); return pl; }
// waarde van het restmateriaal uit de indeling: per plank het grootste bruikbare reststuk (vanaf de minimummaat bij de instellingen)
// als deel van de plankprijs. De begroting trekt daar een percentage van af (costing regel "houtrest").
function restWaarde(lays) {
  const st = S(); let waarde = 0, n = 0;
  for (const l of lays) for (const b of l.boards) {
    const rems = (N.boardStats(b, st).rems || []).slice().sort((a, c) => c.w * c.h - a.w * a.h); if (!rems.length || !(b.W * b.L > 0)) continue;
    const prijs = b.stock.panel ? b.stock.panel.planks.reduce((a, x) => a + M.boardPrice(x), 0) : M.boardPrice(b.stock);
    waarde += (+prijs || 0) * Math.min(1, rems[0].w * rems[0].h / (b.W * b.L)); n++;
  }
  return { waarde, n };
}
// prijs van een bewerking zoals in keuzelijsten getoond: vaste prijs, anders kostprijs
const bewPrijs = (b) => (b.vast > 0 ? +b.vast : CO.bewKost(C(), b));
// houtschatting zolang er geen indeling is: netto volume × gemiddelde m³-prijs van passende maten × afvalfactor
function houtSchatting(p) {
  const c = C(), inc = P.metAantal(p.parts.filter(x => x.include !== false), p.stairs); let m3 = 0, bedrag = 0;
  for (const x of inc) {
    const vol = Math.abs(G.area(x.poly)) * x.thickness / 1e9; m3 += vol;
    const mat = N.materialOf(x, S(), p.typeMaterial);
    const rows = db.materials.filter(m => M.matches(m, mat) && Math.abs(m.netT - x.thickness) < 0.6 && !m.stock);
    const pool = rows.length ? rows : db.materials.filter(m => M.matches(m, mat) && !m.stock);
    const perM3 = pool.length ? pool.reduce((a, m) => a + M.boardPrice(m) / (m.grossT * m.width * m.length / 1e9), 0) / pool.length : 0;
    bedrag += vol * perM3 * (+c.tarief.afval || 1);
  }
  return m3 ? { m3, bedrag } : null;
}
// 3D-weergave: onderdelen aanklikken en er in één keer een bewerking aan toevoegen
function view3dCard(p, c) {
  const B = p.begroting, sel = ui.sel3d;
  const head = `<div class="ml-head">${foldBtn('bg-3d', '3D')}<h3>3D-weergave</h3><span class="muted small">klik onderdelen aan (Shift = meerdere), slepen = draaien, scrollen = zoomen</span></div>`;
  if (folded('bg-3d')) return `<section class="card v3card">${head}</section>`;
  if (!ZP.view3d.hasMesh(p)) return `<section class="card v3card">${head}<p class="muted">Geen 3D-model voor dit project. Het 3D-model komt uit de DXF van StairDesigner (de PDF bevat geen 3D): lees de DXF in bij <a href="#" data-act="go" data-v="importeren">Importeren</a>, of lees hem opnieuw in als dit project van vóór de 3D-weergave is.</p></section>`;
  const types = [...new Set(p.parts.filter(x => x.mesh && x.include !== false).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
  const selParts = p.parts.filter(x => sel.has(x.id));
  const bewOn = (pid) => (B.bew || []).filter(bw => (bw.parts || []).includes(pid));
  const g = new Map(); for (const b of c.bewerkingen) { const k = b.onderdeel || 'Overig'; if (!g.has(k)) g.set(k, []); g.get(k).push(b); }
  const bewSel = `<select id="v3-bew">${[...g.entries()].map(([k, l]) => `<optgroup label="${esc(k)}">${l.map(b => `<option value="${b.id}">${esc(b.naam)} – ${eur(bewPrijs(b))} ${esc(b.eenheid)}${b.vast > 0 ? ' (vast)' : ''}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const info = selParts.length ? `<div class="v3sel"><b>${selParts.length} geselecteerd:</b> ${esc(selParts.slice(0, 8).map(x => x.dispName || x.name).join(', '))}${selParts.length > 8 ? ' …' : ''}</div>
      <div class="v3bews">${selParts.slice(0, 6).map(x => bewOn(x.id).map(bw => { const b = c.bewerkingen.find(y => y.id === bw.id); return b ? `<span class="v3chip">${DW.forBew(b, 'mini')}<span>${esc(x.dispName || x.name)}: ${esc(b.naam)}</span><button class="ghost small" data-act="v3rembew" data-v="${bw.key}|${x.id}" title="Weghalen bij dit onderdeel">✕</button></span>` : ''; }).join('')).join('')}</div>`
    : '<div class="v3sel muted small">Nog niets geselecteerd. Klik een onderdeel aan, of kies hieronder bv. "alle treden".</div>';
  const opsAan = !!(p.opstelling && p.opstelling.aan);
  return `<section class="card v3card">${head}
    <div class="v3bar"><span class="btngroup">${[['iso', '3D'], ['top', 'boven'], ['front', 'voor'], ['side', 'zij']].map(([k, t]) => `<button class="small" data-act="v3view" data-v="${k}">${t}</button>`).join('')}</span>
      <button class="small ${opsAan ? 'primary' : ''}" data-act="opsaan" title="Trappen boven elkaar zetten, met vloeren, wanden en balustrades">${opsAan ? '✓ Opstelling' : 'Opstelling: trappen, wanden, vloeren'}</button>
      <span class="btngroup">${types.map(tp => `<button class="small ghost" data-act="v3seltype" data-v="${tp}">alle ${P.TYPES[tp].label.toLowerCase()}</button>`).join('')}<button class="small ghost" data-act="v3clear">selectie wissen</button></span></div>
    <div id="view3d" class="v3box"><div class="v3load muted">3D-model laden…</div></div>
    <div class="v3legend small"><span><i style="background:#2b6cb0"></i>geselecteerd</span><span><i style="background:#7fb27f"></i>heeft een bewerking</span><span><i style="background:#d9a86a"></i>trede</span><span><i style="background:#b98552"></i>boom</span><span><i style="background:#cf9d6c"></i>leuning</span></div>
    ${info}
    <div class="row wrap v3add"><b class="small">Bewerking voor de selectie</b> ${bewSel}<button class="small" data-act="v3addbew" ${selParts.length ? '' : 'disabled'}>+ Toevoegen aan ${selParts.length || ''} ${selParts.length === 1 ? 'onderdeel' : 'onderdelen'}</button>
      <span class="muted small">Het aantal volgt uit de selectie (stuks, meters of m²) en komt in de begroting onder "Speciale bewerkingen".</span></div>
    ${opsAan ? opsCard(p) : ''}</section>`;
}
function mount3d() {
  const el = document.getElementById('view3d'), p = proj(); if (!el || !p) return;
  const withBew = new Set(((p.begroting || {}).bew || []).flatMap(b => b.parts || []));
  if (p.opstelling && p.opstelling.aan) ZP.ops.ensure(p);
  ZP.view3d.mount(el, p, { C: C(), selected: ui.sel3d, withBew, onPick: (id, multi) => {
    const s = ui.sel3d;
    if (!id) { if (!multi) s.clear(); } else if (multi) { if (s.has(id)) s.delete(id); else s.add(id); } else { const only = s.size === 1 && s.has(id); s.clear(); if (!only) s.add(id); }
    render();
  } }).then(() => { const l = el.querySelector('.v3load'); if (l) l.remove(); })
    .catch(e => { el.innerHTML = `<div class="warn">${esc(e.message)}</div>`; });
}
// nacalculatie afwerkmiddel: werkelijk verbruik (liters) per afwerking invullen → werkelijke dekking; Prijzen → Afwerkingen
// toont het gemiddelde over de projecten en stelt voor de dekking bij te stellen (B.afwLiters[afwerking] = {l, m2})
function bNacalcAfw(p, r) {
  const c = C(), B = p.begroting, fk = 'open:bg-nacalc', m = new Map();
  for (const l of r.secs.flatMap(s => s.lines)) if (l.key.startsWith('afw:') && l.qty > 0 && l.extra && l.extra.value) m.set(l.extra.value, (m.get(l.extra.value) || 0) + l.qty);
  if (!m.size) return '';
  const L = B.afwLiters || {}, n = Object.keys(L).length;
  const head = `<div class="ml-head">${foldBtn(fk, 'Nacalculatie afwerkmiddel')}<h3>Nacalculatie afwerkmiddel</h3><span class="muted small">${n ? 'verbruik ingevuld' : 'na het afwerken: hoeveel liter is er gebruikt?'}</span></div>`;
  if (folded(fk)) return `<section class="card bnacalc">${head}</section>`;
  return `<section class="card bnacalc">${head}<table class="tbl compact"><thead><tr><th>Afwerking</th><th class="num">Oppervlak</th><th class="num">Begroot</th><th>Werkelijk gebruikt</th><th class="num">Werkelijke dekking</th></tr></thead><tbody>${[...m.entries()].map(([id, m2]) => {
    const a = c.afwerkingen.find(x => x.id === id); if (!a) return ''; const e = L[id], beg = a.dekking > 0 ? m2 * (+a.lagen || 1) / a.dekking : 0, dk = e && e.l > 0 ? m2 * (+a.lagen || 1) / e.l : 0;
    return `<tr><td>${esc(a.naam)}</td><td class="num">${f1(m2)} m²</td><td class="num">${f1(beg)} liter</td><td><input class="w4 num" data-bind="bliters" data-id="${id}" data-m2="${m2}" value="${e ? String(e.l).replace('.', ',') : ''}" placeholder="liter"> liter</td>
      <td class="num">${dk ? `${f1(dk)} m²/liter <span class="muted small">(ingesteld ${f1(a.dekking)})</span>` : '—'}</td></tr>`; }).join('')}</tbody></table>
    <p class="muted small">Bij Prijzen en normen → Afwerkingen staat het gemiddelde over je projecten, met een voorstel om de dekking bij te stellen.</p></section>`;
}
// vaste balk bovenaan de begroting (blijft staan bij scrollen): de kerncijfers in één regel
function bBalk(t, c, r) {
  const mPct = t.marge / (t.kostprijs || 1) * 100, laag = t.marge < t.kostprijs * (c.tarief.minMarge || 0);
  const v = (lab, w, cls = '') => `<div class="bb-v ${cls}"><span>${lab}</span><b>${w}</b></div>`;
  return `<div class="bbalk no-print" role="status" aria-label="Kerncijfers begroting">
    ${v('Uren werkplaats', f1(t.urenWerk) + ' u')}${v('Uren montage', f1(t.urenMontage) + ' u')}${v('Materiaal', eur(t.mat))}
    ${v('Excl. BTW', eur(t.excl), 'groot')}${v('Incl. BTW', eur(t.incl))}${v('Marge', `${eur(t.marge)} · ${f1(mPct)}%`, laag ? 'neg' : 'pos')}
    ${r.warn.length ? `<div class="bb-v let" title="${esc(r.warn.join('\n'))}"><span>Let op</span><b>⚠ ${r.warn.length}</b></div>` : ''}</div>`;
}
function scrBudget() {
  const p = proj(), c = C(), pur = purchaseOf(p), r = CO.begroting(c, p, pur, pur ? null : houtSchatting(p)), B = p.begroting, K = B.klant, t = r.tot;
  const kf = (k, label, type = 'text', w = '') => `<label>${label}<input type="${type}" class="${w}" data-bind="bklant" data-k="${k}" value="${esc(K[k] || '')}"></label>`;
  const klant = `<div class="tar-grid klant">${kf('naam', 'Klant')}${kf('adres', 'Adres')}${kf('plaats', 'Postcode en plaats')}${kf('tel', 'Telefoon / e-mail')}${kf('nr', 'Opdrachtnummer')}${kf('lever', 'Gewenste leverdatum', 'date')}
    <label>Status<select data-bind="bklant" data-k="status">${opts(CO.STATUS, K.status || 'Offerte')}</select></label></div>`;
  const qIn = (L) => L.edit ? `<input class="w4 num ${B.qty[L.key] !== undefined ? 'set' : ''}" data-bind="bqty" data-k="${esc(L.key)}" value="${B.qty[L.key] !== undefined ? String(B.qty[L.key]).replace('.', ',') : ''}" placeholder="${f2(L.auto)}" title="Leeg = automatisch uit de tekening (${f2(L.auto)})">` : `<span class="num">${f2(L.qty)}</span>`;
  // keuzes (vorm, leuning, afwerking, spijl …) staan bij Uitvoering: hier alleen een verwijzing
  const extra = (L) => {
    const x = L.extra || {};
    return x.field || x.leuning || x.drager || x.afw || x.afwStuk || x.bal || x.bew ? ` <a href="#" class="small uv-link" data-act="go" data-v="uitvoering" title="Deze keuze wijzig je bij Uitvoering">keuze wijzigen</a>` : '';
  };
  const qtyCell = (L) => {
    const x = L.extra || {};
    if (x.bal) return `<input class="w4 num" data-bind="bbal" data-id="${x.bal.id}" data-f="m" value="${String(x.bal.m || '').replace('.', ',')}">`;
    if (x.extraLeun) return `<input class="w4 num" data-bind="bleun" data-id="${x.extraLeun.id}" data-f="m" value="${String(x.extraLeun.m || '').replace('.', ',')}">`;
    if (x.bew) return `<input class="w4 num" data-bind="bbew" data-k="${x.bew.key}" value="${String(x.bew.n || '').replace('.', ',')}">`;
    return qIn(L);
  };
  const del = (L) => { const x = L.extra || {}; return x.bal ? `<button class="ghost small" data-act="bbaldel" data-v="${x.bal.id}" title="Weghalen">✕</button>` : x.extraLeun ? `<button class="ghost small" data-act="bleundel" data-v="${x.extraLeun.id}" title="Weghalen">✕</button>` : x.bew ? `<button class="ghost small" data-act="bbewdel" data-v="${x.bew.key}" title="Weghalen">✕</button>` : x.afw && (B.afw || {})[x.afw] ? `<button class="ghost small" data-act="bafwdel" data-v="${x.afw}" title="Weer de standaardafwerking">✕</button>` : ''; };
  const bewOf = (L) => (L.extra && L.extra.bew ? c.bewerkingen.find(b => b.id === L.extra.bew.id) : null);
  const rowHtml = (L) => `<tr class="${L.def !== L.totaal ? 'ovr' : ''}"><td>${bewOf(L) ? `<span class="bthumb">${DW.forBew(bewOf(L))}</span>` : L.extra && L.extra.spijl ? `<span class="bthumb">${DW.spijl(L.extra.spijl, 'thumb')}</span>` : ''}<span class="bl-lab">${esc(L.label)}</span>${L.vast ? `<span class="sig ${L.vast.teLaag ? 'bad' : 'ok'}" title="Kostprijs ${eur(L.kost)}">${L.vast.teLaag ? 'vaste prijs te laag' : 'vaste prijs'}</span>` : ''}${extra(L)}${L.note ? `<div class="muted small">${esc(L.note)}</div>` : ''}</td>
    <td>${qtyCell(L)}</td><td class="muted small">${esc(L.unit)}</td><td class="num">${L.uren ? f2(L.uren) : ''}</td><td class="num">${L.vast ? `<span class="muted small">kost ${eur(L.kost)}</span>` : L.arbeid ? eur(L.arbeid) : ''}</td><td class="num">${!L.vast && L.mat ? eur(L.mat) : ''}</td>
    <td><input class="w5 num" data-bind="bovr" data-k="${esc(L.key)}" value="${L.ovr !== undefined && L.ovr !== '' ? String(L.ovr).replace('.', ',') : ''}" placeholder="${f2(L.totaal)}" title="Eigen bedrag voor deze regel (leeg = berekend)"></td>
    <td class="num"><b>${L.def ? eur(L.def) : ''}</b></td><td>${del(L)}</td></tr>`;
  const head = `<thead><tr><th>Omschrijving</th><th>Aantal</th><th></th><th class="num">Uren</th><th class="num">Arbeid</th><th class="num">Materiaal</th><th>Aangepast €</th><th class="num">Bedrag</th><th></th></tr></thead>`;
  const naarUv = (t) => `<tr class="addrow-l"><td colspan="9"><span class="muted small">${t}</span> <a href="#" class="small" data-act="go" data-v="uitvoering">naar Uitvoering →</a></td></tr>`;
  const add = {
    'Leuning en balustrade': naarUv('Een leuning of balustrade toevoegen of anders kiezen doe je bij Uitvoering.'),
    'Speciale bewerkingen': naarUv('Opties en bewerkingen kies je bij Uitvoering.'),
    'Hout, afwerking en beslag': `<tr class="addrow-l"><td colspan="9"><b class="small">Artikel toevoegen</b> <select id="bs-sel">${opts(c.beslag.map(s => [s.id, `${s.naam} (${eur(s.prijs)} per ${s.eenheid})`]))}</select> <button class="small" data-act="bbesadd">+ Artikel</button></td></tr>`,
    'Montage en transport': `<tr class="addrow-l"><td colspan="9"><span class="small">Ritten ${numIn('bqty', 'data-k="ritten"', B.qty.ritten !== undefined ? B.qty.ritten : 2, 'w3')} · afstand enkele reis ${numIn('bqty', 'data-k="km"', B.qty.km || '', 'w3')} km · reistijd per rit ${numIn('bqty', 'data-k="reistijd"', B.qty.reistijd || '', 'w3')} uur</span></td></tr>`,
  };
  const secTot = (s) => s.lines.reduce((a, l) => a + l.def, 0);
  // secties standaard dicht (sleutel "open:"): kop met aantal regels en bedrag; open = alle regels
  const secHtml = (s) => { const fk = 'open:bg-' + s.title, dicht = folded(fk);
    return `<section class="card bsec ${dicht ? 'dicht' : ''}"><div class="ml-head">${foldBtn(fk, s.title)}<h3>${esc(s.title)}</h3><span class="muted small">${dicht ? `${s.lines.length} regel${s.lines.length === 1 ? '' : 's'}${s.lines.some(l => l.def !== l.totaal) ? ' · aangepast' : ''}` : esc(s.sub || '')}</span>
      <span class="bsec-tot">${eur(secTot(s))}</span></div>
    ${dicht ? '' : `<table class="tbl btable">${head}<tbody>${s.lines.map(rowHtml).join('') || '<tr><td colspan="9" class="muted">Nog niets.</td></tr>'}${add[s.title] || ''}</tbody></table>`}</section>`; };
  // alles van het maken van de trap in één in- en uitklapbaar blok (dicht = per onderdeel alleen het bedrag); montage en transport los
  const MAKEN = ['Trap – werkplaats', 'Leuning en balustrade', 'Speciale bewerkingen', 'Hout, afwerking en beslag'];
  const maken = r.secs.filter(s => MAKEN.includes(s.title)), overig = r.secs.filter(s => !MAKEN.includes(s.title));
  const makenHtml = maken.length ? `<section class="card bmaken"><div class="ml-head">${foldBtn('bg-maken', 'Maken van de trap')}<h3>Maken van de trap</h3><span class="muted small">werkplaats (treden, stootborden, bomen, spil, afwerken), leuning en balustrade, bewerkingen, hout en beslag</span>
      <span class="bsec-tot">${eur(maken.reduce((a, s) => a + secTot(s), 0))}</span></div>
    ${folded('bg-maken') ? `<table class="tbl bmaken-sum">${maken.map(s => `<tr><td>${esc(s.title)}</td><td class="muted small">${s.lines.length} regel${s.lines.length === 1 ? '' : 's'}</td><td class="num">${eur(secTot(s))}</td></tr>`).join('')}</table>` : `<div class="bmaken-in">${maken.map(secHtml).join('')}</div>`}</section>` : '';
  const secsHtml = makenHtml + overig.map(secHtml).join('');
  const houtSel = r.houtUitIndeling ? `<span class="small">Hout: <b>inkooplijst van de indeling</b> (variant ${esc((N.VARIANTS[p.variant || 'hout'] || {}).label || '')})</span>` : `<span class="small">Hout: <b>schatting</b> – <a href="#" data-act="go" data-v="indeling">bereken de indeling</a> voor de exacte inkooplijst</span>`;
  const sumRow = (lab, val, inp = '', cls = '') => `<tr class="${cls}"><td>${lab}</td><td>${inp}</td><td class="num">${val}</td></tr>`;
  const sum = `<table class="tbl bsum">
    ${sumRow('Uren werkplaats', f1(t.urenWerk) + ' u')}${sumRow('Uren montage (incl. reistijd)', f1(t.urenMontage) + ' u')}
    ${sumRow('Arbeid', eur(t.arbeid))}${sumRow('Materiaal', eur(t.mat))}${t.vast ? sumRow('Vaste prijzen', eur(t.vast)) : ''}${t.transport ? sumRow('Kilometers', eur(t.transport)) : ''}${t.corr ? sumRow('Handmatige aanpassingen', eur(t.corr)) : ''}
    ${sumRow('<b>Subtotaal</b>', '<b>' + eur(t.sub) + '</b>', '', 'sub')}
    ${sumRow('Opslag op arbeid', eur(t.opslagA), pctIn('bsum', 'data-k="opslagArbeid"', t.opA))}
    ${sumRow('Opslag op materiaal', eur(t.opslagM), pctIn('bsum', 'data-k="opslagMat"', t.opM))}
    ${sumRow('Korting', t.korting ? '− ' + eur(t.korting) : '', '€ ' + numIn('bsum', 'data-k="korting"', B.korting || ''))}
    ${sumRow('<b>Totaal excl. BTW</b>', '<b>' + eur(t.excl) + '</b>', '', 'sub')}
    ${sumRow('BTW', eur(t.btwBedrag), pctIn('bsum', 'data-k="btw"', t.btw))}
    ${sumRow('<b>Totaal incl. BTW</b>', '<b>' + eur(t.incl) + '</b>', '', 'grand')}
    ${t.perTrede ? sumRow('Prijs per tred (excl. BTW)', eur(t.perTrede)) : ''}
    ${sumRow('Kostprijs (uren × tarief + materiaal)', eur(t.kostprijs))}${sumRow(`Marge`, `<span class="${t.marge < t.kostprijs * (c.tarief.minMarge || 0) ? 'neg' : 'pos'}">${eur(t.marge)} (${f1(t.marge / (t.kostprijs || 1) * 100)}%)</span>`)}
    ${sumRow('Indicatie werkdagen werkplaats', f1(t.urenWerk / 8) + ' dagen')}</table>`;
  return `<div class="no-print">${pageHead('Begroting', 'Uren uit uw normtijden, aantallen automatisch uit de tekening. Overschrijf een aantal of een regelbedrag waar nodig.',
      `<button data-act="go" data-v="prijzen">Prijzen en normen</button><button data-act="print" title="Interne begroting met uren en alle regels">Begroting (intern) afdrukken</button>`)}
    ${bBalk(t, c, r)}
    <div class="bgrid"><div>
      <section class="card"><div class="row wrap">${houtSel}${pur && pur.rest && pur.rest.waarde > 0 ? `<label class="small" title="Bruikbare reststukken (${eur(pur.rest.waarde)}) gaan terug op de plank: dit deel van hun waarde gaat van de houtprijs af. Leeg = de standaard bij Prijzen (${f1((+c.tarief.restPct || 0) * 100).replace(/,0$/, '')}%).">Restmateriaal terug ${pctIn('bsum', 'data-k="restPct"', B.restPct !== undefined ? B.restPct : c.tarief.restPct)}</label>` : ''}<span class="muted small">Uren: ${esc(c.source)}</span> <span class="muted small">· Keuzes (hout, afwerking, leuning, opties): <a href="#" data-act="go" data-v="uitvoering">Uitvoering</a></span></div>${r.warn.length ? `<div class="bwarn">${r.warn.map(w => `<div>⚠ ${esc(w)}</div>`).join('')}</div>` : ''}
        ${CONFIGURATOR && p.config && (p.config.toegepast || p.config.gekozen) ? `<div class="cf-binfo">${ICON.config}<div><b>${p.config.toegepast ? 'Keuzes uit de configurator: variant ' + esc(p.config.toegepast.naam) : 'Configurator'}</b>
          <label class="small cf-bgebruik"><input type="checkbox" data-bind="bcfgebruik" ${p.config.uit ? '' : 'checked'}> Configurator gebruiken <span class="muted">${p.config.uit ? '– uit: keuzes blijven bewaard, maar gaan niet meer vanzelf naar hout en begroting' : '– keuzes in de configurator gaan vanzelf naar hout en begroting'}</span></label>
          ${(p.config.meldingen || []).length ? `<ul class="cf-meld">${p.config.meldingen.map(m => `<li class="${m.kind}">${esc(m.text)}</li>`).join('')}</ul>` : p.config.toegepast ? '<div class="muted small">De tekening past bij de keuzes.</div>' : ''}</div><button class="small" data-act="go" data-v="configurator">Configurator</button></div>` : ''}</section>
      ${secsHtml}
      ${kpAan() ? kpNacalc(p, r) : ''}
      ${(r.opties || []).length ? `<section class="card bopties"><div class="ml-head"><h3>Opties</h3><span class="muted small">niet in het totaal; als meerprijs op de offerte</span></div><table class="tbl compact">${r.opties.map(o => `<tr><td>${esc(o.label)}</td><td class="num">${hoBedrag(o.excl)}</td><td class="num muted small">incl. ${hoBedrag(o.incl)}</td></tr>`).join('')}</table></section>` : ''}</div>
      <aside class="bside"><section class="card sticky"><h3>Samenvatting</h3>${sum}</section>${hoBegrotingKaart(p)}</aside></div></div>
    ${ui.printDoc === 'spec' ? specPrint(p, r) : ui.printDoc === 'pakket' ? pakketPrint(p, r) : budgetPrint(p, r)}`;
}
// ---------- scherm Klant: klantgegevens, specificatiestaat, offerte en afdrukken voor de klant ----------
function scrKlant() {
  const p = proj(), c = C();
  if (!p.parts.length && !(CONFIGURATOR && p.config)) return pageHead('Klant', 'Offerte en specificatiestaat.') + `<section class="card empty-state"><h3>Eerst een tekening inlezen</h3><button class="primary" data-act="go" data-v="importeren">Naar Tekening</button></section>`;
  const pur = purchaseOf(p), r = CO.begroting(c, p, pur, pur ? null : houtSchatting(p)), K = p.begroting.klant;
  const kf = (k, label, type = 'text', w = '') => `<label>${label}<input type="${type}" class="${w}" data-bind="bklant" data-k="${k}" value="${esc(K[k] || '')}"></label>`;
  const klant = `<div class="tar-grid klant">${kf('naam', 'Klant')}${kf('adres', 'Adres')}${kf('plaats', 'Postcode en plaats')}${kf('tel', 'Telefoon / e-mail')}${kf('nr', 'Opdrachtnummer')}${kf('lever', 'Gewenste leverdatum', 'date')}
    <label>Status<select data-bind="bklant" data-k="status">${opts(CO.STATUS, K.status || 'Offerte')}</select></label></div>`;
  return `<div class="no-print">${pageHead('Klant', 'Wat de klant krijgt: de offerte (met prijzen) en de specificatiestaat met tekening (zonder prijzen). Vink rechts aan wat je afdrukt.')}
    <div class="bgrid"><div>
      <section class="card"><div class="ml-head">${foldBtn('bg-klant', 'Klant')}<h3>Klant en project</h3><span class="muted small">${esc(K.naam || '')}${K.status ? ' · ' + esc(K.status) : ''}</span></div>${folded('bg-klant') ? '' : klant}</section>
      ${r.warn.length ? `<section class="card"><div class="bwarn">${r.warn.map(w => `<div>⚠ ${esc(w)}</div>`).join('')}</div></section>` : ''}
      ${specCard(p, r)}
      ${offerteCard(p, r)}</div>
      <aside class="bside">${afdrukKaart(p)}<section class="card"><h3>Totaal</h3><div class="uv-bedrag"><b>${eur(r.tot.excl)}</b><span class="muted small">excl. BTW · incl. ${eur(r.tot.incl)}</span></div><button class="small" data-act="go" data-v="begroting">Naar de prijsopbouw</button></section></aside></div></div>
    ${ui.printDoc === 'spec' ? specPrint(p, r) : ui.printDoc === 'pakket' ? pakketPrint(p, r) : ''}`;
}
// kop rechtsboven: logo (offerte en specificatiestaat); de bedrijfsgegevens alleen op de offerte (volledig = true)
function firmaBlok(b, volledig) {
  const logo = b.logo ? `<img class="bp-logo" src="${b.logo}" alt="${esc(b.naam || 'Logo')}">` : '';
  if (!volledig) return `<div class="bp-firm">${logo || `<b>${esc(b.naam || '')}</b>`}</div>`;
  const r = (k, w) => (w ? `<tr><th>${k}</th><td>${esc(w)}</td></tr>` : '');
  return `<div class="bp-firm">${logo}${logo ? '' : `<b>${esc(b.naam || '')}</b>`}
    <div class="bp-adres">${esc(b.adres || '')}<br>${esc(b.plaats || '')}</div>
    <table class="bp-gegevens">${r('t', b.tel)}${r('e', b.mail)}${r('i', b.web)}</table>
    <table class="bp-gegevens">${r('Iban', b.iban)}${r('Btw-nr', b.btwnr)}${r('Kvk', b.kvk)}</table></div>`;
}
// nette afdrukversie (alleen zichtbaar bij afdrukken)
function budgetPrint(p, r) {
  const c = C(), K = p.begroting.klant, b = c.bedrijf, t = r.tot;
  const lines = r.secs.map(s => { const ls = s.lines.filter(l => l.def); return ls.length ? `<tr class="ph"><th colspan="4">${esc(s.title)}</th></tr>` + ls.map(l => `<tr><td>${l.extra && l.extra.bew && c.bewerkingen.find(b => b.id === l.extra.bew.id) ? `<span class="bthumb">${DW.forBew(c.bewerkingen.find(b => b.id === l.extra.bew.id))}</span>` : ''}${esc(l.label)}</td><td class="num">${f2(l.qty)} ${esc(l.unit)}</td><td class="num">${l.uren ? f2(l.uren) + ' u' : ''}</td><td class="num">${eur(l.def)}</td></tr>`).join('') : ''; }).join('');
  return `<div class="print-only bprint">
    <div class="bp-head"><div><h1>Begroting</h1><p>${esc(p.name)}${K.nr ? ' · ' + esc(K.nr) : ''}<br>Datum ${new Date().toLocaleDateString('nl-NL')}${K.lever ? ' · gewenste levering ' + new Date(K.lever).toLocaleDateString('nl-NL') : ''}</p></div>
      ${firmaBlok(b, true)}</div>
    <p class="bp-klant"><b>${esc(K.naam || '')}</b><br>${esc(K.adres || '')}<br>${esc(K.plaats || '')}<br>${esc(K.tel || '')}</p>
    <table class="tbl bp-table"><thead><tr><th>Omschrijving</th><th class="num">Aantal</th><th class="num">Uren</th><th class="num">Bedrag</th></tr></thead><tbody>${lines}</tbody></table>
    <table class="tbl bp-sum"><tr><td>Subtotaal</td><td class="num">${eur(t.sub)}</td></tr>${t.opslagA ? `<tr><td>Opslag arbeid (${f1(t.opA * 100)}%)</td><td class="num">${eur(t.opslagA)}</td></tr>` : ''}${t.opslagM ? `<tr><td>Opslag materiaal (${f1(t.opM * 100)}%)</td><td class="num">${eur(t.opslagM)}</td></tr>` : ''}${t.korting ? `<tr><td>Korting</td><td class="num">− ${eur(t.korting)}</td></tr>` : ''}
      <tr class="sub"><td>Totaal excl. BTW</td><td class="num">${eur(t.excl)}</td></tr><tr><td>BTW ${f1(t.btw * 100)}%</td><td class="num">${eur(t.btwBedrag)}</td></tr><tr class="grand"><td>Totaal incl. BTW</td><td class="num">${eur(t.incl)}</td></tr></table>
    ${hoPrint(p)}
    <p class="muted small">Uren werkplaats ${f1(t.urenWerk)} · montage ${f1(t.urenMontage)}. Gebaseerd op normtijden: ${esc(c.source)}.</p></div>`;
}

// ---------- specificatiestaat voor de klant: wat er gemaakt wordt, zonder prijzen ----------
// Bron: de tekening (aantallen, houtsoort per onderdeel), de begroting (leuning, balustrade, afwerking, opties, montage)
// en – als die is overgezet – de gekozen configurator-variant (looprichting, kanten, verdiepingen).
function specVariant(p) {
  const cfg = p.config; if (!CONFIGURATOR || !cfg || !cfg.toegepast) return null;
  return (cfg.varianten || []).find(v => v.id === cfg.toegepast.variant) || null;
}
function specGroepen(p, r) {
  const c = C(), B = p.begroting, v = specVariant(p), st = S();
  const inc = p.parts.filter(x => x.include !== false), lines = r.secs.flatMap(s => s.lines);
  const L = (pre) => lines.filter(l => l.key === pre || l.key.startsWith(pre + ':')).filter(l => +l.qty > 0);
  const hout = (m) => CF.houtNaam(m) || '–', getal = (x) => f2(x).replace(/,00$/, '');
  const G = [];
  // 1. de trap (per trap)
  for (const s of p.stairs.length ? p.stairs : [{ id: null, name: p.name }]) {
    const pp = s.id ? inc.filter(x => x.stair === s.id) : inc, n = (t) => pp.filter(x => x.type === t).length, cfgS = B.stairs[s.id || '-'] || {};
    const rows = [['Aantal', P.aantalVan(s) > 1 ? `${P.aantalVan(s)} stuks (${P.aantalVan(s)} × dezelfde trap)` : '1 stuk'], ['Type trap', cfgS.type || (v ? v.type : '–')]];
    if (v) rows.push(['Looprichting', v.richting === 'links' ? 'Linksom' : 'Rechtsom'], ['Verdiepingshoogte', CF.schatting(v).H + ' mm']);
    if (n('trede')) rows.push(['Aantal treden', String(n('trede'))]);
    rows.push(['Uitvoering', n('stootbord') ? 'Dichte trap (met stootborden)' : 'Open trap (zonder stootborden)']);
    if (n('spil')) {
      // kopse maat (doorsnede) per spil, gegroepeerd: bv. "3 stuks, kopse maat 90 × 90 mm"
      const maten = new Map();
      for (const x of pp.filter(x => x.type === 'spil')) { const a = Math.round(x.W || 0), b = Math.round(x.thickness || 0), k = `${Math.max(a, b)} × ${Math.min(a, b)}`; maten.set(k, (maten.get(k) || 0) + 1); }
      rows.push(['Trapspillen', [...maten].map(([k, q]) => `${q} ${q === 1 ? 'stuk' : 'stuks'}, kopse maat ${k} mm`).join('; ')]);
    }
    G.push({ titel: p.stairs.length > 1 ? `Trap ${stairCode(p, s.id)} – ${s.name}` : 'Uw trap', rows });
  }
  // 2. per kant: boom en leuning (keuze uit de configurator, anders zoals getekend)
  // de ingelezen tekening gaat voor de configurator: bomen per kant zoals getekend (als de tekening kanten kent)
  const tekKant = inc.some(x => (x.type === 'trapboom' || x.type === 'keepboom') && x.side);
  const spiltrap = Object.values(B.stairs || {}).some(s => s.type === 'Spiltrap') && inc.some(x => x.type === 'spil');
  const boomTek = (side) => { const b = inc.filter(x => (x.type === 'trapboom' || x.type === 'keepboom') && x.side === side);
    return b.length ? [...new Set(b.map(x => P.TYPES[x.type].label.toLowerCase().replace(/^./, ch => ch.toUpperCase())))].join(' + ') : (spiltrap ? 'Spil (geen boom)' : 'Geen boom'); };
  for (const [k, lab, side] of CF.KANT) {
    const rows = [];
    if (v) {
      const e = CF.kant(v, k), boom = (CF.BOMEN.find(b => b[0] === e.boom) || [, e.boom])[1];
      rows.push(['Boom', tekKant ? boomTek(side) : e.boom === 'geen' ? 'Geen boom' : boom]);   // recht/gebogen niet op de specificatiestaat
      if (!tekKant) for (const nr of CF.vluchtNrs(v)) { const x = CF.vlucht(v, k, nr); if (x.afwijkend && x.boom !== e.boom) rows.push(['Vlucht ' + nr, x.boom === 'geen' ? 'Geen boom' : (CF.BOMEN.find(b => b[0] === x.boom) || [, x.boom])[1]]); }
      const geenLeunTek = inc.some(x => x.type === 'leuning' && x.side) && !inc.some(x => x.type === 'leuning' && x.side === side);
      rows.push(['Leuning', e.leuning === 'geen' || geenLeunTek ? 'Geen' : `${e.leuning === 'muur' ? 'Aan de muur' : 'Vrij, op een balustrade'} – ${e.lp.toLowerCase()}, ${e.lv.toLowerCase()}`]);
      // kant zonder boom en zonder leuning (bv. spiltrap rechts): niet op de specificatiestaat
      if (rows.length === 2 && /^(Geen boom|Spil \(geen boom\))$/.test(rows[0][1]) && rows[1][1] === 'Geen') continue;
    } else {
      // recht/gebogen staat niet op de specificatiestaat (wens gebruiker); de begroting leest het uit de tekening
      // de leuning staat één keer bij "Leuning, balustrade en spillen" (niet ook hier per kant)
      const bomen = inc.filter(x => (x.type === 'trapboom' || x.type === 'keepboom') && x.side === side);
      if (!bomen.length) continue;
      rows.push(['Boom', [...new Set(bomen.map(x => P.TYPES[x.type].label.toLowerCase().replace(/^./, ch => ch.toUpperCase())))].join(' + ')]);
    }
    G.push({ titel: lab + ' (naar boven lopend)', rows });
  }
  // 4a. leuningen: één regel per soort leuning (profiel, vorm, hout), met de meters per kant erachter – niet per kant herhaald
  const leunL = [...L('leuning'), ...L('leun')].map(l => {
    const side = l.key.startsWith('leuning:') ? l.key.split(':')[1] : '', lk = (B.leuningKant || {})[side] || {};
    const cfgL = Object.assign({}, B.leuning, lk, (l.extra && l.extra.leuning) || {});
    const waar = l.key.startsWith('leun:') ? 'extra' : side ? side.toLowerCase() + (lk.plaats ? (lk.plaats === 'muur' ? ' aan de muur' : ' vrij') : '') : '';
    return { cfgL, waar, m: +l.qty || 0 };
  });
  const leunSoort = new Map();
  for (const x of leunL) { const k = [x.cfgL.profiel, x.cfgL.vorm, x.cfgL.hout].join('|'); (leunSoort.get(k) || leunSoort.set(k, []).get(k)).push(x); }
  // 3. houtsoort per onderdeel (zoals ingedeeld). Links en rechts gelijk = één regel; de leuning staat al bij 4a (met houtsoort)
  const hrows = new Map();
  for (const x of P.sortParts(inc)) {
    if (x.type === 'leuning' && leunL.length) continue;
    const val = `${hout(N.materialOf(x, st, p.typeMaterial))}, ${f0(x.thickness)} mm`;
    const per = hrows.get(x.type) || hrows.set(x.type, new Map()).get(x.type), kant = x.side && ['trapboom', 'keepboom', 'leuning'].includes(x.type) ? x.side.toLowerCase() : '';
    (per.get(kant) || per.set(kant, new Set()).get(kant)).add(val);
  }
  const hRegels = [];
  for (const [t, per] of hrows) {
    const waarden = [...per.values()].map(s => [...s].join(' / '));
    if (new Set(waarden).size === 1) hRegels.push([P.TYPES[t].label, waarden[0]]);
    else for (const [kant, s] of per) hRegels.push([P.TYPES[t].label + (kant ? ' ' + kant : ''), [...s].join(' / ')]);
  }
  if (hRegels.length) G.push({ titel: 'Houtsoort', rows: hRegels });
  // 4. leuning en balustrade (meters uit de tekening, × aantal)
  const lrows = [];
  [...leunSoort.values()].forEach((lijst, i) => {
    const g = lijst[0].cfgL, m = lijst.length > 1 || lijst[0].waar ? lijst.map(x => `${x.waar ? x.waar + ' ' : ''}${getal(x.m)} m`).join(', ') : getal(lijst[0].m) + ' m';
    lrows.push([leunSoort.size > 1 ? 'Leuning ' + (i + 1) : 'Leuning', `${g.profiel || ''}${g.vorm ? ', ' + g.vorm.toLowerCase() : ''}${g.hout ? ', ' + g.hout : ''} · ${m}`, DW.profiel(g.profiel)]);
  });
  // leuningdragers: gekozen soort, anders de standaard muurleuninghouder uit het beslag (soort + aantal)
  // zonder aantal (wens gebruiker): alleen welke dragers, bij de muurleuning
  for (const l of L('drager')) lrows.push(['Leuningdragers', `${(c.dragers.find(d => d.id === B.drager.id) || {}).naam || l.label.replace(/^Leuningdragers – /, '')} (bij de muurleuning)`]);
  if (!L('drager').length) for (const l of lines.filter(l => l.key.startsWith('bs:') && /muurleuninghouder/i.test(l.label) && +l.qty > 0)) lrows.push(['Leuningdragers', `${l.label} (bij de muurleuning)`]);
  for (const l of L('bal')) { const g = l.extra.cfg, sp = l.extra.spijl, vk = l.extra.vloerKeuze || {};
    // balustrade per verdieping anders: eigen houtsoort / afwerking van die verdieping erbij
    const eigen = [vk.hout, vk.afw && (c.afwerkingen.find(a => a.id === vk.afw) || {}).naam].filter(Boolean).map(x => ' · ' + x).join('');
    lrows.push([l.label.replace(/ – [^–]*$/, '').replace(/^Balustrade – /, 'Balustrade ') || 'Balustrade', `spijl ${sp.naam.toLowerCase()} · tussenruimte ${g.tussen} mm${g.onderslof ? ' · met onderslof' : ''}${eigen} · ${getal(l.qty)} m`, DW.spijl(sp, 'thumb')]); }
  // getekende spijltjes (balusters in de tekening): het gekozen spijltype (Uitvoering), anders het standaardspijltje
  if (inc.some(x => x.type === 'baluster')) { const sp = c.spijltypes.find(s => s.id === B.spijl) || c.spijltypes.find(s => s.id === CO.balStdVan(c).spijl);
    if (sp) lrows.push(['Spijltjes', `${sp.naam} · ${inc.filter(x => x.type === 'baluster').length * 1} stuks`, DW.spijl(sp, 'thumb')]); }
  for (const l of L('spil')) lrows.push([l.label.replace(/^Trapspillen – /, '').replace(/^./, ch => ch.toUpperCase()), getal(l.qty) + ' stuks']);
  if (lrows.length) G.push({ titel: 'Leuning, balustrade en spillen', rows: lrows });
  // 5. afwerking
  // per soort onderdeel, zelfde opbouw als Houtsoort
  // per soort één regel; stukken met een eigen afwerking (regel afw:<soort>:<afwerking>) erbij als "… (2 stuks: wit gegrond)"
  const afwEigen = (t) => lines.filter(l => l.key.startsWith('afw:' + t + ':') && l.qty > 0).map(l => `${l.extra.n} ${l.extra.n === 1 ? 'stuk' : 'stuks'}: ${(c.afwerkingen.find(a => a.id === l.extra.value) || {}).naam || '?'}`);
  // heeft de hele soort een afwijkende afwerking (bv. deze trap anders dan de rest van het project), dan alleen die tonen
  const afwNaam = (id) => (c.afwerkingen.find(a => a.id === id) || {}).naam || '?';
  const arows = lines.filter(l => l.key.startsWith('afw:') && l.extra && l.extra.afw).map(l => { const t = l.key.slice(4), eigen = lines.filter(x => x.key.startsWith('afw:' + t + ':') && x.qty > 0);
    const tekst = !(l.qty > 0) && eigen.length ? eigen.map(x => afwNaam(x.extra.value)).join(' / ')
      : ((c.afwerkingen.find(a => a.id === (l.extra || {}).value) || {}).naam || l.label.split(' – ').pop()) + (afwEigen(t).length ? ' (' + afwEigen(t).join('; ') + ')' : '');
    return [(P.TYPES[t] || {}).label || t, tekst]; }).filter((r, i, all) => true);
  if (arows.length) G.push({ titel: 'Afwerking', rows: arows });
  // 6. speciale opties (bewerkingen) met tekening
  const brows = L('bew').map(l => { const b = c.bewerkingen.find(x => x.id === l.extra.bew.id) || {}; return [b.naam || l.label, `${getal(l.qty)} ${l.unit}`, DW.forBew(b)]; });
  G.push({ titel: 'Speciale opties', rows: brows.length ? brows : [['Geen', '']] });
  // 7. montage
  G.push({ titel: 'Levering en montage', rows: [['Montage', B.geenMontage ? 'Alleen leveren' : 'Wij plaatsen de trap'], ['Oude trap verwijderen', B.sloop ? 'Ja' : 'Nee']] });
  return G;
}
// ---------- tekening: eigen blad met 3D-beeld, boven- en zijaanzicht (spectekening.js: sptScherm/sptPrint) ----------
// losse regels weghalen (per project, p.begroting.specWeg = ['groep|regel']); op het scherm doorgestreept met ↺, op de afdruk weg
const specSleutel = (g, k) => g.titel + '|' + k;
// eigen teksten (per project, p.begroting.specTekst {sleutel: tekst}): gaan voor de automatische tekst. Sleutel = 'groep|regel' (waarde),
// '#groep' (titel), '__noot' (zin onderaan). Valt de automatische regel weg, dan valt de eigen tekst ook weg (nooit dubbel).
const SPEC_NOOT = 'Deze specificatie hoort bij de offerte. Schetsen zijn niet op schaal; maten volgens de tekening.';
function specTekstVan(p, key, auto) { const T = p.begroting.specTekst || {}; return T[key] != null ? T[key] : auto; }
function specTekstHtml(p, key, auto, scherm, tag) {
  const T = p.begroting.specTekst || {}, eigen = T[key] != null, w = specTekstVan(p, key, auto);
  if (!scherm) return esc(w);
  return `<${tag || 'span'} class="sp-tekst${eigen ? ' eigen' : ''}" contenteditable="true" spellcheck="false" data-sptk="${esc(key)}" data-auto="${esc(auto)}" title="Klik om de tekst aan te passen${eigen ? ' (aangepast – automatisch: ' + esc(auto) + ')' : ''}">${esc(w)}</${tag || 'span'}><button class="ghost small sp-tterug${eigen ? '' : ' hidden'}" data-act="spectekstterug" data-v="${esc(key)}" title="Automatische tekst terug">↺</button>`;
}
// bewerken op het scherm: opslaan bij verlaten (geen hertekenen, zodat een klik elders gewoon doorgaat); Enter = klaar, Esc = terug
function bindSpecTekst() {
  const p = proj(); if (!p || !p.begroting) return;
  document.querySelectorAll('.spcard [data-sptk]').forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } else if (e.key === 'Escape') { el.textContent = specTekstVan(p, el.dataset.sptk, el.dataset.auto); el.blur(); } });
    el.addEventListener('blur', () => {
      const key = el.dataset.sptk, auto = el.dataset.auto, t = el.textContent.replace(/\s+/g, ' ').trim(), T = p.begroting.specTekst = p.begroting.specTekst || {};
      const oud = T[key];
      if (!t || t === auto) delete T[key]; else T[key] = t;
      if (!t) el.textContent = auto;
      if (oud === T[key]) return;
      el.classList.toggle('eigen', T[key] != null); const kn = el.nextElementSibling; if (kn && kn.classList.contains('sp-tterug')) kn.classList.toggle('hidden', T[key] == null);
      save();
    });
  });
}
function specBody(p, r, scherm, zonderTek) {
  const v = specVariant(p), weg = new Set(p.begroting.specWeg || []);
  // tekening: op het scherm het tekeningblad (verschuifbaar), op de afdruk een eigen blad (specPrint)
  const tek = scherm && !zonderTek ? sptScherm(p) : '';
  // drie vaste kolommen die van boven naar beneden lezen: 1 de trap en de kanten, 2 hout en afwerking, 3 leuning/balustrade, opties, montage
  const kolVan = (t) => /^(Uw trap|Trap |Linker|Rechter)/.test(t) ? 0 : /^(Houtsoort|Afwerking)/.test(t) ? 1 : 2;
  const kols = [[], [], []];
  specGroepen(p, r).forEach(g => {
    const rows = g.rows.filter(([k]) => scherm || !weg.has(specSleutel(g, k)));
    if (!rows.length) return;
    kols[kolVan(g.titel)].push(`<div class="sp-grp"><h3>${specTekstHtml(p, '#' + g.titel, g.titel, scherm)}</h3><table>${rows.map(([k, x, img]) => {
      const s = specSleutel(g, k), uit = weg.has(s);
      const knop = scherm ? `<button class="ghost small sp-weg" data-act="${uit ? 'specterug' : 'specweg'}" data-v="${esc(s)}" title="${uit ? 'Weer op de specificatiestaat zetten' : 'Niet op de specificatiestaat'}">${uit ? '↺' : '✕'}</button>` : '';
      return `<tr${uit ? ' class="sp-uit"' : ''}><th>${esc(k)}</th><td>${knop}${img ? `<span class="sp-img">${img}</span>` : ''}${specTekstHtml(p, s, String(x == null ? '' : x), scherm)}</td></tr>`;
    }).join('')}</table></div>`);
  });
  const groups = kols.filter(k => k.length).map(k => `<div class="sp-kol">${k.join('')}</div>`).join('');
  const vb = v && (v.vloerBal || []).some(b => b.punten.length > 1) ? `<h3 class="sp-h3">Balustrades op de verdiepingen</h3><div class="cfp-vb">${v.vloerBal.filter(b => b.punten.length > 1).map(b => `<figure>${vbSvg(b, false, v)}<figcaption>${esc(b.vloer)} – ${f2(CF.vbLengte(b) / 1000)} m${Math.max(1, ...p.stairs.map(P.aantalVan)) > 1 ? ` (× ${Math.max(...p.stairs.map(P.aantalVan))})` : ''}</figcaption></figure>`).join('')}</div>` : '';
  return `${tek}
    <div class="sp-grid">${groups}</div>${vb}${v && v.notitie ? `<p class="cfp-note">${esc(v.notitie)}</p>` : ''}
    <p class="muted small sp-noot">${specTekstHtml(p, '__noot', SPEC_NOOT, scherm)}</p>`;
}
function specCard(p, r) {
  const head = `<div class="ml-head">${foldBtn('bg-spec', 'Specificatiestaat')}<h3>Specificatiestaat voor de klant</h3><span class="muted small">wat er gemaakt wordt, zonder prijzen – als bijlage bij de offerte</span>
    <button class="small" data-act="printspec">Specificatiestaat afdrukken / PDF</button></div>`;
  const nWeg = (p.begroting.specWeg || []).length, nTekst = Object.keys(p.begroting.specTekst || {}).length;
  const info = `<p class="muted small sp-weginfo">Klik op een tekst om hem aan te passen (geldt voor dit project); ✕ = regel niet op de specificatiestaat.
    ${nWeg ? `${nWeg} regel${nWeg > 1 ? 's' : ''} weggehaald (doorgestreept). <button class="ghost small" data-act="specallesterug">Alles terugzetten</button>` : ''}
    ${nTekst ? `${nTekst} tekst${nTekst > 1 ? 'en' : ''} aangepast. <button class="ghost small" data-act="spectekstallesterug">Automatische teksten terug</button>` : ''}</p>`;
  if (folded('bg-spec')) return `<section class="card spcard">${head}</section>`;
  // meerdere trappen: eerst het tekeningblad (per groep trappen), daaronder de specificatiestaat van de gekozen trap
  // (elke trap kan een eigen houtsoort en afwerking hebben; op de afdruk krijgt elke trap een eigen staat)
  if (p.stairs.length > 1) {
    const lijst = specPerTrap(p), i = Math.max(0, p.stairs.findIndex(s => s.id === ui.specTrap)), t = lijst[i];
    const kies = `<div class="uv-trappen sp-trapkies" role="tablist" aria-label="Specificatiestaat van welke trap"><span class="muted small">Specificatiestaat van</span>${p.stairs.map((s, j) => `<button class="prtab ${j === i ? 'on' : ''}" role="tab" aria-selected="${j === i}" data-act="spectrap" data-v="${s.id}"><span class="scode">${stairCode(p, s.id)}</span>${esc(s.name)}</button>`).join('')}</div>`;
    return `<section class="card spcard">${head}${info}${sptScherm(p)}${kies}${specBody(t.p, begrotingVan(t.p), true, true)}</section>`;
  }
  return `<section class="card spcard">${head}${info + specBody(p, r, true)}</section>`;
}
CLICK.push(function click_spec(a, t, v, p) {
  const B = p && p.begroting; if (!B) return false;
  switch (a) {
    case 'spectrap': ui.specTrap = v; render(); return;
    case 'specweg': B.specWeg = [...new Set([...(B.specWeg || []), v])]; break;
    case 'specterug': B.specWeg = (B.specWeg || []).filter(k => k !== v); break;
    case 'specallesterug': B.specWeg = []; break;
    case 'spectekstterug': if (B.specTekst) delete B.specTekst[v]; break;
    case 'spectekstallesterug': B.specTekst = {}; break;
    default: return false;
  }
  save(); render();
});
// label = naam van de variant of houtsoort-optie (meerdere specificatiestaten, offerte.js specLijst)
// kop van de specificatiestaat; ook bovenaan het tekeningblad (spectekening.js), zodat beide bladen er hetzelfde uitzien
function specKop(p, label, titel) {
  const K = p.begroting.klant || {};
  return `<div class="bp-head sp-head"><div><h1>${esc(titel || 'Specificatiestaat trap')}${label ? ` <span class="sp-label">– ${esc(label)}</span>` : ''}</h1><p>${esc(K.naam || p.name)}<br>${esc(K.adres || '')} ${esc(K.plaats || '')}<br>${K.nr ? 'Offerte ' + esc(K.nr) + ' · ' : ''}Datum ${new Date().toLocaleDateString('nl-NL')}</p></div>
      ${firmaBlok(C().bedrijf, false)}</div>`;
}
// blad: project(kopie) voor het tekeningblad vóór deze staat (undefined = dit project zelf, null = geen blad: staat volgt op een ander blad)
function specPrint(p, r, label, blad, bladLabel) {
  return `<div class="print-only cfprint spprint">${blad === undefined ? sptPrint(p, label) : blad ? sptPrint(blad, bladLabel) : ''}
    ${specKop(p, label)}
    ${specBody(p, r)}
    <div class="cfp-sign"><div>Voor akkoord, handtekening klant<span></span></div><div>Datum<span></span></div></div></div>`;
}


CLICK.push(function click_begroting(a, t, v, p, e) {
  switch (a) {
    // specificatiestaat i.p.v. de begroting afdrukken (daarna weer de begroting als afdrukversie)
    // afwerking per soort onderdeel (afwijkend van treden/overige)
    case 'bafwadd': { const ty = document.getElementById('af-t').value, af = document.getElementById('af-a').value; if (ty && af) { (p.begroting.afw = p.begroting.afw || {})[ty] = af; save(); render(); } break; }
    case 'bafwdel': if (p.begroting.afw) { delete p.begroting.afw[v]; save(); render(); } break;
    case 'printspec': {
      // alleen de specificatiestaat(en): per aangevinkte variant/houtsoort-optie, elk met eigen tekeningblad (offerte.js)
      const pur = purchaseOf(p); afdrukStart(p, CO.begroting(C(), p, pur, pur ? null : houtSchatting(p)), { offerte: false, spec: true });
      break;
    }
    // ---- 3D ----
    case 'v3view': ZP.view3d.setView(v); break;
    case 'v3seltype': { ui.sel3d = new Set(p.parts.filter(x => x.mesh && x.type === v && x.include !== false).map(x => x.id)); render(); break; }
    case 'v3clear': ui.sel3d = new Set(); render(); break;
    case 'v3addbew': {
      const sel = p.parts.filter(x => ui.sel3d.has(x.id)); if (!sel.length) { ui.msg = { text: 'Selecteer eerst onderdelen in de 3D-weergave.', kind: 'err' }; return render(); }
      const b = C().bewerkingen.find(x => x.id === document.getElementById('v3-bew').value); if (!b) break;
      // aantal volgt uit de selectie: stuks/treden = aantal, per m = lengte, per m² = oppervlak, per trap = 1
      const n = b.eenheid === 'per m' ? Math.round(sel.reduce((a, x) => a + x.L, 0) / 100) / 10
        : b.eenheid === 'per m²' ? Math.round(sel.reduce((a, x) => a + Math.abs(G.area(x.poly)), 0) / 1e5) / 10 : b.eenheid === 'per trap' ? 1 : sel.length;
      const B = p.begroting = p.begroting || {}; B.bew = B.bew || [];
      B.bew.push({ key: CO.uid('k'), id: b.id, n, parts: sel.map(x => x.id) });
      ui.msg = { text: `"${b.naam}" toegevoegd aan ${sel.length} ${sel.length === 1 ? 'onderdeel' : 'onderdelen'} (${String(n).replace('.', ',')} ${b.eenheid.replace(/^per /, '')}).`, kind: 'ok' }; save(); render(); break;
    }
    case 'v3rembew': { const [key, pid] = v.split('|'); const bw = p.begroting.bew.find(x => x.key === key); if (bw && bw.parts) { bw.parts = bw.parts.filter(x => x !== pid); if (!bw.parts.length) p.begroting.bew = p.begroting.bew.filter(x => x !== bw); else { const b = C().bewerkingen.find(x => x.id === bw.id); if (b && !/per m|per trap/.test(b.eenheid)) bw.n = bw.parts.length; } } save(); render(); break; }
    // ---- begroting ----
    case 'bbaladd': {
      const B = p.begroting = p.begroting || {}; B.bal = B.bal || [];
      const m = parseFloat(((document.getElementById('bb-m') || {}).value || '').replace(',', '.'));
      if (!(m > 0)) { ui.msg = { text: 'Vul het aantal meter balustrade in.', kind: 'err' }; return render(); }
      // samenstelling van het gekozen type overnemen; daarna per regel aan te passen
      const bl = { id: CO.uid('bb'), type: document.getElementById('bb-type').value, m, plaats: document.getElementById('bb-pl').value };
      Object.assign(bl, CO.balRegel(C(), bl).cfg); B.bal.push(bl); save(); render(); break;
    }
    case 'bbaldel': p.begroting.bal = p.begroting.bal.filter(b => b.id !== v); save(); render(); break;
    case 'bleunadd': {
      const B = p.begroting = p.begroting || {}; B.leun = B.leun || []; const g = (id) => (document.getElementById(id) || {}).value || '';
      const m = parseFloat(g('bl-m').replace(',', '.'));
      if (!(m > 0)) { ui.msg = { text: 'Vul het aantal meter leuning in.', kind: 'err' }; return render(); }
      B.leun.push({ id: CO.uid('bl'), profiel: g('bl-prof'), vorm: g('bl-vorm'), hout: g('bl-hout'), m }); save(); render(); break;
    }
    case 'bleundel': p.begroting.leun = (p.begroting.leun || []).filter(l => l.id !== v); save(); render(); break;
    case 'bbewadd': {
      const B = p.begroting = p.begroting || {}; B.bew = B.bew || [];
      const b = C().bewerkingen.find(x => x.id === document.getElementById('bw-sel').value); if (!b) break;
      let n = parseFloat(((document.getElementById('bw-n') || {}).value || '').replace(',', '.'));
      // automatisch aantal: per tred = aantal treden, per trap = aantal trappen, per m leuning = leuninglengte …
      if (!(n > 0)) n = ZP.config.autoAantal(p, b);
      B.bew.push({ key: CO.uid('k'), id: b.id, n }); save(); render(); break;
    }
    case 'bbewdel': p.begroting.bew = p.begroting.bew.filter(b => b.key !== v); save(); render(); break;
    case 'bbesadd': { const B = p.begroting; const id = document.getElementById('bs-sel').value; B.qty['bs:' + id] = B.qty['bs:' + id] > 0 ? B.qty['bs:' + id] + 1 : 1; save(); render(); break; }
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_begroting(b, t, p, part, numv) {
  switch (b) {
    case 'bafw': (p.begroting.afw = p.begroting.afw || {})[t.dataset.k] = t.value; break;
    case 'bliters': { const L = p.begroting.afwLiters = p.begroting.afwLiters || {}, l = numv(t.value); if (l > 0) L[t.dataset.id] = { l, m2: +t.dataset.m2 || 0 }; else delete L[t.dataset.id]; break; }
    // ---- begroting ----
    case 'bklant': (p.begroting.klant = p.begroting.klant || {})[t.dataset.k] = t.value; break;
    case 'bqty': if (t.value.trim() === '') delete p.begroting.qty[t.dataset.k]; else p.begroting.qty[t.dataset.k] = numv(t.value); break;
    case 'bovr': if (t.value.trim() === '') delete p.begroting.ovr[t.dataset.k]; else p.begroting.ovr[t.dataset.k] = numv(t.value); break;
    case 'bstair': { const so = p.begroting.stairs[t.dataset.s] = p.begroting.stairs[t.dataset.s] || {}; so[t.dataset.f] = t.value; if (t.dataset.f === 'type') so.typeHand = true; break; }   // eigen keuze blijft staan
    case 'bleun': {
      const l = t.dataset.id ? (p.begroting.leun || []).find(x => x.id === t.dataset.id) : p.begroting.leuning; if (!l) break;
      l[t.dataset.f] = t.dataset.f === 'm' ? numv(t.value) : t.value; break;
    }
    case 'bwpick': ui.bwPick = t.value; break;
    case 'bboomvorm': { const m = p.begroting.boomVormen = p.begroting.boomVormen || {}, k = 'id:' + t.dataset.id; if (t.value) m[k] = t.value; else delete m[k]; break; }
    case 'bdrager': p.begroting.drager = Object.assign(p.begroting.drager || { deel: 1 }, { id: t.value }); break;
    case 'bbal': {
      const b = p.begroting.bal.find(x => x.id === t.dataset.id); if (!b) break; const f = t.dataset.f;
      if (b.spijl === undefined) Object.assign(b, CO.balRegel(C(), b).cfg);     // oude regel: samenstelling van het type vastleggen
      b[f] = f === 'onderslof' ? t.checked : f === 'm' || f === 'tussen' ? numv(t.value) : t.value; break;
    }
    case 'bbew': { const b = p.begroting.bew.find(x => x.key === t.dataset.k); if (b) b.n = numv(t.value); break; }
    case 'bsum': { const k = t.dataset.k; if (t.value.trim() === '') delete p.begroting[k]; else p.begroting[k] = t.dataset.pct ? numv(t.value) / 100 : numv(t.value); break; }
    default: return false;
  }
});
