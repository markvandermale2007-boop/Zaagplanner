// Varianten A/B/C voor de offerte: dezelfde getekende trap, andere houtsoort en/of afwerking.
// A = de keuzes van het project (Hout + afwerking in de begroting). B, C … wijken per soort onderdeel af ("zoals A" = gelijk).
// Data: p.begroting.varianten [{id, naam, hout{type: houtsoort}, afw{treden|rest|<type>: afwerking-id}, offerte}]
// Meerprijs = begroting met de keuzes van de variant − begroting A, allebei met de houtschatting (zelfde rekenwijze voor het hout),
// excl. en incl. BTW. Op de offerte als optie onder het totaal; per variant ook een eigen specificatiestaat (offerte.js specScenarios).
function bvLijst(p) { const B = p.begroting; if (!B) return []; B.varianten = B.varianten || []; return B.varianten; }
const bvVan = (p, id) => bvLijst(p).find(v => v.id === id);
// soorten onderdelen in het project (volgorde zoals overal)
const bvTypes = (p) => [...new Set(p.parts.filter(x => x.include !== false).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
// afwerkingsregels zoals de begroting ze rekent (treden en leuning / overige delen / eigen per soort)
const bvAfwKeys = (r) => r.secs.flatMap(s => s.lines).filter(l => l.key.startsWith('afw:') && l.extra && l.extra.afw).map(l => ({ k: l.key.slice(4), id: (l.extra || {}).value, lab: l.key === 'afw:treden' ? 'Treden en leuning' : l.key === 'afw:rest' ? 'Overige delen' : (P.TYPES[l.key.slice(4)] || {}).label || l.key.slice(4) }));
const bvAfwNaam = (id) => (C().afwerkingen.find(a => a.id === id) || {}).naam || '';
// kopie van het project met de keuzes van de variant (onderdelen ondiep gekopieerd: mesh gedeeld, niet gewijzigd)
function bvKopie(p, v) {
  const k = JSON.parse(JSON.stringify(Object.assign({}, p, { parts: [] })));
  k.parts = p.parts.map(x => Object.assign({}, x)); k._kopie = true; k._label = 'Variant ' + v.naam;
  const tm = k.typeMaterial = Object.assign({}, p.typeMaterial || {});
  for (const [t, w] of Object.entries(v.hout || {})) {
    if (!w) continue;
    for (const key of Object.keys(tm)) if (key === t || key.startsWith(t + '|') || (key.startsWith('s:') && key.endsWith('|' + t))) delete tm[key];   // ook keuzes per kant en per trap
    tm[t] = w;
  }
  // leuning: de begroting rekent de leuning per meter per houtsoort → die houtsoort mee
  const lw = (v.hout || {}).leuning;
  if (lw) {
    const lh = (C().leuningHout || []).find(h => h.toLowerCase() === hoWood(lw).toLowerCase());
    if (lh) { const B = k.begroting; if (B.leuning) B.leuning.hout = lh; for (const x of B.leun || []) x.hout = lh; for (const s of Object.values(B.leuningKant || {})) if (s) s.hout = lh; }
  }
  k.begroting.afw = Object.assign({}, k.begroting.afw || {});
  for (const [a, id] of Object.entries(v.afw || {})) if (id) { k.begroting.afw[a] = id; for (const o of Object.values(k.begroting.afwTrap || {})) delete o[a]; }   // de variant geldt voor alle trappen
  return k;
}
// meerprijs t.o.v. A
function bvMeer(p, v) {
  const t0 = CO.begroting(C(), p, null, houtSchatting(p)).tot, k = bvKopie(p, v), t1 = CO.begroting(C(), k, null, houtSchatting(k)).tot;
  const d = t1.excl - t0.excl; return { excl: d, incl: d * (1 + t0.btw) };
}
// korte omschrijving van wat anders is dan A, bv. "alles in Vuren; afwerking treden en leuning wit gegrond"
function bvOms(p, v) {
  const types = bvTypes(p), h = types.filter(t => (v.hout || {})[t]), d = [];
  const ws = [...new Set(h.map(t => v.hout[t]))];
  if (h.length && h.length === types.length && ws.length === 1) d.push('alles in ' + ws[0]);
  else for (const w of ws) d.push(h.filter(t => v.hout[t] === w).map(t => P.TYPES[t].label.toLowerCase()).join(', ') + ' in ' + w);
  const af = Object.entries(v.afw || {}).filter(([, id]) => id);
  const ids = [...new Set(af.map(([, id]) => id))];
  if (af.length && ids.length === 1) d.push('afwerking ' + bvAfwNaam(ids[0]).toLowerCase());
  else for (const [k, id] of af) d.push('afwerking ' + ((P.TYPES[k] || {}).label || k).toLowerCase() + ' ' + bvAfwNaam(id).toLowerCase());
  return d.join('; ') || 'gelijk aan variant A';
}
// opties voor de offerte (onder het totaal)
function bvOfferteRegels(p) {
  return bvLijst(p).filter(v => v.offerte !== false).map(v => { const m = bvMeer(p, v); return { label: `Variant ${v.naam}: ${bvOms(p, v)}`, excl: m.excl, incl: m.incl }; });
}

// ---------- kaart in de begroting ----------
function bvCard(p, r) {
  if (!p.parts.length) return '';
  const L = bvLijst(p), fk = 'bg-varianten', st = S(), tm = p.typeMaterial || {}, c = C();
  const head = `<div class="ml-head">${foldBtn(fk, 'Varianten')}<h3>Varianten voor de offerte</h3><span class="muted small">${L.length ? 'A + ' + L.map(v => v.naam).join(', ') : 'bv. A in eiken, B in vuren – met de meerprijs op de offerte'}</span>
    <button class="small" data-act="bvadd">+ Variant ${esc(bvVolgende(p))}</button></div>`;
  if (folded(fk)) return `<section class="card bvcard">${head}</section>`;
  if (!L.length) return `<section class="card bvcard">${head}<p class="muted small">A = de trap zoals begroot. Maak variant B (en C …) met een andere houtsoort en/of afwerking per onderdeel; de meerprijs t.o.v. A komt als optie op de offerte en elke variant krijgt een eigen specificatiestaat.</p></section>`;
  const types = bvTypes(p), afw = bvAfwKeys(r);
  const nu = (t) => [...new Set(p.parts.filter(x => x.include !== false && x.type === t).map(x => N.materialOf(x, st, tm)))].join(' / ');
  const houtSel = (v, t) => `<select class="small" data-bind="bvhout" data-id="${v.id}" data-t="${t}"><option value="">zoals A</option>${houtMatOpts((v.hout || {})[t] || '')}</select>`;
  const afwSel = (v, k) => `<select class="small" data-bind="bvafw" data-id="${v.id}" data-k="${k}"><option value="">zoals A</option>${opts(c.afwerkingen.map(a => [a.id, a.naam]), (v.afw || {})[k] || '')}</select>`;
  const alles = (v) => `<select class="small" data-bind="bvalles" data-id="${v.id}" title="Alle onderdelen in één houtsoort"><option value="">alles in …</option>${houtMatOpts('')}</select>`;
  const meer = L.map(v => bvMeer(p, v));
  const bedrag = (m) => `<b>${hoBedrag(m.excl)}</b><div class="muted small">incl. BTW ${hoBedrag(m.incl)}</div>`;
  return `<section class="card bvcard">${head}
    <div class="tblwrap"><table class="tbl compact bv-tbl"><thead><tr><th></th><th>A <span class="muted small">zoals begroot</span></th>${L.map(v => `<th><input class="w3 bv-naam" data-bind="bvnaam" data-id="${v.id}" value="${esc(v.naam)}" title="Naam van de variant"> <button class="ghost small" data-act="bvdel" data-v="${v.id}" title="Variant weghalen">✕</button></th>`).join('')}</tr></thead><tbody>
      <tr class="bv-kop"><th colspan="${2 + L.length}">Houtsoort</th></tr>
      <tr><th class="muted small">snel kiezen</th><td></td>${L.map(v => `<td>${alles(v)}</td>`).join('')}</tr>
      ${types.map(t => `<tr><th>${esc(P.TYPES[t].label)}</th><td class="small">${esc(nu(t))}</td>${L.map(v => `<td>${houtSel(v, t)}</td>`).join('')}</tr>`).join('')}
      <tr class="bv-kop"><th colspan="${2 + L.length}">Afwerking</th></tr>
      ${afw.map(a => `<tr><th>${esc(a.lab)}</th><td class="small">${esc(bvAfwNaam(a.id))}</td>${L.map(v => `<td>${afwSel(v, a.k)}</td>`).join('')}</tr>`).join('')}
      <tr class="bv-tot"><th>Meerprijs t.o.v. A</th><td class="muted">—</td>${meer.map(m => `<td class="num">${bedrag(m)}</td>`).join('')}</tr>
      <tr><th></th><td></td>${L.map(v => `<td><label class="small"><input type="checkbox" data-bind="bvoff" data-id="${v.id}" ${v.offerte !== false ? 'checked' : ''}> op offerte</label></td>`).join('')}</tr>
    </tbody></table></div>
    <p class="muted small">Meerprijs = de hele begroting met de keuzes van de variant min variant A (hout volgens de schatting, afwerking, leuning per meter), na opslag en korting, excl. BTW. Het totaal van de offerte blijft variant A; de varianten staan als optie onder het totaal en krijgen elk een eigen specificatiestaat.</p></section>`;
}
// volgende vrije letter: B, C, D …
function bvVolgende(p) { const nm = new Set(['A', ...bvLijst(p).map(v => v.naam)]); for (let i = 1; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!nm.has(l)) return l; } return String(bvLijst(p).length + 2); }

CLICK.push(function click_varianten(a, t, v, p) {
  if (!p || !p.begroting) return false;
  switch (a) {
    case 'bvadd': bvLijst(p).push({ id: CO.uid('bv'), naam: bvVolgende(p), hout: {}, afw: {}, offerte: true }); break;
    case 'bvdel': p.begroting.varianten = bvLijst(p).filter(x => x.id !== v); break;
    default: return false;
  }
  save(); render();
});
CHANGE.push(function change_varianten(b, t, p) {
  const v = t.dataset && t.dataset.id ? bvVan(p, t.dataset.id) : null;
  switch (b) {
    case 'bvhout': if (!v) return 'skip'; v.hout = v.hout || {}; if (t.value) v.hout[t.dataset.t] = t.value; else delete v.hout[t.dataset.t]; break;
    case 'bvalles': if (!v || !t.value) return 'skip'; v.hout = Object.fromEntries(bvTypes(p).map(x => [x, t.value])); break;
    case 'bvafw': if (!v) return 'skip'; v.afw = v.afw || {}; if (t.value) v.afw[t.dataset.k] = t.value; else delete v.afw[t.dataset.k]; break;
    case 'bvnaam': if (!v) return 'skip'; v.naam = t.value.trim() || v.naam; break;
    case 'bvoff': if (!v) return 'skip'; v.offerte = t.checked; break;
    default: return false;
  }
});
