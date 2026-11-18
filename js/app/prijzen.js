// Beheer: prijzen en normen (uren uit Excel, bedragen, vaste prijzen, tekeningen)
function scrPrices() {
  const c = C(), T = c.tarief;
  const card = (key, title, sub, body) => `<section class="card pcard2"><div class="ml-head">${foldBtn('pr-' + key, title)}<h3>${title}</h3>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>${folded('pr-' + key) ? '' : body}</section>`;
  const xl = '<span class="xl" title="Uit het Excel-bestand (arbeidsnormen)">Excel</span>';
  const uren = (v) => `<span class="uval">${f2(v)} u</span>`;
  // norm (uren) bewerkbaar: uit Excel, of zelf ingevuld (blijft dan staan bij opnieuw inlezen; ↺ = terug naar Excel)
  const normIn = (pad, w = 'w4') => { const v = CO.normGet(c, pad), e = CO.normBronVan(c, pad);
    return `<span class="normin"><input class="${w} num ${e ? 'set' : ''}" data-bind="cnorm" data-pad="${esc(pad)}" value="${v > 0 ? String(Math.round(v * 10000) / 10000).replace('.', ',') : ''}" placeholder="gem." title="${e ? (e.bron === 'gemeten' ? 'Gemeten' : 'Zelf ingevuld') + ' op ' + e.datum + ' · Excel: ' + (e.excel > 0 ? f2(e.excel) + ' u' : '–') : 'Uit het Excel-bestand; zelf een waarde invullen kan (blijft staan bij opnieuw inlezen)'}"> u${e ? ` <span class="nbron ${e.bron}">${e.bron === 'gemeten' ? 'gemeten' : 'eigen'}</span><button class="ghost small" data-act="cnormterug" data-v="${esc(pad)}" title="Terug naar de waarde uit Excel (${e.excel > 0 ? f2(e.excel) + ' u' : 'leeg'})" aria-label="Terug naar Excel">↺</button>` : ''}</span>`; };
  // vaste prijs: invoer + signaal (te laag t.o.v. kostprijs + minimale marge)
  const vastCell = (kind, id, s, kost) => `<div class="vast">
      <label>Vaste prijs € <input class="w5 num" data-bind="cvast" data-kind="${kind}" data-id="${esc(id)}" value="${s ? String(s.vast).replace('.', ',') : ''}" placeholder="—" title="Optioneel: de prijs die u vast rekent. Leeg = kostprijs + opslag."></label>
      ${s ? (s.teLaag ? `<span class="sig bad" title="Minimaal ${eur(s.min)} (kostprijs ${eur(kost)} + ${f1(T.minMarge * 100)}% marge)">te laag · min. ${eur(s.min)}</span>` : `<span class="sig ok">marge ${f1(s.marge * 100)}%</span>`)
        + (s.stijging > 0.005 ? `<span class="sig up" title="Kostprijs is gestegen sinds de prijs werd vastgezet (uurloon of materiaal)">kostprijs +${f1(s.stijging * 100)}%</span>` : '') : ''}</div>`;
  // ---- signalen ----
  const sigs = CO.signalen(c);
  const banner = sigs.length ? `<section class="card sigbanner"><h3>⚠ ${sigs.length} vaste ${sigs.length === 1 ? 'prijs is' : 'prijzen zijn'} te laag geworden</h3>
    <p class="small">Door een hoger uurloon of duurder materiaal ligt de kostprijs + minimale marge (${f1(T.minMarge * 100)}%) boven de vaste prijs.</p>
    <table class="tbl compact"><thead><tr><th>Soort</th><th>Naam</th><th class="num">Vaste prijs</th><th class="num">Kostprijs nu</th><th class="num">Minimaal</th><th class="num">Kosten gestegen</th></tr></thead><tbody>${sigs.map(s => `<tr><td>${s.soort}</td><td>${esc(s.naam)}</td><td class="num">${eur(s.vast)} ${esc(s.eenheid)}</td><td class="num">${eur(s.kost)}</td><td class="num"><b>${eur(s.min)}</b></td><td class="num">${s.stijging > 0.005 ? '+' + f1(s.stijging * 100) + '%' : '—'}</td></tr>`).join('')}</tbody></table></section>` : '';
  // ---- bron (Excel) ----
  const xlKnoppen = `${ui.normHandle ? `<button class="primary" data-act="normreload" title="Hetzelfde bestand opnieuw inlezen">↻ Opnieuw inlezen (${esc(ui.normHandle.name)})</button>` : ''}
      ${window.showOpenFilePicker ? `<button class="${ui.normHandle ? '' : 'primary'}" data-act="normpick">Excel-bestand kiezen…</button>` : `<label class="btn primary">Excel-bestand kiezen…<input type="file" accept=".xlsx,.xlsm" data-act="normxlsx" hidden></label>`}`;
  // gekoppelde versie: de normen staan in de app (tab Normtijden) en worden bijgewerkt met de gemeten tijden; Excel alleen nog eenmalig overnemen
  const bron = kpAan() ? `<div class="bron"><div><b>Arbeidsnormen (uren):</b> in de app – tab <i>Normtijden</i>, bij te werken met de gemeten tijden van de timer-app (scherm Koppeling).<div class="muted small">Laatst uit Excel overgenomen: ${esc(c.source)}. Wil je met het Excel-normbestand blijven werken, open dan de Excel-versie (map <code>met-excel</code>).</div></div>
    <details class="kp-xl"><summary class="small">Eenmalig normen uit Excel overnemen…</summary><div class="row wrap">${xlKnoppen}</div></details></div>`
    : `<div class="bron"><div><b>Arbeidsnormen (uren):</b> ${esc(c.source)}<div class="muted small">Uren voor treden, bomen, spil, leuning, spijltypes, bewerkingen, afwerkingen en montage komen uit het Excel-bestand. Nieuwe bewerking, spijltype of afwerking: voeg een regel toe in Excel en lees opnieuw in. Alle bedragen hieronder stelt u hier in.</div></div>
    <div class="row wrap">${xlKnoppen}</div></div>`;
  // ---- tarieven ----
  const tar = `<div class="tar-grid">
    <label>Uurtarief werkplaats <span>€ ${numIn('ctar', 'data-k="werk"', T.werk)}</span></label>
    <label>Uurtarief montage <span>€ ${numIn('ctar', 'data-k="montage"', T.montage)}</span></label>
    <label>Kilometervergoeding <span>€ ${numIn('ctar', 'data-k="km"', T.km)} per km</span></label>
    <label>Opslag op arbeid <span>${pctIn('ctar', 'data-k="opslagArbeid"', T.opslagArbeid)}</span></label>
    <label>Opslag op materiaal <span>${pctIn('ctar', 'data-k="opslagMat"', T.opslagMat)}</span></label>
    <label>BTW <span>${pctIn('ctar', 'data-k="btw"', T.btw)}</span></label>
    <label title="Een vaste prijs of begroting onder kostprijs + deze marge wordt gesignaleerd">Minimale marge <span>${pctIn('ctar', 'data-k="minMarge"', T.minMarge)}</span></label>
    <label title="Alleen als er nog geen indeling is: netto houtvolume × deze factor">Afvalfactor houtschatting <span>× ${numIn('ctar', 'data-k="afval"', T.afval, 'w3')}</span></label>
    <label title="Bruikbare reststukken uit de indeling gaan terug op de plank: dit deel van hun waarde gaat van de houtprijs af. 0 = niets. Per project aan te passen in de begroting.">Restmateriaal terug <span>${pctIn('ctar', 'data-k="restPct"', T.restPct)}</span></label>
    <label title="Vaste prijs per trap voor uitzetten, mallen maken en machines instellen (0 = geen regel)">Voorbereiding per trap <span>€ ${numIn('copzet', 'data-k="prijs"', (c.opzetten || {}).prijs || '')}</span></label>
    <label title="Hoeveel uur de voorbereiding werkelijk kost: daarmee bewaakt de app of de vaste prijs nog klopt">Voorbereiding: uren (bewaking) <span>${numIn('copzet', 'data-k="u"', (c.opzetten || {}).u || '', 'w3')} u</span></label>
    <label class="tar-vink" title="Aan: de begroting telt rechte en verdreven treden apart, elk met een eigen norm (normbestand versie 11). Uit: één regel per trap met de norm van het type trap."><input type="checkbox" data-bind="ctredenapart" ${c.tredenApart ? 'checked' : ''} ${c.tredeNorm ? '' : 'disabled'}> Treden recht en verdreven apart rekenen</label></div>
    <div class="tar-grid bedrijf">${[['naam', 'Bedrijfsnaam'], ['adres', 'Adres'], ['plaats', 'Postcode en plaats'], ['tel', 'Telefoon'], ['mail', 'E-mail'], ['web', 'Website'], ['iban', 'IBAN'], ['kvk', 'KvK-nummer'], ['btwnr', 'BTW-nummer']].map(([k, t]) => `<label>${t} <input data-bind="cbedrijf" data-k="${k}" value="${esc(c.bedrijf[k] || '')}"></label>`).join('')}</div>
    <div class="row wrap logo-rij"><b class="small">Logo</b> ${c.bedrijf.logo ? `<img class="logo-voorbeeld" src="${c.bedrijf.logo}" alt="Logo">` : '<span class="muted small">nog geen logo</span>'}
      <label class="btn small">${c.bedrijf.logo ? 'Ander logo…' : 'Logo kiezen…'}<input type="file" accept="image/*" data-bind="clogo" hidden></label>${c.bedrijf.logo ? '<button class="ghost small" data-act="clogodel">✕ Logo weg</button>' : ''}
      <span class="muted small">Staat bovenaan de offerte (begroting) en de specificatiestaat. De bedrijfsgegevens hierboven staan alleen op de offerte.</span></div>`;
  // ---- leuning per meter ----
  // per profiel: uren per vorm (Excel), daaronder per houtsoort de houtprijs en de prijs per meter recht / gebogen
  const HT = c.leuningHout || [], ophangen = c.montage.leuningOphangen * T.montage;
  const lrows = c.profielen.map(pr => {
    const hd = `<tr class="lprof"><td colspan="2"><b>${esc(pr)}</b> ${fotoKnop('profiel', pr)}</td>${CO.VORMEN.map(v => `<td colspan="2" class="small">${v}: ${uren(CO.leuningU(c, pr, v))} per m ${c.leuning[pr + '|' + v] > 0 ? '' : '<span class="muted">gem.</span>'}</td>`).join('')}</tr>`;
    return hd + HT.map(h => `<tr><td class="lhout">${esc(h)}</td><td>€ ${numIn('cleunmat', `data-k="${esc(pr)}" data-h="${esc(h)}"`, (c.leuningMat[pr] || {})[h])}</td>${CO.VORMEN.map(v => {
      const pm = CO.leuningPerM(c, pr, v, h), key = CO.leunKey(pr, v, h), lv = c.leuningVast[key], s = lv ? CO.check(c, lv.prijs, pm.maken, lv.kost) : null;
      return `<td class="num" title="maken (uren + hout), zonder ophangen (${eur(pm.ophangen)}/m bij montage)"><b>${eur(pm.maken)}</b></td><td>${vastCell('leun', key, s, pm.maken)}</td>`;
    }).join('')}</tr>`).join('');
  }).join('');
  const leun = `<div class="row wrap small lhoutbar"><b>Houtsoorten leuning:</b> ${HT.map(h => `<span class="chip">${esc(h)} <button class="ghost small" data-act="lhoutdel" data-v="${esc(h)}" title="Houtsoort weghalen">✕</button></span>`).join('')}
      <input class="w8" id="lh-naam" list="lh-list" placeholder="bv. Beuken"><datalist id="lh-list">${[...new Set(db.materials.map(m => M.canonMaterial(m.material)))].filter(h => !HT.includes(h)).map(h => `<option value="${esc(h)}">`).join('')}</datalist><button class="small" data-act="lhoutadd">+ Houtsoort</button></div>
    <table class="tbl ptable ltable"><thead><tr><th>Profiel / houtsoort</th><th>Hout per m</th>${CO.VORMEN.map(v => `<th class="num">${v}: kostprijs per m</th><th>Vaste prijs per m</th>`).join('')}</tr></thead><tbody>${lrows}</tbody></table>
    <p class="muted small">Kostprijs per m = uren ${xl} × uurtarief + hout per m, <b>exclusief ophangen</b> (${eur(ophangen)}/m, staat apart bij montage; de klant kan het zelf doen). Uren "gem." = nog niet gemeten: gemiddelde van die vorm. De vaste prijs per meter is de verkoopprijs per profiel, recht of gebogen; de app bewaakt de marge t.o.v. de kostprijs.</p>`;
  // eigen foto/tekening (ZP.fotos): ook groot in de tegels van de configurator
  const imgBtns = (kind, o) => fotoKnop(kind, o.id);
  // ---- leuningdragers (app) ----
  const drag = `<table class="tbl ptable"><thead><tr><th></th><th>Leuningdrager</th><th>Prijs per stuk</th><th></th></tr></thead><tbody>${c.dragers.map(d => `<tr>
      <td class="thumbcell">${DW.drager(d, 'thumb')}</td><td><input class="w14" data-bind="cdrager" data-id="${d.id}" data-f="naam" value="${esc(d.naam)}"><div>${imgBtns('drager', d)}</div></td>
      <td>€ ${numIn('cdrager', `data-id="${d.id}" data-f="prijs"`, d.prijs)}</td><td><button class="ghost small" data-act="dragerdel" data-v="${d.id}" title="Verwijderen">✕</button></td></tr>`).join('')}</tbody></table>
    <div class="row wrap"><button class="small primary" data-act="drageradd">+ Leuningdrager</button><span class="muted small">Keuze in de configurator; in de begroting vervangt de gekozen drager de standaard muurleuninghouder. Aantal per leuningstuk: tot 1,70 m 2, tot 3 m 3, langer ongeveer 70 cm onderling (minimaal 4).</span></div>`;
  // ---- trapspillen per soort (app; staan niet in Excel) ----
  const spl = `<table class="tbl ptable"><thead><tr><th>Spil</th><th>Uren per stuk</th><th>Materiaal per stuk</th><th class="num">Kostprijs per stuk</th><th>Vaste prijs per stuk</th></tr></thead><tbody>${[['eind', 'Eindspil (onder/boven)'], ['hoek', 'Hoekspil (draai, bordes)'], ['tussen', 'Tussenspil']].map(([k, lab]) => {
      const s = c.spilSoorten[k] || {}, kost = (+s.u || 0) * T.werk + (+s.mat || 0), sg = CO.check(c, s.vast, kost, s.vastKost);
      return `<tr><td><b>${lab}</b><div>${fotoKnop('spil', k)}</div></td><td>${numIn('cspil', `data-k="${k}" data-f="u"`, s.u, 'w3')} u</td><td>€ ${numIn('cspil', `data-k="${k}" data-f="mat"`, s.mat)}</td><td class="num"><b>${eur(kost)}</b></td>
        <td><input class="w5 num" data-bind="cspil" data-k="${k}" data-f="vast" value="${s.vast > 0 ? String(s.vast).replace('.', ',') : ''}" placeholder="—">${sg ? (sg.teLaag ? ` <span class="sig bad">te laag · min. ${eur(sg.min)}</span>` : ` <span class="sig ok">marge ${f1(sg.marge * 100)}%</span>`) : ''}</td></tr>`; }).join('')}</tbody></table>
    <p class="muted small">Het hout van de spil zelf komt uit de indeling. De configurator telt eindspillen (onder en boven) en hoekspillen (bij draaien, bordessen en knikpunten van getekende balustrades).</p>`;
  // ---- spijltypes ----
  const bstd = CO.balStdVan(c);
  const srows = c.spijltypes.map(s => { const isStd = s.id === bstd.spijl;
    return `<tr class="${isStd ? 'spijl-std' : ''}"><td class="thumbcell">${DW.spijl(s, 'thumb')}</td><td><b>${esc(s.naam)}</b>${isStd ? ' <span class="pill">standaard</span>' : ''}<div>${imgBtns('spijl', s)}</div></td><td>${uren(s.u)}</td>
    <td>${numIn('cspijl', `data-id="${s.id}" data-f="breedte"`, s.breedte)} mm</td><td>€ ${numIn('cspijl', `data-id="${s.id}" data-f="mat"`, s.mat)}</td>
    <td class="num"><b>${eur(s.u * T.werk + (+s.mat || 0))}</b></td>
    <td>${isStd ? '<span class="muted small">—</span>' : `€ ${numIn('cspijl', `data-id="${s.id}" data-f="meer"`, s.meer, 'w4')}`}</td></tr>`; }).join('');
  const spijl = `<table class="tbl ptable"><thead><tr><th></th><th>Spijltype ${xl}</th><th>Uren per spijl ${xl}</th><th>Breedte in aanzicht</th><th>Materiaal per spijl</th><th class="num">Kostprijs per spijl</th><th>Meerprijs per stuk</th></tr></thead><tbody>${srows}</tbody></table>
    <p class="muted small">Nieuw spijltype: regel toevoegen op blad Spijlen in Excel. De breedte bepaalt hoeveel spijlen er per meter in een balustrade passen.
    De standaardbalustrade rekent met het standaardspijltje (norm); een ander spijltje kost de meerprijs per stuk (zonder norm, excl. BTW, zonder opslag).</p>`;
  // ---- standaard balustrade: prijs per meter volgens de norm (maken, afwerken, plaatsen) ----
  const stdKol = (plaats, lab) => { const s = CO.balStdPrijs(c, plaats);
    return `<div class="balstd-kol"><h4>${lab}</h4>
      <label class="small"><input type="checkbox" data-bind="cbalstd" data-f="slof.${plaats}" ${bstd.slof[plaats] ? 'checked' : ''}> met onderslof</label>
      <table class="tbl compact"><tr><td>Maken (${f1(s.perMStd)} spijltjes${bstd.slof[plaats] ? ' + onderslof' : ''})</td><td class="num">${f2(s.maakU)} u</td><td class="num">${eur(s.maakU * T.werk)}</td></tr>
      <tr><td>Afwerken (grondverven per spijltje)</td><td class="num">${f2(s.afwU)} u</td><td class="num">${eur(s.afwerken)}</td></tr>
      <tr><td>Plaatsen ${lab.toLowerCase()}</td><td class="num">${f2(s.plaatsU)} u</td><td class="num">${eur(s.plaatsen)}</td></tr>
      <tr><td>Materiaal (spijltjes${bstd.slof[plaats] ? ', onderslof' : ''}, bevestiging)</td><td></td><td class="num">${eur(s.mat)}</td></tr>
      <tr class="tot"><td>Kostprijs per m</td><td></td><td class="num">${eur(s.arb + s.mat)}</td></tr>
      <tr class="tot"><td><b>Standaardprijs per m</b> (met opslag, excl. BTW)</td><td></td><td class="num"><b class="balstd-prijs" data-plaats="${plaats}">${eur(s.verkoop)}</b></td></tr></table></div>`; };
  const balstd = `<div class="row wrap small"><label>Standaardspijltje <select data-bind="cbalstd" data-f="spijl">${opts(c.spijltypes.map(x => [x.id, x.naam]), bstd.spijl)}</select></label>
      <label>Tussenruimte ${numIn('cbalstd', 'data-f="tussen"', bstd.tussen, 'w3')} mm</label></div>
    <div class="balstd">${stdKol('boom', 'Op de boom')}${stdKol('verdieping', 'Op de verdieping')}</div>
    <p class="muted small">Uren uit het Excel-bestand: spijltje en onderslof (blad Balustrade), grondverven per onderdeel en plaatsen per meter (Norm G). Excl. leuning (eigen prijs per meter).</p>`;
  // ---- balustrades (opbouw in de app) ----
  const brows = c.balustrades.map(b => {
    const pb = CO.balustradePerM(c, b, 'boom'), pv = CO.balustradePerM(c, b, 'verdieping'), s = CO.check(c, b.vast, pb.kost, b.vastKost);
    return `<div class="balcard ${s && s.teLaag ? 'bad' : ''}"><div class="balrow"><div class="balpic">${DW.spijl(pb.spijl, 'thumb')}</div><div><div class="row wrap">
        <input class="w16 bal-naam" data-bind="cbal" data-id="${b.id}" data-f="naam" value="${esc(b.naam)}">
        <label class="small">Spijl <select data-bind="cbal" data-id="${b.id}" data-f="spijl">${opts(c.spijltypes.map(x => [x.id, x.naam]), b.spijl)}</select></label>
        <label class="small">Max. tussenruimte ${numIn('cbal', `data-id="${b.id}" data-f="tussen"`, b.tussen, 'w3')} mm</label>
        <label class="small"><input type="checkbox" data-bind="cbal" data-id="${b.id}" data-f="onderslof" ${b.onderslof ? 'checked' : ''}> onderslof</label>
        <button class="ghost small danger ml-del" data-act="baldel" data-v="${b.id}">Verwijderen</button></div>
      <div class="balcalc">
        <span><small>Spijlen</small><b>${f1(pb.perM)} per m</b><em>${eur(pb.spijlen)}</em></span>
        <span><small>Onderslof</small><b>${b.onderslof ? 'ja' : 'nee'}</b><em>${eur(pb.slof)}</em></span>
        <span><small>Plaatsen op de boom</small><b>${f2(pb.plaatsU)} u/m</b><em>${eur(pb.plaatsen)}</em></span>
        <span class="tot"><small>Kostprijs per m (excl. leuning)</small><b>${eur(pb.kost)}</b><em>op de verdieping ${eur(pv.kost)}</em></span>
        <span class="vastbox">${vastCell('bal', b.id, s, pb.kost)}</span></div></div></div></div>`;
  }).join('');
  const bal = `<div class="row wrap small">Onderslof: hout € ${numIn('conslof', '', c.onderslofMat)} per m · uren ${uren(c.onderslof)} per m ${xl}</div>${brows}
    <div class="row wrap"><button class="primary small" data-act="baladd">+ Balustrade</button>
    <span class="muted small">Prijs per meter excl. leuning (de leuning heeft een eigen prijs per meter). Bouwbesluit: openingen maximaal 100 mm.</span></div>`;
  // ---- bewerkingen ----
  const byOnd = new Map(); for (const b of c.bewerkingen) { const k = b.onderdeel || 'Overig'; if (!byOnd.has(k)) byOnd.set(k, []); byOnd.get(k).push(b); }
  const tekOpts = (b) => `<option value="">automatisch (${esc(DW.LIB[DW.keyFor(Object.assign({}, b, { tek: '' }))].t)})</option>` + DW.list().map(([k, t]) => `<option value="${k}" ${b.tek === k ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const bwCard = (b) => { const kost = CO.bewKost(c, b), s = CO.check(c, b.vast, kost, b.vastKost);
    return `<div class="bwcard ${s && s.teLaag ? 'bad' : ''}" data-bew="${b.id}">
      <div class="bwpic">${DW.forBew(b)}</div>
      <div class="bw-naam">${esc(b.naam)}</div>
      <div class="bwrow muted">${esc(b.onderdeel)} · ${esc(b.eenheid)} · ${uren(b.u)} ${xl}</div>
      <div class="bwrow"><label>materiaal € ${numIn('cbew', `data-id="${b.id}" data-f="mat"`, b.mat)}</label></div>
      <div class="bwprice"><span class="muted small">kostprijs</span> <b>${eur(kost)}</b> <span>${esc(b.eenheid)}</span></div>
      ${vastCell('bew', b.id, s, kost)}
      <div class="bwrow"><select class="small" data-bind="cbew" data-id="${b.id}" data-f="tek" title="Tekening uit de bibliotheek">${tekOpts(b)}</select></div>
      <div class="bwrow">${imgBtns('bew', b)}</div></div>`; };
  const bew = [...byOnd.entries()].map(([ond, list]) => `<h4 class="bwgroup">${esc(ond)} <span class="muted small">${list.length}</span></h4><div class="bwgrid">${list.map(bwCard).join('')}</div>`).join('') +
    `<p class="muted small">Nieuwe bewerking: regel toevoegen op blad Bewerkingen in Excel en opnieuw inlezen; daarna hier materiaalprijs, vaste prijs en tekening invullen.</p>`;
  // ---- afwerkingen ----
  // gemeten dekking: uit de projecten waar het werkelijke verbruik (liters) is ingevuld bij Prijs → Nacalculatie afwerkmiddel
  const afw = `<table class="tbl ptable"><thead><tr><th>Afwerking ${xl}</th><th>Extra uren per m² ${xl}</th><th>Product</th><th>Prijs per liter</th><th>Dekking (m²/liter/laag)</th><th>Lagen</th><th title="Schuurpapier, kwasten, lappen">Klein materiaal per m²</th><th class="num">Materiaal per m²</th><th class="num">Kostprijs per m²</th></tr></thead><tbody>${c.afwerkingen.map(a => { const g = CO.afwGemeten(db, a), afwijkt = g && a.dekking > 0 && Math.abs(g.dekking / a.dekking - 1) > 0.1;
    return `<tr>
      <td><b>${esc(a.naam)}</b><div>${fotoKnop('afw', a.id)}</div></td><td>${uren(a.uM2 || 0)}</td><td><input class="w8" data-bind="cafw" data-id="${a.id}" data-f="product" value="${esc(a.product || '')}"></td>
      <td>€ ${numIn('cafw', `data-id="${a.id}" data-f="prijsL"`, a.prijsL)}</td><td>${numIn('cafw', `data-id="${a.id}" data-f="dekking"`, a.dekking)}${g ? `<div class="small ${afwijkt ? 'warnc' : 'muted'}">gemeten ${f1(g.dekking)} (${g.n} ${g.n === 1 ? 'project' : 'projecten'})${afwijkt ? ` <button class="small" data-act="cafwmeet" data-v="${a.id}" title="De gemeten dekking overnemen">Overnemen</button>` : ''}</div>` : ''}</td><td>${numIn('cafw', `data-id="${a.id}" data-f="lagen"`, a.lagen, 'w3')}</td>
      <td>€ ${numIn('cafw', `data-id="${a.id}" data-f="klein"`, a.klein || '', 'w3')}</td>
      <td class="num">${eur(CO.afwMat(a))}</td><td class="num"><b>${eur(CO.afwPrijs(c, a))}</b></td></tr>`; }).join('')}</tbody></table>
    <div class="row wrap small">Standaard voor nieuwe begrotingen: treden en leuning <select data-bind="cafwstd" data-k="treden">${opts(c.afwerkingen.map(a => a.naam), c.afwStd.treden)}</select>
      · overige onderdelen <select data-bind="cafwstd" data-k="rest">${opts(c.afwerkingen.map(a => a.naam), c.afwStd.rest)}</select></div>`;
  // ---- beslag (app) ----
  const bs = `<table class="tbl ptable"><thead><tr><th>Artikel</th><th>Eenheid</th><th>Prijs per eenheid</th><th>Standaard aantal</th><th>per</th><th></th></tr></thead><tbody>${c.beslag.map(s => `<tr>
      <td><input class="w16" data-bind="cbes" data-id="${s.id}" data-f="naam" value="${esc(s.naam)}"></td><td><input class="w4" data-bind="cbes" data-id="${s.id}" data-f="eenheid" value="${esc(s.eenheid)}"></td>
      <td>€ ${numIn('cbes', `data-id="${s.id}" data-f="prijs"`, s.prijs)}</td><td>${numIn('cbes', `data-id="${s.id}" data-f="std"`, s.std)}</td>
      <td><select data-bind="cbes" data-id="${s.id}" data-f="per">${opts(BESLAG_PER, s.per)}</select></td><td><button class="ghost small" data-act="besdel" data-v="${s.id}">✕</button></td></tr>`).join('')}</tbody>
    <tfoot><tr class="addrow-l"><td><input class="w16" id="bs-naam" placeholder="Nieuw artikel"></td><td><input class="w4" id="bs-eh" placeholder="stuk"></td><td>€ <input class="w4 num" id="bs-p"></td><td><input class="w4 num" id="bs-std" placeholder="0"></td><td><select id="bs-per">${opts(BESLAG_PER, 'per stuk')}</select></td><td><button class="small primary" data-act="besadd">+</button></td></tr></tfoot></table>`;
  // ---- overige normtijden (alleen-lezen) ----
  const nr = (lab, pad) => `<tr><td>${lab}</td><td class="num">${normIn(pad)}</td></tr>`, N2 = CO.NS;
  const nEigen = Object.keys(c.normBron || {}).length;
  // treden per type trap (één regel per trap) en – normbestand versie 11 – per soort trede (recht/verdreven, zonder afwerken)
  const treden = `<div><h4>Treden per type trap (per tred)</h4><table class="tbl compact">${c.traptypes.map(t => nr(esc(t), 'treden' + N2 + t)).join('')}<tr><td><i>Gemiddelde</i> <span class="muted small">voor een leeg type</span></td><td class="num">${normIn('tredenGem')}</td></tr></table>
      ${c.tredeNorm ? `<h4>Treden per soort (zonder afwerken)</h4><table class="tbl compact">${nr('Rechte trede', 'tredeNorm' + N2 + 'Recht')}${nr('Verdreven trede', 'tredeNorm' + N2 + 'Verdreven')}</table>
        <p class="muted small">Aftekenen, op maat zagen, verlijmen, schuren, ronde kant frezen + kopse kant schuren. Gebruikt als "Treden recht en verdreven apart rekenen" aan staat (tabblad Bedrijf en tarieven); verdreven treden telt de app uit de tekening.</p>` : ''}</div>`;
  const afwerken = c.afwNorm ? `<h4>Afwerken per onderdeel (uren)</h4><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Afwerking</th><th class="num">per tred</th><th class="num">per stootbord</th><th class="num">per m trapboom</th><th class="num">per m keepboom</th><th class="num">per tred spil</th><th class="num">per m leuning</th></tr></thead><tbody>
      ${Object.keys(c.afwNorm).map(n => `<tr><td>${esc(n)}</td>${['trede', 'stootbord', 'trapboom', 'keepboom', 'spil', 'leuning'].map(k => `<td class="num">${normIn('afwNorm' + N2 + n + N2 + k, 'w3')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">Olie kost meer tijd dan wit gegrond. ${(c.geenAfwerking || []).length ? 'Niet afwerken (stootborden): ' + esc(c.geenAfwerking.join(', ')) + '.' : ''}</p>` : '';
  const norms = `<p class="muted small norm-uitleg">De uren komen uit het Excel-bestand, maar je kunt elke norm hier zelf aanpassen. Een eigen norm krijgt het label <span class="nbron hand">eigen</span> en blijft staan als je Excel opnieuw inleest; ↺ zet de Excel-waarde terug.${nEigen ? ` Nu ${nEigen} eigen ${nEigen === 1 ? 'norm' : 'normen'}. <button class="small ghost" data-act="cnormallesterug">Alles terug naar Excel</button>` : ''}</p>
    <div class="normgrid">
    ${treden}
    <div><h4>Bomen (per meter)</h4><table class="tbl compact">${CO.VORMEN.map(v => nr('Trapboom ' + v.toLowerCase(), 'trapboom' + N2 + v) + nr('Keepboom ' + v.toLowerCase(), 'keepboom' + N2 + v)).join('')}</table>
      ${c.trapboomTred || c.keepboomTred ? `<h4>Nesten frezen / keepen zagen (per trede, per boom)</h4><table class="tbl compact">${CO.VORMEN.map(v => (c.trapboomTred ? nr('Nesten frezen – ' + v.toLowerCase(), 'trapboomTred' + N2 + v) : '') + (c.keepboomTred ? nr('Keepen zagen – ' + v.toLowerCase(), 'keepboomTred' + N2 + v) : '')).join('')}</table>` : ''}
      <h4>Overig</h4><table class="tbl compact">${nr('Stootbord (per stuk, algemeen)', 'stootbord')}${nr('Spil (per tred die de spil bedient)', 'spil')}${nr('Onderslof (per m)', 'onderslof')}${nr('Grondverven (per onderdeel)', 'grondverven')}</table></div>
    <div><h4>Stootborden per type trap (per stuk)</h4><table class="tbl compact">${c.traptypes.map(t => nr(esc(t), 'stootbordType' + N2 + t)).join('')}</table>
      <p class="muted small">Leeg = de algemene norm per stootbord.</p>
      <h4>Montage op locatie</h4><table class="tbl compact">${[['zetten', 'Trap zetten (per trap)'], ['leuningOphangen', 'Leuning ophangen (per m)'], ['balBoom', 'Balustrade op de boom (per m)'], ['balVerdieping', 'Balustrade op de verdieping (per m)'], ['aftimmering', 'Aftimmering trapgat (per m)'], ['trapgat', 'Trapgat aanpassen (per keer)']].map(([k, t]) => nr(t, 'montage' + N2 + k)).join('')}
      <tr><td title="Staat niet in het Excel-bestand: hier in te stellen">Oude trap verwijderen (per trap)</td><td class="num">${numIn('cmont', 'data-k="sloop"', c.montage.sloop, 'w3')} u</td></tr></table></div></div>${afwerken}`;
  // tabbladen in plaats van één lange pagina (ui.prTab); "Alles" = de oude lange pagina
  const tab = PR_TABS.some(x => x[0] === ui.prTab) ? ui.prTab : 'tar', in_ = (k) => tab === 'alles' || PR_TABS.find(x => x[0] === tab)[2].includes(k);
  const tabs = `<div class="przoek no-print"><input type="search" class="w16" data-bind="przoek" value="${esc(ui.prZoek || '')}" placeholder="Zoek een bewerking, spijl, afwerking of artikel" aria-label="Zoeken in prijzen en normen">${ui.prZoek ? ' <span class="muted small">alleen wat past bij de zoekterm; maak het veld leeg voor alles</span>' : ''}</div>
    <div class="prtabs no-print" role="tablist" aria-label="Onderdelen van prijzen en normen">${PR_TABS.map(([k, t]) => `<button class="prtab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" data-act="prtab" data-v="${k}">${t}</button>`).join('')}</div>`;
  return pageHead('Prijzen en normen', 'De uren komen uit uw Excel-bestand; alle bedragen, vaste prijzen en tekeningen stelt u hier in.', `<button class="ghost" data-act="normreset" title="Alles terug naar de startwaarden">Startwaarden</button>`) +
    banner + tabs + (in_('bron') ? `<section class="card">${bron}</section>` : '') +
    (in_('tar') ? card('tar', 'Tarieven en bedrijfsgegevens', 'uurloon, opslag, BTW, minimale marge', tar) : '') +
    (in_('bew') ? card('bew', 'Bewerkingen – prijs per eenheid', 'materiaal en eventueel een vaste prijs per bewerking', bew) : '') +
    (in_('leun') ? card('leun', 'Leuning – prijs per meter', 'per profiel, vorm en houtsoort', leun) : '') +
    (in_('spl') ? card('spl', 'Trapspillen – prijs per stuk', 'eindspil, hoekspil, tussenspil', spl) : '') +
    (in_('drag') ? card('drag', 'Leuningdragers', 'type en prijs per stuk', drag) : '') +
    (in_('balstd') ? card('balstd', 'Standaard balustrade – prijs per meter', 'norm: maken, afwerken, plaatsen; op de boom en op de verdieping', balstd) : '') +
    (in_('bal') ? card('bal', 'Balustradetypes (eigen samenstelling)', 'opbouw met spijltype, tussenruimte en onderslof', bal) : '') +
    (in_('spijl') ? card('spijl', 'Spijltypes', 'breedte en materiaal per spijl', spijl) : '') +
    (in_('afw') ? card('afw', 'Afwerkingen – prijs per m²', 'product, prijs per liter, dekking, lagen', afw) : '') +
    (in_('bes') ? card('bes', 'Beslag en hulpmiddelen', 'prijzen en standaardverbruik', bs) : '') +
    (in_('norm') ? card('norm', 'Overige normtijden', 'uit het Excel-bestand', norms) : '');
}
// tabbladen Prijzen en normen: [sleutel, titel, kaarten]
const PR_TABS = [['tar', 'Bedrijf en tarieven', ['tar']], ['bew', 'Bewerkingen', ['bew']], ['leun', 'Leuning en balustrade', ['leun', 'drag', 'balstd', 'bal', 'spijl']],
  ['spl', 'Spillen', ['spl']], ['afw', 'Afwerkingen', ['afw']], ['bes', 'Beslag', ['bes']], ['norm', 'Normtijden (Excel)', ['bron', 'norm']], ['alles', 'Alles', null]];


CLICK.push(function click_prijzen(a, t, v, p, e) {
  switch (a) {
    // ---- prijzen en normen ----
    case 'prtab': ui.prTab = v; render(); window.scrollTo(0, 0); break;
    case 'cafwmeet': { const a = C().afwerkingen.find(x => x.id === v), g = a && CO.afwGemeten(db, a); if (g) { a.dekking = Math.round(g.dekking * 10) / 10; ui.msg = { text: `Dekking van ${a.naam} nu ${f1(a.dekking)} m² per liter (gemeten).`, kind: 'ok' }; save(); } render(); break; }
    case 'cnormterug': CO.normTerug(C(), v); save(); render(); break;
    case 'cnormallesterug': for (const pad of Object.keys(C().normBron || {})) CO.normTerug(C(), pad); save(); render(); break;
    case 'normreset': if (confirm('Alle normen, prijzen, vaste prijzen en balustrades terugzetten naar de startwaarden?')) { db.cost = CO.defaults(); ui.msg = { text: 'Startwaarden teruggezet.', kind: 'ok' }; save(); } render(); break;
    case 'normpick': (async () => {
      // bestand kiezen en onthouden, zodat het later met één klik opnieuw ingelezen kan worden
      try { const [h] = await window.showOpenFilePicker({ types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] } }] }); ui.normHandle = h; handleStore.set(h); await readNorms(await h.getFile()); }
      catch (err) { if (err.name !== 'AbortError') { ui.msg = { text: 'Excel niet ingelezen: ' + err.message, kind: 'err' }; render(); } }
    })(); break;
    case 'normreload': (async () => {
      const h = ui.normHandle; if (!h) return;
      try { if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted') await h.requestPermission({ mode: 'read' }); await readNorms(await h.getFile()); }
      catch (err) { ui.msg = { text: `"${h.name}" kon niet gelezen worden (${err.message}). Kies het bestand opnieuw.`, kind: 'err' }; render(); }
    })(); break;
    case 'baladd': { const c = C(); c.balustrades.push({ id: CO.uid('bl'), naam: 'Nieuwe balustrade', spijl: (c.spijltypes[0] || {}).id, tussen: 100, onderslof: true, profiel: c.profielen[0], vorm: 'Recht' }); save(); render(); break; }
    case 'baldel': if (confirm('Deze balustrade verwijderen?')) { C().balustrades = C().balustrades.filter(b => b.id !== v); save(); } render(); break;
    case 'besadd': {
      const g = (id) => (document.getElementById(id) || {}).value || '', n = (id) => parseFloat(g(id).replace(',', '.'));
      const naam = g('bs-naam').trim(); if (!naam) { ui.msg = { text: 'Geef het artikel een naam.', kind: 'err' }; return render(); }
      C().beslag.push({ id: CO.uid('s'), naam, eenheid: g('bs-eh') || 'stuk', prijs: n('bs-p') || 0, std: n('bs-std') || 0, per: g('bs-per') }); save(); render(); break;
    }
    case 'lhoutadd': {
      const c = C(), h = ((document.getElementById('lh-naam') || {}).value || '').trim();
      if (!h) { ui.msg = { text: 'Vul een houtsoort in.', kind: 'err' }; return render(); }
      if (!c.leuningHout.some(x => x.toLowerCase() === h.toLowerCase())) {
        // startprijs: wat de eerste houtsoort per profiel kost (aan te passen)
        for (const pr of c.profielen) { const m = c.leuningMat[pr] = c.leuningMat[pr] || {}; m[h] = c.leuningHout.length ? +m[c.leuningHout[0]] || 0 : 0; }
        c.leuningHout.push(h); ui.msg = { text: `${h} toegevoegd; houtprijzen overgenomen van ${c.leuningHout[0]} – pas ze aan.`, kind: 'ok' };
      }
      save(); render(); break;
    }
    case 'lhoutdel': {
      const c = C(); if (c.leuningHout.length <= 1) { ui.msg = { text: 'Er moet minstens één houtsoort blijven.', kind: 'err' }; return render(); }
      if (!confirm(`${v} weghalen uit de leuningprijzen (ook de vaste prijzen)?`)) break;
      c.leuningHout = c.leuningHout.filter(h => h !== v);
      for (const pr of Object.keys(c.leuningMat)) if (c.leuningMat[pr]) delete c.leuningMat[pr][v];
      for (const k of Object.keys(c.leuningVast)) if (k.split('|')[2] === v) delete c.leuningVast[k];
      save(); render(); break;
    }
    case 'besdel': C().beslag =C().beslag.filter(s => s.id !== v); save(); render(); break;
    case 'clogodel': delete C().bedrijf.logo; save(); render(); break;
    case 'imgdel': { const o = imgList(t.dataset.kind).find(x => x.id === v); if (o) { delete o.img; save(); } render(); break; }
    case 'drageradd': C().dragers.push({ id: CO.uid('dr'), naam: 'Nieuwe leuningdrager', prijs: 0, perM: 1.2 }); save(); render(); break;
    case 'dragerdel': if (confirm('Deze leuningdrager verwijderen?')) { C().dragers = C().dragers.filter(d => d.id !== v); save(); } render(); break;
    default: return false;
  }
});
// bedrijfsgegevens voor de offerte: lege velden één keer vullen met de gegevens van de gebruiker (daarna aan te passen bij Prijzen)
(function bedrijfStart() {
  const b = C().bedrijf; if (b.gevuld) return;
  const std = { naam: 'Timmerwerken Van der Male', adres: 'Energieweg 11 B', plaats: '4691 SE Tholen', tel: '06-12654136', mail: 'info@timmerwerkenvandermale.nl',
    web: 'www.timmerwerkenvandermale.nl', iban: 'NL21RABO0123540720', btwnr: 'NL868483114B01', kvk: '98414054' };
  for (const [k, w] of Object.entries(std)) if (!b[k]) b[k] = w;
  b.gevuld = true; save();
})();
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_prijzen(b, t, p, part, numv) {
  switch (b) {
    // ---- prijzen en normen ----
    case 'ctar': C().tarief[t.dataset.k] = t.dataset.pct ? numv(t.value) / 100 : numv(t.value); break;
    // norm zelf invullen (leeg = terug naar Excel), voorbereiding per trap, treden recht/verdreven apart
    case 'przoek': ui.prZoek = t.value.trim(); if (ui.prZoek) ui.prTab = 'alles'; render(); return 'skip';
    case 'cnorm': if (t.value.trim() === '') CO.normTerug(C(), t.dataset.pad); else CO.normSet(C(), t.dataset.pad, numv(t.value)); break;
    case 'copzet': (C().opzetten = C().opzetten || {})[t.dataset.k] = numv(t.value); break;
    case 'ctredenapart': C().tredenApart = t.checked; break;
    case 'cbedrijf': C().bedrijf[t.dataset.k] = t.value.trim(); break;
    case 'clogo': {
      // logo voor offerte en specificatiestaat: verkleind tot 900 px (wit achter doorzichtige delen)
      const fl = t.files && t.files[0]; t.value = ''; if (!fl) return 'skip';
      ZP.drawings.shrink(fl, 900).then(src => { C().bedrijf.logo = src; ui.msg = { text: 'Logo opgeslagen; het staat op de offerte en de specificatiestaat.', kind: 'ok' }; save(); render(); })
        .catch(err => { ui.msg = { text: 'Logo niet gelezen: ' + err.message, kind: 'err' }; render(); });
      return 'skip';
    }
    case 'cleunmat': { const m = C().leuningMat; if (!m[t.dataset.k] || typeof m[t.dataset.k] !== 'object') m[t.dataset.k] = {}; m[t.dataset.k][t.dataset.h] = numv(t.value); break; }
    case 'conslof': C().onderslofMat = numv(t.value); break;
    case 'cmont': C().montage[t.dataset.k] = numv(t.value); break;
    case 'cspil': {
      const c = C(), s = c.spilSoorten[t.dataset.k] = c.spilSoorten[t.dataset.k] || {};
      if (t.dataset.f === 'vast') { const pr = t.value.trim() === '' ? null : numv(t.value); s.vast = pr > 0 ? pr : null; s.vastKost = s.vast ? (+s.u || 0) * c.tarief.werk + (+s.mat || 0) : null; }
      else s[t.dataset.f] = numv(t.value);
      break;
    }
    case 'cdrager': { const d = C().dragers.find(x => x.id === t.dataset.id); if (d) d[t.dataset.f] = t.dataset.f === 'naam' ? t.value : numv(t.value); break; }
    case 'cvast': CO.setVast(C(), t.dataset.kind, t.dataset.id, t.value.trim() === '' ? '' : numv(t.value)); break;
    case 'cspijl': { const s = C().spijltypes.find(x => x.id === t.dataset.id); if (s) s[t.dataset.f] = numv(t.value); break; }
    case 'cbalstd': {
      const s = CO.balStdVan(C()), f = t.dataset.f;
      if (f.startsWith('slof.')) s.slof[f.slice(5)] = t.checked; else if (f === 'tussen') s.tussen = numv(t.value) || 100; else s.spijl = t.value;
      break;
    }
    case 'cbal': {
      const b = C().balustrades.find(x => x.id === t.dataset.id); if (!b) break; const f = t.dataset.f;
      b[f] = f === 'onderslof' ? t.checked : f === 'tussen' ? numv(t.value) : t.value; break;
    }
    case 'cbew': { const b = C().bewerkingen.find(x => x.id === t.dataset.id); if (b) b[t.dataset.f] = t.dataset.f === 'mat' ? numv(t.value) : t.value; break; }
    case 'cafw': { const a = C().afwerkingen.find(x => x.id === t.dataset.id); if (a) a[t.dataset.f] = ['naam', 'product'].includes(t.dataset.f) ? t.value : numv(t.value); break; }
    case 'cafwstd': C().afwStd[t.dataset.k] = t.value; break;
    case 'cbes': { const s = C().beslag.find(x => x.id === t.dataset.id); if (s) s[t.dataset.f] = ['prijs', 'std'].includes(t.dataset.f) ? numv(t.value) : t.value; break; }
    default: return false;
  }
});
