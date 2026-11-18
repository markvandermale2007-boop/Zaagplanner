// Scherm 3 Hout: materiaal per onderdeel, groepen, instellingen
// ---------------- 3 Hout ----------------
// keuzelijst houtsoort: hele houtsoort (alle plank soorten) of één plank soort – ook gebruikt in de begroting
function houtMatOpts(cur) {
  const woods = [...new Set(db.materials.map(m => M.canonMaterial(m.material)))].sort((a, b) => a.localeCompare(b));
  return woods.map(w => `<optgroup label="${esc(w)}"><option value="${esc(w)}" ${cur === w ? 'selected' : ''}>${esc(w)} (alle plank soorten)</option>`
    + [...new Set(db.materials.filter(m => M.canonMaterial(m.material) === w && m.sub).map(m => M.fullName(m)))].sort().map(n => `<option value="${esc(n)}" ${cur === n ? 'selected' : ''}>${esc(n)}</option>`).join('') + '</optgroup>').join('');
}
function scrWood() {
  const p = proj(), st = S();
  const groups = N.groupsOf(p.parts, st, p.typeMaterial, db.materials, p.stairs);
  // houtsoort per onderdeelsoort (bv. treden in beuken, bomen en leuningen in eiken)
  // keuze: een materiaalsoort uit de materialenlijst, bv. "Rustiek eiken" of "Eiken foutvrij"
  // een hele houtsoort (alle plank soorten mogen) of één plank soort ("Rustiek eiken › Panelen 40 mm")
  const matOpts = houtMatOpts;
  const presentTypes = [...new Set(p.parts.filter(x => x.include).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
  const typeRows = presentTypes.map(t => {
    const drawn = [...new Set(p.parts.filter(x => x.include && x.type === t).map(x => M.canonMaterial(x.material, st.materialMap) || '(onbekend)'))].join(' / ');
    const cur = (p.typeMaterial || {})[t] || '';
    const th = [...new Set(p.parts.filter(x => x.include && x.type === t).map(x => x.thickness))].join(' / ');
    // keuzes per kant/vlucht (uit de configurator) gaan voor de keuze per soort: laten zien
    const perKant = Object.entries(p.typeMaterial || {}).filter(([k]) => k.startsWith(t + '|'));
    return `<tr><th><span class="tdot t-${t}"></span>${P.TYPES[t].label}</th><td class="muted">${th} mm</td><td><select data-bind="typemat" data-v="${t}">
      <option value="">volgens tekening (${esc(drawn)})</option>${matOpts(cur)}</select>${perKant.length ? `<div class="small hout-perkant">Per kant: ${perKant.map(([k, w]) => `<b>${esc(k.split('|').slice(1).join(' vlucht '))}</b> ${esc(w)}`).join(' · ')} <span class="muted">(gaat voor; een keuze hier vervangt dit)</span></div>` : ''}</td></tr>`;
  }).join('');
  const cards = groups.map(g => {
    const cfg = p.groupCfg[g.key] || {};
    const all = N.stocksFor(g, db.materials, null);
    const allowed = cfg.allowed || null;
    const types = [...new Set(g.parts.map(x => P.TYPES[x.type].label.toLowerCase()))].join(', ');
    const hasTread = g.parts.some(x => x.type === 'trede');
    // controles per onderdeelsoort: alleen maten die voor die soort bedoeld zijn tellen mee
    const warns = [];
    for (const t of [...new Set(g.parts.map(x => x.type))]) {
      const ok = all.filter(m => M.allows(m, t)); const lab = P.TYPES[t].label.toLowerCase();
      if (all.length && !ok.length) { warns.push(`Geen maat geschikt voor ${lab}.`); continue; }
      const longest = Math.max(0, ...ok.map(m => m.length)), widest = Math.max(0, ...ok.map(m => m.width));
      const tl = g.parts.filter(x => x.type === t && x.L + 2 * st.overLen > longest - 2 * st.endTrim);
      const tw = t === 'trede' ? [] : g.parts.filter(x => x.type === t && x.W + 2 * st.overWidth > widest);
      if (ok.length && tl.length) warns.push(`Langer dan de langste maat voor ${lab} (${f0(longest)} mm): ${tl.map(x => esc(x.name) + ' ' + f0(x.L) + ' mm').join(', ')}. Voeg een langere maat toe of koop dit onderdeel apart.`);
      if (ok.length && tw.length) warns.push(`Breder dan de breedste plank voor ${lab} (${f0(widest)} mm): ${tw.map(x => esc(x.name) + ' ' + f0(x.W) + ' mm').join(', ')}.`);
    }
    const rowsBy = new Map();
    for (const m of all) { const k = M.fullName(m) + '|' + m.width; if (!rowsBy.has(k)) rowsBy.set(k, { w: m.width, t: m.sub || '', list: [] }); rowsBy.get(k).list.push(m); }
    const rowList = [...rowsBy.values()].sort((a, b) => a.t.localeCompare(b.t) || a.w - b.w);
    const typeDots = [...new Set(g.parts.map(x => x.type))].map(t => `<span class="tag"><span class="tdot t-${t}"></span>${P.TYPES[t].label} · ${g.parts.filter(x => x.type === t).length}</span>`).join('');
    const hk = 'hout-' + g.key;
    return `<section class="card gcard"><div class="thd">${foldBtn(hk, 'toegestane maten')}<h3>${esc(g.material)} <span class="thick">${g.thickness} mm</span></h3><div class="tags">${typeDots}</div></div>
      ${!all.length ? `<div class="warn">Geen passende maten in de materialenlijst (materiaal "${esc(g.material)}", netto ${g.thickness} mm). Voeg ze toe bij Materialenlijst, kies hierboven een andere houtsoort of pas de koppeltabel aan.</div>` : ''}
      ${warns.map(w => `<div class="warn">${w}</div>`).join('')}
      ${[...new Map(g.parts.filter(x => x.spilLayer).map(x => [x.id, x])).values()].map(x => `<div class="note small">${esc(x.dispName.replace(/ laag \d+\/\d+$/, ''))} (${f0(x.spilLayer.of)} × ${f0(x.W - st.spil.allowance)} mm): verlijmd uit <b>${x.spilLayer.k} lagen van ${f0(x.spilLayer.t)} mm</b> (${f0(x.spilLayer.k * x.spilLayer.t)} mm, daarna op maat geschaafd). Instelling bij Rekenen → Spillen maken.</div>`).join('')}
      ${hasTread ? `<div class="row wrap"><label>Treden maken <select data-bind="gmode" data-v="${esc(g.key)}">${[['auto', 'automatisch: uit één plank als het past, anders in stroken'], ['zuinig', 'zuinig: brede plank of verlijmd paneel, wat het minste hout kost'], ['breed', 'alleen uit één brede plank'], ['verlijmd', 'verlijmd paneel: eerst planken in de breedte naast elkaar gelijmd'], ['lamellen', 'altijd in stroken (lamellen), daarna verlijmd']].map(([k, t]) => `<option value="${k}" ${(cfg.treadMode || st.treadMode) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <span class="muted small">Past een trede (of bordes, stootbord …) niet uit één plank, dan zaagt de app hem in stroken: zo breed mogelijk plus één reststrook, elk los op de zaaglijst (bv. "lamel 1/3 (neus)"). Een verlijmd paneel alleen als u dat hier kiest.</span></div>` : ''}
      ${folded(hk) ? `<div class="muted small">${all.filter(m => !allowed || allowed.includes(m.id)).length} van ${all.length} maten toegestaan</div>` : `<div class="muted small">Toegestane maten (de app kiest zelf welke lengtes en breedtes samen het goedkoopst zijn):</div>
      <table class="tbl compact"><tbody>${rowList.map(r => `<tr><th>${r.w} mm<div class="muted small" style="font-weight:400">${esc(r.t)}</div></th><td>${r.list.sort((a, b) => a.length - b.length).map(m =>
        `<label class="chip"><input type="checkbox" data-bind="allow" data-g="${esc(g.key)}" data-id="${m.id}" ${!allowed || allowed.includes(m.id) ? 'checked' : ''}> <b>${m.length}</b>${m.stock ? ' <em>voorraad</em>' : ''} <span class="muted">${eur(M.boardPrice(m))}</span></label>`).join('')}</td></tr>`).join('')}</tbody></table>`}</section>`;
  }).join('');
  const k = st.kerf;
  const KLAB = { trede: 'Treden', lamel: 'Lamellen', stootbord: 'Stootborden', trapboom: 'Trapbomen', keepboom: 'Keepbomen', leuning: 'Leuningen', spil: 'Spillen', baluster: 'Balusters', bordes: 'Bordes', overig: 'Overig' };
  const num = (path, v, w = 'w4') => `<input class="${w} num" data-bind="set" data-path="${path}" value="${v}">`;
  return pageHead('Hout', 'Kies de houtsoort per onderdeelsoort en welke maten uit de materialenlijst mogen. De app kiest zelf welke lengtes en breedtes samen het goedkoopst zijn.',
      `<button class="primary" data-act="calc">Indeling berekenen →</button>`) + `
    <section class="card"><h3>Materiaal per onderdeelsoort</h3>
      <p class="muted small">Kies per onderdeel uit welke houtsoort het gemaakt wordt, of uit één plank soort daarvan (bv. treden uit "Rustiek eiken › Panelen 40 mm", trapbomen uit "Rustiek eiken"). Onderdelen met hetzelfde hout en dezelfde dikte worden samen ingedeeld en kunnen planken delen; de app kiest zelf de voordeligste lengtes.</p>
      <table class="tbl compact typemat"><tbody>${typeRows}</tbody></table></section>
    <h2 class="sect">Groepen <span class="muted small">hout + dikte · vink maten uit die je voor dit project niet wilt gebruiken</span></h2>
    ${cards || '<p class="muted">Geen onderdelen.</p>'}
    <section class="card"><h3>Instellingen <span class="muted small">bewaard als profiel voor elk project</span></h3>
    <div class="grid2">
      <fieldset><legend>Zaagsnede per onderdeeltype (mm)</legend>${Object.keys(k).map(t => `<label>${KLAB[t] || t} ${num('kerf.' + t, k[t])}</label>`).join('')}
        <p class="muted small">Tussen twee verschillende onderdelen telt de grootste.</p></fieldset>
      <fieldset><legend>Overmaat en marges (mm)</legend>
        <label>Lengte per kopse kant ${num('overLen', st.overLen)}</label><label>Breedte per gezaagde kant ${num('overWidth', st.overWidth)}</label>
        <label>Kopse marge per plankeinde ${num('endTrim', st.endTrim)}</label>
        <label>Minimale restmaat ${num('minRemnant.L', st.minRemnant.L)} × ${num('minRemnant.W', st.minRemnant.W)}</label>
        <label>Restwaarde (deel van de plankprijs) ${num('remnantFactor', st.remnantFactor)}</label></fieldset>
      <fieldset><legend>Verlijmen</legend>
        <label>Eerste lijmnaad minimaal achter de neus ${num('glue.minFirstSeam', st.glue.minFirstSeam)}</label>
        <label>Breedteverlies per lijmnaad (vlakken) ${num('glue.allowance', st.glue.allowance)}</label>
        <label>Lijmkosten per naad per m¹ (€) ${num('glue.seamCost', st.glue.seamCost)}</label>
        <label>Lamelbreedte bij lamellen per trede (0 = auto) ${num('glue.lamelWidth', st.glue.lamelWidth)}</label></fieldset>
      <fieldset><legend>Rekenen</legend>
        <label><input type="checkbox" data-bind="setb" data-path="contour" ${st.contour ? 'checked' : ''}> Indelen op echte contour (anders omhullende rechthoek)</label>
        <label><input type="checkbox" data-bind="setb" data-path="mirrorAllowed" ${st.mirrorAllowed ? 'checked' : ''}> Spiegelen toegestaan (hout aan beide kanten zichtgoed)</label>
        <label><input type="checkbox" data-bind="setb" data-path="midLine.enabled" ${st.midLine && st.midLine.enabled ? 'checked' : ''}> Middenlijn: op brede planken ook treden in het midden (neus op één gezaagde rechte lijn)</label>
        <label>Middenlijn vanaf plankbreedte (mm) ${num('midLine.minWidth', st.midLine ? st.midLine.minWidth : 600)}</label>
        <label>Spillen maken <select data-bind="sets" data-path="spil.mode">${[['auto', 'automatisch: massief als er dik genoeg hout is, anders verlijmd'], ['massief', 'altijd uit massief (één dikke plank)'], ['verlijmd', 'altijd verlijmd uit lagen']].map(([k, tt]) => `<option value="${k}" ${st.spil.mode === k ? 'selected' : ''}>${tt}</option>`).join('')}</select></label>
        <label>Spil verlijmen: schaafmarge op dikte en breedte (mm) ${num('spil.allowance', st.spil.allowance)}</label>
        <label>Rekentijd per groep (s) ${num('timeBudget', st.timeBudget)}</label>
        <label>Strafpunt per extra plank in de treden (€) ${num('soft.treadBoards', st.soft.treadBoards)}</label>
        <label>Strafpunt opvolgende trede niet uit buurplank (€) ${num('soft.treadJump', st.soft.treadJump)}</label></fieldset>
    </div>
    <label class="block">Koppeltabel materiaalnamen (tekening = materialenlijst, één per regel)
      <textarea data-bind="matmap" rows="3" placeholder="2-Eiken = Eiken">${esc(Object.entries(st.materialMap || {}).map(([a, b]) => a + ' = ' + b).join('\n'))}</textarea></label>
    <button class="ghost" data-act="resetsettings">Standaardwaarden herstellen</button></section>`;
}


CLICK.push(function click_hout(a, t, v, p, e) {
  switch (a) {
    case 'resetsettings': if (confirm('Instellingen terugzetten naar standaard?')) { db.settings = M.defaultSettings(); save(); render(); } break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_hout(b, t, p, part, numv) {
  switch (b) {
    case 'gmode': (p.groupCfg[t.dataset.v] = p.groupCfg[t.dataset.v] || {}).treadMode = t.value; break;
    case 'typemat': {
      // keuze per soort: ook de keuzes per kant/vlucht (type|Links, type|Links|2) van die soort vervallen, die gingen er anders voor
      const tp = t.dataset.v; p.typeMaterial = p.typeMaterial || {};
      for (const k of Object.keys(p.typeMaterial)) if (k.startsWith(tp + '|')) delete p.typeMaterial[k];
      if (t.value) p.typeMaterial[tp] = t.value; else delete p.typeMaterial[tp];
      // en in de gekozen configurator-variant, zodat een klik in de configurator het niet terugzet
      if (t.value && cfHoutNaarVariant(p, tp, t.value)) ui.msg = { text: `${P.TYPES[tp].label}: ${t.value} – ook in de configurator-variant gezet.`, kind: 'ok' };
      break;
    }
    case 'allow': {
      const g = N.groupsOf(p.parts, S(), p.typeMaterial, db.materials, p.stairs).find(g => g.key === t.dataset.g);
      const cfg = p.groupCfg[t.dataset.g] = p.groupCfg[t.dataset.g] || {};
      const all = N.stocksFor(g, db.materials, null).map(m => m.id);
      const cur = new Set(cfg.allowed || all);
      if (t.checked) cur.add(t.dataset.id); else cur.delete(t.dataset.id);
      cfg.allowed = cur.size === all.length ? null : [...cur]; break;
    }
    case 'set': case 'setb': case 'sets': {
      const path = t.dataset.path.split('.'); let o = db.settings;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path[path.length - 1]] = b === 'setb' ? t.checked : b === 'sets' ? t.value : numv(t.value); break;
    }
    case 'matmap': { const m = {}; t.value.split(/\n/).forEach(l => { const [a, c] = l.split('='); if (a && c) m[a.trim()] = c.trim(); }); db.settings.materialMap = m; break; }
    default: return false;
  }
});
