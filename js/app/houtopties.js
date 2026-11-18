// Houtsoorten vergelijken (offerte-opties): bij Indeling de hele trap in elke aangevinkte houtsoort op echte planken
// doorrekenen; de goedkoopste = basis. Daarna per soort onderdeel × andere houtsoort de meerprijs (die soort in de andere
// houtsoort, de rest in de basis). Gekozen cellen komen als meerprijsregels onder het totaal van de begroting/offerte.
// Data: p.houtOpties = { houten[], soorten[], tijd, offerte[sleutel], res{hash, datum, basis, houten{W:{prijs,planken,ok,msg}}, cellen{'soort|W':…}} }
// Sleutels: 'alles|<houtsoort>' (hele trap) of '<soort>|<houtsoort>'. De echte indeling van het project blijft ongemoeid.
const HO_SOORTEN = [
  { id: 'treden', label: 'Treden en bordes', types: ['trede', 'bordes'] },
  { id: 'stootborden', label: 'Stootborden', types: ['stootbord'] },
  { id: 'bomen', label: 'Trap- en keepbomen', types: ['trapboom', 'keepboom'] },
  { id: 'leuning', label: 'Leuning', types: ['leuning'] },
  { id: 'spil', label: 'Spil', types: ['spil'] },
  { id: 'baluster', label: 'Balusters', types: ['baluster'] },
];
const hoWood = (s) => M.canonMaterial(s || '').split(' › ')[0];
// houtsoorten uit de materialenlijst (met maten)
const hoHoutsoorten = () => [...new Set(db.materials.filter(m => m.width > 0 && m.length > 0).map(m => M.canonMaterial(m.material)))].sort((a, b) => a.localeCompare(b));
// soorten onderdelen die in het project voorkomen
const hoSoortenVan = (p) => { const t = new Set(p.parts.filter(x => x.include !== false).map(x => x.type)); return HO_SOORTEN.filter(s => s.types.some(x => t.has(x))); };
const hoSoortLabel = (id) => (HO_SOORTEN.find(s => s.id === id) || { label: id }).label;
function hoState(p) {
  if (!p.houtOpties) {
    // standaard: de houtsoorten die nu in het project gebruikt worden, alle soorten onderdelen
    const nu = [...new Set(p.parts.filter(x => x.include !== false).map(x => hoWood(N.materialOf(x, S(), p.typeMaterial))))].filter(w => hoHoutsoorten().includes(w));
    p.houtOpties = { houten: nu.slice(0, 4), soorten: hoSoortenVan(p).map(s => s.id), tijd: 1, offerte: [], res: null };
  }
  const o = p.houtOpties; o.offerte = o.offerte || []; o.houten = o.houten || []; o.soorten = o.soorten || [];
  return o;
}
const hoTypes = (o) => HO_SOORTEN.filter(s => o.soorten.includes(s.id)).flatMap(s => s.types);
// tijdelijke houtkeuze: de vergeleken soorten onderdelen krijgen de gekozen houtsoort, de rest houdt de keuze van het project
function hoTypeMat(p, o, keuze) {
  const types = hoTypes(o), t = Object.assign({}, p.typeMaterial || {});
  for (const k of Object.keys(t)) if (types.includes(k.split('|')[0])) delete t[k];
  return Object.assign(t, keuze);
}
// vingerafdruk: onderdelen, materialen, instellingen, aantallen en de keuzes van de vergelijking (niet de houtkeuze van de vergeleken soorten)
function hoHash(p) {
  const o = hoState(p);
  const tm = hoTypeMat(p, o, { __ho: JSON.stringify([o.houten.slice().sort(), o.soorten.slice().sort(), o.tijd]) });
  return inputHash({ parts: p.parts, typeMaterial: tm, groupCfg: p.groupCfg, stairs: p.stairs });
}
const hoVerouderd = (p) => !!(p.houtOpties && p.houtOpties.res && p.houtOpties.res.hash !== hoHash(p));
// opslag materiaal en BTW zoals in de begroting
function hoTarief(p) {
  const B = p.begroting || {}, T = C().tarief;
  const opM = B.opslagMat !== undefined && B.opslagMat !== '' ? +B.opslagMat : +T.opslagMat || 0;
  const btw = B.btw !== undefined && B.btw !== '' ? +B.btw : +T.btw || 0;
  return { opM, btw };
}

