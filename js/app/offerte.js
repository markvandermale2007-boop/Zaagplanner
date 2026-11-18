// Afdrukken voor de klant (begroting): vinkjes Offerte / Specificatiestaat, en per configurator-variant en per houtsoort-optie
// (Houtsoorten vergelijken, "op offerte") een eigen specificatiestaat. Offerte = trap als totaalprijs, extra's (bewerkingen) en
// eigen regels apart, opties als meerprijs, slottekst; zonder uren en kostprijs.
// Data: p.begroting.afdruk {offerte, spec, specUit[sleutels]}, p.begroting.offRegels [{id, oms, bedrag (excl.)}], C().offerte {intro, voorwaarden, slot}.
const OFF_STD = {
  intro: 'Naar aanleiding van uw aanvraag bieden wij u vrijblijvend het volgende aan:',
  voorwaarden: 'Deze offerte is 30 dagen geldig. Betaling binnen 14 dagen na factuurdatum.',
  slot: 'Wij vertrouwen erop u hiermee een passende aanbieding te hebben gedaan.',
};
const offTekst = () => Object.assign({}, OFF_STD, C().offerte || {});
function afdrukKeuze(p) { const B = p.begroting; B.afdruk = Object.assign({ offerte: false, spec: true, specUit: [] }, B.afdruk || {}); return B.afdruk; }

// ---------- specificatiestaten: zoals begroot + andere varianten + houtsoort-opties ----------
function specScenarios(p) {
  const L = [], cfg = p.config, v0 = specVariant(p) || sptVariant(p);
  const bv = bvLijst(p);
  L.push({ key: 'basis', label: bv.length ? 'Variant A' : v0 && cfg && (cfg.varianten || []).length > 1 ? 'Variant ' + v0.naam : 'Zoals begroot' });
  for (const v of bv) L.push({ key: 'bv:' + v.id, label: 'Variant ' + v.naam });
  if (CONFIGURATOR && cfg && !cfg.uit && v0) for (const v of cfg.varianten || []) if (v.id !== v0.id) L.push({ key: 'var:' + v.id, label: 'Variant ' + v.naam });
  const o = p.houtOpties; if (o && o.res && o.res.basis) for (const k of o.offerte || []) L.push({ key: 'ho:' + k, label: 'Optie: ' + hoLabel(k) });
  return L;
}
// kopie van het project met de variant of houtsoort-optie toegepast (onderdelen ondiep gekopieerd: mesh wordt gedeeld, niet gewijzigd)
function specKopie(p, key) {
  if (key === 'basis') return p;
  if (key.startsWith('bv:')) { const v = bvVan(p, key.slice(3)); return v ? bvKopie(p, v) : null; }
  const k = JSON.parse(JSON.stringify(Object.assign({}, p, { parts: [] })));
  k.parts = p.parts.map(x => Object.assign({}, x)); k._kopie = true;
  if (key.startsWith('var:')) {
    const v = (k.config.varianten || []).find(x => x.id === key.slice(4)); if (!v) return null;
    k.config.gekozen = v.id; k.config.actief = v.id; k.config.uit = false;
    try { if (k.parts.length) CF.toepassen(k, v, C(), db.materials); } catch (e) { /* tekening past niet: alleen de keuzes */ }
    k.config.toegepast = Object.assign({}, k.config.toegepast || {}, { variant: v.id, naam: v.naam });
    k._label = 'Variant ' + v.naam;
  } else if (key.startsWith('ho:')) {
    const hk = key.slice(3), i = hk.indexOf('|'), s = hk.slice(0, i), w = hk.slice(i + 1), o = hoState(p), keuze = {};
    const types = s === 'alles' ? hoTypes(o) : (HO_SOORTEN.find(x => x.id === s) || { types: [] }).types;
    for (const t of types) keuze[t] = w;
    k.typeMaterial = hoTypeMat(p, o, keuze); k._label = 'Optie: ' + hoLabel(hk);
  }
  return k;
}
const begrotingVan = (k) => { const pur = purchaseOf(k); return CO.begroting(C(), k, pur, pur ? null : houtSchatting(k)); };
// meerdere trappen in één project: per trap een eigen specificatiestaat (wens gebruiker). Kopie met alleen die trap en zijn onderdelen;
// geen indeling/opstelling mee (de specificatiestaat heeft geen prijzen; de tekening toont dan alleen deze trap).
function specPerTrap(p) {
  if (!p.stairs || p.stairs.length < 2) return [{ p, trap: '' }];
  return p.stairs.map(s => {
    const k = Object.assign({}, p, { stairs: [s], parts: p.parts.filter(x => x.stair === s.id), layouts: {}, opstelling: null, _kopie: true });
    k.begroting = JSON.parse(JSON.stringify(p.begroting || {}));
    return { p: k, trap: `Trap ${stairCode(p, s.id)} – ${s.name}` };
  });
}
function specLijst(p, r) {
  const A = afdrukKeuze(p), uit = new Set(A.specUit || []), een = specScenarios(p).length === 1;
  return specScenarios(p).filter(s => !uit.has(s.key)).flatMap(s => {
    const k = specKopie(p, s.key); if (!k) return [];
    const label = s.key === 'basis' && een ? '' : s.label;
    // per groep trappen (boven elkaar gekoppeld = bij elkaar) één tekeningblad, daarna per trap een specificatiestaat;
    // losse trappen krijgen elk een eigen blad. blad = project(kopie) voor het tekeningblad vóór deze staat (null = geen blad hier)
    const perTrap = specPerTrap(k), groepen = ZP.ops.groepen(k), uit = [];
    for (const g of groepen.length ? groepen : [k.stairs]) {
      const bladP = sptGroepKopie(k, g), bladLabel = [k.stairs.length > 1 ? sptGroepNaam(k, g) : '', label].filter(Boolean).join(' · ');
      (k.stairs.length > 1 ? g.map(s => perTrap[k.stairs.indexOf(s)]) : perTrap).forEach((t, i) => { if (!t) return;
        uit.push({ p: t.p, r: t.p === p ? r : begrotingVan(t.p), label: [t.trap, label].filter(Boolean).join(' · '), blad: i === 0 ? bladP : null, bladLabel }); });
    }
    return uit;
  });
}

