// Configurator: de trap bij de klant samenstellen (stappen, tegels, live schets, varianten, keuzeoverzicht).
// Logica in js/config.js (ZP.config); hier alleen het scherm.
const CF = ZP.config;
ui.cfPrijs = false; ui.cfBtw = false; ui.present = false;
const cfOf = (p) => CF.ensure(p, C(), db.materials);
const getPath = (o, path) => path.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
const setPath = (o, path, val) => { const ks = path.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = val; };
// verkoopprijs per eenheid (excl. BTW, met opslag) – alleen zichtbaar met "Prijzen tonen"
function cfVerkoop(arbeid, mat, vast) {
  const T = C().tarief, v = vast > 0 ? +vast : arbeid * (1 + (+T.opslagArbeid || 0)) + mat * (1 + (+T.opslagMat || 0));
  return v * (ui.cfBtw ? 1 + (+T.btw || 0) : 1);
}
const cfPr = (bedrag, eenheid) => (ui.cfPrijs ? `<em class="cf-price">${eur(bedrag)}<small> ${eenheid}</small></em>` : '');
// schets-opties uit een variant
function cfSketch(v) {
  const c = C(), afw = (id) => (c.afwerkingen.find(a => a.id === id) || {}).naam || '';
  // zijaanzicht van de vrije kant (of de linkerkant): boom, leuning en balustrade van die kant
  const k = CF.vrijeKanten(v)[0] || 'links', e = CF.kant(v, k);
  return { open: v.open, boom: e.boom === 'keepboom' ? 'keepboom' : 'trapboom', houtTrede: CF.houtNaam(v.houtTrede), houtRest: CF.houtNaam(e.hout), afwTreden: afw(v.afwTreden), afwRest: afw(v.afwRest || v.afwTreden),
    leuning: { aan: e.leuning !== 'geen', hout: e.lh }, bal: { aan: e.leuning === 'vrij', onderslof: v.bal.onderslof, spijl: c.spijltypes.find(s => s.id === e.spijl) } };
}
// tegel: kiest één waarde (data-f = pad in de variant)
function cfTile(f, val, cur, pic, title, sub = '', price = '', extraCls = '') {
  const on = String(cur) === String(val), t = typeof val === 'boolean' ? ' data-t="b"' : '';
  return `<button class="cf-tile ${on ? 'on' : ''} ${extraCls}" data-act="cfset" data-f="${f}" data-v="${typeof val === 'boolean' ? (val ? 1 : 0) : esc(val)}"${t} aria-pressed="${on}">
    ${pic ? `<span class="cf-pic">${pic}</span>` : ''}<span class="cf-tt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${price}${on ? '<i class="cf-check">✓</i>' : ''}</button>`;
}
const cfSeg = (f, cur, list) => `<div class="cf-seg">${list.map(([val, lab]) => `<button class="${String(cur) === String(val) ? 'on' : ''}" data-act="cfset" data-f="${f}" data-v="${typeof val === 'boolean' ? (val ? 1 : 0) : esc(val)}"${typeof val === 'boolean' ? ' data-t="b"' : ''}>${esc(lab)}</button>`).join('')}</div>`;
const cfField = (lab, html, wide) => `<label class="cf-field ${wide ? 'wide' : ''}"><span>${lab}</span>${html}</label>`;
const cfSec = (title, sub, body) => `<div class="cf-sec"><h3>${title}</h3>${sub ? `<p class="muted small">${sub}</p>` : ''}${body}</div>`;
const swatch = (hout, afw) => { const c = DW.woodColor(hout, afw); return `<svg class="cf-sw" viewBox="0 0 60 40" aria-hidden="true"><rect x="1" y="1" width="58" height="38" rx="6" fill="${c.f}" stroke="${c.l}" stroke-opacity=".5"/><path d="M6 12q24-6 48 0M6 22q24-5 48 1M6 31q24-6 48-1" stroke="${c.l}" stroke-opacity=".22" fill="none"/></svg>`; };