async function hoRekenen(p) {
  const o = hoState(p);
  const houten = o.houten.filter(w => hoHoutsoorten().includes(w));
  const soorten = hoSoortenVan(p).filter(s => o.soorten.includes(s.id));
  if (houten.length < 2) { ui.msg = { text: 'Vink minstens twee houtsoorten aan.', kind: 'err' }; return render(); }
  if (!soorten.length) { ui.msg = { text: 'Vink minstens één soort onderdeel aan.', kind: 'err' }; return render(); }
  const st = Object.assign({}, S(), { timeBudget: Math.max(0.2, +o.tijd || 1) });
  const cache = new Map(), lays = {};   // lays: groeps-id → indeling (voor het zaagschema), gedeeld door de scenario's
  const totaal = houten.length + soorten.length * (houten.length - 1); let k = 0;
  N.stopFlag = false;
  const allesIn = (w) => Object.fromEntries(soorten.flatMap(s => s.types).map(t => [t, w]));
  async function reken(label, keuze) {
    const groups = N.groupsOf(p.parts, st, hoTypeMat(p, o, keuze), db.materials, p.stairs);
    const uit = { prijs: 0, planken: 0, ok: true, msg: [], lays: [] };
    for (const g of groups) {
      const sig = g.key + '#' + g.parts.map(x => x.id + ':' + x.name).sort().join(',');
      let r = cache.get(sig);
      if (!r) {
        setBusy(`Houtsoorten vergelijken – ${label}: ${g.material} ${g.thickness} mm`, k / totaal);
        try {
          const res = await N.optimizeGroup(g, db.materials, st, p.groupCfg[g.key], 'hout');
          const bs = res.chosen.sol.boards;
          r = { prijs: bs.reduce((a, b) => a + M.boardPrice(b.stock), 0), planken: bs.length, unpl: res.chosen.sol.unplaced.length, msg: res.problems.slice(0, 2), id: 'g' + cache.size };
          lays[r.id] = LY.fromResult(res, st);
        } catch (err) { r = { prijs: 0, planken: 0, unpl: g.parts.length, msg: [g.material + ' ' + g.thickness + ' mm: ' + err.message] }; }
        cache.set(sig, r);
      }
      uit.prijs += r.prijs; uit.planken += r.planken; if (r.id) uit.lays.push(r.id);
      if (r.unpl) { uit.ok = false; uit.msg.push(...(r.msg.length ? r.msg : [`${g.material} ${g.thickness} mm: ${r.unpl} onderdelen passen niet`])); }
      if (N.stopFlag) break;
    }
    k++;
    return uit;
  }
  const res = { datum: new Date().toISOString(), houten: {}, cellen: {}, soorten: soorten.map(s => s.id), houtLijst: houten, basis: null };
  for (const w of houten) { res.houten[w] = await reken('hele trap in ' + w, allesIn(w)); if (N.stopFlag) break; }
  if (!N.stopFlag) {
    const kand = houten.filter(w => res.houten[w].ok);
    res.basis = (kand.length ? kand : houten).slice().sort((a, b) => res.houten[a].prijs - res.houten[b].prijs)[0];
    for (const s of soorten) for (const w of houten) {
      if (w === res.basis || N.stopFlag) continue;
      const keuze = allesIn(res.basis); for (const t of s.types) keuze[t] = w;
      res.cellen[s.id + '|' + w] = await reken(s.label.toLowerCase() + ' in ' + w, keuze);
    }
  }
  const gestopt = N.stopFlag; N.stopFlag = false; ui.busy = null;
  if (gestopt) { ui.msg = { text: 'Vergelijken gestopt; er is niets bewaard.', kind: 'err' }; return render(); }
  res.hash = hoHash(p); res.lays = lays; ui.hoZaag = null; ui.hoPlank = null;
  // offerte-keuzes die niet meer bestaan weghalen
  o.res = res; o.offerte = o.offerte.filter(key => key.startsWith('alles|') ? !!res.houten[key.slice(6)] && key.slice(6) !== res.basis : !!res.cellen[key]);
  ui.msg = { text: `Houtsoorten vergeleken: basis = ${res.basis} (${eur(res.houten[res.basis].prijs)} inkoop).`, kind: 'ok' };
  save(); render();
}