// ---------- offerte ----------
function offerteBedragen(p, r) {
  const t = r.tot, f = t.sub > 0 ? t.excl / t.sub : 1, lines = r.secs.flatMap(s => s.lines);
  const extra = lines.filter(l => /^bew(:|$)/.test(l.key) && l.def > 0).map(l => ({ label: l.label, excl: l.def * f }));
  const eigen = (p.begroting.offRegels || []).filter(x => (x.oms || '').trim() || +x.bedrag).map(x => ({ label: x.oms || 'Extra', excl: +x.bedrag || 0, eigen: true }));
  const trap = t.excl - extra.reduce((a, x) => a + x.excl, 0), excl = t.excl + eigen.reduce((a, x) => a + x.excl, 0), btwBedrag = excl * t.btw;
  return { trap, extra, eigen, excl, btw: t.btw, btwBedrag, incl: excl + btwBedrag };
}
// andere configurator-varianten als optie: verschil met de basis (beide met de houtschatting, zodat ze vergelijkbaar zijn)
function offerteVariantOpties(p) {
  const cfg = p.config, v0 = specVariant(p) || sptVariant(p); if (!CONFIGURATOR || !cfg || cfg.uit || !v0 || (cfg.varianten || []).length < 2) return [];
  const t0 = CO.begroting(C(), p, null, houtSchatting(p)).tot, basis = t0.excl, btw = t0.btw;
  return cfg.varianten.filter(v => v.id !== v0.id).map(v => { const k = specKopie(p, 'var:' + v.id); if (!k) return null;
    const d = CO.begroting(C(), k, null, houtSchatting(k)).tot.excl - basis; return Math.abs(d) < 0.5 ? null : { label: 'Optie: variant ' + v.naam, excl: d, incl: d * (1 + btw) }; }).filter(Boolean);
}
function offerteOmschrijving(p, r) {
  const weg = new Set(p.begroting.specWeg || []);
  return specGroepen(p, r).filter(g => !/kant \(naar boven|Speciale opties/.test(g.titel)).map(g => {
    // eigen teksten van de specificatiestaat (specTekst) ook hier
    const rows = g.rows.map(([k, x]) => [k, specTekstVan(p, specSleutel(g, k), String(x == null ? '' : x))]).filter(([k, x]) => !weg.has(specSleutel(g, k)) && x && x !== 'Geen' && x !== 'Nee');
    return rows.length ? `<li><b>${esc(specTekstVan(p, '#' + g.titel, g.titel))}:</b> ${rows.map(([k, x]) => `${esc(k.toLowerCase())} ${esc(x)}`).join('; ')}</li>` : '';
  }).join('');
}
function offertePrint(p, r) {
  const c = C(), K = p.begroting.klant, b = c.bedrijf, O = offerteBedragen(p, r), T = offTekst();
  // opties: bewerkingen "alleen als optie" (Uitvoering), varianten B/C …, houtsoort-opties
  const opties = [...(r.opties || []), ...bvOfferteRegels(p), ...offerteVariantOpties(p), ...hoOfferteRegels(p)];
  const rij = (l, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td><td class="num">${v}</td></tr>`;
  return `<div class="print-only bprint opprint">
    <div class="bp-head"><div><h1>Offerte</h1><p>${K.nr ? 'Offertenummer ' + esc(K.nr) + '<br>' : ''}Datum ${new Date().toLocaleDateString('nl-NL')}</p></div>${firmaBlok(b, true)}</div>
    <p class="bp-klant"><b>${esc(K.naam || '')}</b><br>${esc(K.adres || '')}<br>${esc(K.plaats || '')}</p>
    <p>${esc(T.intro)}</p>
    <ul class="op-oms">${offerteOmschrijving(p, r)}</ul>
    <table class="tbl bp-sum op-prijs">${rij('<b>Trap volgens bijgaande specificatie</b>', eur(O.trap))}
      ${O.extra.map(x => rij(esc(x.label), eur(x.excl))).join('')}${O.eigen.map(x => rij(esc(x.label), eur(x.excl))).join('')}
      ${rij('Totaal excl. BTW', eur(O.excl), 'sub')}${rij(`BTW ${f1(O.btw * 100)}%`, eur(O.btwBedrag))}${rij('<b>Totaal incl. BTW</b>', '<b>' + eur(O.incl) + '</b>', 'grand')}</table>
    ${opties.length ? `<table class="tbl bp-sum bp-opties"><tr class="ph"><th>Opties (meerprijs, niet in het totaal)</th><th class="num">excl. BTW</th><th class="num">incl. BTW</th></tr>${opties.map(o => `<tr><td>${esc(o.label)}</td><td class="num">${hoBedrag(o.excl)}</td><td class="num">${hoBedrag(o.incl)}</td></tr>`).join('')}</table>` : ''}
    <p class="op-tekst">${esc(T.voorwaarden)}</p><p class="op-tekst">${esc(T.slot)}</p>
    <p class="op-groet">Met vriendelijke groet,<br><br><b>${esc(b.naam || '')}</b></p></div>`;
}
// alles wat bij "Afdrukken voor de klant" hoort, in volgorde
function pakketPrint(p, r) {
  const A = Object.assign({}, afdrukKeuze(p), ui.printTijdelijk || {}), L = ui.printKopie || [];
  return (A.offerte ? offertePrint(p, r) : '') + (A.spec ? L.map(x => specPrint(x.p, x.r, x.label, x.blad, x.bladLabel)).join('') : '');
}

// ---------- kaarten op het scherm ----------
function afdrukKaart(p) {
  const A = afdrukKeuze(p), sc = specScenarios(p), uit = new Set(A.specUit || []);
  const vink = (bind, k, aan, t, sub) => `<label class="afd-vink${sub ? ' sub' : ''}"><input type="checkbox" data-bind="${bind}" data-v="${esc(k)}" ${aan ? 'checked' : ''}> ${t}</label>`;
  const niets = !A.offerte && !(A.spec && sc.some(s => !uit.has(s.key)));
  return `<section class="card afdkaart no-print"><h3>Afdrukken</h3>
    ${vink('bafdruk', 'offerte', A.offerte, '<b>Offerte</b> <span class="muted small">voor de klant, met prijzen</span>')}
    ${vink('bafdruk', 'spec', A.spec, '<b>Specificatiestaat</b> <span class="muted small">met tekening, zonder prijzen</span>')}
    ${A.spec && sc.length > 1 ? sc.map(s => vink('bafdrukspec', s.key, !uit.has(s.key), esc(s.label), true)).join('') : ''}
    <button class="primary afd-knop" data-act="afdruk" ${niets ? 'disabled' : ''}>Afdrukken / PDF</button></section>`;
}
function offerteCard(p, r) {
  const fk = 'open:offerte', T = offTekst();
  const head = `<div class="ml-head">${foldBtn(fk, 'Offerte')}<h3>Offerte voor de klant</h3><span class="muted small">trap als totaalprijs, extra's en eigen regels apart – zonder uren en kostprijs</span></div>`;
  if (folded(fk)) return `<section class="card offcard">${head}</section>`;
  const O = offerteBedragen(p, r), regels = p.begroting.offRegels || [];
  const ta = (k, t) => `<label class="off-tekst">${t}<textarea rows="2" data-bind="offtekst" data-k="${k}">${esc(T[k])}</textarea></label>`;
  // dubbel? eigen regel die (bijna) zo heet als een regel met een bedrag in de begroting (bv. "Trapgat aanpassen" bij Montage)
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bLines = r.secs.flatMap(s => s.lines).filter(l => l.def > 0);
  const dubbel = (x) => { const o = norm(x.oms); if (o.length < 4) return null; return bLines.find(l => { const b = norm(l.label); return b.includes(o) || (b.length >= 10 && o.includes(b)); }) || null; };
  const dubHtml = (x) => { const l = dubbel(x); return l ? `<div class="off-dubbel small">⚠ Staat ook in de begroting: "${esc(l.label)}" (${eur(l.def)}) – telt dan dubbel. Haal één van de twee weg.</div>` : ''; };
  return `<section class="card offcard">${head}
    <table class="tbl compact off-tbl"><tbody>
      <tr><td><b>Trap volgens bijgaande specificatie</b></td><td class="num">${eur(O.trap)}</td><td></td></tr>
      ${O.extra.map(x => `<tr><td>${esc(x.label)} <span class="muted small">(extra, uit de begroting)</span></td><td class="num">${eur(x.excl)}</td><td></td></tr>`).join('')}
      ${regels.map(x => `<tr><td><input class="off-oms" data-bind="offregel" data-id="${x.id}" data-f="oms" value="${esc(x.oms || '')}" placeholder="bv. trapgat aanpassen, plafond afwerken">${dubHtml(x)}</td>
        <td class="num"><input class="w7 num" data-bind="offregel" data-id="${x.id}" data-f="bedrag" value="${x.bedrag ? String(x.bedrag).replace('.', ',') : ''}" placeholder="€ excl."></td>
        <td><button class="ghost small" data-act="offregeldel" data-v="${x.id}" title="Regel weghalen">✕</button></td></tr>`).join('')}
      <tr><td colspan="3"><button class="small" data-act="offregeladd">+ Eigen regel</button> <span class="muted small">alleen op de offerte (niet in de begroting)</span></td></tr>
      <tr class="sub"><td>Totaal excl. BTW</td><td class="num">${eur(O.excl)}</td><td></td></tr>
      <tr><td><b>Totaal incl. BTW</b></td><td class="num"><b>${eur(O.incl)}</b></td><td></td></tr></tbody></table>
    ${(() => { const o = [...(r.opties || []), ...bvOfferteRegels(p)]; return o.length ? `<table class="tbl compact off-tbl"><tbody>${o.map(x => `<tr><td>${esc(x.label)} <span class="muted small">(optie, niet in het totaal)</span></td><td class="num">${hoBedrag(x.excl)}</td><td class="num muted small">incl. ${hoBedrag(x.incl)}</td></tr>`).join('')}</tbody></table>` : ''; })()}
    <p class="muted small">Opties (varianten B, C … en houtsoort-opties "op offerte") komen als meerprijs onder het totaal. Teksten gelden voor alle offertes:</p>
    <div class="off-teksten">${ta('intro', 'Aanhef')}${ta('voorwaarden', 'Geldigheid en betaling')}${ta('slot', 'Slotzin')}</div></section>`;
}
// afdrukken: eerst de tekeningbladen maken (kan even duren), dan het printvenster
let afdrukBezig = null;
function afdrukStart(p, r, keuze) {
  const A = Object.assign({}, afdrukKeuze(p), keuze || {});
  const lijst = A.spec ? specLijst(p, r) : [];
  // eerst alle plaatjes (logo, 3D-beeld, aanzichten) laden, anders drukt Safari/iPad ze niet af. Terugzetten pas na het afdrukken
  // (afterprint; op de iPad komt window.print meteen terug terwijl het afdrukvenster nog open is), anders bij de volgende klik.
  const druk = async () => {
    if (afdrukBezig) afdrukBezig.stop();   // vorige afdruk niet meer terugzetten (anders wist die deze)
    const mij = { stop: () => { klaar = true; window.removeEventListener('afterprint', terug); document.removeEventListener('click', klik, true); } };
    afdrukBezig = mij;
    let klaar = false;
    const klik = () => setTimeout(terug, 0);
    const terug = () => { if (klaar) return; mij.stop(); if (afdrukBezig === mij) afdrukBezig = null; if (ui.printDoc === 'pakket') { ui.printDoc = null; ui.printKopie = null; ui.printTijdelijk = null; render(); } };
    ui.printKopie = lijst; ui.printDoc = 'pakket'; ui.printTijdelijk = keuze || null; if (!['begroting', 'klant'].includes(ui.screen)) ui.screen = 'klant'; render();
    const imgs = [...document.querySelectorAll('.print-only img')];
    await Promise.race([Promise.all(imgs.map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => { /* kapot plaatje: toch afdrukken */ }))), new Promise(r => setTimeout(r, 4000))]);
    if (klaar) return;   // intussen een nieuwe afdruk gestart
    window.addEventListener('afterprint', terug);
    window.print();
    setTimeout(() => { if (!klaar) document.addEventListener('click', klik, true); }, 0);
  };
  const k = sptVoorAfdruk(lijst.filter(x => x.blad).map(x => x.blad));
  if (k === true) druk(); else { ui.msg = { text: `Tekening${lijst.length > 1 ? 'en' : ''} voor de specificatiestaat maken…`, kind: 'ok' }; render(); k.then(() => { ui.msg = null; druk(); }); }
}
CLICK.push(function click_offerte(a, t, v, p) {
  if (!p || !p.begroting) return false;
  switch (a) {
    case 'afdruk': { const c = C(), pur = purchaseOf(p), A = afdrukKeuze(p);
      if (!A.offerte && !A.spec) { ui.msg = { text: 'Vink bij Afdrukken (rechts) de offerte en/of de specificatiestaat aan.', kind: 'err' }; return render(); }
      // controle vóór het afdrukken: bij meldingen eerst vragen (verouderde indeling, geschat hout, prijs zonder norm, geen klant …)
      const rr = CO.begroting(c, p, pur, pur ? null : houtSchatting(p)), let_ = rr.warn.slice();
      if (isStale(p)) let_.unshift('De indeling is verouderd: de houtprijs hoort bij de oude keuzes.');
      if (A.offerte && !(p.begroting.klant || {}).naam) let_.push('Er is nog geen klant ingevuld.');
      if (let_.length && !confirm('Let op vóór het afdrukken:\n\n• ' + let_.join('\n• ') + '\n\nToch afdrukken?')) return;
      afdrukStart(p, rr); return; }
    case 'offregeladd': (p.begroting.offRegels = p.begroting.offRegels || []).push({ id: CO.uid('or'), oms: '', bedrag: 0 }); break;
    case 'offregeldel': p.begroting.offRegels = (p.begroting.offRegels || []).filter(x => x.id !== v); break;
    default: return false;
  }
  save(); render();
});
CHANGE.push(function change_offerte(b, t, p, part, numv) {
  switch (b) {
    case 'bafdruk': afdrukKeuze(p)[t.dataset.v] = t.checked; break;
    case 'bafdrukspec': { const A = afdrukKeuze(p), k = t.dataset.v; A.specUit = (A.specUit || []).filter(x => x !== k); if (!t.checked) A.specUit.push(k); break; }
    case 'offregel': { const x = (p.begroting.offRegels || []).find(y => y.id === t.dataset.id); if (!x) break; x[t.dataset.f] = t.dataset.f === 'bedrag' ? numv(t.value) : t.value; break; }
    case 'offtekst': { const c = C(); c.offerte = Object.assign({}, c.offerte || {}); const val = t.value.trim(); if (val && val !== OFF_STD[t.dataset.k]) c.offerte[t.dataset.k] = val; else delete c.offerte[t.dataset.k]; break; }
    default: return false;
  }
});
