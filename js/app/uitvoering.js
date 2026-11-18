// Scherm 3 Uitvoering: alle keuzes over hoe de trap wordt, op één plek (PLAN-mooier-en-fijner.md §3.4).
// Houtsoort en afwerking (snelkeuze → per soort → per kant → per stuk), wat uit de tekening komt (zelf te overrulen),
// leuning en balustrade, opties (speciale bewerkingen) en de varianten B, C … De begroting (Prijs) rekent er alleen nog mee.
// Gegevens: p.typeMaterial (soort, soort|kant, id:<stuk>), B.afw[soort], B.afwStuk[stuk], B.boomVormen['id:<stuk>'] (boom/leuning),
// B.verdreven[stuk] ('Recht'|'Verdreven'), B.bew[] (optie = alleen op de offerte), B.leuning/leun/bal/drager, B.varianten.
const uvBase = (id) => String(id).split('*')[0];
const uvInc = (p) => p.parts.filter(x => x.include !== false);
const uvTypes = (p) => [...new Set(uvInc(p).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
const uvKleur = (w) => { const hk = C().houtKleur || {}, k = Object.keys(hk).find(x => x.toLowerCase() === String(w).toLowerCase()); return (k && hk[k].kleur) || DW.woodColor(w, '').f; };
// tegel met foto (of kleurstaal), naam en eventueel een regel eronder
const uvTegel = (act, v, on, naam, sub, foto, kleur, extra = '') => `<button class="uv-tegel ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${!!on}" ${extra}>
  <span class="uv-staal" style="${foto ? `background-image:url('${foto}')` : `background:${kleur || 'var(--surface-2)'}`}"></span><b>${esc(naam)}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
const uvAfwNaam = (id) => (C().afwerkingen.find(a => a.id === id) || {}).naam || '';
// de afwerking per soort zoals de begroting hem rekent (regel afw:<soort>)
const uvAfwVan = (r, t) => ((r.secs.flatMap(s => s.lines).find(l => l.key === 'afw:' + t) || {}).extra || {}).value || '';
const uvHoutVan = (p, x) => N.materialOf(x, S(), p.typeMaterial || {});
// vorm (recht/gebogen) zoals gerekend: eigen keuze per stuk → tekening
const uvVormVan = (p, x) => ((p.begroting || {}).boomVormen || {})['id:' + uvBase(x.id)] || P.vorm(x) || 'Recht';
const uvVerdreven = (p, x) => { const e = ((p.begroting || {}).verdreven || {})[uvBase(x.id)]; return e ? e === 'Verdreven' : CO.isVerdreven(x); };
const uvStuks = (p) => uvInc(p).filter(x => !(x.kopie > 1));

function scrUitvoering() {
  const p = proj(), c = C();
  if (!p.parts.length) return pageHead('Uitvoering', 'Houtsoort, afwerking, leuning, balustrade en opties.') + `<section class="card empty-state"><h3>Eerst een tekening inlezen</h3><button class="primary" data-act="go" data-v="importeren">Naar Tekening</button></section>`;
  const pur = purchaseOf(p), r = CO.begroting(c, p, pur, pur ? null : houtSchatting(p));
  // met de opstelling aan (trappen, vloeren, wanden tekenen) krijgt de 3D-kaart de volle breedte
  const breed = !!(p.opstelling && p.opstelling.aan);
  // meerdere trappen: tabbladen "Hele project" + per trap (ui.uvTrap). Per trap: eigen houtsoort en afwerking (de trappen
  // in één project kunnen verschillen); de rest (leuning, opties, varianten) staat bij "Hele project".
  const sid = p.stairs.length > 1 && p.stairs.some(s => s.id === ui.uvTrap) ? ui.uvTrap : '';
  const trapBalk = p.stairs.length > 1 ? `<div class="uv-trappen no-print" role="tablist" aria-label="Trappen in dit project">
    <button class="prtab ${sid ? '' : 'on'}" role="tab" aria-selected="${!sid}" data-act="uvtrap" data-v="">Hele project</button>
    ${p.stairs.map(s => `<button class="prtab ${sid === s.id ? 'on' : ''}" role="tab" aria-selected="${sid === s.id}" data-act="uvtrap" data-v="${s.id}"><span class="scode">${stairCode(p, s.id)}</span>${esc(s.name)}${uvTrapWijkt(p, s.id) ? ' <span title="Deze trap heeft eigen keuzes">●</span>' : ''}</button>`).join('')}</div>` : '';
  return pageHead('Uitvoering', 'Waar de trap van gemaakt wordt en hoe hij eruit komt te zien. Kies bovenaan in één keer; daaronder kun je per onderdeel, per kant en per stuk afwijken. Wat uit de tekening komt staat er al en kun je zelf overrulen.') + `
    ${trapBalk}
    ${breed ? view3dCard(p, c) : ''}
    <div class="uv-grid"><div class="uv-links">
      ${sid ? uvTrapKaart(p, sid) + uvSnel(p, r, sid) + uvOnderdelen(p, r, sid) + uvStukken(p, r, sid)
        : uvKoppelKaart(p) + uvSnel(p, r, '') + uvOnderdelen(p, r, '') + uvStukken(p, r, '') + uvTekening(p, r) + uvLeuning(p, r) + uvOpties(p, r) + bvCard(p, r)}
    </div><aside class="uv-rechts">${breed ? '' : view3dCard(p, c)}${uvPrijs(p, r)}</aside></div>`;
}

// ---------- meerdere trappen: welke hoort boven welke, en eigen keuzes per trap ----------
// onderdelen van één trap ('' = hele project)
const uvIncVan = (p, sid) => uvInc(p).filter(x => !sid || x.stair === sid);
const uvTypesVan = (p, sid) => [...new Set(uvIncVan(p, sid).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order);
// heeft deze trap eigen keuzes (houtsoort of afwerking anders dan het project)?
const uvTrapWijkt = (p, sid) => Object.keys(p.typeMaterial || {}).some(k => k.startsWith('s:' + sid + '|')) || Object.keys((((p.begroting || {}).afwTrap) || {})[sid] || {}).length > 0;
// trappen die boven elkaar staan horen bij elkaar (stair.boven = de trap eronder): samen op één tekeningblad
function uvBovenOpts(p, s) {
  const boven = (id) => p.stairs.find(x => x.boven === id);          // de trap die óp trap id staat
  const keten = new Set(); for (let x = s; x; x = boven(x.id)) { if (keten.has(x.id)) break; keten.add(x.id); }   // s en alles wat erboven staat
  return [['', 'op de begane grond (los)']].concat(p.stairs.filter(x => !keten.has(x.id) && (!boven(x.id) || boven(x.id).id === s.id)).map(x => [x.id, `boven trap ${stairCode(p, x.id)} – ${x.name}`]));
}
const uvBovenSel = (p, s) => `<select data-bind="sboven" data-s="${s.id}" class="${s.boven ? 'set' : ''}" title="Staat deze trap boven een andere trap (bv. de zoldertrap boven de verdiepingstrap)? Dan komen ze samen op één tekeningblad, boven elkaar in 3D en in het aanzicht.">${opts(uvBovenOpts(p, s), s.boven || '')}</select>`;
function uvKoppelKaart(p) {
  if (p.stairs.length < 2) return '';
  return `<section class="card uv-koppel"><div class="ml-head"><h3>Trappen in dit project</h3><span class="muted small">staan trappen boven elkaar (bv. verdiepingstrap en zoldertrap)? Koppel ze: dan staan ze samen op één tekeningblad</span></div>
    <table class="tbl compact uv-tbl"><tbody>${p.stairs.map(s => `<tr><th><span class="scode">${stairCode(p, s.id)}</span> ${esc(s.name)}</th><td>${uvBovenSel(p, s)}</td>
      <td><button class="small" data-act="uvtrap" data-v="${s.id}">Houtsoort en afwerking van deze trap${uvTrapWijkt(p, s.id) ? ' ●' : ''} →</button></td></tr>`).join('')}</tbody></table></section>`;
}
function uvTrapKaart(p, sid) {
  const s = stairOf(p, sid), n = uvIncVan(p, sid).length;
  return `<section class="card uv-koppel"><div class="uv-trapinfo"><span class="scode">${stairCode(p, sid)}</span><h3>${esc(s.name)}</h3><span class="muted small">${n} onderdelen · keuzes hier gelden alleen voor deze trap</span>
    <label class="small">Staat ${uvBovenSel(p, s)}</label>
    ${uvTrapWijkt(p, sid) ? `<button class="small ghost" data-act="uvtrapreset" data-v="${sid}" title="Alle eigen keuzes van deze trap weghalen">↺ Zoals het hele project</button>` : ''}</div></section>`;
}

// ---------- snelkeuze: alles in één houtsoort / één afwerking (hele project of één trap) ----------
function uvSnel(p, r, sid) {
  const c = C(), B = p.begroting, lijst = uvIncVan(p, sid), nu = new Set(lijst.map(x => hoWood(uvHoutVan(p, x))));
  const afwNu = new Set(lijst.map(x => CO.afwVanPart(c, B, x)).filter(Boolean));
  const eenHout = nu.size === 1 ? [...nu][0] : null, eenAfw = afwNu.size === 1 ? [...afwNu][0] : null, ds = `data-s="${esc(sid || '')}"`;
  const houten = [...new Set([...hoHoutsoorten(), ...nu].map(hoWood))].filter(w => w && w !== '(onbekend)').sort((a, b) => a.localeCompare(b));
  return `<section class="card uv-snel"><div class="ml-head"><h3>Snelkeuze${sid ? ' voor deze trap' : ''}</h3><span class="muted small">één tik zet alle onderdelen${sid ? ' van deze trap' : ''}; afwijken kan hieronder</span></div>
    <div class="uv-rij"><div class="uv-lab">Houtsoort<small>${eenHout ? 'alles in ' + esc(eenHout) : esc([...nu].join(' + '))}</small></div>
      <div class="uv-tegels">${houten.map(w => uvTegel('uvhout', w, eenHout === w, w, nu.has(w) && !eenHout ? 'deels' : '', fotoVan('hout', w), uvKleur(w), ds)).join('')}</div></div>
    <div class="uv-rij"><div class="uv-lab">Afwerking<small>${eenAfw ? esc(uvAfwNaam(eenAfw)) : 'verschillend per onderdeel'}</small></div>
      <div class="uv-tegels">${c.afwerkingen.map(a => uvTegel('uvafw', a.id, eenAfw === a.id, a.naam, afwNu.has(a.id) && !eenAfw ? 'deels' : '', fotoVan('afw', a.id), DW.woodColor(eenHout || [...nu][0] || 'Eiken', a.naam).f, ds)).join('')}</div></div></section>`;
}

// ---------- per soort onderdeel (en per kant): houtsoort + afwerking ----------
function uvOnderdelen(p, r, sid) {
  const st = S(), tm = p.typeMaterial || {}, c = C(), types = uvTypesVan(p, sid), fk = 'bg-hout', B = p.begroting;
  const nu = (t) => [...new Set(uvIncVan(p, sid).filter(x => x.type === t).map(x => hoWood(uvHoutVan(p, x))))].join(' / ');
  const head = `<div class="ml-head">${foldBtn(fk, 'Per onderdeel')}<h3>Per onderdeel${sid ? ' – trap ' + stairCode(p, sid) : ''}</h3><span class="muted small">${esc(types.map(t => P.TYPES[t].label + ': ' + nu(t)).join(' · '))}</span></div>`;
  if (folded(fk)) return `<section class="card bhout">${head}</section>`;
  // één trap: per soort kiezen of hij het project volgt of een eigen houtsoort / afwerking krijgt
  if (sid) {
    const at = (B.afwTrap || {})[sid] || {};
    const rijT = (t) => { const lijst = uvIncVan(p, sid).filter(x => x.type === t), eigenH = tm['s:' + sid + '|' + t] || '', eigenA = at[t] || '';
      const alg = tm[t] ? hoWood(tm[t]) : 'volgens tekening', algA = uvAfwNaam(uvAfwVan(r, t)) || '–';
      return `<tr><th><span class="tdot t-${t}"></span>${P.TYPES[t].label} <span class="count">${lijst.length}</span></th>
        <td><select data-bind="uvtrapmat" data-s="${sid}" data-t="${t}" class="${eigenH ? 'set' : ''}"><option value="">zoals het hele project (${esc(alg)})</option>${houtMatOpts(eigenH)}</select></td>
        <td><select data-bind="uvtrapafw" data-s="${sid}" data-t="${t}" class="${eigenA ? 'set' : ''}">${opts([['', `zoals het hele project (${algA})`]].concat(c.afwerkingen.map(a => [a.id, a.naam])), eigenA)}</select></td></tr>`; };
    return `<section class="card bhout">${head}${isStale(p) ? `<div class="warn stale">Houtsoort gewijzigd: de indeling (planken en inkoop) hoort nog bij de oude keuze. <button class="small" data-act="bcalc">Indeling opnieuw berekenen</button></div>` : ''}
      <table class="tbl compact typemat uv-tbl"><thead><tr><th>Onderdeel</th><th>Houtsoort</th><th>Afwerking</th></tr></thead><tbody>${types.map(rijT).join('')}</tbody></table>
      <p class="muted small">Met de oranje rand = eigen keuze voor deze trap. De specificatiestaat en de tekening van deze trap volgen deze keuzes.</p></section>`;
  }
  // trappen die voor een soort afwijken van het project
  const wijkt = (t) => p.stairs.filter(s => tm['s:' + s.id + '|' + t] || ((B.afwTrap || {})[s.id] || {})[t]).map(s => stairCode(p, s.id));
  const nEigen = (t) => uvStuks(p).filter(x => x.type === t && (tm['id:' + uvBase(x.id)] || ((p.begroting || {}).afwStuk || {})[uvBase(x.id)])).length;
  const rij = (t) => {
    const lijst = uvInc(p).filter(x => x.type === t);
    const drawn = [...new Set(lijst.map(x => M.canonMaterial(x.material, st.materialMap) || '(onbekend)'))].join(' / ');
    const kanten = Object.keys(tm).filter(k => k.startsWith(t + '|')).sort(), afw = uvAfwVan(r, t), ne = nEigen(t);
    return `<tr><th><span class="tdot t-${t}"></span>${P.TYPES[t].label} <span class="count">${lijst.length}</span>${ne ? `<div class="uv-eigen small" title="Stukken met een eigen keuze, zie Per stuk">● ${ne} ${ne === 1 ? 'stuk wijkt' : 'stuks wijken'} af</div>` : ''}${wijkt(t).length ? `<div class="uv-eigen small" title="Deze trap heeft een eigen keuze: zie het tabblad van die trap">● trap ${wijkt(t).join(', ')} wijkt af</div>` : ''}</th>
        <td><select data-bind="typemat" data-v="${t}" class="${tm[t] ? 'set' : ''}"><option value="">volgens tekening (${esc(drawn)})</option>${houtMatOpts(tm[t] || '')}</select></td>
        <td>${afw ? `<select data-bind="bafw" data-k="${t}" class="${((p.begroting || {}).afw || {})[t] ? 'set' : ''}">${opts(c.afwerkingen.map(a => [a.id, a.naam]), afw)}</select>` : '<span class="muted small">—</span>'}</td></tr>`
      + kanten.map(k => `<tr class="bhout-kant"><th><span class="muted small">${esc(P.TYPES[t].label)} ${esc(k.split('|').slice(1).join(' vlucht '))}</span></th><td><select data-bind="typematk" data-v="${esc(k)}">${houtMatOpts(tm[k])}</select>
        <button class="ghost small" data-act="typematkdel" data-v="${esc(k)}" title="Zelfde houtsoort als de andere ${esc(P.TYPES[t].label.toLowerCase())}">✕</button></td><td></td></tr>`).join('');
  };
  // per kant afwijken: alleen voor soorten die in de tekening een kant hebben
  const metKant = types.filter(t => uvInc(p).some(x => x.type === t && x.side));
  const kantOpts = metKant.flatMap(t => [...new Set(uvInc(p).filter(x => x.type === t && x.side).map(x => x.side))].map(s => [t + '|' + s, `${P.TYPES[t].label} ${s.toLowerCase()}`])).filter(([k]) => !(k in tm));
  const oud = isStale(p) ? `<div class="warn stale">Houtsoort gewijzigd: de indeling (planken en inkoop) hoort nog bij de oude keuze. <button class="small" data-act="bcalc">Indeling opnieuw berekenen</button></div>` : '';
  const cf = CONFIGURATOR && p.config && CF.gekozen(p) ? `<p class="muted small">${p.config.uit ? 'De configurator staat uit: deze keuzes blijven staan.' : 'Wordt ook in de configurator-variant gezet, zodat die de keuze niet terugzet.'}</p>` : '';
  return `<section class="card bhout">${head}${oud}
    <table class="tbl compact typemat uv-tbl"><thead><tr><th>Onderdeel</th><th>Houtsoort</th><th>Afwerking</th></tr></thead><tbody>${types.map(rij).join('')}</tbody></table>
    ${kantOpts.length ? `<div class="row wrap small uv-kantadd"><span class="muted">Per kant afwijken:</span> <select id="uv-kant">${opts(kantOpts)}</select> <select id="uv-kanthout">${houtMatOpts('')}</select> <button class="small" data-act="uvkantadd">+ Eigen houtsoort voor deze kant</button></div>` : ''}${cf}</section>`;
}

// ---------- per stuk: elk onderdeel apart aanpasbaar ----------
function uvStukken(p, r, sid) {
  const fk = 'open:uv-stuk', B = p.begroting || {}, tm = p.typeMaterial || {}, c = C(), sel = ui.sel3d;
  const stuks = uvStuks(p).filter(x => !sid || x.stair === sid), eigen = (x) => { const b = uvBase(x.id); return !!(tm['id:' + b] || (B.afwStuk || {})[b] || (B.boomVormen || {})['id:' + b] || (B.verdreven || {})[b]); };
  const nE = stuks.filter(eigen).length, selParts = stuks.filter(x => sel.has(x.id));
  const head = `<div class="ml-head">${foldBtn(fk, 'Per stuk')}<h3>Per stuk</h3><span class="muted small">${nE ? `● ${nE} ${nE === 1 ? 'stuk heeft' : 'stuks hebben'} een eigen keuze` : 'elk onderdeel apart aanpassen: houtsoort, afwerking, recht/gebogen, recht/verdreven'}${selParts.length ? ` · ${selParts.length} geselecteerd` : ''}</span></div>`;
  if (folded(fk) && !selParts.length) return `<section class="card uv-stuk">${head}</section>`;
  // bewerken van de selectie (uit de lijst of aangeklikt in 3D)
  const gem = (f) => { const s = new Set(selParts.map(f)); return s.size === 1 ? [...s][0] : null; };
  const heeft = (ts) => selParts.some(x => ts.includes(x.type));
  const bewerk = selParts.length ? `<div class="uv-selbar"><b>${selParts.length} geselecteerd</b> <span class="muted small">${esc(selParts.slice(0, 5).map(x => x.dispName || x.name).join(', '))}${selParts.length > 5 ? ' …' : ''}</span>
      <div class="row wrap">
        <label>Houtsoort <select data-bind="uvstukhout"><option value="">zoals de soort</option>${houtMatOpts(gem(x => tm['id:' + uvBase(x.id)] || '') || '')}</select></label>
        <label>Afwerking <select data-bind="uvstukafw">${opts([['', 'zoals de soort']].concat(c.afwerkingen.map(a => [a.id, a.naam])), gem(x => (B.afwStuk || {})[uvBase(x.id)] || '') || '')}</select></label>
        ${heeft(['trapboom', 'keepboom', 'leuning']) ? `<label>Vorm <select data-bind="uvstukvorm">${opts([['', 'uit tekening'], ...CO.VORMEN.map(v => [v, v])], gem(x => (B.boomVormen || {})['id:' + uvBase(x.id)] || '') || '')}</select></label>` : ''}
        ${heeft(['trede']) ? `<label>Trede <select data-bind="uvstukverdr">${opts([['', 'uit tekening'], ['Recht', 'Recht'], ['Verdreven', 'Verdreven']], gem(x => (B.verdreven || {})[uvBase(x.id)] || '') || '')}</select></label>` : ''}
        <button class="small ghost" data-act="uvstukreset" title="Alle eigen keuzes van de selectie weghalen">↺ Terug naar de soort / tekening</button>
        <button class="small ghost" data-act="v3clear">Selectie wissen</button></div></div>`
    : '<p class="muted small">Vink stukken aan (of klik ze aan in de 3D-weergave rechts) en kies wat er anders moet. ● = eigen keuze, grijs = volgt de soort of de tekening.</p>';
  if (folded(fk)) return `<section class="card uv-stuk">${head}${bewerk}</section>`;
  const cel = (w, eigenW) => `<td class="${eigenW ? 'uv-e' : 'muted'}">${eigenW ? '● ' : ''}${esc(w)}</td>`;
  const blok = (t) => { const l = P.sortParts(stuks.filter(x => x.type === t)); if (!l.length) return '';
    const alle = l.every(x => sel.has(x.id));
    return `<tbody><tr class="uv-kop"><th colspan="6"><label><input type="checkbox" data-bind="uvselalle" data-t="${t}" ${alle ? 'checked' : ''}> ${P.TYPES[t].label} <span class="count">${l.length}</span></label></th></tr>
      ${l.map(x => { const b = uvBase(x.id), a = (B.afwStuk || {})[b], v = (B.boomVormen || {})['id:' + b], vd = (B.verdreven || {})[b];
        const vorm = ['trapboom', 'keepboom', 'leuning'].includes(t) ? uvVormVan(p, x).toLowerCase() : t === 'trede' ? (uvVerdreven(p, x) ? 'verdreven' : 'recht') : '';
        return `<tr class="${sel.has(x.id) ? 'sel' : ''}"><td><input type="checkbox" data-bind="uvsel" data-id="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''} aria-label="${esc(x.dispName || x.name)} selecteren"></td>
          <td>${esc(x.dispName || x.name)}</td><td class="muted small num">${f0(x.L)} × ${f0(x.W)}</td>
          ${cel(hoWood(uvHoutVan(p, x)), !!tm['id:' + b])}${cel(uvAfwNaam(CO.afwVanPart(c, B, x)), !!a)}${cel(vorm, !!(v || vd))}</tr>`; }).join('')}</tbody>`; };
  return `<section class="card uv-stuk">${head}${bewerk}
    <div class="tblwrap uv-stukwrap"><table class="tbl compact uv-stuktbl"><thead><tr><th></th><th>Stuk</th><th class="num">Maat</th><th>Houtsoort</th><th>Afwerking</th><th>Vorm</th></tr></thead>${uvTypes(p).map(blok).join('')}</table></div></section>`;
}

// ---------- uit de tekening (zelf te overrulen): type trap, vorm van de bomen ----------
function uvTekening(p, r) {
  const B = p.begroting, regels = r.secs.flatMap(s => s.lines).filter(l => l.extra && l.extra.field);
  if (!regels.length) return '';
  const fk = 'uv-tek';
  const head = `<div class="ml-head">${foldBtn(fk, 'Uit de tekening')}<h3>Uit de tekening</h3><span class="muted small">de app leest dit uit de tekening; kies zelf iets anders als het niet klopt</span></div>`;
  if (folded(fk)) return `<section class="card uv-tek">${head}</section>`;
  const rij = (L) => { const x = L.extra, eigen = x.field === 'type' ? !!(B.stairs[x.stair] || {}).typeHand : x.value !== 'auto';
    return `<tr><th>${esc(L.label)}<div class="muted small">${f2(L.qty)} ${esc(L.unit)}${L.note ? ' · ' + esc(L.note) : ''}</div></th>
      <td><select class="${eigen ? 'set' : ''}" data-bind="bstair" data-s="${esc(x.stair)}" data-f="${x.field}" title="${x.field === 'type' ? 'Type trap (bepaalt de norm per tred)' : 'Vorm voor alle bomen van deze soort'}">${opts(x.options, x.value)}</select>
      ${x.bomen && x.bomen.length > 1 ? `<div class="row wrap small bvorm">${x.bomen.map(b => `<label>${esc(b.lab)} <select class="small${b.eigen ? ' set' : ''}" data-bind="bboomvorm" data-id="${esc(b.id)}" title="Vorm van deze boom">${opts([['', 'volgt (' + b.vorm.toLowerCase() + ')'], ...CO.VORMEN.map(v => [v, v])], b.eigen)}</select></label>`).join('')}</div>` : ''}</td></tr>`; };
  const tr = uvStuks(p).filter(x => x.type === 'trede'), nV = tr.filter(x => uvVerdreven(p, x)).length;
  return `<section class="card uv-tek">${head}<table class="tbl compact uv-tbl"><tbody>${regels.map(rij).join('')}
    ${r.secs.flatMap(s => s.lines).filter(l => l.extra && l.extra.spillen && l.extra.spillen.length).map(L => `<tr><th>${esc(L.label)}<div class="muted small">aantal treden dat op elke spil aansluit; leeg = uit de tekening</div></th>
      <td><div class="row wrap small bvorm">${L.extra.spillen.map(s => `<label>${esc(s.lab)} <input class="w3 num ${s.eigen !== undefined && s.eigen !== null && s.eigen !== '' ? 'set' : ''}" data-bind="uvspiltr" data-id="${esc(s.id)}" value="${s.eigen !== undefined && s.eigen !== null ? s.eigen : ''}" placeholder="${s.auto === null ? 'alle' : s.auto}"> treden</label>`).join('')}</div></td></tr>`).join('')}
    ${tr.length ? `<tr><th>Treden recht / verdreven<div class="muted small">per trede aan te passen bij Per stuk</div></th><td>${tr.length - nV} recht · ${nV} verdreven</td></tr>` : ''}</tbody></table></section>`;
}

// ---------- leuning, dragers en balustrade ----------
function uvLeuning(p, r) {
  const c = C(), B = p.begroting, lines = r.secs.flatMap(s => s.lines), fk = 'uv-leun';
  const leun = lines.filter(l => l.extra && l.extra.leuning), bal = lines.filter(l => l.extra && l.extra.bal);
  const head = `<div class="ml-head">${foldBtn(fk, 'Leuning en balustrade')}<h3>Leuning en balustrade</h3><span class="muted small">${esc([leun.filter(l => l.qty > 0).length ? `${f1(leun.reduce((a, l) => a + l.qty, 0))} m leuning` : '', bal.length ? `${f1(bal.reduce((a, l) => a + l.qty, 0))} m balustrade` : ''].filter(Boolean).join(' · ') || 'nog geen leuning of balustrade')}</span></div>`;
  if (folded(fk)) return `<section class="card uv-leun">${head}</section>`;
  const leunRij = (L) => { const l = L.extra.leuning, x = L.extra.extraLeun, id = x ? x.id : '';
    return `<tr><th>${esc(L.label)}<div class="muted small">${x ? '' : f2(L.qty) + ' m uit de tekening'}</div></th>
      <td>${L.extra.leuning && (x || L.key === 'leuning') ? `<select data-bind="bleun" data-id="${id}" data-f="profiel">${opts(c.profielen, l.profiel)}</select> ${x
          ? `<select data-bind="bleun" data-id="${id}" data-f="vorm">${opts(CO.VORMEN, l.vorm)}</select>`
          // getekende leuning: recht/gebogen per stuk uit de tekening, of één vorm voor alles (per stuk afwijken: Per stuk)
          : `<select data-bind="uvleunvorm" class="${B.leuning.auto ? '' : 'set'}" title="Recht of gebogen: per leuningstuk uit de tekening, of zelf kiezen voor alle leuningen">${opts([['auto', 'vorm uit tekening'], ...CO.VORMEN.map(v => [v, v])], B.leuning.auto ? 'auto' : B.leuning.vorm)}</select>`}
          <select data-bind="bleun" data-id="${id}" data-f="hout" title="Houtsoort (prijs per meter)">${opts(c.leuningHout, l.hout)}</select>` : `<span class="muted small">${esc(l.profiel)} · ${esc(l.vorm)} · ${esc(l.hout || '')}</span>`}
      ${x ? ` <input class="w4 num" data-bind="bleun" data-id="${id}" data-f="m" value="${String(x.m || '').replace('.', ',')}"> m <label class="small" title="Geen ophangen bij montage voor deze leuning"><input type="checkbox" data-bind="uvleunzelf" data-id="${id}" ${x.zelf ? 'checked' : ''}> klant hangt zelf op</label> <button class="ghost small" data-act="bleundel" data-v="${id}" title="Weghalen">✕</button>` : ''}</td></tr>`; };
  const balRij = (L) => { const b = L.extra.bal, g = L.extra.cfg, id = b.id;
    return `<tr><th>${esc(L.label)}</th><td><div class="row wrap small balline"><label>Spijl <select data-bind="bbal" data-id="${id}" data-f="spijl">${opts(c.spijltypes.map(s => [s.id, s.naam]), g.spijl)}</select></label>
      <label>tussenruimte <input class="w3 num" data-bind="bbal" data-id="${id}" data-f="tussen" value="${g.tussen}"> mm</label>
      <label><input type="checkbox" data-bind="bbal" data-id="${id}" data-f="onderslof" ${g.onderslof ? 'checked' : ''}> onderslof</label>
      <select data-bind="bbal" data-id="${id}" data-f="plaats">${opts([['boom', 'op de boom'], ['verdieping', 'op de verdieping']], b.plaats || 'boom')}</select>
      <input class="w4 num" data-bind="bbal" data-id="${id}" data-f="m" value="${String(b.m || '').replace('.', ',')}"> m <label title="Geen plaatsen bij montage voor deze balustrade"><input type="checkbox" data-bind="uvbalzelf" data-id="${id}" ${b.zelf ? 'checked' : ''}> klant plaatst zelf</label> <button class="ghost small" data-act="bbaldel" data-v="${id}" title="Weghalen">✕</button></div></td></tr>`; };
  const dr = B.drager && c.dragers.find(d => d.id === B.drager.id);
  // spijltype: geldt voor de getekende spijltjes en voor alle balustrades (per balustrade kan het hieronder nog anders)
  const stdSp = CO.balStdVan(c).spijl, gekozen = c.spijltypes.some(s => s.id === B.spijl) ? B.spijl : stdSp, nTek = uvInc(p).filter(x => x.type === 'baluster').length;
  const spijlRij = c.spijltypes.length ? `<div class="uv-rij uv-spijl"><div class="uv-lab">Spijltje<small>${nTek ? nTek + ' getekend' : 'in de balustrade'}</small></div>
    <div class="uv-tegels">${c.spijltypes.map(s => `<button class="uv-tegel ${gekozen === s.id ? 'on' : ''}" data-act="uvspijl" data-v="${s.id}" aria-pressed="${gekozen === s.id}" title="${esc(s.naam)}"><span class="uv-staal">${DW.spijl(s, 'thumb')}</span><b>${esc(s.naam)}</b><small>${s.id === stdSp ? 'standaard' : +s.meer > 0 ? '+ ' + eur(s.meer) + ' per stuk' : ''}</small></button>`).join('')}</div></div>` : '';
  return `<section class="card uv-leun">${head}${spijlRij}
    <table class="tbl compact uv-tbl"><tbody>${leun.map(leunRij).join('')}
      <tr><th>Leuningdragers<div class="muted small">alleen bij een muurleuning</div></th><td><select data-bind="uvdrager">${opts([['', 'standaard (muurleuninghouder uit het beslag)']].concat(c.dragers.map(d => [d.id, `${d.naam} (${eur(d.prijs)})`])), dr ? dr.id : '')}</select></td></tr>
      ${bal.map(balRij).join('')}
      <tr><th>Montage door de klant<div class="muted small">de prijzen per meter zijn exclusief ophangen en plaatsen</div></th><td><label class="small"><input type="checkbox" data-bind="uvzelf" data-k="leuning" ${(B.zelf || {}).leuning ? 'checked' : ''}> klant hangt alle leuningen zelf op</label><br>
        <label class="small"><input type="checkbox" data-bind="uvzelf" data-k="balustrade" ${(B.zelf || {}).balustrade ? 'checked' : ''}> klant plaatst alle balustrades zelf</label></td></tr></tbody></table>
    <div class="uv-add"><b class="small">Leuning toevoegen</b> <select id="bl-prof">${opts(c.profielen, B.leuning.profiel)}</select> <select id="bl-vorm">${opts(CO.VORMEN)}</select> <select id="bl-hout">${opts(c.leuningHout, B.leuning.hout)}</select>
      <input class="w4 num" id="bl-m" placeholder="meter"> m <button class="small" data-act="bleunadd">+ Leuning</button> <span class="muted small">bv. een muurleuning die niet getekend is</span></div>
    <div class="uv-add"><b class="small">Balustrade toevoegen</b> <select id="bb-type">${opts([['', 'Eigen samenstelling (spijl daarna kiezen)']].concat(c.balustrades.map(b => [b.id, `${b.naam} – ${eur(b.vast > 0 ? b.vast : CO.balustradePerM(c, b).kost)}/m${b.vast > 0 ? ' (vast)' : ''}`])), (c.balustrades[0] || {}).id)}</select>
      <input class="w4 num" id="bb-m" placeholder="meter"> m <select id="bb-pl">${opts([['boom', 'op de boom'], ['verdieping', 'op de verdieping']])}</select> <button class="small" data-act="bbaladd">+ Balustrade</button></div></section>`;
}

// ---------- opties: speciale bewerkingen als tegels (aan/uit), met aantal en "alleen als optie op de offerte" ----------
function uvOpties(p, r) {
  const c = C(), B = p.begroting, fk = 'uv-opt', aan = B.bew || [];
  const head = `<div class="ml-head">${foldBtn(fk, 'Opties')}<h3>Opties</h3><span class="muted small">${aan.length ? esc([...new Set(aan.map(bw => (c.bewerkingen.find(b => b.id === bw.id) || {}).naam).filter(Boolean))].join(' · ')) : 'speciale bewerkingen en extra\'s: tik aan wat erbij komt'}</span></div>`;
  if (folded(fk)) return `<section class="card uv-opt">${head}</section>`;
  const g = new Map(); for (const b of c.bewerkingen) { const k = b.onderdeel || 'Overig'; if (!g.has(k)) g.set(k, []); g.get(k).push(b); }
  const tegels = [...g.entries()].map(([k, l]) => `<div class="uv-rij"><div class="uv-lab">${esc(k)}</div><div class="uv-tegels klein">${l.map(b => { const on = aan.some(x => x.id === b.id);
    return `<button class="uv-tegel opt ${on ? 'on' : ''}" data-act="uvbew" data-v="${b.id}" aria-pressed="${on}" title="${esc(b.naam)} – ${on ? 'weghalen' : 'toevoegen (aantal uit de tekening)'}"><span class="uv-staal">${DW.forBew(b)}</span><b>${esc(b.naam)}</b><small>${eur(bewPrijs(b))} ${esc(b.eenheid)}</small></button>`; }).join('')}</div></div>`).join('');
  const lijst = aan.map(bw => { const b = c.bewerkingen.find(x => x.id === bw.id); if (!b) return '';
    return `<tr><th>${esc(b.naam)}${bw.parts && bw.parts.length ? `<div class="muted small">op ${bw.parts.length} ${bw.parts.length === 1 ? 'onderdeel' : 'onderdelen'}</div>` : ''}</th>
      <td><input class="w4 num" data-bind="bbew" data-k="${bw.key}" value="${String(bw.n || '').replace('.', ',')}"> <span class="muted small">${esc(b.eenheid.replace(/^per /, ''))}</span></td>
      <td><label class="small" title="Niet in het totaal: als meerprijs onder het totaal op de offerte"><input type="checkbox" data-bind="uvbewoptie" data-k="${bw.key}" ${bw.optie ? 'checked' : ''}> alleen als optie op de offerte</label></td>
      <td class="num">${eur((+bw.n || 0) * bewPrijs(b))}</td><td><button class="ghost small" data-act="bbewdel" data-v="${bw.key}" title="Weghalen">✕</button></td></tr>`; }).join('');
  return `<section class="card uv-opt">${head}${tegels}
    ${lijst ? `<table class="tbl compact uv-tbl uv-optlijst"><thead><tr><th>Gekozen</th><th>Aantal</th><th></th><th class="num">Prijs</th><th></th></tr></thead><tbody>${lijst}</tbody></table>` : ''}
    <div class="uv-add"><b class="small">Met een eigen aantal toevoegen</b> <select id="bw-sel" data-bind="bwpick">${[...g.entries()].map(([k, l]) => `<optgroup label="${esc(k)}">${l.map(b => `<option value="${b.id}" ${ui.bwPick === b.id ? 'selected' : ''}>${esc(b.naam)} – ${eur(bewPrijs(b))} ${esc(b.eenheid)}${b.vast > 0 ? ' (vast)' : ''}</option>`).join('')}</optgroup>`).join('')}</select>
      <input class="w4 num" id="bw-n" placeholder="aantal" title="Leeg = automatisch (bv. aantal treden bij 'per tred')"> <button class="small" data-act="bbewadd">+ Bewerking</button></div></section>`;
}

// ---------- rechts: wat het nu kost (de opbouw staat bij Prijs) ----------
function uvPrijs(p, r) {
  const t = r.tot, vs = bvLijst(p);
  return `<section class="card uv-prijs"><div class="ml-head"><h3>Prijs met deze keuzes</h3></div>
    <div class="uv-bedrag"><b>${eur(t.excl)}</b><span class="muted small">excl. BTW · incl. ${eur(t.incl)}</span></div>
    ${r.geschat ? '<div class="muted small">Hout geschat (nog geen indeling berekend).</div>' : ''}
    ${(r.opties || []).length ? `<table class="tbl compact">${r.opties.map(o => `<tr><td class="small">Optie: ${esc(o.label)}</td><td class="num small">${hoBedrag(o.excl)}</td></tr>`).join('')}</table>` : ''}
    ${vs.length ? `<table class="tbl compact">${vs.map(v => `<tr><td class="small">Variant ${esc(v.naam)}</td><td class="num small">${hoBedrag(bvMeer(p, v).excl)}</td></tr>`).join('')}</table>` : ''}
    <button class="small" data-act="go" data-v="begroting">Naar de prijsopbouw →</button></section>`;
}

CLICK.push(function click_uitvoering(a, t, v, p) {
  if (!p) return false; const B = p.begroting = p.begroting || {};
  switch (a) {
    // alles in één houtsoort: keuzes per soort, per kant en per stuk worden vervangen; de leuning (prijs per meter) gaat mee
    case 'uvtrap': ui.uvTrap = v || ''; ui.sel3d = new Set(); render(); window.scrollTo(0, 0); return;
    // eigen keuzes van één trap weghalen: volgt weer het hele project
    case 'uvtrapreset': { const tm = p.typeMaterial || {}; for (const k of Object.keys(tm)) if (k.startsWith('s:' + v + '|')) delete tm[k]; if (B.afwTrap) delete B.afwTrap[v]; break; }
    // spijltype voor de getekende spijltjes en alle balustrades
    case 'uvspijl': { B.spijl = v; for (const bl of B.bal || []) { if (bl.spijl === undefined) Object.assign(bl, CO.balRegel(C(), bl).cfg); bl.spijl = v; } break; }
    case 'uvhout': if (t.dataset.s) {
      // alleen deze trap: eigen houtsoort per soort (sleutel s:<trap>|<soort>); keuzes per stuk van deze trap vervallen
      const sid = t.dataset.s, tm = p.typeMaterial = p.typeMaterial || {};
      for (const x of uvIncVan(p, sid)) delete tm['id:' + uvBase(x.id)];
      for (const ty of uvTypesVan(p, sid)) tm['s:' + sid + '|' + ty] = v;
      ui.msg = { text: `Trap ${stairCode(p, sid)}: alles in ${v}.`, kind: 'ok' }; break;
    } else {
      const oud = Object.keys(p.typeMaterial || {}).filter(k => k.includes('|') || k.startsWith('id:')).length;
      p.typeMaterial = Object.fromEntries(uvTypes(p).map(x => [x, v]));
      const lh = (C().leuningHout || []).find(h => h.toLowerCase() === hoWood(v).toLowerCase());
      if (lh) { if (B.leuning) B.leuning.hout = lh; for (const x of B.leun || []) x.hout = lh; for (const s of Object.values(B.leuningKant || {})) if (s) s.hout = lh; }
      for (const x of uvTypes(p)) cfHoutNaarVariant(p, x, v);
      ui.msg = { text: `Alles in ${v}${oud ? ` (${oud} eigen ${oud === 1 ? 'keuze' : 'keuzes'} per kant of per stuk vervangen)` : ''}.`, kind: 'ok' }; break;
    }
    case 'uvafw': if (t.dataset.s) {
      const sid = t.dataset.s; (B.afwTrap = B.afwTrap || {})[sid] = Object.fromEntries(uvTypesVan(p, sid).map(x => [x, v]));
      for (const x of uvIncVan(p, sid)) if (B.afwStuk) delete B.afwStuk[uvBase(x.id)];
      ui.msg = { text: `Trap ${stairCode(p, sid)}: alles ${uvAfwNaam(v).toLowerCase()}.`, kind: 'ok' }; break;
    } else { const n = Object.keys(B.afwStuk || {}).length + Object.keys(B.afwTrap || {}).length; B.afw = Object.assign({ treden: v, rest: v }, Object.fromEntries(uvTypes(p).map(x => [x, v]))); B.afwStuk = {}; B.afwTrap = {};
      ui.msg = { text: `Alles ${uvAfwNaam(v).toLowerCase()}${n ? ` (${n} eigen ${n === 1 ? 'keuze' : 'keuzes'} per stuk vervangen)` : ''}.`, kind: 'ok' }; break; }
    case 'uvkantadd': { const k = (document.getElementById('uv-kant') || {}).value, w = (document.getElementById('uv-kanthout') || {}).value; if (!k || !w) return;
      (p.typeMaterial = p.typeMaterial || {})[k] = w; cfKantNaarVariant(p, k, w); break; }
    // optie-tegel: aan = toevoegen met het aantal uit de tekening, uit = weghalen
    case 'uvbew': { B.bew = B.bew || []; const b = C().bewerkingen.find(x => x.id === v); if (!b) return;
      if (B.bew.some(x => x.id === v)) B.bew = B.bew.filter(x => x.id !== v); else B.bew.push({ key: CO.uid('k'), id: v, n: ZP.config.autoAantal(p, b) || 1 });
      break; }
    case 'uvstukreset': { const tm = p.typeMaterial || {};
      for (const x of p.parts.filter(y => ui.sel3d.has(y.id))) { const b = uvBase(x.id); delete tm['id:' + b]; if (B.afwStuk) delete B.afwStuk[b]; if (B.boomVormen) delete B.boomVormen['id:' + b]; if (B.verdreven) delete B.verdreven[b]; }
      break; }
    default: return false;
  }
  save(); render();
});
CHANGE.push(function change_uitvoering(b, t, p) {
  if (!p) return false; const B = p.begroting = p.begroting || {}, sel = p.parts.filter(x => ui.sel3d.has(x.id));
  const zet = (o, sleutel, w) => { for (const x of sel) { const k = sleutel(x); if (w) o[k] = w; else delete o[k]; } };
  switch (b) {
    case 'uvsel': { const id = t.dataset.id; if (t.checked) ui.sel3d.add(id); else ui.sel3d.delete(id); render(); return 'skip'; }
    case 'uvselalle': { for (const x of uvStuks(p).filter(y => y.type === t.dataset.t)) { if (t.checked) ui.sel3d.add(x.id); else ui.sel3d.delete(x.id); } render(); return 'skip'; }
    // houtsoort / afwerking van één soort onderdeel voor één trap (leeg = zoals het hele project)
    case 'uvtrapmat': { const tm = p.typeMaterial = p.typeMaterial || {}, k = 's:' + t.dataset.s + '|' + t.dataset.t; if (t.value) tm[k] = t.value; else delete tm[k]; break; }
    case 'uvtrapafw': { const a = (B.afwTrap = B.afwTrap || {}), o = a[t.dataset.s] = a[t.dataset.s] || {}; if (t.value) o[t.dataset.t] = t.value; else delete o[t.dataset.t]; if (!Object.keys(o).length) delete a[t.dataset.s]; break; }
    // trap staat boven een andere trap (samen op één tekeningblad); '' = los
    case 'sboven': { const s = stairOf(p, t.dataset.s); if (!s) return 'skip';
      for (const x of p.stairs) if (x.boven === undefined) x.boven = '';   // vanaf nu geldt de eigen koppeling (niet meer afleiden uit de opstelling)
      s.boven = t.value && stairOf(p, t.value) ? t.value : '';
      // staat de opstelling aan, dan de trap daar ook op die hoogte en plaats zetten
      const o = p.opstelling; if (o && o.aan) { ZP.ops.ensure(p); const me = o.trappen[s.id], on = s.boven && o.trappen[s.boven];
        if (me) { if (on) { me.x = on.x; me.y = on.y; ZP.ops.trapNaarPeil(p, s.id, (on.z || 0) + (on.h || 0)); } else ZP.ops.trapNaarPeil(p, s.id, 0); } }
      break; }
    case 'uvstukhout': zet(p.typeMaterial = p.typeMaterial || {}, x => 'id:' + uvBase(x.id), t.value); break;
    case 'uvstukafw': zet(B.afwStuk = B.afwStuk || {}, x => uvBase(x.id), t.value); break;
    case 'uvstukvorm': { const m = B.boomVormen = B.boomVormen || {}; for (const x of sel.filter(y => ['trapboom', 'keepboom', 'leuning'].includes(y.type))) { if (t.value) m['id:' + uvBase(x.id)] = t.value; else delete m['id:' + uvBase(x.id)]; } break; }
    case 'uvstukverdr': { const m = B.verdreven = B.verdreven || {}; for (const x of sel.filter(y => y.type === 'trede')) { if (t.value) m[uvBase(x.id)] = t.value; else delete m[uvBase(x.id)]; } break; }
    case 'uvleunvorm': if (t.value === 'auto') B.leuning.auto = true; else { B.leuning.vorm = t.value; delete B.leuning.auto; } break;
    case 'uvleunzelf': { const l = (B.leun || []).find(x => x.id === t.dataset.id); if (l) { if (t.checked) l.zelf = true; else delete l.zelf; } break; }
    case 'uvbalzelf': { const l = (B.bal || []).find(x => x.id === t.dataset.id); if (l) { if (t.checked) l.zelf = true; else delete l.zelf; } break; }
    case 'uvzelf': { const z = B.zelf = B.zelf || {}; if (t.checked) z[t.dataset.k] = true; else delete z[t.dataset.k]; break; }
    case 'uvspiltr': { const m = B.spilTreden = B.spilTreden || {}; if (t.value.trim() === '') delete m[t.dataset.id]; else m[t.dataset.id] = Math.max(0, Math.round(parseFloat(t.value.replace(',', '.')) || 0)); break; }
    case 'uvdrager': if (t.value) B.drager = Object.assign(B.drager || { deel: 1 }, { id: t.value }); else delete B.drager; break;
    case 'uvbewoptie': { const bw = (B.bew || []).find(x => x.key === t.dataset.k); if (bw) { if (t.checked) bw.optie = true; else delete bw.optie; } break; }
    default: return false;
  }
});