// ---------- de stappen ----------
function cfStapKlant(p, cfg) {
  const K = cfg.klant, f = (k, lab, type = 'text', wide) => cfField(lab, `<input type="${type}" data-bind="cfklant" data-k="${k}" value="${esc(K[k] || '')}">`, wide);
  return cfSec('Klant en situatie', 'Wie, waar, en wat u ter plekke ziet.', `<div class="cf-form">${f('naam', 'Naam')}${f('tel', 'Telefoon')}${f('adres', 'Adres')}${f('plaats', 'Postcode en plaats')}${f('mail', 'E-mail', 'email')}${f('bezoek', 'Datum bezoek', 'date')}
      ${cfField('Notities (situatie, wensen, bijzonderheden)', `<textarea rows="4" data-bind="cfklant" data-k="notitie">${esc(K.notitie || '')}</textarea>`, true)}</div>`)
    + cfSec('Foto’s van de situatie', 'Trapgat, aansluiting boven en onder, muren. Worden verkleind opgeslagen.', `<div class="cf-fotos">${cfg.fotos.map(ft => `<figure><img src="${ft.img}" alt="" data-act="fotozoom" data-kind="situatie" data-v="${ft.id}" title="Groot bekijken"><button class="ghost small" data-act="cffotodel" data-v="${ft.id}" title="Foto weghalen">✕</button></figure>`).join('')}
      <label class="cf-fotoadd">${ICON.upload}<span>Foto toevoegen</span><input type="file" accept="image/*" capture="environment" multiple data-act="cffoto" hidden></label></div>`);
}
function cfStapType(v) {
  // maten zoals StairDesigner (lengte per loop, breedte) met een plattegrond op maat
  const ob = ZP.cf3d.opbouw(v), bw = Math.round(ob.bbox.x1 - ob.bbox.x0), bh = Math.round(ob.bbox.y1 - ob.bbox.y0);
  const maatIn = (k, lab, sub) => cfField(`${lab}${sub ? ` <small class="muted">${sub}</small>` : ''}`, `<input class="w6 num" data-bind="cfval" data-f="maten.${k}" value="${esc(v.maten[k])}" inputmode="numeric"> mm`);
  const plan = `<svg class="cf-maatplan" viewBox="-700 -500 ${bw + 1200} ${bh + 1100}" aria-hidden="true">${trapPlan(v, 0, 0, bw, bh)}
      <path d="M0 ${bh + 260}H${bw}M0 ${bh + 200}v120M${bw} ${bh + 200}v120" class="cf-maatlijn"/><text x="${bw / 2}" y="${bh + 480}" class="cf-maattxt" text-anchor="middle">${bw}</text>
      <path d="M-260 0V${bh}M-320 0h120M-320 ${bh}h120" class="cf-maatlijn"/><text x="-330" y="${bh / 2}" class="cf-maattxt" text-anchor="end" dominant-baseline="middle">${bh}</text></svg>`;
  const maten = cfSec('Maten', 'Zoals in StairDesigner: lengte per loop (buitenmaat, inclusief de draai) en de trapbreedte. De plattegrond volgt deze maten.', `<div class="cf-maten"><div class="cf-maatvelden">
      ${CF.MAATVELDEN[CF.vormVan(v)].map(([k, lab, sub]) => maatIn(k, lab, sub)).join('')}${maatIn('breedte', 'Trapbreedte', '')}
      ${CF.vormVan(v) !== 'recht' ? cfField('Looplijn <small class="muted">vanaf de binnenkant (draaikant)</small>', `<input class="w6 num" data-bind="cfval" data-f="maten.looplijn" value="${esc(v.maten.looplijn || '')}" placeholder="${Math.round(ob.looplijnAfstand)}" inputmode="numeric"> mm`) : ''}
      <div class="cf-voorstel">Lengtes voorstellen bij aantrede <input class="w4 num" id="cf-at" value="250"> mm <button class="small" data-act="cfmatenvoorstel">Voorstellen</button></div></div><div class="cf-maatbox">${plan}</div></div>`);
  // hoogte → schatting van het aantal treden (zoals StairDesigner: verdiepingsvloerhoogte, aantal treden, optrede, aantrede)
  const sch = CF.schatting(v), bb = (ok, txt) => `<span class="sig ${ok ? 'ok' : 'bad'}">${txt}</span>`;
  const at = ob.aantrede || sch.aantrede, stap = 2 * sch.optrede + at;
  const hoogte = cfSec('Hoogte en treden', 'Meet van vloer tot vloer (afgewerkt). Het aantal treden is een schatting; de tekening geeft later het exacte aantal.', `<div class="cf-hoogte">
      ${cfField('Verdiepingshoogte (mm)', `<input class="w6 num" data-bind="cfval" data-f="hoogte" value="${esc(v.hoogte)}" inputmode="numeric">`)}
      ${cfField('Aantal treden', `<input class="w4 num" data-bind="cfval" data-f="treden" value="${sch.handmatig ? esc(v.treden) : ''}" placeholder="${sch.n}" title="Leeg = schatting uit de hoogte">`)}
      <div class="cf-schat"><b>${sch.handmatig ? '' : '± '}${sch.n} treden</b>${(() => { const ts = CF.tredenSoort(v); return ts.verdreven ? `<span class="cf-rv"><i class="r"></i>${ts.recht} recht <i class="v"></i>${ts.verdreven} verdreven</span>` : `<span class="cf-rv"><i class="r"></i>alle treden recht</span>`; })()}<span>optrede ${f1(sch.optrede)} mm ${bb(sch.bbOptrede, sch.bbOptrede ? '≤ 188' : '> 188 mm')}</span>
        <span>aantrede ${ob.aantrede ? 'uit de maten' : '±'} ${Math.round(at)} mm ${bb(at >= 220, at >= 220 ? '≥ 220' : '< 220 mm')}</span><span class="${stap >= 570 && stap <= 650 ? 'muted' : 'neg'}">stapmaat 2 × optrede + aantrede = ${Math.round(stap)} mm</span></div></div>`);
  // geen trapsoorten (model-tegels) meer in de configurator: het type trap komt uit de tekening (of de schets)
  return `<div class="cf-row2">${cfSec('Looprichting', 'Naar boven lopend', cfSeg('richting', v.richting, CF.RICHTING))}
      ${cfSec('Aantal vluchten', 'Lopen tussen draaien/bordessen', cfSeg('vluchten', +v.vluchten, [1, 2, 3, 4].map(n => [n, String(n)])))}</div>` + maten + hoogte;
}
// ---------- per kant (links/rechts, naar boven lopend) en per vlucht, zoals StairDesigner ----------
function cfStapKanten(v) {
  const c = C(), hk = CF.houtKeuzes(db.materials), W = c.tarief.werk;
  const sel = (f, val, list, std) => `<select data-bind="cfval" data-f="${f}"><option value="">${esc(std)}</option>${list.map(x => { const [a, b] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(a)}" ${String(val) === String(a) ? 'selected' : ''}>${esc(b)}</option>`; }).join('')}</select>`;
  const kaart = ([k, lab]) => {
    const s = v.kanten[k], e = CF.kant(v, k), f = (x) => `kanten.${k}.${x}`, ander = k === 'links' ? 'rechts' : 'links';
    const boomPr = (b) => (b === 'geen' ? '' : cfPr(cfVerkoop(CO.boomU(c, CF.boomSoort(b), e.vorm) * W, 0), 'per m'));
    let h = `<div class="cf-kantcard"><div class="cf-kanthead">${DW.kantPlan(k)}<h3>${lab}</h3><button class="small ghost" data-act="cfkantcopy" data-v="${k}" title="Alle keuzes van deze kant overnemen naar de ${ander === 'links' ? 'linker' : 'rechter'} kant">Kopieer naar ${ander}</button></div>
      <h4>Boom</h4><div class="cf-tiles">${CF.BOMEN.map(([b, bl, sub]) => cfTile(f('boom'), b, s.boom, DW.boom(b), bl, sub, boomPr(b))).join('')}</div>`;
    if (s.boom !== 'geen') h += `<div class="cf-kantrow"><label>Vorm${cfSeg(f('vorm'), e.vorm, CO.VORMEN.map(x => [x, x]))}</label>
      <label>Houtsoort <small class="muted">alleen als deze kant afwijkt</small>${sel(f('hout'), CF.houtNaam(s.hout), hk.map(x => x.hout), 'zoals Basiskeuzes (' + (CF.houtNaam(CF.houtVan(v, e.soort)) || '–') + ')')}</label></div>`;
    h += `<h4>Leuning</h4>${cfSeg(f('leuning'), s.leuning, CF.LEUNING_PLAATS)}`;
    if (s.leuning !== 'geen') h += `<div class="cf-kantrow"><label>Profiel${sel(f('leuningProfiel'), s.leuningProfiel, c.profielen, 'standaard (' + v.leuning.profiel + ')')}</label>
      <label>Houtsoort${sel(f('leuningHout'), s.leuningHout, c.leuningHout || [], 'standaard (' + (v.leuning.hout || '–') + ')')}</label>
      <label>Vorm${sel(f('leuningVorm'), s.leuningVorm, CO.VORMEN, 'standaard (' + v.leuning.vorm.toLowerCase() + ')')}</label>
      ${s.leuning === 'vrij' ? `<span class="muted small">Spijltje kiest u later, bij <a href="#" data-act="cfstap" data-v="spijl">Spijltjes</a>.</span>` : '<span></span>'}</div>`;
    // per vlucht afwijken (zoals Trapboom Rechts #3 in StairDesigner)
    const nrs = CF.vluchtNrs(v), nAfw = nrs.filter(n => CF.vlucht(v, k, n).afwijkend).length;
    if (nrs.length > 1) h += `<details class="cf-vl" ${nAfw ? 'open' : ''}><summary>Per vlucht afwijken${nAfw ? `<small>${nAfw} afwijkend</small>` : ''}</summary>
      <table class="cf-vltab"><thead><tr><th></th><th>Boom</th><th>Vorm</th><th>Houtsoort</th></tr></thead><tbody>${nrs.map(n => { const o = s.vluchten[n] || {}, x = CF.vlucht(v, k, n);
        return `<tr class="${x.afwijkend ? 'afw' : ''}"><td><b>Vlucht ${n}</b></td><td>${sel(f('vluchten.' + n + '.boom'), o.boom, CF.BOMEN.map(b => [b[0], b[1]]), 'zoals kant')}</td>
          <td>${sel(f('vluchten.' + n + '.vorm'), o.vorm, CO.VORMEN, 'zoals kant')}</td><td>${sel(f('vluchten.' + n + '.hout'), CF.houtNaam(o.hout), hk.map(y => y.hout), 'zoals kant')}</td></tr>`; }).join('')}</tbody></table>
      <p class="muted small">Vlucht 1 is de onderste. In StairDesigner heten de onderdelen dan bv. "Trapboom ${CF.KANT.find(x => x[0] === k)[2]} #2".</p></details>`;
    return h + '</div>';
  };
  return `<div class="cf-kanten">${CF.KANT.map(kaart).join('')}</div>`;
}
// zijaanzicht-icoon: dichte trap (met stootborden) of open trap
const cfTrapIcoon = (open) => `<svg viewBox="0 0 120 80" class="cf-trapico" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => { const x = 10 + i * 20, y = 66 - i * 13;
  return `<rect x="${x}" y="${y}" width="28" height="5" rx="1" class="t"/>${open ? '' : `<rect x="${x + 2}" y="${y + 5}" width="3" height="${8}" class="s"/>`}`; }).join('')}<path d="M6 78L112 8" class="b"/></svg>`;
// Basiskeuzes (grof → fijn): open of dicht, één houtsoort en afwerking voor alles, daarna per onderdeel afwijken
function cfStapHout(v) {
  const c = C(), hk = CF.houtKeuzes(db.materials), cur = CF.houtNaam(v.houtTrede);
  const afwN = (id) => (c.afwerkingen.find(a => a.id === id) || {}).naam || '';
  const afwStd = v.afwRest || v.afwTreden, heeftLeuning = CF.KANT.some(([k]) => v.kanten[k].leuning !== 'geen') || (v.vloerBal || []).length;
  const rijen = [['trede', 'Treden'], ...CF.soortenVan(v), ...(heeftLeuning ? [['leuning', 'Leuning']] : [])];
  const houtVanRij = (t) => (t === 'trede' ? cur : t === 'leuning' ? (v.leuning.hout || '') : CF.houtNaam(CF.houtVan(v, t)));
  // eigen houtsoort per kant of vlucht (stap Bomen en kanten) telt ook als afwijkend
  const kantEigen = Object.values(v.kanten || {}).some(s => s.hout || Object.values(s.vluchten || {}).some(o => o && o.hout));
  const eenHout = !kantEigen && rijen.every(([t]) => t === 'leuning' || houtVanRij(t) === cur), eenAfw = rijen.every(([t]) => CF.afwVan(v, t) === v.afwTreden);
  // A · open of dicht
  const openTile = (val, t, sub) => `<button class="cf-lux ${!!v.open === val ? 'on' : ''}" data-act="cfset" data-f="open" data-v="${val ? 1 : 0}" data-t="b">${cfTrapIcoon(val)}<b>${t}</b><small>${sub}</small>${!!v.open === val ? '<i class="cf-check">✓</i>' : ''}</button>`;
  const A = `<div class="cf-lux-row">${openTile(false, 'Gesloten trap', 'met stootborden')}${openTile(true, 'Open trap', 'zonder stootborden')}</div>`;
  // B · houtsoort: eerst alles, dan per onderdeel (één klik per rij)
  const woodTile = (h) => `<button class="cf-wood ${eenHout && h.hout === cur ? 'on' : ''}" data-act="cfhoutalles" data-v="${esc(h.hout)}" title="Alle onderdelen in ${esc(h.hout)}">${fotoVan('hout', h.hout) ? `<img src="${fotoVan('hout', h.hout)}" alt="">${fotoZoom('hout', h.hout, h.hout)}` : swatch(h.hout, afwN(v.afwTreden))}<b>${esc(h.hout)}</b><small>${h.soorten.length ? h.soorten.length + ' plank soorten' : 'houtsoort'}</small>${eenHout && h.hout === cur ? '<i class="cf-check">✓</i>' : ''}</button>`;
  const chip = (act, f, val, on, label, sw) => `<button class="cf-chip ${on ? 'on' : ''}" data-act="${act}" data-f="${f}" data-v="${esc(val)}">${sw}<span>${esc(label)}</span></button>`;
  const houtRij = ([t, lab]) => {
    const lijst = t === 'leuning' ? (c.leuningHout || []) : hk.map(h => h.hout), now = houtVanRij(t), eigen = t !== 'trede' && t !== 'leuning' && now !== cur;
    const f = t === 'trede' ? 'houtTrede' : t === 'leuning' ? 'leuning.hout' : 'hout.' + t;
    return `<tr class="${eigen ? 'eigen' : ''}"><th>${esc(lab)}${eigen ? '<small>afwijkend</small>' : ''}</th><td><div class="cf-chips">${lijst.map(h => chip('cfset', f, h, now === h, h, `<i class="cf-dot" style="background:${DW.woodColor(h, afwN(CF.afwVan(v, t))).f}"></i>`)).join('')}</div></td></tr>`; };
  const B = (hk.length ? `<div class="cf-woods">${hk.map(woodTile).join('')}</div>` : '<p class="warn">De materialenlijst is nog leeg. Voeg eerst houtsoorten toe bij Materialenlijst.</p>')
    + `<details class="cf-fijn" ${eenHout ? '' : 'open'}><summary>Per onderdeel een andere houtsoort${eenHout ? '' : ' <span class="pill warn">afwijkend</span>'}</summary>${kantEigen ? `<p class="small cf-kanteigen">Bomen hebben een eigen houtsoort per kant: ${Object.entries(v.kanten).filter(([, s]) => s.hout).map(([k, s]) => esc(k + ': ' + CF.houtNaam(s.hout))).join(', ') || 'per vlucht'} (stap Bomen en kanten). Die gaat voor deze keuze; een houtsoort hierboven kiezen of "Alles gelijk maken" haalt hem weg.</p>` : ''}<table class="cf-mx">${rijen.map(houtRij).join('')}</table></details>`;
  // C · afwerking: eerst alles, dan per onderdeel
  const afwTile = (a) => `<button class="cf-wood ${eenAfw && a.id === v.afwTreden ? 'on' : ''}" data-act="cfafwalles" data-v="${a.id}" title="Alles ${esc(a.naam)}">${fotoVan('afw', a.id) ? `<img src="${fotoVan('afw', a.id)}" alt="">${fotoZoom('afw', a.id, a.naam)}` : swatch(cur, a.naam)}<b>${esc(a.naam)}</b><small>${esc(a.product || '')}</small>${cfPr(cfVerkoop((+a.uM2 || 0) * c.tarief.werk, CO.afwMat(a)), 'per m²')}${eenAfw && a.id === v.afwTreden ? '<i class="cf-check">✓</i>' : ''}</button>`;
  const plaat = CO.geenAfw(c, CF.houtVan(v, 'stootbord'));
  const afwRij = ([t, lab]) => {
    const now = CF.afwVan(v, t), eigen = t !== 'trede' && now !== v.afwTreden, f = t === 'trede' ? 'afwTreden' : 'afw.' + t;
    if (t === 'stootbord' && plaat) return `<tr><th>${esc(lab)}</th><td class="muted small">plaatmateriaal (${esc(CF.houtNaam(CF.houtVan(v, 'stootbord')))}) – wordt niet afgewerkt</td></tr>`;
    return `<tr class="${eigen ? 'eigen' : ''}"><th>${esc(lab)}${eigen ? '<small>afwijkend</small>' : ''}</th><td><div class="cf-chips">${c.afwerkingen.map(a => chip('cfset', f, a.id, now === a.id, a.naam, `<i class="cf-dot" style="background:${DW.woodColor(houtVanRij(t) || cur, a.naam).f}"></i>`)).join('')}</div></td></tr>`; };
  const Cc = `<div class="cf-woods">${c.afwerkingen.map(afwTile).join('')}</div>
    <details class="cf-fijn" ${eenAfw ? '' : 'open'}><summary>Per onderdeel een andere afwerking${eenAfw ? '' : ' <span class="pill warn">afwijkend</span>'}</summary><table class="cf-mx">${rijen.map(afwRij).join('')}</table></details>`;
  // snel starten met een materiaalstijl (zoals StairDesigner)
  const stijlen = c.materiaalstijlen || [];
  const stijl = `<div class="cf-stijl"><span>Snel kiezen</span><select data-bind="cfstijl"><option value="">– materiaalstijl –</option><option value="__gelijk">Alles in de houtsoort van de treden</option>${stijlen.map(s => `<option value="${s.id}" ${v.materiaalstijl === s.naam ? 'selected' : ''}>${esc(s.naam)}</option>`).join('')}</select>
    <button class="small ghost" data-act="cfstijlsave" title="Deze houtsoorten en afwerkingen bewaren als materiaalstijl">Bewaren als stijl…</button>${!eenHout || !eenAfw ? '<button class="small ghost" data-act="cfhoutstd" title="Alle afwijkingen per onderdeel weghalen">Alles gelijk maken</button>' : ''}</div>`;
  return `<div class="cf-basis">${stijl}
    ${cfSec('<span class="cf-num">1</span> Open of gesloten', 'Bepaalt of er stootborden komen.', A)}
    ${cfSec('<span class="cf-num">2</span> Houtsoort', 'Eén keuze voor de hele trap; per onderdeel afwijken kan eronder.', B)}
    ${cfSec('<span class="cf-num">3</span> Afwerking', 'Bepaalt ook de uren afwerken per onderdeel (olie kost meer tijd dan grondverf).', Cc)}</div>`;
}
function cfStapLeuning(v) {
  const c = C(), L = v.leuning, W = c.tarief.werk;
  const plaats = CF.KANT.filter(([k]) => v.kanten[k].leuning !== 'geen').map(([k, lab]) => `${lab.toLowerCase()}: ${v.kanten[k].leuning === 'muur' ? 'aan de muur' : 'vrij'}`);
  let s = `<div class="cf-sec"><h3>Waar komt de leuning?</h3><p class="muted small">${plaats.length ? 'Per kant ingesteld bij Kanten: ' + esc(plaats.join(' · ')) + '.' : 'Bij Kanten staat nog geen leuning aan.'} <a href="#" data-act="cfstap" data-v="kanten">Wijzigen</a></p></div>`;
  const lp =(pr) => { const pm = CO.leuningPerM(c, pr, L.vorm, L.hout), lv = c.leuningVast[CO.leunKey(pr, L.vorm, L.hout)]; return cfPr(cfVerkoop(pm.u * W + pm.ophangen, pm.mat, lv && lv.prijs), 'per m'); };
  s += cfSec('Profiel (standaard)', 'Doorsnede van de leuning; per kant afwijken kan bij Kanten',`<div class="cf-tiles">${c.profielen.map(pr => cfTile('leuning.profiel', pr, L.profiel, DW.profiel(pr) + fotoZoom('profiel', pr, pr), pr, '', lp(pr), fotoVan('profiel', pr) ? 'foto' : '')).join('')}</div>`);
  s += `<div class="cf-row2">${cfSec('Vorm', '', cfSeg('leuning.vorm', L.vorm, CO.VORMEN.map(x => [x, x])))}${cfSec('Houtsoort leuning', '', `<p class="muted small">${esc(L.hout || '–')} · gekozen bij <a href="#" data-act="cfstap" data-v="hout">Basiskeuzes</a></p>`)}</div>`;
  if (CF.muurKanten(v).length) s += cfSec('Leuningdragers', 'Type houder aan de muur', `<div class="cf-tiles">${(c.dragers || []).map(d => cfTile('leuning.drager', d.id, L.drager, DW.drager(d) + fotoZoom('drager', d.id, d.naam), d.naam, '', cfPr(cfVerkoop(0, +d.prijs || 0), 'per stuk'))).join('')}</div>`);
  return s;
}
function cfStapBal(v) {
  const c = C(), B = v.bal, W = c.tarief.werk;
  const vk = CF.vrijeKanten(v), S = v.spillen, SP = c.spilSoorten || {};
  // spillen: hoek-, eind- en tussenspil zoals StairDesigner, met eigen stukprijs
  const spillen = cfSec('Spillen', 'Zoals in StairDesigner: eindspil, hoekspil, tussenspil (aan/uit), met doorsnede.', `<div class="cf-tiles">${CF.SPILSOORTEN.map(([sk, lab, sub]) => {
      const on = !!S[sk], ft = fotoVan('spil', sk); return `<button class="cf-tile ${on ? 'on' : ''} ${ft ? 'foto' : ''}" data-act="cfset" data-f="spillen.${sk}" data-v="${on ? 0 : 1}" data-t="b" aria-pressed="${on}">${ft ? `<span class="cf-pic"><img class="dw dw-img" src="${ft}" alt="">${fotoZoom('spil', sk, lab)}</span>` : ''}<span class="cf-tt"><b>${lab}</b><small>${sub}</small></span>${SP[sk] ? cfPr(cfVerkoop((+SP[sk].u || 0) * W, +SP[sk].mat || 0, SP[sk].vast), 'per stuk') : ''}${on ? '<i class="cf-check">✓</i>' : ''}</button>`; }).join('')}</div>
      <div class="cf-row2">${cfField('Doorsnede', cfSeg('spillen.vorm', S.vorm, [['Vierkant', 'Vierkant'], ['Rechthoekig', 'Rechthoekig'], ['Rond', 'Rond']]))}${cfField('Maat (mm)', `<input class="w5 num" data-bind="cfval" data-f="spillen.maat" value="${esc(S.maat)}">`)}</div>`);
  if (!vk.length) return cfSec('Balustrade langs de trap', '', `<p class="muted">Geen kant staat op "Vrij (balustrade)". Zet bij <a href="#" data-act="cfstap" data-v="kanten">Kanten</a> de leuning van een kant op Vrij voor een balustrade.</p>`) + spillen;
  let s = cfSec('Balustrade langs de trap', `Voor de vrije ${vk.length === 2 ? 'kanten' : 'kant'} (${vk.map(k => k === 'links' ? 'links' : 'rechts').join(' en ')}). Het spijltje kiest u later, bij <a href="#" data-act="cfstap" data-v="spijl">Spijltjes</a>.`, '');
  s += `<div class="cf-row2">${cfSec('Tussenruimte', 'max. 100 mm', cfSeg('bal.tussen', +B.tussen, [[80, '80 mm'], [90, '90 mm'], [100, '100 mm']]))}
    ${cfSec('Onderslof', '', cfSeg('bal.onderslof', !!B.onderslof, [[true, 'Met onderslof'], [false, 'Zonder']]))}</div>`;
  return s + spillen;
}
// Spijltjes: pas als de rest vastligt. Standaard voor de trap, per vrije kant afwijken, en per verdiepingsbalustrade.
function cfStapSpijl(v) {
  const c = C(), B = v.bal, W = c.tarief.werk, vk = CF.vrijeKanten(v), vb = v.vloerBal || [];
  if (!vk.length && !vb.length) return cfSec('Spijltjes', '', `<p class="muted">Deze trap heeft geen balustrade. Zet bij <a href="#" data-act="cfstap" data-v="kanten">Bomen en kanten</a> een kant op "Vrij" of teken bij <a href="#" data-act="cfstap" data-v="vloeren">Verdiepingen</a> een balustrade.</p>`);
  const bp = (sp) => { const cfg = { spijl: sp.id, tussen: +B.tussen || 100, onderslof: !!B.onderslof }, pm = CO.balustradePerM(c, cfg, 'boom'), t = c.balustrades.find(b => b.spijl === sp.id && (+b.tussen || 100) === cfg.tussen && !!b.onderslof === cfg.onderslof);
    return cfPr(cfVerkoop(pm.uren * W + pm.plaatsen, pm.matSp + pm.bevM + pm.slofMat, t && t.vast), 'per m'); };
  const spTile = (f, sp, cur) => `<button class="cf-lux sp ${cur === sp.id ? 'on' : ''}" data-act="cfset" data-f="${f}" data-v="${esc(sp.id)}"><span class="cf-sppic ${fotoVan('spijl', sp.id) ? 'foto' : ''}">${DW.spijl(sp)}${fotoZoom('spijl', sp.id, sp.naam)}</span><b>${esc(sp.naam)}</b><small>${sp.breedte} mm breed</small>${bp(sp)}${cur === sp.id ? '<i class="cf-check">✓</i>' : ''}</button>`;
  let s = vk.length ? cfSec('Spijltje langs de trap', `Standaard voor de vrije ${vk.length === 2 ? 'kanten' : 'kant'}.`, `<div class="cf-lux-row wrap">${c.spijltypes.map(sp => spTile('bal.spijl', sp, B.spijl)).join('')}</div>`) : '';
  if (vk.length === 2) s += cfSec('Per kant afwijken', 'Alleen als links en rechts een ander spijltje krijgen.', `<table class="cf-mx">${vk.map(k => `<tr><th>${k === 'links' ? 'Linkerkant' : 'Rechterkant'}</th><td><div class="cf-chips">
      <button class="cf-chip ${!v.kanten[k].spijl ? 'on' : ''}" data-act="cfset" data-f="kanten.${k}.spijl" data-v=""><span>zoals standaard</span></button>
      ${c.spijltypes.map(sp => `<button class="cf-chip ${v.kanten[k].spijl === sp.id ? 'on' : ''}" data-act="cfset" data-f="kanten.${k}.spijl" data-v="${esc(sp.id)}"><span>${esc(sp.naam)}</span></button>`).join('')}</div></td></tr>`).join('')}</table>`);
  if (vb.length) s += cfSec('Balustrades op de verdiepingen', '', `<table class="cf-mx">${vb.map(b => `<tr><th>${esc(b.vloer)}<small>${f2(CF.vbLengte(b) / 1000)} m</small></th><td><div class="cf-chips">${c.spijltypes.map(sp =>
      `<button class="cf-chip ${b.spijl === sp.id ? 'on' : ''}" data-act="cfvbset" data-id="${b.id}" data-f="spijl" data-v="${esc(sp.id)}"><span>${esc(sp.naam)}</span></button>`).join('')}</div></td></tr>`).join('')}</table>`);
  return s;
}
// tegel: plattegrond van een model met dezelfde opbouw als de trap op maat (treden en looplijn kloppen),
// bij het gekozen model de eigen maten, anders de standaardmaten van dat model
function planTegel(v, k) {
  let t = v;
  if (v.model !== k) { t = Object.assign({}, v, { maten: Object.assign({}, v.maten) }); CF.zetModel(t, k); }
  const ob = ZP.cf3d.opbouw(t), w = ob.bbox.x1 - ob.bbox.x0, h = ob.bbox.y1 - ob.bbox.y0, m = Math.max(w, h) * 0.06;
  return `<svg class="dw cf-plan cf-plan-op" viewBox="${-m} ${-m} ${w + 2 * m} ${h + 2 * m}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${trapPlan(t, 0, 0, w, h)}</svg>`;
}
// plattegrond van de trap op maat (treden uit ZP.cf3d.opbouw) in de rechthoek x, y, w, h (mm, y omlaag), met looplijn
function trapPlan(v, x, y, w, h) {
  const ob = ZP.cf3d.opbouw(v), b = ob.bbox, sx = w / ((b.x1 - b.x0) || 1), sy = h / ((b.y1 - b.y0) || 1);
  const T = (p) => [Math.round((x + (p[0] - b.x0) * sx) * 10) / 10, Math.round((y + (b.y1 - p[1]) * sy) * 10) / 10];
  // verdreven treden (wigvormig) licht gekleurd, zodat ze in de plattegrond opvallen
  let s = ob.treden.map(t => `<path class="vb-tr${t.bordes ? ' b' : CO.isVerdreven(t) ? ' vd' : ''}" d="M${t.poly.map(p => T(p).join(' ')).join('L')}z"/>`).join('');
  // looplijn uit de opbouw (vaste afstand van de binnenkant, boog rond de draai), begin = bolletje, eind = pijl
  const ll = (ob.looplijn || []).map(T);
  if (ll.length > 1) { const k = Math.max(60, Math.min(w, h) / 14), q = ll[ll.length - 1], p = ll[ll.length - 2], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L;
    const e = [q[0] - ux * k * 0.2, q[1] - uy * k * 0.2];
    s += `<path class="vb-loop" d="M${ll.slice(0, -1).map(p2 => p2.join(' ')).join('L')}L${e.join(' ')}"/><circle class="vb-pijl" cx="${ll[0][0]}" cy="${ll[0][1]}" r="${k * 0.35}"/>`
      + `<path class="vb-pijl" d="M${q[0] + ux * k * .4} ${q[1] + uy * k * .4}L${e[0] - uy * k * .5} ${e[1] + ux * k * .5}L${e[0] + uy * k * .5} ${e[1] - ux * k * .5}z"/>`; }
  return s;
}
// ---------- balustrades op verdiepingsvloeren: tekenen op een raster (mm), met het trapgat en de trap erin ----------
// edit = groot tekenvlak (klikken = punt, slepen = verplaatsen, dubbelklik = weg); anders een passend miniatuur
function vbSvg(b, edit, v, cls = '') {
  const c = C(), pts = b.punten, sp = c.spijltypes.find(s => s.id === b.spijl) || { breedte: 40 }, g = b.trapgat;
  // de trap op ware grootte op b.trap (linksboven); het trapgat staat daar los van
  const ob = v ? ZP.cf3d.opbouw(v) : null, tp = g ? CF.trapPos(b) : null, tw = ob ? ob.bbox.x1 - ob.bbox.x0 : 0, th = ob ? ob.bbox.y1 - ob.bbox.y0 : 0;
  const alle = pts.concat(g ? CF.tgHoeken(g) : []).concat(ob && tp ? [[tp.x, tp.y], [tp.x + tw, tp.y + th]] : []);
  let x0 = 0, y0 = 0, W = 6000, H = 5000;
  if (edit) { for (const [x, y] of alle) { W = Math.max(W, Math.ceil((x + 1500) / 1000) * 1000); H = Math.max(H, Math.ceil((y + 1500) / 1000) * 1000); } }
  else if (alle.length) { const xs = alle.map(p => p[0]), ys = alle.map(p => p[1]); x0 = Math.min(...xs) - 400; y0 = Math.min(...ys) - 400; W = Math.max(1500, Math.max(...xs) - x0 + 400); H = Math.max(1000, Math.max(...ys) - y0 + 400); }
  let s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="vb-bg"/>`;
  if (edit) {
    for (let x = 0; x <= W; x += 100) s += `<path d="M${x} 0V${H}" class="${x % 1000 ? 'vb-g1' : 'vb-g2'}"/>`;
    for (let y = 0; y <= H; y += 100) s += `<path d="M0 ${y}H${W}" class="${y % 1000 ? 'vb-g1' : 'vb-g2'}"/>`;
    for (let x = 1000; x < W; x += 1000) s += `<text x="${x + 30}" y="160" class="vb-ax">${x / 1000} m</text>`;
    for (let y = 1000; y < H; y += 1000) s += `<text x="30" y="${y - 30}" class="vb-ax">${y / 1000} m</text>`;
  }
  // trapgat met de plattegrond van het gekozen model; de aankomstzijde gemarkeerd
  if (g) {
    const hk = CF.tgHoeken(g), gatD = `M${hk.map(p => p.join(' ')).join('L')}z`;
    s += `<path d="${gatD}" class="vb-gat"/>`;
    if (v) {
      s += trapPlan(v, tp.x, tp.y, tw, th);
      // deel van de trap onder de vloer (buiten het trapgat) grijs: vloervlak rond de trap met het trapgat eruit
      s += `<path d="M${tp.x - 30} ${tp.y - 30}h${tw + 60}v${th + 60}h${-tw - 60}z${gatD}" class="vb-vloer" fill-rule="evenodd"/>`;
    }
    const a = CF.tgAankomst(g), h0 = hk[a], h1 = hk[(a + 1) % hk.length];
    s += `<path d="M${h0[0]} ${h0[1]}L${h1[0]} ${h1[1]}" class="vb-aank"/>`;
    if (edit) {
      const mx = (h0[0] + h1[0]) / 2, my = (h0[1] + h1[1]) / 2, off = { boven: [0, -180], onder: [0, 260], links: [-180, 0], rechts: [180, 0] }[g.aankomst] || [0, 0];
      s += `<text x="${mx + off[0]}" y="${my + off[1]}" class="vb-aanktxt" text-anchor="middle">aankomst trap</text>`;
      const ys = hk.map(p => p[1]), xs = hk.map(p => p[0]);
      s += `<text x="${(Math.min(...xs) + Math.max(...xs)) / 2}" y="${Math.max(...ys, tp ? tp.y + th : 0) + 420}" class="vb-gattxt" text-anchor="middle">${CF.tgEigen(g) ? 'trapgat eigen vorm' : `trapgat ${g.bx} × ${g.by}`}</text>`;
      if (CF.tgEigen(g) && ui.vbMode === 'gat') hk.forEach(([x, y], i) => { s += `<circle cx="${x}" cy="${y}" r="110" class="vb-handle gat" data-k="gat" data-i="${i}"><title>Slepen = verplaatsen, dubbelklik of lang drukken = weghalen</title></circle>`; });
    }
  }
  // spijlen als stipjes langs de lijn, palen op de hoekpunten, maten bij elk stuk
  const step = (+sp.breedte || 40) + (+b.tussen || 100);
  for (let i = 1; i < pts.length; i++) {
    const [a, q] = [pts[i - 1], pts[i]], L = CF.segLen(a, q); if (!L) continue;
    const ux = (q[0] - a[0]) / L, uy = (q[1] - a[1]) / L;
    s += `<path d="M${a[0]} ${a[1]}L${q[0]} ${q[1]}" class="vb-line"/>`;
    for (let d = step; d < L - step / 2; d += step) s += `<circle cx="${a[0] + ux * d}" cy="${a[1] + uy * d}" r="${Math.max(12, (+sp.breedte || 40) / 2)}" class="vb-spijl"/>`;
    // maat aan de buitenkant van het trapgat
    const mx0 = (a[0] + q[0]) / 2, my0 = (a[1] + q[1]) / 2, side = g ? Math.sign((mx0 - (g.x + g.bx / 2)) * -uy + (my0 - (g.y + g.by / 2)) * ux) || 1 : 1;
    s += `<text x="${mx0 - uy * 260 * side}" y="${my0 + ux * 260 * side}" class="vb-maat" text-anchor="middle" dominant-baseline="middle">${Math.round(L)}</text>`;
  }
  pts.forEach(([x, y], i) => { s += `<rect x="${x - 50}" y="${y - 50}" width="100" height="100" class="vb-paal"/>`; if (edit && ui.vbMode !== 'gat') s += `<circle cx="${x}" cy="${y}" r="110" class="vb-handle" data-i="${i}"><title>Slepen = verplaatsen, dubbelklik of lang drukken = weghalen</title></circle>`; });
  if (edit && !pts.length) s += `<text x="${W / 2}" y="${Math.max(400, (g ? g.y - 400 : H / 2))}" class="vb-hint" text-anchor="middle">Kies hieronder een vorm rond het trapgat, of klik zelf de hoekpunten</text>`;
  return `<svg class="vb-svg ${cls}" viewBox="${x0} ${y0} ${W} ${H}" ${edit ? `data-act="cfvbklik" data-v="${b.id}"` : 'aria-hidden="true"'}>${s}</svg>`;
}
// klikpunt in mm; raster 50 mm, vastklikken op hoeken en randen van het trapgat, bijna haaks t.o.v. het vorige punt = recht
function vbPunt(svg, ev) { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
function vbSnap(b, q, i) {
  let x = Math.round(q.x / 50) * 50, y = Math.round(q.y / 50) * 50;
  const g = b.trapgat;
  if (g) {
    const hoek = CF.tgHoeken(g).find(h => Math.hypot(h[0] - q.x, h[1] - q.y) < 200);
    if (hoek) return hoek.slice();
    if (!CF.tgEigen(g)) { for (const gx of [g.x, g.x + g.bx]) if (Math.abs(q.x - gx) < 120) x = gx;
      for (const gy of [g.y, g.y + g.by]) if (Math.abs(q.y - gy) < 120) y = gy; }
  }
  const prev = b.punten[(i === undefined ? b.punten.length : i) - 1];
  if (prev) { const dx = x - prev[0], dy = y - prev[1]; if (Math.abs(dy) < Math.abs(dx) * 0.14) y = prev[1]; else if (Math.abs(dx) < Math.abs(dy) * 0.14) x = prev[0]; }
  return [Math.max(0, x), Math.max(0, y)];
}
// punt van het trapgat (eigen vorm): raster 50 mm, vastklikken op de randen van de trap, haaks t.o.v. het vorige punt
function gatSnap(b, q, i) {
  let x = Math.round(q.x / 50) * 50, y = Math.round(q.y / 50) * 50;
  const p = proj(), v = p && CF.actief(p), tp = CF.trapPos(b);
  if (v) { const ob = ZP.cf3d.opbouw(v), tw = ob.bbox.x1 - ob.bbox.x0, th = ob.bbox.y1 - ob.bbox.y0;
    for (const gx of [tp.x, tp.x + tw]) if (Math.abs(q.x - gx) < 120) x = Math.round(gx);
    for (const gy of [tp.y, tp.y + th]) if (Math.abs(q.y - gy) < 120) y = Math.round(gy); }
  const pts = b.trapgat.punten || [], prev = pts[(i === undefined ? pts.length : i) - 1];
  if (prev) { const dx = x - prev[0], dy = y - prev[1]; if (Math.abs(dy) < Math.abs(dx) * 0.14) y = prev[1]; else if (Math.abs(dx) < Math.abs(dy) * 0.14) x = prev[0]; }
  return [Math.max(0, x), Math.max(0, y)];
}
// 3D van de actieve variant (rechts in het voorbeeld, of in de stap Verdiepingen)
function mountCf3d() {
  const el = document.getElementById('cf3d'), p = proj(); if (!el || !p || !p.config) return;
  ZP.cf3d.mount(el, CF.actief(p), C()).then(() => { const l = el.querySelector('.v3load'); if (l) l.remove(); })
    .catch(e => { el.innerHTML = `<div class="warn small">${esc(e.message)}</div>`; });
}
// slepen en dubbelklikken op de hoekpunten (na elke render opnieuw gekoppeld vanuit afterRender)
function bindVb() {
  const box = document.querySelector('.cf-vbcanvas'); if (!box) return;
  const svgNu = () => box.querySelector('svg'), bal = () => { const p = proj(); return p && CF.actief(p).vloerBal.find(x => x.id === (svgNu() || {}).dataset.v); };
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.vb-handle'); if (!h) return;
    e.preventDefault(); const b = bal(), i = +h.dataset.i; if (!b) return;
    const v = CF.actief(proj()), gat = h.dataset.k === 'gat', x0 = e.clientX, y0 = e.clientY;
    // lang drukken zonder te bewegen (aanraakscherm) = punt weghalen, zoals dubbelklikken met de muis
    let lang = setTimeout(() => { lang = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); (gat ? b.trapgat.punten : b.punten).splice(i, 1); ui.vbDrag = true; save(); render(); setTimeout(() => { ui.vbDrag = false; }, 400); }, 650);
    const move = (ev) => { if (lang && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; clearTimeout(lang); lang = null;
      const s = svgNu(); if (!s) return; if (gat) b.trapgat.punten[i] = gatSnap(b, vbPunt(s, ev), i); else b.punten[i] = vbSnap(b, vbPunt(s, ev), i); ui.vbDrag = true; box.innerHTML = vbSvg(b, true, v); };
    const up = () => { clearTimeout(lang); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (ui.vbDrag) { save(); render(); } setTimeout(() => { ui.vbDrag = false; }, 0); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  box.addEventListener('dblclick', (e) => { const h = e.target.closest('.vb-handle'); const b = bal(); if (!h || !b) return; (h.dataset.k === 'gat' ? b.trapgat.punten : b.punten).splice(+h.dataset.i, 1); save(); render(); });
}
function cfStapVloeren(v) {
  const c = C(), list = v.vloerBal;
  if (!list.some(b => b.id === ui.cfVb)) ui.cfVb = list.length ? list[0].id : null;
  const b = list.find(x => x.id === ui.cfVb);
  const tabs = list.map(x => `<button class="cf-vbtab ${x === b ? 'on' : ''}" data-act="cfvbsel" data-v="${x.id}"><span class="cf-vbmini">${vbSvg(x, false, v)}</span><span><b>${esc(x.vloer)}</b><small>${f2(CF.vbLengte(x) / 1000)} m · ${Math.max(0, x.punten.length)} spillen · peil ${f1((+x.hoogte || 0) / 1000)} m</small></span></button>`).join('');
  // snel een balustrade toevoegen per vloer (verdieping, zolder …), of een eigen naam
  // keldertrap: de trap gaat van de kelder naar de begane grond, dus trapgat en balustrade liggen op de begane grond (peil 0)
  const add = `<div class="cf-vbadd">${['1e verdieping', 'Zolder', '2e verdieping'].map(n => `<button class="small primary" data-act="cfvbadd" data-v="${esc(n)}">+ ${esc(n)}</button>`).join('')}
    <button class="small primary" data-act="cfvbadd" data-v="Begane grond" title="Trap naar de kelder: trapgat en balustrade op de begane grond (peil 0)">+ Begane grond (keldertrap)</button>
    <input id="vb-vloer" list="vb-vloeren" placeholder="andere vloer"><datalist id="vb-vloeren">${CF.VLOEREN.map(n => `<option value="${esc(n)}">`).join('')}</datalist><button class="small" data-act="cfvbadd">+</button></div>`;
  let s = cfSec('Balustrades op de verdiepingen', 'Per vloer een balustrade langs het trapgat of de vide. Het trapgat met de trap staat al in de tekening.', `<div class="cf-vbtabs">${tabs}${add}</div>`);
  if (!b) return s;
  const g = b.trapgat, n = b.punten.length;
  const segs = b.punten.slice(1).map((q, i) => `<label class="cf-seg-row"><span>Stuk ${i + 1}</span><input class="w5 num" data-bind="cfvbseg" data-id="${b.id}" data-i="${i + 1}" value="${Math.round(CF.segLen(b.punten[i], q))}"> mm</label>`).join('');
  const set = (f, val, list2) => `<div class="cf-seg">${list2.map(([x, lab]) => `<button class="${String(val) === String(x) ? 'on' : ''}" data-act="cfvbset" data-id="${b.id}" data-f="${f}" data-v="${typeof x === 'boolean' ? (x ? 1 : 0) : x}"${typeof x === 'boolean' ? ' data-t="b"' : ''}>${esc(lab)}</button>`).join('')}</div>`;
  // trapgat: maat en aankomstzijde, daarna een vorm kiezen (de balustrade staat dan direct goed) of zelf tekenen
  // trapgat los van de trap: rechthoek (maat + plaats) of eigen vorm (tekenen); deel boven de trap mag dicht blijven
  const eigen = CF.tgEigen(g), tp = CF.trapPos(b), mode = ui.vbMode === 'gat' && eigen ? 'gat' : 'bal';
  const gs = (vv, lab) => `<button class="${(eigen ? 'eigen' : 'recht') === vv ? 'on' : ''}" data-act="cfgatvorm" data-id="${b.id}" data-v="${vv}">${lab}</button>`;
  const gat = `<div class="cf-vbgat"><b>Trapgat</b><div class="cf-seg">${gs('recht', 'Rechthoek')}${gs('eigen', 'Eigen vorm')}</div>
      ${eigen ? `<span class="muted small">${g.punten.length} hoekpunten</span><button class="small ghost" data-act="cfgatwis" data-v="${b.id}">Opnieuw tekenen</button>`
        : `<label>breedte <input class="w5 num" data-bind="cfvbgat" data-id="${b.id}" data-f="bx" value="${g.bx}"> mm</label>
      <label>lengte <input class="w5 num" data-bind="cfvbgat" data-id="${b.id}" data-f="by" value="${g.by}"> mm</label>
      <label>plaats x <input class="w4 num" data-bind="cfvbgat" data-id="${b.id}" data-f="x" value="${g.x}"></label><label>y <input class="w4 num" data-bind="cfvbgat" data-id="${b.id}" data-f="y" value="${g.y}"></label>`}
      <span class="cf-vbaank">aankomst trap ${set('trapgat.aankomst', g.aankomst, CF.ZIJDEN)}</span>
      <button class="small ghost" data-act="cfvbgatstd" data-v="${b.id}" title="Trapgat = buitenmaat van de trap, helemaal open">volgens trap</button>
      <label>vloerhoogte <input class="w5 num" data-bind="cfvb" data-id="${b.id}" data-f="hoogte" value="${esc(b.hoogte)}"> mm</label></div>
    <div class="cf-vbgat"><b>Trap</b><label>plaats x <input class="w4 num" data-bind="cfvbtrap" data-id="${b.id}" data-f="x" value="${Math.round(tp.x)}"></label><label>y <input class="w4 num" data-bind="cfvbtrap" data-id="${b.id}" data-f="y" value="${Math.round(tp.y)}"></label>
      <span class="muted small">Het grijze deel van de trap ligt onder de vloer (trapgat daar dicht, let op de stahoogte).</span></div>
    ${eigen ? `<div class="cf-vbgat"><b>Tekenen</b><div class="cf-seg"><button class="${mode === 'bal' ? 'on' : ''}" data-act="cfvbmode" data-v="bal">Balustrade</button><button class="${mode === 'gat' ? 'on' : ''}" data-act="cfvbmode" data-v="gat">Trapgat</button></div>
      <span class="muted small">${mode === 'gat' ? 'Klik de hoekpunten van het trapgat; slepen = verplaatsen, dubbelklik of lang drukken = weghalen.' : 'Klik de hoekpunten van de balustrade.'}</span></div>` : ''}
    <div class="cf-vbvorm"><b>Balustrade rond het trapgat</b>${CF.VB_VORMEN.map(([k, lab]) => `<button class="small" data-act="cfvbvorm" data-id="${b.id}" data-v="${k}">${esc(lab)}</button>`).join('')}<span class="muted small">of klik zelf de hoekpunten</span></div>`;
  s += `<div class="cf-sec cf-vbedit"><div class="cf-vbhead"><h3>${esc(b.vloer)}</h3><span class="muted small">${f2(CF.vbLengte(b) / 1000)} m · ${n} spillen · klikken = punt, slepen = verplaatsen, dubbelklik of lang drukken = weghalen</span>
      <span class="cf-vbtools"><button class="small" data-act="cfvbundo" data-v="${b.id}" ${n ? '' : 'disabled'}>↶ Laatste punt weg</button><button class="small" data-act="cfvbwis" data-v="${b.id}" ${n ? '' : 'disabled'}>Wissen</button><button class="small ghost" data-act="cfvbdel" data-v="${b.id}">Verwijderen</button></span></div>
    ${gat}
    <div class="cf-vbviews"><div class="cf-vbcanvas">${vbSvg(b, true, v)}</div></div>
    <div class="cf-vbprops">
      <div>${cfField('Vloer', `<input data-bind="cfvb" data-id="${b.id}" data-f="vloer" list="vb-vloeren" value="${esc(b.vloer)}">`)}
        ${segs ? `<div class="cf-segs"><span class="muted small">Maten (exact invullen)</span>${segs}</div>` : ''}</div>
      <div>${cfField('Spijltje', `<select data-bind="cfvb" data-id="${b.id}" data-f="spijl">${opts(c.spijltypes.map(x => [x.id, x.naam]), b.spijl)}</select>`)}
        <div class="cf-field"><span>Tussenruimte</span>${set('tussen', +b.tussen, [[80, '80 mm'], [90, '90 mm'], [100, '100 mm']])}</div>
        <div class="cf-field"><span>Onderslof</span>${set('onderslof', !!b.onderslof, [[true, 'Met'], [false, 'Zonder']])}</div></div>
      <div>${cfField('Leuning – profiel', `<select data-bind="cfvb" data-id="${b.id}" data-f="leuning.profiel">${opts(c.profielen, b.leuning.profiel)}</select>`)}
        ${cfField('Leuning – houtsoort', `<select data-bind="cfvb" data-id="${b.id}" data-f="leuning.hout">${opts(c.leuningHout || [], b.leuning.hout)}</select>`)}
        <span class="cf-sp">${DW.spijl(c.spijltypes.find(x => x.id === b.spijl) || {})}</span></div></div></div>`;
  return s;
}
function cfStapExtras(v) {
  const c = C(), W = c.tarief.werk, g = new Map();
  for (const b of c.bewerkingen) { const k = b.onderdeel || 'Overig'; if (!g.has(k)) g.set(k, []); g.get(k).push(b); }
  // per onderdeel een groep met foto/tekening per bewerking; groep met keuzes staat open, de rest dicht
  const gekozen = v.extras.map(id => c.bewerkingen.find(b => b.id === id)).filter(Boolean);
  const kaart = (b) => { const on = v.extras.includes(b.id);
    return `<button class="cf-extra ${on ? 'on' : ''}" data-act="cfextra" data-v="${b.id}" aria-pressed="${on}"><span class="cf-expic">${DW.forBew(b)}${fotoZoom('bew', b.id, b.naam)}</span><span class="cf-extt"><b>${esc(b.naam)}</b><small>${esc(b.eenheid)}</small></span>${cfPr(cfVerkoop((+b.u || 0) * W, +b.mat || 0, b.vast), b.eenheid)}<i class="cf-check">${on ? '✓' : '+'}</i></button>`; };
  const groepen = [...g.entries()].map(([k, list]) => { const n = list.filter(b => v.extras.includes(b.id)).length;
    return `<details class="cf-exgrp" ${n ? 'open' : ''}><summary><b>${esc(k)}</b><span class="muted small">${list.length} mogelijkheden</span>${n ? `<span class="pill ok">${n} gekozen</span>` : ''}</summary><div class="cf-extras">${list.map(kaart).join('')}</div></details>`; }).join('');
  const mand = `<div class="cf-mand"><b>Gekozen extra’s</b>${gekozen.length ? gekozen.map(b => `<button class="cf-chip on" data-act="cfextra" data-v="${b.id}" title="Weghalen">${esc(b.naam)} <span>✕</span></button>`).join('') : '<span class="muted small">nog niets gekozen – open een groep hieronder</span>'}</div>`;
  // extra's als laatste: eerst wat er aan de trap gebeurt (bewerkingen), dan de plaatsing (montage, oude trap), dan een opmerking
  return cfSec('Extra’s', 'Tik aan wat erbij hoort; het aantal (per tred, meter of stuk) komt later uit de tekening.', mand + groepen)
    + `<div class="cf-row2">${cfSec('Montage', '', `<div class="cf-lux-row">${[[true, 'Wij plaatsen de trap', 'montage op locatie'], [false, 'Alleen leveren', 'klant plaatst zelf']].map(([val, t1, t2]) => `<button class="cf-lux sm ${!!v.montage === val ? 'on' : ''}" data-act="cfset" data-f="montage" data-v="${val ? 1 : 0}" data-t="b"><b>${t1}</b><small>${t2}</small>${!!v.montage === val ? '<i class="cf-check">✓</i>' : ''}</button>`).join('')}</div>`)}
      ${cfSec('Oude trap', '', `<div class="cf-lux-row">${[[false, 'Blijft staan', 'of klant regelt het'], [true, 'Wij verwijderen', 'slopen en afvoeren']].map(([val, t1, t2]) => `<button class="cf-lux sm ${!!v.sloop === val ? 'on' : ''}" data-act="cfset" data-f="sloop" data-v="${val ? 1 : 0}" data-t="b"><b>${t1}</b><small>${t2}</small>${!!v.sloop === val ? '<i class="cf-check">✓</i>' : ''}</button>`).join('')}</div>`)}</div>`
    + cfSec('Opmerking bij deze variant', '',`<textarea rows="3" class="cf-wide" data-bind="cfval" data-f="notitie">${esc(v.notitie || '')}</textarea>`);
}
// overzicht: varianten naast elkaar, verschillen gemarkeerd, prijzen per eenheid (optioneel)
function cfStapOverzicht(p, cfg) {
  const c = C(), V = cfg.varianten, sums = V.map(v => CF.samenvatting(c, v));
  const diff = new Set(); for (let i = 1; i < V.length; i++) for (const k of CF.verschillen(c, V[0], V[i])) diff.add(k);
  const head = `<tr><th></th>${V.map(v => `<th class="cf-vcol ${cfg.gekozen === v.id ? 'chosen' : ''}"><div class="cf-vhead"><span class="cf-vname">Variant ${esc(v.naam)}</span>
      <div class="cf-vpics">${DW.plan(v.model, v.richting, 'mini')}${DW.aanzicht(cfSketch(v))}${heeftSchets(v) ? skSvg(v.schets, { cls: 'cf-vschets' }) : ''}</div>
      ${cfg.gekozen === v.id ? '<span class="pill ok">gekozen</span>' : `<button class="small" data-act="cfkies" data-v="${v.id}">Deze kiezen</button>`}</div></th>`).join('')}</tr>`;
  // per groep alle regels van alle varianten (bv. A zonder, B met balustrade)
  const body = sums[0].map(([g], gi) => {
    const keys = [...new Set(sums.flatMap(sm => sm[gi][1].map(x => x[0])))];
    return `<tr class="cf-grp"><td colspan="${V.length + 1}">${esc(g)}</td></tr>` + keys.map(k => {
      const cells = sums.map(sm => (sm[gi][1].find(x => x[0] === k) || [k, '–'])[1]);
      return `<tr class="${diff.has(g + '|' + k) || new Set(cells).size > 1 ? 'diff' : ''}"><th>${esc(k)}</th>${cells.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    }).join('');
  }).join('');
  let prijs = '';
  if (ui.cfPrijs) {
    const P0 = V.map(v => CF.prijzen(c, v)), keys = [...new Map(P0.flat().map(r => [r.key, r])).values()];
    const fac = ui.cfBtw ? 1 + (+c.tarief.btw || 0) : 1;
    // groepen in de volgorde van het projectblad in Excel (1 treden … 9 montage)
    const rang = (g) => { const m = /^(\d+)/.exec(g || ''); return m ? +m[1] : g === 'Balustrade en spillen' ? 6.5 : g === 'Verdiepingen' ? 6.6 : 99; };
    keys.sort((a, b) => rang(a.groep) - rang(b.groep));
    const grp = (k) => k.groep, kop = (k, i) => (i === 0 || grp(keys[i - 1]) !== grp(k) ? `<tr class="cf-pgrp"><td colspan="${V.length + 2}">${esc(grp(k))}</td></tr>` : '');
    prijs = `<h3 class="cf-h3">Prijsopbouw per eenheid <span class="muted small">${ui.cfBtw ? 'incl.' : 'excl.'} BTW · nog zonder aantallen · zelfde indeling als het normbestand</span></h3>
      <table class="tbl cf-ptab"><thead><tr><th>Onderdeel</th><th>Eenheid</th>${V.map(v => `<th class="num">Variant ${esc(v.naam)}</th>`).join('')}</tr></thead><tbody>${keys.map((k, ki) => kop(k, ki) + (() => {
        const cells = P0.map(rows => rows.find(r => r.key === k.key)), base = cells[0];
        return `<tr><td>${esc((cells.find(Boolean) || k).naam)}${k.note ? `<div class="muted small">${esc(k.note)}</div>` : ''}</td><td class="muted small">${esc(k.eenheid)}</td>${cells.map((r, i) => {
          if (!r) return '<td class="num muted">–</td>';
          const d = i && base ? (r.prijs - base.prijs) * fac : 0;
          return `<td class="num"><b>${eur(r.prijs * fac)}</b>${r.vast ? ' <span class="sig ok">vast</span>' : ''}${Math.abs(d) > 0.005 ? `<div class="cf-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'} ${eur(Math.abs(d))}</div>` : ''}</td>`; }).join('')}</tr>`; })()).join('')}</tbody></table>`;
  }
  const meld = (cfg.meldingen || []).length ? `<ul class="cf-meld">${cfg.meldingen.map(m => `<li class="${m.kind}">${esc(m.text)}</li>`).join('')}</ul>` : '';
  const na = p.parts.length
    ? `<div class="cf-next ok"><div><b>Tekening ingelezen (${p.parts.length} onderdelen).</b> ${cfg.gekozen ? `Keuzes van variant ${esc((V.find(x => x.id === cfg.gekozen) || {}).naam || '')} gaan automatisch door naar hout en begroting${cfg.toegepast ? ` (laatst ${new Date(cfg.toegepast.op).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })})` : ''}.` : 'Kies een variant: de keuzes gaan dan automatisch door naar hout en begroting.'}</div>
        <div class="row wrap"><button class="primary" data-act="go" data-v="begroting" ${cfg.gekozen ? '' : 'disabled'}>Naar de begroting →</button><button class="ghost" data-act="cftoepassen" ${cfg.gekozen ? '' : 'disabled'} title="Opnieuw overzetten, bv. na een wijziging in de begroting">↻ Opnieuw overzetten</button>${cfg.toegepast ? '<button data-act="printspec" title="Wat er gemaakt wordt, zonder prijzen – bij de offerte">Specificatiestaat afdrukken</button>' : ''}</div>${meld}</div>`
    : `<div class="cf-next"><div><b>Volgende stap:</b> teken de trap in StairDesigner en lees de DXF/PDF in bij Importeren. De app zet dan ${cfg.gekozen ? `variant ${esc((V.find(v => v.id === cfg.gekozen) || {}).naam)}` : 'de gekozen variant'} automatisch over en rekent de prijs uit: hout via de indeling, uren, leuning, balustrade, bewerkingen, afwerking en montage.</div>
        <div class="row wrap"><button class="primary" data-act="go" data-v="importeren">Tekening inlezen →</button></div></div>`;
  return `<div class="cf-sec"><h3>Varianten naast elkaar</h3><p class="muted small">${V.length > 1 ? 'Verschillen zijn gemarkeerd.' : 'Maak een variant om te vergelijken (bv. eiken tegenover beuken).'} Kies de variant die het wordt.</p>
    <div class="cf-cmpwrap"><table class="tbl cf-cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>${prijs}</div>${na}`;
}

// ---------- het scherm ----------
// stappen over de hele breedte (zonder voorbeeld rechts)
const CF_EEN = ['klant', 'schets', 'overzicht', 'vloeren', 'kanten'];
function scrConfig() {
  const p = proj(), cfg = cfOf(p), v = CF.actief(p), c = C();
  const si = Math.max(0, CF.STAPPEN.findIndex(s => s[0] === cfg.stap)), stap = CF.STAPPEN[si][0];
  const stepper = `<nav class="cf-steps">${CF.STAPPEN.map(([k, t], i) => { const nv = CF.nvt(v, k);
    return `<button class="cf-step ${i === si ? 'on' : ''} ${i < si ? 'done' : ''} ${nv ? 'nvt' : ''}" data-act="cfstap" data-v="${k}" ${nv ? `title="Niet van toepassing: ${esc(nv)}"` : ''}><span>${i < si ? '✓' : i + 1}</span><b>${t}</b>${nv ? '<small>n.v.t.</small>' : ''}</button>`; }).join('')}</nav>`;
  const tabs = `<div class="cf-vtabs">${cfg.varianten.map(x => `<button class="cf-vtab ${x.id === v.id ? 'on' : ''}" data-act="cfvar" data-v="${x.id}" title="Variant ${esc(x.naam)}">${esc(x.naam)}${cfg.gekozen === x.id ? ' ✓' : ''}</button>`).join('')}
    <button class="cf-vtab add" data-act="cfkopie" title="Kopie van deze variant om één keuze te wijzigen">+ variant</button>${cfg.varianten.length > 1 ? `<button class="cf-vtab del" data-act="cfvardel" data-v="${v.id}" title="Variant ${esc(v.naam)} verwijderen">✕</button>` : ''}</div>`;
  const body = { klant: () => cfStapKlant(p, cfg), schets: () => cfStapSchets(v), type: () => cfStapType(v), hout: () => cfStapHout(v), leuning: () => cfStapLeuning(v), kanten: () => cfStapKanten(v), balustrade: () => cfStapBal(v), vloeren: () => cfStapVloeren(v), spijl: () => cfStapSpijl(v), extras: () => cfStapExtras(v), overzicht: () => cfStapOverzicht(p, cfg) }[stap]();
  const sum = CF.samenvatting(c, v);
  const chips = sum.map(([g, l]) => `<div class="cf-sumg"><small>${esc(g)}</small>${l.slice(0, g === 'Trap' ? 3 : 2).map(([k, x]) => `<span>${esc(x)}</span>`).join('')}</div>`).join('');
  const preview = `<aside class="cf-prev"><div class="cf-prevcard"><div class="cf-prevhead"><b>Variant ${esc(v.naam)}</b><span class="muted small">${esc(CF.modelVan(v).naam)} · ${v.richting === 'links' ? 'linksom' : 'rechtsom'}</span></div>
      <div class="cf-prevpics"><div class="cf-planbox">${DW.plan(v.model, v.richting)}<small>plattegrond</small></div><div class="cf-sidebox">${DW.aanzicht(cfSketch(v))}</div></div>
      <div class="cf-sum">${chips}</div></div></aside>`;
  const nav = `<div class="cf-nav">${si > 0 ? `<button data-act="cfstap" data-v="${CF.STAPPEN[si - 1][0]}">← ${CF.STAPPEN[si - 1][1]}</button>` : '<span></span>'}
    <span class="muted small cf-tip">💡 ${esc(CF.TIPS[stap])}</span>
    ${si < CF.STAPPEN.length - 1 ? `<button class="primary" data-act="cfstap" data-v="${CF.STAPPEN[si + 1][0]}">${CF.STAPPEN[si + 1][1]} →</button>` : `<button class="primary" data-act="print">Keuzeoverzicht afdrukken</button>`}</div>`;
  const tools = `<div class="cf-tools"><label class="cf-switch"><input type="checkbox" data-bind="cfui" data-k="cfPrijs" ${ui.cfPrijs ? 'checked' : ''}><span></span>Prijzen tonen</label>
      ${ui.cfPrijs ? `<label class="cf-switch"><input type="checkbox" data-bind="cfui" data-k="cfBtw" ${ui.cfBtw ? 'checked' : ''}><span></span>incl. BTW</label>` : ''}
      <label class="cf-switch" title="Uit: de keuzes blijven bewaard, maar gaan niet meer vanzelf naar hout en begroting; daar gekozen houtsoorten blijven staan"><input type="checkbox" data-bind="bcfgebruik" ${cfg.uit ? '' : 'checked'}><span></span>Configurator gebruiken</label>
      <button class="small ${ui.present ? 'primary' : ''}" data-act="cfpresent" title="Menu en beheer verbergen voor het gesprek met de klant">${ui.present ? 'Klantweergave aan' : 'Klantweergave'}</button>
      <button class="small" data-act="print">Afdrukken</button></div>`;
  return `<div class="no-print cf">
    <div class="cf-top"><div><div class="cf-kicker">${esc(c.bedrijf.naam || 'Trap op maat')}</div><h1>Trap configureren</h1><p class="muted">${esc(cfg.klant.naam || p.name)}${cfg.klant.plaats ? ' · ' + esc(cfg.klant.plaats) : ''}</p></div>${tools}</div>
    ${stepper}
    <div class="cf-bar">${stap === 'klant' || stap === 'overzicht' ? '<span></span>' : tabs}</div>
    <div class="cf-grid ${CF_EEN.includes(stap) ? 'one' : ''}"><div class="cf-main">${body}</div>${CF_EEN.includes(stap) ? '' : preview}</div>
    ${nav}</div>${cfPrint(p, cfg)}`;
}
// afdrukversie: keuzeoverzicht voor de klant (gekozen variant, anders alle varianten)
function cfPrint(p, cfg) {
  const c = C(), b = c.bedrijf, K = cfg.klant, list = cfg.gekozen ? cfg.varianten.filter(v => v.id === cfg.gekozen) : cfg.varianten;
  const fac = ui.cfBtw ? 1 + (+c.tarief.btw || 0) : 1;
  const vHtml = (v) => `<section class="cfp-var"><h2>Variant ${esc(v.naam)}${cfg.gekozen === v.id ? ' – gekozen' : ''}</h2>
    <div class="cfp-pics ${heeftSchets(v) ? 'met-schets' : ''}"><div>${DW.plan(v.model, v.richting)}</div><div>${DW.aanzicht(cfSketch(v))}</div>${heeftSchets(v) ? `<figure class="cfp-schets">${skSvg(v.schets)}<figcaption>schets ter plekke</figcaption></figure>` : ''}</div>
    <div class="cfp-grid">${CF.samenvatting(c, v).map(([g, l]) => `<div><h3>${esc(g)}</h3><table>${l.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table></div>`).join('')}</div>
    ${(v.vloerBal || []).some(b => b.punten.length > 1) ? `<h3>Balustrades op de verdiepingen</h3><div class="cfp-vb">${v.vloerBal.filter(b => b.punten.length > 1).map(b => `<figure>${vbSvg(b, false, v)}<figcaption>${esc(b.vloer)} – ${f2(CF.vbLengte(b) / 1000)} m</figcaption></figure>`).join('')}</div>` : ''}
    ${v.notitie ? `<p class="cfp-note">${esc(v.notitie)}</p>` : ''}
    ${ui.cfPrijs ? `<h3>Prijzen per eenheid (${ui.cfBtw ? 'incl.' : 'excl.'} BTW)</h3><table class="cfp-prices">${CF.prijzen(c, v).map(r => `<tr><td>${esc(r.naam)}</td><td>${esc(r.eenheid)}</td><td class="num">${eur(r.prijs * fac)}</td></tr>`).join('')}</table>` : ''}</section>`;
  return `<div class="print-only cfprint">
    <div class="bp-head"><div><h1>Keuzeoverzicht trap</h1><p>${esc(K.naam || p.name)}<br>${esc(K.adres || '')} ${esc(K.plaats || '')}<br>Datum ${new Date().toLocaleDateString('nl-NL')}</p></div>
      <div class="bp-firm"><b>${esc(b.naam || '')}</b><br>${esc(b.adres || '')}<br>${esc(b.plaats || '')}<br>${esc(b.tel || '')} ${esc(b.mail || '')}</div></div>
    ${K.notitie ? `<p class="cfp-note">${esc(K.notitie)}</p>` : ''}
    ${list.map(vHtml).join('')}
    <p class="muted small">Schetsen zijn niet op maat. De definitieve maten en prijs volgen na het inmeten en tekenen.</p>
    <div class="cfp-sign"><div>Handtekening klant<span></span></div><div>Datum<span></span></div></div></div>`;
}
// nieuw project vanuit de configurator (nog zonder tekening)
function newConfigProject(name) {
  const p = newProject(name || 'Nieuwe trap'); cfOf(p); p.config.stap = 'klant'; save(); return p;
}

CLICK.push(function click_configurator(a, t, v, p, e) {
  switch (a) {
    case 'cfnew': { const n = (document.getElementById('newname') || {}).value; newConfigProject((n || '').trim()); ui.screen = 'configurator'; render(); break; }
    case 'cfstap': cfOf(p).stap = v; save(); render(); window.scrollTo(0, 0); break;
    case 'cfset': {
      const x = CF.actief(p), val = t.dataset.t === 'b' ? v === '1' : /^(bal\.tussen)$/.test(t.dataset.f) ? +v : v;
      setPath(x, t.dataset.f, val);
      // houtsoort per onderdeel (Basiskeuzes): een eigen houtsoort per kant van die soort vervalt
      const hm = /^hout\.(trapboom|keepboom)$/.exec(t.dataset.f); if (hm) cfKantHoutWeg(x, hm[1]);
      if (t.dataset.f === 'leuning.hout') cfKantHoutWeg(x, 'leuning');
      save(); render(); break;
    }
    case 'cf3d': ui.cf3d = v === '1'; render(); break;
    // stap Hout en afwerking: snelle knoppen
    case 'cfafwgelijk': { const x = CF.actief(p); x.afwRest = x.afwTreden; delete x.materiaalstijl; save(); render(); break; }
    case 'cfhoutalles': { const x = CF.actief(p); x.houtTrede = v; x.hout = {}; x.leuning.hout = cfLeuningHout(v); cfKantHoutWeg(x); delete x.materiaalstijl; save(); render(); break; }
    case 'cfafwalles': { const x = CF.actief(p); x.afwTreden = v; x.afwRest = v; x.afw = {}; delete x.materiaalstijl; save(); render(); break; }
    case 'cfhoutstd': { const x = CF.actief(p); x.hout = {}; x.afw = {}; cfKantHoutWeg(x); delete x.materiaalstijl; save(); render(); break; }
    case 'cfstijlsave': {
      const x = CF.actief(p), c = C(), naam = (prompt('Naam van de materiaalstijl (bv. "Eiken, gegrond")', x.materiaalstijl || CF.houtNaam(x.houtTrede)) || '').trim(); if (!naam) break;
      c.materiaalstijlen = c.materiaalstijlen || [];
      const s = c.materiaalstijlen.find(y => y.naam.toLowerCase() === naam.toLowerCase()) || (c.materiaalstijlen.push({ id: 'ms' + Date.now().toString(36), naam }), c.materiaalstijlen[c.materiaalstijlen.length - 1]);
      Object.assign(s, { naam, houtTrede: x.houtTrede, hout: Object.assign({}, x.hout || {}), afw: Object.assign({}, x.afw || {}), afwTreden: x.afwTreden, afwRest: x.afwRest || x.afwTreden });
      x.materiaalstijl = naam; ui.msg = { text: `Materiaalstijl "${naam}" opgeslagen.`, kind: 'ok' }; save(); render(); break;
    }
    case 'cfstijldel': { const c = C(); c.materiaalstijlen = (c.materiaalstijlen || []).filter(y => y.id !== v); delete CF.actief(p).materiaalstijl; save(); render(); break; }
    case 'cfmatenvoorstel': { const x = CF.actief(p), at = parseFloat(((document.getElementById('cf-at') || {}).value || '250').replace(',', '.')) || 250; x.maten = CF.matenVoorstel(x, Math.max(200, Math.min(320, at))); save(); render(); break; }
    case 'cf3dview': ZP.cf3d.setView(v); break;
    case 'cfmodel': CF.zetModel(CF.actief(p), v); save(); render(); break;
    case 'cfkantcopy': {
      // alle keuzes van deze kant overnemen naar de andere kant
      const x = CF.actief(p), naar = v === 'links' ? 'rechts' : 'links';
      x.kanten[naar] = JSON.parse(JSON.stringify(x.kanten[v])); ui.msg = { text: `Keuzes van de ${v === 'links' ? 'linker' : 'rechter'} kant overgenomen naar de ${naar === 'links' ? 'linker' : 'rechter'} kant.`, kind: 'ok' }; save(); render(); break;
    }
    case 'cfextra': { const x = CF.actief(p); x.extras = x.extras.includes(v) ? x.extras.filter(id => id !== v) : x.extras.concat(v); save(); render(); break; }
    case 'cfvar': p.config.actief = v; save(); render(); break;
    case 'cfkopie': { const n = CF.kopie(p, CF.actief(p)); ui.msg = { text: `Variant ${n.naam} gemaakt als kopie. Wijzig nu de keuze(s) die anders moeten.`, kind: 'ok' }; save(); render(); break; }
    case 'cfvardel': if (confirm('Deze variant verwijderen?')) { p.config.varianten = p.config.varianten.filter(x => x.id !== v); cfOf(p); save(); } render(); break;
    case 'cfkies': p.config.gekozen = v; p.config.actief = v; ui.msg = { text: `Variant ${CF.actief(p).naam} gekozen.`, kind: 'ok' }; save(); render(); break;
    case 'cftoepassen': {
      const g = CF.gekozen(p); if (!g) { ui.msg = { text: 'Kies eerst een variant.', kind: 'err' }; return render(); }
      const m = CF.toepassen(p, g, C(), db.materials);
      ui.msg = { text: `Variant ${g.naam} overgezet naar hout en begroting.` + (m.length ? ` ${m.length} ${m.length === 1 ? 'punt' : 'punten'} om na te kijken.` : ''), kind: m.some(x => x.kind === 'warn') ? 'err' : 'ok' };
      save(); render(); break;
    }
    // ---- balustrades op de verdiepingen ----
    case 'cfvbadd': { const x = CF.actief(p), b = CF.nieuweVloerBal(C(), x, v || ((document.getElementById('vb-vloer') || {}).value || '').trim() || '1e verdieping'); x.vloerBal.push(b); ui.cfVb = b.id; save(); render(); break; }
    case 'cfvbsel': ui.cfVb = v; render(); break;
    case 'cfvbklik': {
      // klikpunt (raster, hoeken en randen van het trapgat, haaks); niet na slepen of op een bestaand punt
      const b = CF.actief(p).vloerBal.find(x => x.id === v); if (!b || !t.getScreenCTM || ui.vbDrag || e.target.closest('.vb-handle')) break;
      // tekenen van het trapgat (eigen vorm): punt erbij in het trapgat
      if (ui.vbMode === 'gat') { const g = b.trapgat; g.punten = g.punten || []; const q = gatSnap(b, vbPunt(t, e)), l = g.punten[g.punten.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) g.punten.push(q); save(); render(); break; }
      const q = vbSnap(b, vbPunt(t, e)), last = b.punten[b.punten.length - 1];
      if (last && last[0] === q[0] && last[1] === q[1]) break;
      b.punten.push(q); save(); render(); break;
    }
    // trapgat: rechthoek of eigen vorm; tekenen = balustrade of trapgat
    case 'cfvbmode': ui.vbMode = v; render(); break;
    case 'cfgatvorm': {
      const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id); if (!b) break; const g = b.trapgat;
      if (v === 'eigen') { if (!CF.tgEigen(g)) g.punten = CF.tgHoeken(g); ui.vbMode = 'gat'; }
      else { if (CF.tgEigen(g)) { const xs = g.punten.map(q => q[0]), ys = g.punten.map(q => q[1]); Object.assign(g, { x: Math.min(...xs), y: Math.min(...ys), bx: Math.max(...xs) - Math.min(...xs), by: Math.max(...ys) - Math.min(...ys) }); } delete g.punten; ui.vbMode = 'bal'; }
      save(); render(); break;
    }
    case 'cfgatwis': { const b = CF.actief(p).vloerBal.find(x => x.id === v); if (b) { b.trapgat.punten = []; ui.vbMode = 'gat'; save(); } render(); break; }
    case 'cfvbvorm': { const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id); if (b) { CF.vbVorm(b, v); save(); } render(); break; }
    case 'cfvbgatstd': { const x = CF.actief(p), b = x.vloerBal.find(y => y.id === v); if (b) { b.trapgat = CF.trapgatStd(x); b.trap = { x: b.trapgat.x, y: b.trapgat.y }; ui.vbMode = 'bal'; save(); } render(); break; }
    case 'cfvbundo': { const b = CF.actief(p).vloerBal.find(x => x.id === v); if (b) b.punten.pop(); save(); render(); break; }
    case 'cfvbwis': { const b = CF.actief(p).vloerBal.find(x => x.id === v); if (b && confirm('Alle punten van deze balustrade wissen?')) { b.punten = []; save(); } render(); break; }
    case 'cfvbdel': { const x = CF.actief(p); if (confirm('Deze balustrade verwijderen?')) { x.vloerBal = x.vloerBal.filter(b => b.id !== v); save(); } render(); break; }
    case 'cfvbset': { const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id); if (b) setPath(b, t.dataset.f, t.dataset.t === 'b' ? v === '1' : (isNaN(+v) ? v : +v)); save(); render(); break; }
    case 'cffotodel': p.config.fotos = p.config.fotos.filter(f => f.id !== v); save(); render(); break;
    case 'cfpresent': ui.present = !ui.present; render(); break;
    default: return false;
  }
});
// ---------- houtsoort van een variant: per kant/vlucht afwijkende keuzes weghalen ----------
// Een eigen houtsoort per kant (boom, leuning) of per vlucht gaat vóór de keuze per onderdeel. "Alles in één houtsoort",
// "alles gelijk maken" en een keuze bij Hout halen die weg, anders blijft bv. de trapboom links in de oude houtsoort.
function cfKantHoutWeg(x, t) {
  for (const k of Object.keys(x.kanten || {})) {
    const s = x.kanten[k];
    if (t === 'leuning' || !t) s.leuningHout = '';
    if (t !== 'leuning' && (!t || CF.boomSoort(s.boom) === t)) s.hout = '';
    for (const o of Object.values(s.vluchten || {})) if (o && o.hout && t !== 'leuning' && (!t || CF.boomSoort(o.boom || s.boom) === t)) delete o.hout;
  }
}
// leuninghout: de naam uit de lijst van Prijzen (zelfde houtsoort, andere schrijfwijze), anders de houtsoort toevoegen
// aan die lijst met de houtprijzen per meter van de eerste houtsoort (zoals bij Prijzen › houtsoort toevoegen)
function cfLeuningHout(w) {
  const c = C(), naam = CF.houtNaam(w); if (!naam) return '';
  c.leuningHout = c.leuningHout || [];
  const al = c.leuningHout.find(h => h.toLowerCase() === naam.toLowerCase()); if (al) return al;
  for (const pr of c.profielen) { const m = c.leuningMat[pr] = c.leuningMat[pr] && typeof c.leuningMat[pr] === 'object' ? c.leuningMat[pr] : {}; m[naam] = c.leuningHout.length ? +m[c.leuningHout[0]] || 0 : 0; }
  c.leuningHout.push(naam); return naam;
}
// keuze bij Hout (of Basis toepassen bij houtsoorten vergelijken) ook in de gekozen configurator-variant zetten,
// zodat een volgende klik in de configurator (cfAuto) de keuze niet terugdraait
function cfHoutNaarVariant(p, t, w) {
  const x = CONFIGURATOR && p && p.config && CF.gekozen(p); if (!x || !w) return false;
  if (t === 'trede') {
    // andere onderdelen die de treden volgen houden hun huidige houtsoort
    x.hout = x.hout || {}; for (const [s] of CF.HOUT_SOORTEN) if (!x.hout[s]) x.hout[s] = x.houtTrede;
    x.houtTrede = w;
  } else if (t === 'leuning') { x.leuning.hout = cfLeuningHout(w); cfKantHoutWeg(x, 'leuning'); }
  else { x.hout = x.hout || {}; x.hout[t] = w; if (t === 'trapboom' || t === 'keepboom') cfKantHoutWeg(x, t); }
  delete x.materiaalstijl;
  return true;
}
// keuze per kant/vlucht (sleutel 'trapboom|Links' of 'trapboom|Links|2', 'leuning|Rechts') in de gekozen variant zetten
function cfKantNaarVariant(p, key, w) {
  const x = CONFIGURATOR && p && p.config && CF.gekozen(p); if (!x || !w) return false;
  const [t, side, nr] = key.split('|'), kk = (CF.KANT.find(k => k[2] === side) || [])[0], s = kk && x.kanten[kk]; if (!s) return false;
  if (t === 'leuning') s.leuningHout = cfLeuningHout(w);
  else if (nr) { s.vluchten = s.vluchten || {}; (s.vluchten[nr] = s.vluchten[nr] || {}).hout = w; }
  else s.hout = w;
  delete x.materiaalstijl;
  return true;
}
// keuzes van de gekozen variant gaan vanzelf door naar hout en begroting (zodra er een tekening is)
const CF_GEEN_AUTO = ['cfstap', 'cf3d', 'cf3dview', 'cfpresent', 'cfvbsel', 'cfnew', 'cftoepassen', 'cfvar', 'cfkopie', 'cffotodel', 'cfstijlsave', 'cfvbmode'];
function cfAuto(p) {
  const cfg = p && p.config, g = cfg && CF.gekozen(p);
  // configurator uitgevinkt (p.config.uit): keuzes blijven bewaard, maar niets meer doorzetten
  if (!CONFIGURATOR || !g || !p.parts.length || cfg.actief !== g.id || cfg.uit) return false;
  CF.toepassen(p, g, C(), db.materials); save(); return true;
}
CLICK.unshift(function click_cfauto(a, t, v, p, e) {
  // staat vooraan in CLICK: eerst de knop zelf uitvoeren (de andere handlers), daarna overzetten
  if (!/^cf/.test(a) || CF_GEEN_AUTO.includes(a) || !p || !p.config) return false;
  const i = CLICK.indexOf(click_cfauto); let r = false;
  for (const h of CLICK.slice(i + 1)) if ((r = h(a, t, v, p, e)) !== false) break;
  if (r !== false && cfAuto(p) && a === 'cfkies') { ui.msg = { text: `Variant ${CF.gekozen(p).naam} gekozen en doorgezet naar hout en begroting.`, kind: 'ok' }; render(); }
  return r;
});
CHANGE.push(function change_configurator(b, t, p, part, numv) {
  const r = change_cf(b, t, p, part, numv);
  if (r !== false && r !== 'skip' && /^cf/.test(b) && b !== 'cfklant') cfAuto(p);
  return r;
});
function change_cf(b, t, p, part, numv) {
  switch (b) {
    case 'cfklant': cfOf(p).klant[t.dataset.k] = t.value; if (t.dataset.k === 'naam' && t.value.trim() && /^Nieuwe trap/.test(p.name)) p.name = t.value.trim(); break;
    case 'cfval': setPath(CF.actief(p), t.dataset.f, t.value); if (/^(hout|afw)\.|^afw(Rest|Treden)$/.test(t.dataset.f)) delete CF.actief(p).materiaalstijl; break;
    // materiaalstijl toepassen: houtsoort per onderdeel + afwerking (alleen houtsoorten/afwerkingen die er nog zijn)
    case 'cfstijl': {
      const x = CF.actief(p), c = C(), woods = new Set(CF.houtKeuzes(db.materials).map(h => h.hout));
      if (t.value === '__gelijk') { x.hout = {}; x.afw = {}; x.afwRest = x.afwTreden; delete x.materiaalstijl; break; }
      const s = (c.materiaalstijlen || []).find(y => y.id === t.value); if (!s) return 'skip';
      if (woods.has(CF.houtNaam(s.houtTrede))) x.houtTrede = CF.houtNaam(s.houtTrede);
      x.hout = {}; for (const [k, h] of Object.entries(s.hout || {})) if (woods.has(CF.houtNaam(h))) x.hout[k] = CF.houtNaam(h);
      for (const f of ['afwTreden', 'afwRest']) if (s[f] && c.afwerkingen.some(a => a.id === s[f])) x[f] = s[f];
      x.afw = {}; for (const [k, id] of Object.entries(s.afw || {})) if (c.afwerkingen.some(a => a.id === id)) x.afw[k] = id;
      x.materiaalstijl = s.naam; break;
    }
    case 'cfui': ui[t.dataset.k] = t.checked; render(); return 'skip';
    case 'cfvbgat': { const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id), f = t.dataset.f, n = Math.round(numv(t.value));
      if (b && (/^(x|y)$/.test(f) ? n >= 0 : n > 100)) { if (!b.trap) b.trap = CF.trapPos(b); b.trapgat[f] = n; } break; }
    // plaats van de trap t.o.v. het raster (het trapgat blijft staan)
    case 'cfvbtrap': { const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id); if (b) { b.trap = Object.assign({}, CF.trapPos(b), { [t.dataset.f]: Math.max(0, Math.round(numv(t.value))) }); } break; }
    case 'cfvb': { const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id); if (b) setPath(b, t.dataset.f, t.value.trim()); break; }
    case 'cfvbseg': {
      // lengte van stuk i aanpassen: richting blijft, de punten erna schuiven mee
      const b = CF.actief(p).vloerBal.find(x => x.id === t.dataset.id), i = +t.dataset.i; if (!b || !b.punten[i]) break;
      const a = b.punten[i - 1], q = b.punten[i], L = CF.segLen(a, q), nl = numv(t.value); if (!(L > 0 && nl > 0)) break;
      const dx = (q[0] - a[0]) / L * nl - (q[0] - a[0]), dy = (q[1] - a[1]) / L * nl - (q[1] - a[1]);
      for (let k = i; k < b.punten.length; k++) b.punten[k] = [Math.round((b.punten[k][0] + dx) * 10) / 10, Math.round((b.punten[k][1] + dy) * 10) / 10];
      break;
    }
    default: return false;
  }
}
