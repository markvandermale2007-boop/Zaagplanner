// Scherm 2 Controleren: zaaglijst, neuzen, handmatig onderdeel
// ---------------- 2 Controleren ----------------
function scrCheck() {
  const p = proj();
  const mats = [...new Set(db.materials.map(m => M.canonMaterial(m.material)))];
  const noMat = p.parts.filter(x => !x.material).length;
  const multi = p.stairs.length > 1;
  // compacte tabel (zes kolommen) zodat niets horizontaal hoeft te schuiven
  const typeCard = (s, t, list) => {
    const allOn = list.every(x => x.include);
    const fk = 'chk-' + p.id + '-' + s.id + '-' + t;
    const rows = list.map(x => {
      const z = x.sawList;
      const dev = x.warnings.length ? `<span class="badge warn" title="${esc(x.warnings.join('\n'))}">${esc(x.warnings[0])}</span>` : (z ? '<span class="badge ok">✓ klopt met zaaglijst</span>' : '');
      return `<tr class="${x.include ? '' : 'off'}">
        <td><input type="checkbox" data-bind="inc" data-id="${x.id}" ${x.include ? 'checked' : ''}></td>
        <td><b>${esc(x.name)}</b><div class="muted small"><span class="src src-${esc(x.source)}">${esc(x.source)}</span>${x.noseFrom ? ' · neus via ' + esc(x.noseFrom) : ''}</div></td>
        <td class="matcell"><input class="w8" list="matlist" data-bind="mat" data-id="${x.id}" value="${esc(x.material)}"><span class="thk"><input class="w3 num" data-bind="thick" data-id="${x.id}" value="${x.thickness}"> mm</span>${(p.typeMaterial || {})[x.type] ? `<div class="muted small">wordt ${esc(p.typeMaterial[x.type])} (keuze bij Hout)</div>` : ''}</td>
        <td class="num"><b>${f0(x.L)} × ${f0(x.W)}</b><div class="muted small">${f2(x.volume)} dm³ netto</div></td>
        <td>${dev}${z ? `<div class="muted small">zaaglijst ${z.dims.slice(0, 2).join(' × ')} · ${f2(z.net)} dm³</div>` : ''}</td>
        <td class="thumbcell">${R.partThumb(x, 120, 48)}${x.hasNose ? `<button class="small" data-act="flip" data-v="${x.id}">Neus omzetten</button>` : ''}
          ${t === 'trede' ? `<select data-bind="make" data-id="${x.id}" title="Hoe deze trede gemaakt wordt">${MAKE_OPTS.map(([k, lab]) => `<option value="${k}" ${x.make === k ? 'selected' : ''}>${lab}</option>`).join('')}</select>` : ''}</td>
        <td><button class="ghost small" data-act="delpart" data-v="${x.id}" title="Onderdeel verwijderen">✕</button></td></tr>`;
    }).join('');
    const nWarn = list.filter(x => x.warnings.length).length;
    return `<section class="card tcard"><div class="thd">${foldBtn(fk, P.TYPES[t].label)}<label class="tlabel"><input type="checkbox" data-bind="incall" data-v="${t}" data-s="${s.id}" ${allOn ? 'checked' : ''}> <h3>${P.TYPES[t].label}</h3></label>
        <span class="count">${list.length}</span>${allOn ? '' : `<span class="pill muted">${list.filter(x => x.include).length} doen mee</span>`}${nWarn ? `<span class="pill warn">${nWarn} om te controleren</span>` : '<span class="pill ok">alles klopt</span>'}</div>
      ${folded(fk) ? '' : `<table class="tbl check"><thead><tr><th></th><th>Onderdeel</th><th>Materiaal · dikte</th><th>Omhullende</th><th>Controle</th><th>Contour · neus · maken</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}</section>`;
  };
  const sections = p.stairs.map(s => {
    const byType = groupByType(p.parts.filter(x => x.stair === s.id));
    const cards = Object.keys(byType).map(t => typeCard(s, t, byType[t])).join('');
    if (!multi) return cards;
    const fk = 'chks-' + p.id + '-' + s.id, n = p.parts.filter(x => x.stair === s.id).length;
    return `<div class="stairblock"><div class="stair-h big">${foldBtn(fk, s.name)}<span class="scode">${stairCode(p, s.id)}</span><h2>${esc(s.name)}</h2><span class="muted small">${n} onderdelen</span></div>${folded(fk) ? '' : cards}</div>`;
  }).join('');
  const tot = (f) => p.parts.filter(x => x.include).reduce((a, x) => a + f(x), 0);
  const sum = summaryOf(p);
  const sdG = sum.reduce((a, s) => a + s.gross, 0);
  return pageHead('Controleren', 'De zaaglijst zoals de app die uit de tekeningen heeft opgebouwd. De rode lijn is de herkende neus (voorkant) van een trede. Vink onderdelen uit die je kant-en-klaar koopt.',
      `<button class="primary" data-act="go" data-v="hout">Verder: hout kiezen →</button>`) + `
    ${noMat ? `<div class="warn">${noMat} onderdelen zonder houtsoort. <select id="setmat">${mats.map(m => `<option>${esc(m)}</option>`).join('')}</select> <button data-act="setmat">Toepassen op alle zonder houtsoort</button></div>` : ''}
    <datalist id="matlist">${mats.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="kpis">${kpi('Doen mee', p.parts.filter(x => x.include).length, 'van ' + p.parts.length + ' onderdelen')}${kpi('Netto volume', f1(tot(x => x.volume)) + ' <i>dm³</i>', 'uit de contouren')}
    ${multi ? kpi('Trappen', p.stairs.length, p.stairs.map(s => stairCode(p, s.id)).join(', ')) : ''}
    ${sdG ? kpi('StairDesigner', f1(sdG) + ' <i>dm³</i>', 'bruto · ' + f1(sum.reduce((a, s) => a + s.net, 0)) + ' netto') : ''}
    ${kpi('Te controleren', p.parts.filter(x => x.include && x.warnings.length).length, 'meldingen', p.parts.some(x => x.include && x.warnings.length) ? 'warn' : 'ok')}</div>
    ${sections}
    <details class="card sub"><summary>Onderdeel handmatig toevoegen <span class="muted small">— bv. een keepboom als alternatief voor een trapboom</span></summary>
      <div class="row wrap">${p.stairs.length > 1 ? `<select id="np-stair" title="Bij welke trap">${p.stairs.map(s => `<option value="${s.id}">${stairCode(p, s.id)} · ${esc(s.name)}</option>`).join('')}</select>` : ''}<select id="np-type">${Object.keys(P.TYPES).map(t => `<option value="${t}">${P.TYPES[t].label}</option>`).join('')}</select>
      <input id="np-name" placeholder="Naam, bv. Trede #16"><input id="np-l" class="w5" placeholder="Lengte"><input id="np-w" class="w5" placeholder="Breedte"><input id="np-t" class="w4" placeholder="Dikte">
      <input id="np-m" class="w8" list="matlist" placeholder="Materiaal"><input id="np-n" class="w3" value="1" title="Aantal"><button data-act="addpart">Toevoegen</button></div>
      <p class="muted small">Rechthoekig (omhullende maat); een trede krijgt de neus aan de lange zijde. Een keepboom wordt net als een trapboom in de lengte ingedeeld.</p></details>
    `;
}


function addManualPart() {
  const p = proj(); const v = (id) => document.getElementById(id).value.trim();
  const type = v('np-type'), L = parseFloat(v('np-l')), W = parseFloat(v('np-w')), t = parseFloat(v('np-t')), n = Math.max(1, parseInt(v('np-n')) || 1);
  if (!(L > 0 && W > 0 && t > 0)) { ui.msg = { text: 'Vul lengte, breedte en dikte in.', kind: 'err' }; return render(); }
  // bij welke trap: gekozen, de enige, of een nieuwe als het project nog leeg is
  if (!p.stairs.length) p.stairs.push({ id: newStairId(p), name: p.name, files: {}, sawList: [], summary: [], importWarnings: [], changes: null });
  const sid = document.getElementById('np-stair') ? v('np-stair') : p.stairs[0].id;
  for (let i = 0; i < n; i++) {
    const pn = P.parseName(v('np-name'));
    const nr = pn.nr ? pn.nr + i : (p.parts.filter(x => x.type === type && x.stair === sid).reduce((a, x) => Math.max(a, x.nr), 0) + 1);
    const name = P.canonicalName(type, pn.side, nr);
    const part = P.rect({ name, type, side: pn.side, nr, material: v('np-m'), materialManual: true, thickness: t, source: 'handmatig', warnings: [] }, L, W);
    part.stair = sid; p.parts.push(part);
  }
  // direct melden als er voor deze houtsoort geen plank van die dikte (of voor deze soort) in de materialenlijst staat
  const mat = N.materialOf({ type, material: v('np-m') }, S(), p.typeMaterial);
  const ofWood = db.materials.filter(m => M.matches(m, mat)), ofThick = ofWood.filter(m => Math.abs(m.netT - t) < 0.6);
  const lab = P.TYPES[type].label.toLowerCase();
  if (!ofWood.length) ui.msg = { text: `Toegevoegd, maar houtsoort "${mat}" staat niet in de materialenlijst – zo wordt het onderdeel niet ingedeeld.`, kind: 'err' };
  else if (!ofThick.length) ui.msg = { text: `Toegevoegd, maar ${mat} heeft geen plank soort met netto ${t} mm (wel: ${[...new Set(ofWood.map(m => m.netT))].sort((a, b) => a - b).join(', ')} mm).`, kind: 'err' };
  else if (!ofThick.some(m => M.allows(m, type))) ui.msg = { text: `Toegevoegd, maar geen plank soort van ${mat} ${t} mm is aangevinkt voor ${lab} (Materialen → Geschikt voor).`, kind: 'err' };
  else { const mw = Math.max(...ofThick.filter(m => M.allows(m, type)).map(m => m.width)); ui.msg = { text: W + 6 > mw ? `Toegevoegd. Breder dan de breedste plank (${mw} mm): wordt in stroken gezaagd en verlijmd.` : 'Toegevoegd.', kind: 'ok' }; }
  refreshNames(p); save(); render();
}


CLICK.push(function click_controleren(a, t, v, p, e) {
  switch (a) {
    case 'flip': { const x = p.parts.find(x => x.id === v); P.flipNose(x); save(); render(); break; }
    case 'delpart': p.parts = p.parts.filter(x => x.id !== v); save(); render(); break;
    case 'setmat': { const m = document.getElementById('setmat').value; p.parts.forEach(x => { if (!x.material) { x.material = m; x.materialManual = true; } }); save(); render(); break; }
    case 'addpart': addManualPart(); break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_controleren(b, t, p, part, numv) {
  switch (b) {
    case 'inc': part.include = t.checked; break;
    case 'incall': p.parts.filter(x => x.type === t.dataset.v && (!t.dataset.s || x.stair === t.dataset.s)).forEach(x => x.include = t.checked); break;
    case 'mat': part.material = t.value; part.materialManual = true; break;
    case 'thick': part.thickness = numv(t.value); part.volume = part.netArea * part.thickness / 1e6; break;
    case 'make': part.make = t.value; break;
    default: return false;
  }
});