// inkoopverschil van een optie t.o.v. de basis (null = niet berekend)
function hoDelta(res, key) {
  if (!res || !res.basis) return null;
  const [s, w] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
  const r = s === 'alles' ? res.houten[w] : res.cellen[key];
  return r ? { delta: r.prijs - res.houten[res.basis].prijs, ok: r.ok, msg: r.msg || [] } : null;
}
const hoLabel = (key) => { const i = key.indexOf('|'), s = key.slice(0, i), w = key.slice(i + 1); return s === 'alles' ? `hele trap in ${w}` : `${hoSoortLabel(s).toLowerCase()} in ${w}`; };
// meerprijsregels voor de offerte (onder het totaal)
function hoOfferteRegels(p) {
  const o = p.houtOpties; if (!o || !o.res || !o.res.basis) return [];
  const { opM, btw } = hoTarief(p);
  return o.offerte.map(key => { const d = hoDelta(o.res, key); if (!d) return null; const excl = d.delta * (1 + opM); return { key, label: 'Optie: ' + hoLabel(key), excl, incl: excl * (1 + btw), ok: d.ok }; }).filter(Boolean);
}
// soorten onderdelen die nu niet in de basis-houtsoort staan
function hoAfwijking(p) {
  const o = p.houtOpties; if (!o || !o.res || !o.res.basis) return [];
  const uit = [];
  for (const s of HO_SOORTEN.filter(s => o.res.soorten.includes(s.id))) {
    const ps = p.parts.filter(x => x.include !== false && s.types.includes(x.type));
    if (ps.some(x => hoWood(N.materialOf(x, S(), p.typeMaterial)) !== o.res.basis)) uit.push(s.label.toLowerCase());
  }
  return uit;
}
// basis-houtsoort toepassen op de vergeleken soorten onderdelen (typeMaterial), daarna de indeling opnieuw berekenen
async function hoBasisToepassen(p) {
  const o = p.houtOpties; if (!o || !o.res || !o.res.basis) return;
  const w = o.res.basis, types = HO_SOORTEN.filter(s => o.res.soorten.includes(s.id)).flatMap(s => s.types);
  p.typeMaterial = p.typeMaterial || {};
  for (const k of Object.keys(p.typeMaterial)) if (types.includes(k.split('|')[0])) delete p.typeMaterial[k];
  for (const t of types) { p.typeMaterial[t] = w; cfHoutNaarVariant(p, t, w); }   // ook in de configurator-variant
  // leuninghout in de begroting mee (prijs per meter / vaste prijzen per houtsoort)
  const lh = (C().leuningHout || []).find(h => h.toLowerCase() === w.toLowerCase());
  if (lh && p.begroting && p.begroting.leuning && types.includes('leuning')) p.begroting.leuning.hout = lh;
  save();
  const terug = ui.screen;
  if (Object.keys(p.layouts || {}).length) { await calculate([p.variant || 'hout']); ui.screen = terug; }
  ui.msg = { text: `Basis-houtsoort ${w} toegepast op ${types.map(t => P.TYPES[t].label.toLowerCase()).join(', ')}` + (Object.keys(p.layouts || {}).length ? ' en de indeling opnieuw berekend.' : '.'), kind: 'ok' };
  save(); render();
}

// ---------- kaart bij Indeling ----------
function hoCard(p) {
  const o = hoState(p), fk = 'open:houtopties';
  const head = `<div class="ml-head">${foldBtn(fk, 'Houtsoorten vergelijken')}<h3>Houtsoorten vergelijken <span class="muted small">offerte-opties</span></h3>${o.res && o.res.basis ? `<span class="muted small">basis: <b>${esc(o.res.basis)}</b> · ${eur(o.res.houten[o.res.basis].prijs)}</span>` : ''}</div>`;
  if (folded(fk)) return `<section class="card hocard">${head}</section>`;
  const houten = hoHoutsoorten(), soorten = hoSoortenVan(p);
  const keuze = `<div class="ho-keuze"><div><b class="small">Houtsoorten</b> <span class="muted small">(2–4)</span><div class="chips">${houten.map(w => `<label class="chip"><input type="checkbox" data-bind="hohout" data-v="${esc(w)}" ${o.houten.includes(w) ? 'checked' : ''}> ${esc(w)}</label>`).join('')}</div></div>
    <div><b class="small">Onderdelen die als optie mogen wisselen</b><div class="chips">${soorten.map(s => `<label class="chip"><input type="checkbox" data-bind="hosoort" data-v="${s.id}" ${o.soorten.includes(s.id) ? 'checked' : ''}> ${esc(s.label)}</label>`).join('')}</div>
    <div class="muted small">Niet aangevinkte onderdelen (bv. multiplex stootborden) houden de houtsoort van het project.</div></div>
    <div class="row wrap"><label class="small">Rekentijd per groep ${numIn('hotijd', '', o.tijd, 'w3')} s</label><button class="primary" data-act="horeken" ${ui.busy ? 'disabled' : ''}>${o.res ? 'Opnieuw doorrekenen' : 'Doorrekenen'}</button>
    <span class="muted small">Rekent op echte planken (variant minste hout); de indeling van het project blijft zoals hij is.</span></div></div>`;
  return `<section class="card hocard">${head}${keuze}${hoResultaat(p)}</section>`;
}
function hoResultaat(p) {
  const o = p.houtOpties, res = o.res; if (!res || !res.basis) return '';
  const { opM, btw } = hoTarief(p);
  const meer = (d) => { const ex = d * (1 + opM); return `<b>${ex < 0 ? '− ' : '+ '}${eur(Math.abs(ex))}</b><div class="muted small">incl. BTW ${ex < 0 ? '− ' : '+ '}${eur(Math.abs(ex * (1 + btw)))}</div>`; };
  const vink = (key) => `<label class="ho-off" title="Als meerprijsregel op de offerte"><input type="checkbox" data-bind="hooff" data-v="${esc(key)}" ${o.offerte.includes(key) ? 'checked' : ''}> op offerte</label>`;
  const fout = (r) => (r.ok ? '' : `<div class="warn small" title="${esc((r.msg || []).join('\n'))}">past niet helemaal${r.msg && r.msg.length ? ': ' + esc(r.msg[0]) : ''}</div>`);
  const ws = res.houtLijst.filter(w => res.houten[w]);
  // knop zaagschema (alleen als de indeling bewaard is; vergelijkingen van vóór deze versie hebben er geen)
  const zk = (key, r) => (r && r.lays && r.lays.length && res.lays ? `<button class="small ghost ho-zk ${ui.hoZaag === key ? 'on' : ''}" data-act="hozaag" data-v="${esc(key)}" title="Zaagschema van deze optie bekijken">Zaagschema</button>` : '');
  const top = `<table class="tbl compact ho-tbl"><thead><tr><th>Hele trap in</th><th class="num">Inkoop hout</th><th class="num">Planken</th><th class="num">Meerprijs offerte</th><th></th></tr></thead><tbody>${ws.map(w => {
    const r = res.houten[w], basis = w === res.basis;
    return `<tr class="${basis ? 'ho-basis' : ''}"><th>${esc(w)}${basis ? ' <span class="tag">basis</span>' : ''}${fout(r)}</th><td class="num">${eur(r.prijs)}</td><td class="num">${r.planken}</td><td class="num">${basis ? '<span class="muted">—</span>' : meer(r.prijs - res.houten[res.basis].prijs)}</td><td>${basis ? '' : vink('alles|' + w)} ${zk('alles|' + w, r)}</td></tr>`;
  }).join('')}</tbody></table>`;
  const anders = ws.filter(w => w !== res.basis);
  const mat = `<table class="tbl compact ho-tbl ho-mat"><thead><tr><th>Alleen dit onderdeel anders</th>${anders.map(w => `<th class="num">${esc(w)}</th>`).join('')}</tr></thead><tbody>${res.soorten.map(s => `<tr><th>${esc(hoSoortLabel(s))}</th>${anders.map(w => {
    const r = res.cellen[s + '|' + w]; if (!r) return '<td class="muted">—</td>';
    // kan duurder uitvallen dan alles in die houtsoort: onderdelen van verschillend hout delen geen planken meer
    const duur = res.houten[w] && r.prijs > res.houten[w].prijs + 0.005 ? `<div class="muted small ho-duur" title="Onderdelen in verschillende houtsoorten kunnen geen planken meer delen.">duurder dan de hele trap in ${esc(w)}</div>` : '';
    return `<td class="num">${meer(r.prijs - res.houten[res.basis].prijs)}${duur}${fout(r)}${vink(s + '|' + w)}<div>${zk(s + '|' + w, r)}</div></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  const oud = hoVerouderd(p) ? `<div class="warn stale">Deze vergelijking is verouderd: onderdelen, materialen, instellingen of de keuzes hierboven zijn gewijzigd. <button class="small" data-act="horeken">Opnieuw doorrekenen</button></div>` : '';
  return `${oud}<p class="muted small">Basis = de goedkoopste houtsoort voor de hele trap. Meerprijs = verschil in inkoop hout (incl. lijm) × (1 + opslag materiaal ${f1(opM * 100)}%), excl. BTW; de uren veranderen niet. Berekend ${new Date(res.datum).toLocaleString('nl-NL')}.</p>
    ${top}<h4 class="ho-h">Per onderdeel in een andere houtsoort <span class="muted small">(rest in ${esc(res.basis)})</span></h4>${anders.length ? mat : '<p class="muted small">Geen andere houtsoort.</p>'}
    ${hoZaagschema(p)}
    <div class="row wrap"><span class="muted small">${o.offerte.length} ${o.offerte.length === 1 ? 'optie' : 'opties'} op de offerte</span><button class="small" data-act="go" data-v="begroting">Naar de begroting →</button></div>`;
}
// zaagschema van één optie (ui.hoZaag = sleutel, ui.hoPlank = 'groepsid:index'): planken links, schema + zaagvolgorde rechts
function hoZaagschema(p) {
  const res = p.houtOpties.res, key = ui.hoZaag; if (!key || !res.lays) return '';
  const i = key.indexOf('|'), s = key.slice(0, i), w = key.slice(i + 1);
  const r = s === 'alles' ? res.houten[w] : res.cellen[key]; if (!r || !r.lays) return '';
  const st = S(), lijst = []; let n = 0;
  const groepen = r.lays.filter(id => res.lays[id]).map(id => {
    const l = res.lays[id]; if (!hydrated.has(l)) { LY.hydrate(l); hydrated.set(l, true); }
    const items = l.boards.map((b, j) => { const it = { id: id + ':' + j, l, b, nr: ++n, bs: N.boardStats(b, st) }; lijst.push(it); return it; });
    return { l, items };
  });
  if (!lijst.length) return '';
  const cur = lijst.find(x => x.id === ui.hoPlank) || lijst[0];
  const titel = s === 'alles' ? `Hele trap in ${w}` : `${hoSoortLabel(s)} in ${w}, de rest in ${res.basis}`;
  const links = groepen.map(({ l, items }) => {
    const prijs = items.reduce((a, x) => a + x.bs.price, 0);
    return `<div class="grp"><div class="grp-h"><b>${esc(l.material)} ${l.thickness} mm</b><span>${items.length} pl. · ${eur(prijs)}</span></div>
      <ul class="boards">${items.map(x => { const pct = Math.round(x.bs.fill * 100);
        return `<li class="${x === cur ? 'on' : ''}" data-act="hoplank" data-v="${esc(x.id)}"><div class="bl-top"><b>P${x.nr}</b><span>${f0(x.b.W)} × ${x.b.L}</span>${x.b.stock.panel ? '<span class="tag paneltag">paneel</span>' : ''}<span class="pct ${pct >= 70 ? 'hi' : pct >= 50 ? 'mid' : 'lo'}">${pct}%</span></div>${R.miniBoard(x.b, 220)}<div class="bl-bot"><span>${x.b.pl.length} delen</span><span>${eur(x.bs.price)}</span></div></li>`; }).join('')}
      ${l.unplaced.length ? `<li class="unpl"><span>${l.unplaced.length} niet geplaatst: ${esc(l.unplaced.map(id => l._pmap.get(id).label).slice(0, 4).join(', '))}</span></li>` : ''}</ul></div>`;
  }).join('');
  const b = cur.b, l = cur.l, plan = LY.sawPlan(b, st);
  const rechts = `<div class="bhead"><div><span class="eyebrow">${b.stock.panel ? `Verlijmd paneel P${cur.nr} · planken ${b.stock.panel.planks.map(x => x.width).join(' + ')} mm` : 'Plank P' + cur.nr}</span><h3>${f0(b.W)} × ${b.L} mm <span class="muted">${esc(l.material)} ${b.stock.grossT} → ${l.thickness} mm</span></h3></div>
      <div class="bh-stats"><div><b>${Math.round(cur.bs.fill * 100)}%</b><small>vulling</small></div><div><b>${eur(cur.bs.price)}</b><small>prijs</small></div><div><b>${b.pl.length}</b><small>delen</small></div></div></div>
    <div class="svgwrap">${R.boardSVG(b, l, { S: st, plan, stats: cur.bs, rows: 1 })}</div>
    <div class="legend small">${legendHtml(b)}</div>
    <details class="ho-cuts"><summary>Zaagvolgorde (${plan.cuts.length} stappen)</summary><ol class="cuts">${plan.cuts.map(c => `<li class="${c.kind}"><span class="cn">${c.n}</span><span class="ck">${{ lijm: 'lijmen', dwars: 'afkorten', langs: 'langs', vorm: 'vorm' }[c.kind]}</span><span>${esc(c.text)}${c.kind === 'dwars' ? ` op <b>${f0(c.x)} mm</b>` : c.kind === 'langs' ? ` op <b>${f0(c.y)} mm</b> vanaf rand A` : ''}</span></li>`).join('')}</ol></details>`;
  return `<div class="ho-zs-wrap"><div class="ho-zs-h"><h4>Zaagschema – ${esc(titel)}</h4><span class="muted small">${lijst.length} planken · ${eur(r.prijs)} inkoop · alleen ter vergelijking, de indeling van het project blijft zoals hij is</span><button class="small ghost" data-act="hozaag" data-v="" title="Zaagschema sluiten">✕ Sluiten</button></div>
    <div class="ho-zs"><div class="ho-zs-l">${links}</div><div class="ho-zs-r">${rechts}</div></div></div>`;
}
// ---------- houtsoort per onderdeel in de begroting ----------
// Zelfde keuze als bij Hout (typeMaterial), ook per kant/vlucht. Gaat ook naar de gekozen configurator-variant,
// zodat de configurator (als die aan staat) de keuze niet terugzet.
function hoHoutKaart(p) {
  if (!p.parts.length) return '';
  const fk = 'bg-hout', st = S(), tm = p.typeMaterial || {};
  const types = [...new Set(p.parts.filter(x => x.include !== false).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
  const nu = (t) => [...new Set(p.parts.filter(x => x.include !== false && x.type === t).map(x => hoWood(N.materialOf(x, st, tm))))].join(' / ');
  const head = `<div class="ml-head">${foldBtn(fk, 'Houtsoorten')}<h3>Houtsoorten</h3><span class="muted small">${esc(types.map(t => P.TYPES[t].label + ': ' + nu(t)).join(' · '))}</span></div>`;
  if (folded(fk)) return `<section class="card bhout">${head}</section>`;
  const rij = (t) => {
    const drawn = [...new Set(p.parts.filter(x => x.include !== false && x.type === t).map(x => M.canonMaterial(x.material, st.materialMap) || '(onbekend)'))].join(' / ');
    const kanten = Object.keys(tm).filter(k => k.startsWith(t + '|')).sort();
    return `<tr><th><span class="tdot t-${t}"></span>${P.TYPES[t].label}</th><td><select data-bind="typemat" data-v="${t}"><option value="">volgens tekening (${esc(drawn)})</option>${houtMatOpts(tm[t] || '')}</select></td></tr>`
      + kanten.map(k => `<tr class="bhout-kant"><th><span class="muted small">${esc(P.TYPES[t].label)} ${esc(k.split('|').slice(1).join(' vlucht '))}</span></th><td><select data-bind="typematk" data-v="${esc(k)}">${houtMatOpts(tm[k])}</select>
        <button class="ghost small" data-act="typematkdel" data-v="${esc(k)}" title="Zelfde houtsoort als de andere ${esc(P.TYPES[t].label.toLowerCase())}">✕</button></td></tr>`).join('');
  };
  const oud = typeof isStale === 'function' && isStale(p) ? `<div class="warn stale">Houtsoort gewijzigd: de inkoop hout in deze begroting hoort nog bij de oude indeling. <button class="small primary" data-act="bcalc">Indeling opnieuw berekenen</button></div>` : '';
  const cf = CONFIGURATOR && p.config && CF.gekozen(p) ? `<p class="muted small">${p.config.uit ? 'De configurator staat uit: deze keuzes blijven staan.' : 'Wordt ook in de configurator-variant gezet, zodat die de keuze niet terugzet.'}</p>` : '';
  return `<section class="card bhout">${head}${oud}<table class="tbl compact typemat"><tbody>${types.map(rij).join('')}</tbody></table>${cf}</section>`;
}
// ---------- in de begroting ----------
function hoBegrotingKaart(p) {
  const o = p.houtOpties; if (!o || !o.res || !o.res.basis) return '';
  const afw = hoAfwijking(p), regels = hoOfferteRegels(p);
  if (!afw.length && !regels.length) return '';
  return `<section class="card hobeg"><div class="ml-head"><h3>Houtsoort-opties</h3><span class="muted small">basis ${esc(o.res.basis)}</span></div>
    ${afw.length ? `<div class="warn">De houtkeuze van het project is niet de basis-houtsoort <b>${esc(o.res.basis)}</b> (${esc(afw.join(', '))}); de totaalprijs hoort dan niet bij de meerprijzen. <button class="small primary" data-act="hobasis">Basis toepassen</button></div>` : ''}
    ${hoVerouderd(p) ? `<div class="warn stale">De vergelijking is verouderd. <button class="small" data-act="go" data-v="indeling">Naar Indeling</button></div>` : ''}
    ${regels.length ? `<table class="tbl compact"><thead><tr><th>Meerprijs (niet in het totaal)</th><th class="num">excl. BTW</th><th class="num">incl. BTW</th></tr></thead><tbody>${regels.map(r => `<tr><td>${esc(r.label)}${r.ok ? '' : ' <span class="sig bad">past niet helemaal</span>'}</td><td class="num">${hoBedrag(r.excl)}</td><td class="num">${hoBedrag(r.incl)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nog geen opties op de offerte; vink ze aan bij Indeling → Houtsoorten vergelijken.</p>'}</section>`;
}
const hoBedrag = (v) => (v < 0 ? '− ' : '+ ') + eur(Math.abs(v));
// afdrukversie: onder het totaal
function hoPrint(p) {
  const regels = hoOfferteRegels(p); if (!regels.length) return '';
  return `<table class="tbl bp-sum bp-opties"><tr class="ph"><th>Opties (meerprijs, niet in het totaal)</th><th class="num">excl. BTW</th><th class="num">incl. BTW</th></tr>${regels.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${hoBedrag(r.excl)}</td><td class="num">${hoBedrag(r.incl)}</td></tr>`).join('')}</table>`;
}

CLICK.push(function click_houtopties(a, t, v, p, e) {
  switch (a) {
    case 'horeken': hoRekenen(p); break;
    case 'hobasis': hoBasisToepassen(p); break;
    case 'hozaag': ui.hoZaag = v && ui.hoZaag !== v ? v : null; ui.hoPlank = null; render(); break;
    case 'hoplank': ui.hoPlank = v; render(); break;
    case 'typematkdel': {
      // eigen houtsoort voor deze kant/vlucht weg: volgt weer de keuze per soort (ook in de configurator-variant)
      delete (p.typeMaterial || {})[v];
      const x = p.config && CF.gekozen(p), [t, side, nr] = v.split('|'), kk = (CF.KANT.find(k => k[2] === side) || [])[0], s = x && kk && x.kanten[kk];
      if (s) { if (t === 'leuning') s.leuningHout = ''; else if (nr) { if (s.vluchten && s.vluchten[nr]) delete s.vluchten[nr].hout; } else s.hout = ''; }
      save(); render(); break;
    }
    case 'bcalc': (async () => { const terug = ui.screen; await calculate([p.variant || 'hout']); ui.screen = terug; render(); })(); break;
    default: return false;
  }
});
CHANGE.push(function change_houtopties(b, t, p, part, numv) {
  switch (b) {
    case 'hohout': { const o = hoState(p), w = t.dataset.v; o.houten = o.houten.filter(x => x !== w); if (t.checked) { if (o.houten.length >= 4) { ui.msg = { text: 'Maximaal vier houtsoorten.', kind: 'err' }; break; } o.houten.push(w); } break; }
    case 'hosoort': { const o = hoState(p), s = t.dataset.v; o.soorten = o.soorten.filter(x => x !== s); if (t.checked) o.soorten.push(s); break; }
    case 'typematk': { p.typeMaterial = p.typeMaterial || {}; p.typeMaterial[t.dataset.v] = t.value; cfKantNaarVariant(p, t.dataset.v, t.value); break; }
    case 'bcfgebruik': {
      // configurator aan/uit; weer aan = de keuzes van de gekozen variant gaan meteen door
      if (!p.config) return 'skip';
      p.config.uit = !t.checked;
      if (!p.config.uit && cfAuto(p)) ui.msg = { text: 'Configurator weer aan: de keuzes zijn doorgezet naar hout en begroting.', kind: 'ok' };
      break;
    }
    case 'hotijd': hoState(p).tijd = Math.max(0.2, numv(t.value) || 1); break;
    case 'hooff': { const o = hoState(p), k = t.dataset.v; o.offerte = o.offerte.filter(x => x !== k); if (t.checked) o.offerte.push(k); break; }
    default: return false;
  }
});
