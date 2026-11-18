// Scherm 1 Importeren: verzamelbak, DXF/PDF samenvoegen
// ---------------- 1 Importeren ----------------
function scrImport() {
  const p = proj();
  const src = (lab, name, desc) => `<div class="srcfile ${name ? 'have' : ''}"><span class="ext">${lab}</span><div><b>${name ? esc(name) : 'nog niet ingelezen'}</b><small>${desc}</small></div></div>`;
  // één kaart per trap: bestanden, opnieuw inlezen, meldingen, wijzigingen en miniaturen (inklapbaar)
  const stairCards = p.stairs.map(s => {
    const parts = p.parts.filter(x => x.stair === s.id);
    const byType = groupByType(parts);
    const fk = 'imp-' + p.id + '-' + s.id;
    const thumbs = Object.keys(byType).map(t => `<div class="tsec"><h4>${P.TYPES[t].label} <span class="count">${byType[t].length}</span></h4><div class="thumbs">${byType[t].map(x =>
      `<figure title="${esc(x.name)}">${R.partThumb(x, 150, 64)}<figcaption><b>${esc(x.name)}</b><span>${f0(x.L)} × ${f0(x.W)} × ${f0(x.thickness)}</span></figcaption></figure>`).join('')}</div></div>`).join('');
    const ch = s.changes;
    return `<section class="card stair">
      <div class="stair-h">${foldBtn(fk, s.name)}<span class="scode">${stairCode(p, s.id)}</span>
        <input class="stair-name" data-bind="sname" data-s="${s.id}" value="${esc(s.name)}" title="Naam van deze trap">
        <label class="stair-aantal" title="Hoe vaak deze trap gemaakt wordt (bv. 3 dezelfde woningen). Indeling, inkooplijst en begroting tellen alles zo vaak.">× <input type="number" min="1" max="99" step="1" class="w3 num" data-bind="saantal" data-s="${s.id}" value="${P.aantalVan(s)}"> keer uitvoeren</label>
        <span class="muted small" title="${parts.length} onderdelen${P.aantalVan(s) > 1 ? ` · ${parts.length * P.aantalVan(s)} in totaal` : ''}">${Object.keys(byType).map(t => byType[t].length + ' ' + P.TYPES[t].label.toLowerCase()).join(' · ') || 'geen onderdelen'}${(s.importWarnings || []).length && folded(fk) ? ' · <b class="warnc">' + s.importWarnings.length + ' meldingen</b>' : ''}</span>
        <span class="stair-act"><label class="btn small ${s.plan ? 'ghost' : ''}" title="Alleen de plattegrond met maten uit de PDF van StairDesigner halen, voor het bovenaanzicht op het tekeningblad. De onderdelen blijven zoals ze zijn.">${s.plan ? '✓ Plattegrond met maten' : 'Plattegrond uit PDF…'}<input type="file" accept=".pdf" data-act="planpdf" data-s="${s.id}" hidden></label>
        <label class="btn small" title="Bestanden in de verzamelbak zetten om deze trap te vervangen">Opnieuw inlezen…<input type="file" accept=".dxf,.pdf" multiple data-act="files" data-s="${s.id}" hidden></label>
        <button class="ghost small danger" data-act="delstair" data-v="${s.id}">Trap verwijderen</button></span></div>
      ${folded(fk) ? '' : `<div class="srcs">${src('DXF', s.files.dxf, '3D-model: contouren, dikte, voorkant van de treden')}${src('PDF', s.files.pdf, 'Houtsoort, stootborden, spillen, balusters, zaaglijst')}</div>
      ${(s.importWarnings || []).length ? `<div class="warn"><b>Let op bij het inlezen</b><ul>${s.importWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${ch ? `<div class="card sub"><h4>Wijzigingen t.o.v. vorige import</h4>${ch.length ? '<ul>' + ch.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' : '<p class="muted">Geen verschillen in onderdelen.</p>'}</div>` : ''}
      ${thumbs}`}</section>`;
  }).join('');
  return pageHead('Importeren', 'Voer de trappen één voor één in: sleep alle tekeningen (DXF en PDF) van één trap erin, kijk of het klopt en klik op "Trap … is klaar". Daarna voeg je de volgende trap toe.') + `
    <section class="card imp-proj"><label class="field">Projectnaam <input data-bind="pname" value="${esc(p.name)}"></label></section>
    ${stairCards}
    ${stagingHtml(p)}`;
}
function groupByType(parts) {
  const o = {};
  for (const x of P.sortParts(parts)) (o[x.type] = o[x.type] || []).push(x);
  return o;
}
// ---------------- invoer per trap: eerst alle tekeningen van één trap, dan pas de volgende ----------------
// Elk bestand wordt meteen gelezen (zodat de projectnaam bekend is) maar pas bij "Trap … is klaar" aan het project toegevoegd.
// Alle bestanden in de invoer horen bij één trap: ui.stgDoel = 'new' (nieuwe trap, naam ui.stgNaam, aantal ui.stgAantal)
// of een trap-id (die trap opnieuw inlezen). ui.impOpen = invoer voor een nieuwe trap staat open (knop "+ Volgende trap").
ui.staged = []; ui.stagedFor = null; ui.stgDoel = 'new'; ui.stgNaam = ''; ui.stgAantal = 1; ui.impOpen = false;
let stageSeq = 0;
const stgLeeg = () => { ui.staged = []; ui.stgDoel = 'new'; ui.stgNaam = ''; ui.stgAantal = 1; };
async function stageFiles(files, stairId) {
  const p = proj();
  if (ui.stagedFor !== p.id) { stgLeeg(); ui.stagedFor = p.id; ui.impOpen = false; } // invoer hoort bij dit project
  const list = [...files].filter(f => /\.(dxf|pdf)$/i.test(f.name));
  if (!list.length) { ui.msg = { text: 'Kies .dxf- en/of .pdf-bestanden.', kind: 'err' }; return render(); }
  // "Opnieuw inlezen…" bij een trap: de invoer gaat over die trap (andere bestanden in de invoer vervallen)
  const doel = stairId || 'new';
  if (ui.staged.length && ui.stgDoel !== doel) stgLeeg();
  ui.stgDoel = doel; if (doel === 'new') ui.impOpen = true;
  for (let i = 0; i < list.length; i++) {
    const f = list[i], kind = /\.dxf$/i.test(f.name) ? 'dxf' : 'pdf';
    try {
      setBusy(`${kind.toUpperCase()} lezen: ${f.name} (${i + 1}/${list.length})`, i / list.length);
      const res = kind === 'dxf' ? ZP.dxfimport.read(await f.text())
        : await ZP.pdfimport.read(await f.arrayBuffer(), (a, n) => setBusy(`PDF lezen: ${f.name} · pagina ${a}/${n}`, (i + a / n) / list.length));
      const project = res.project || f.name.replace(/\.(dxf|pdf)$/i, '');
      ui.staged.push({ id: 'f' + (++stageSeq), name: f.name, kind, res, project, n: res.parts.length, target: doel === 'new' ? 'new:trap' : doel });
      if (doel === 'new' && !ui.stgNaam) ui.stgNaam = project;
    } catch (e) { console.error(e); ui.msg = { text: `${f.name} niet leesbaar: ${e.message}`, kind: 'err' }; }
  }
  ui.busy = null; render();
}
// alleen de plattegrond (met maten) uit een PDF bij een bestaande trap zetten; de onderdelen blijven ongemoeid
async function leesPlan(file, sid) {
  const p = proj(), s = p && stairOf(p, sid); if (!s || !file) return;
  try {
    setBusy('Plattegrond lezen: ' + file.name, 0.3);
    const res = await ZP.pdfimport.read(await file.arrayBuffer());
    if (!res.plan) ui.msg = { text: `In ${file.name} staat geen plattegrond met maten (het eerste blad van de StairDesigner-PDF).`, kind: 'err' };
    else { s.plan = res.plan; ui.msg = { text: `Plattegrond met maten toegevoegd aan trap ${stairCode(p, sid)} (${res.plan.tekst.length} maten en nummers).`, kind: 'ok' }; save(); }
  } catch (e) { console.error(e); ui.msg = { text: `${file.name} niet leesbaar: ${e.message}`, kind: 'err' }; }
  ui.busy = null; render();
}
// naam van de volgende nieuwe trap (Trap A, B …)
const volgendeCode = (p) => String.fromCharCode(65 + p.stairs.length);
function commitStaged() {
  const p = proj(); if (!ui.staged.length) return;
  const dxfs = ui.staged.filter(f => f.kind === 'dxf'), pdfs = ui.staged.filter(f => f.kind === 'pdf');
  const names = {}; if (dxfs[0]) names.dxf = dxfs[0].name; if (pdfs[0]) names.pdf = pdfs[0].name;
  const isNew = ui.stgDoel === 'new' || !stairOf(p, ui.stgDoel);
  const s = applyImport(p, dxfs[0] ? dxfs[0].res : null, pdfs[0] ? pdfs[0].res : null, names, isNew ? null : ui.stgDoel, isNew ? (ui.stgNaam.trim() || null) : null);
  if (isNew && ui.stgAantal > 1) s.aantal = ui.stgAantal;
  if (dxfs.length > 1 || pdfs.length > 1) s.importWarnings.unshift('Meerdere DXF- of PDF-bestanden voor deze trap gekozen; alleen het eerste van elk soort is gebruikt.');
  // klaar: de trap klapt dicht tot een samenvatting, de invoer gaat dicht (knop "+ Volgende trap")
  const fk = 'imp-' + p.id + '-' + s.id; if (!folded(fk)) toggleFold(fk);
  stgLeeg(); ui.impOpen = false;
  ui.msg = { text: `Trap ${stairCode(p, s.id)} ingelezen: ${s.name} (${p.parts.filter(x => x.stair === s.id).length} onderdelen).`, kind: 'ok' };
  // keuzes uit de configurator (gekozen variant, of de enige) meteen overzetten naar hout en begroting
  const cv = p.config && (ZP.config.gekozen(p) || (p.config.varianten.length === 1 ? p.config.varianten[0] : null));
  if (cv) {
    p.config.gekozen = cv.id;
    const m = ZP.config.toepassen(p, cv, C(), db.materials);
    ui.msg = { text: ui.msg.text + ` Keuzes van variant ${cv.naam} overgezet` + (m.length ? `; ${m.length} ${m.length === 1 ? 'punt' : 'punten'} om na te kijken (zie Begroting).` : '.'), kind: m.some(x => x.kind === 'warn') ? 'err' : 'ok' };
  }
  save(); render();
}
// De invoer op het scherm: één trap tegelijk (nieuwe trap, of een bestaande trap opnieuw inlezen).
function stagingHtml(p) {
  if (ui.stagedFor !== p.id) { stgLeeg(); ui.impOpen = false; ui.stagedFor = p.id; }
  const vervang = ui.stgDoel !== 'new' && ui.staged.length ? stairOf(p, ui.stgDoel) : null;
  const open = vervang || ui.impOpen || ui.staged.length || !p.stairs.length;
  // dicht: alleen de knop voor de volgende trap
  if (!open) return `<div class="imp-volgende"><button class="big" data-act="impnieuw">+ Volgende trap (Trap ${volgendeCode(p)})</button>
    <span class="muted small">Zijn alle trappen van dit project ingelezen? Ga dan verder met controleren.</span></div>`;
  const nD = ui.staged.filter(f => f.kind === 'dxf').length, nP = ui.staged.filter(f => f.kind === 'pdf').length;
  const meldingen = [];
  if (nD > 1 || nP > 1) meldingen.push('Meer dan één DXF of PDF: alleen het eerste van elk soort wordt gebruikt. Haal de andere weg (✕) en lees ze in bij de volgende trap.');
  if (new Set(ui.staged.map(f => norm(f.project))).size > 1) meldingen.push('De bestanden hebben een verschillende projectnaam; horen ze wel bij dezelfde trap?');
  // nieuwe trap met dezelfde naam als een bestaande: misschien bedoel je opnieuw inlezen
  const lijkt = !vervang && ui.staged.length ? p.stairs.find(s => ui.staged.some(f => norm(f.project) === norm(s.name))) : null;
  const code = vervang ? stairCode(p, vervang.id) : volgendeCode(p);
  const files = ui.staged.length ? `<ul class="stg-files">${ui.staged.map(f => `<li><span class="ext ${f.kind}">${f.kind.toUpperCase()}</span><span class="fn"><b>${esc(f.name)}</b><small>${esc(f.project)} · ${f.n} onderdelen</small></span>
      <button class="ghost small" data-act="stgdel" data-v="${f.id}" title="Weghalen uit de invoer">✕</button></li>`).join('')}</ul>
    ${!nD ? '<div class="muted small">Geen DXF: de vormen komen uit de PDF.</div>' : ''}${!nP ? '<div class="muted small">Geen PDF: houtsoort en stootborden ontbreken (later aan te vullen of de PDF er nog bij slepen).</div>' : ''}` : '';
  const kop = vervang
    ? `<span class="scode">${code}</span><h3>${esc(vervang.name)} <span class="pill warn">opnieuw inlezen</span></h3><span class="muted small">vervangt de onderdelen van deze trap; eigen keuzes blijven bewaard</span>`
    : `<span class="scode">${code}</span><input class="stg-name" data-bind="stgnaam" value="${esc(ui.stgNaam)}" placeholder="Naam van trap ${code}" title="Naam van de nieuwe trap">
       <label class="stair-aantal" title="Hoe vaak deze trap gemaakt wordt">× <input type="number" min="1" max="99" step="1" class="w3 num" data-bind="stgaantal" value="${ui.stgAantal}"> keer uitvoeren</label>`;
  return `<section class="card staging stg-trap ${vervang ? 'repl' : 'new'}">
    <div class="stg-h">${kop}</div>
    ${vervang ? '' : `<div class="drop" id="drop"><div class="drop-ic">${ICON.upload}</div><p class="drop-t">Sleep hier de tekeningen van trap ${code} in</p>
      <p class="muted">DXF (3D-model) en PDF (houtsoort, stootborden, zaaglijst) van deze ene trap · in één keer of na elkaar</p>
      <label class="btn">Bestanden kiezen<input type="file" accept=".dxf,.pdf" multiple data-act="files" hidden></label></div>`}
    ${files}
    ${meldingen.map(m => `<div class="warn small">${m}</div>`).join('')}
    ${lijkt ? `<div class="warn small">Deze tekening heeft dezelfde naam als trap ${stairCode(p, lijkt.id)} (${esc(lijkt.name)}). Wil je die trap opnieuw inlezen? <button class="small" data-act="stgvervang" data-v="${lijkt.id}">Ja, trap ${stairCode(p, lijkt.id)} vervangen</button></div>` : ''}
    <div class="row end">${p.stairs.length || ui.staged.length ? `<button class="ghost" data-act="stgclear">Annuleren</button>` : ''}
      <button class="primary big" data-act="stgcommit" ${ui.staged.length ? '' : 'disabled'}>${vervang ? `Trap ${code} opnieuw inlezen` : `Trap ${code} is klaar`} →</button></div></section>`;
}
// DXF en PDF samenvoegen. De tekening (DXF-vorm) wint, de PDF levert materiaal en ontbrekende onderdelen.
function applyImport(p, dxf, pdf, names, stairId, name) {
  ensureStairs(p);
  let s = stairId && stairOf(p, stairId);
  if (!s) {
    s = { id: newStairId(p), name: name || (pdf && pdf.project) || (dxf && dxf.project) || ('Trap ' + (p.stairs.length + 1)), files: {}, sawList: [], summary: [], importWarnings: [], changes: null };
    p.stairs.push(s);
  }
  const warnings = [];
  let parts = [];
  if (dxf) { parts = dxf.parts; warnings.push(...dxf.warnings); }
  if (pdf) {
    warnings.push(...pdf.warnings);
    if (!dxf) parts = pdf.parts;
    else {
      const byName = new Map(pdf.parts.map(x => [x.name, x]));
      const mats = {}; pdf.parts.forEach(x => { mats[x.material] = (mats[x.material] || 0) + 1; });
      const main = Object.keys(mats).sort((a, b) => mats[b] - mats[a])[0] || '';
      for (const x of parts) {
        const q = byName.get(x.name);
        if (q) { x.material = q.material; if (Math.abs(q.thickness - x.thickness) > 0.6) x.warnings.push(`Dikte DXF ${x.thickness} mm, PDF ${q.thickness} mm.`); }
        else if (!x.material) x.material = main;
      }
      const have = new Set(parts.map(x => x.name));
      for (const q of pdf.parts) if (!have.has(q.name)) { q.warnings.push('Alleen in PDF (niet in DXF).'); parts.push(q); }
      ZP.pdfimport.checkAgainstSawList(parts, pdf.sawList);
    }
    s.sawList = pdf.sawList; s.summary = pdf.summary;
    if (pdf.plan) s.plan = pdf.plan;   // plattegrond met de maten van StairDesigner (voor het bovenaanzicht op het tekeningblad)
  }
  if (dxf && pdf && dxf.project && pdf.project && norm(dxf.project) !== norm(pdf.project))
    warnings.unshift(`DXF hoort bij "${dxf.project}", PDF bij "${pdf.project}". Lees per trap de DXF en PDF van hetzelfde project samen in.`);
  if (dxf && !pdf && parts.some(x => !x.material)) warnings.push('De DXF bevat geen houtsoort; kies die bij Controleren (of lees de PDF erbij in).');
  if (dxf && !pdf) warnings.push('De DXF bevat geen stootborden; lees de PDF erbij in of voeg ze toe bij Controleren.');
  // bij opnieuw inlezen: verschillen tonen, eigen keuzes (meedoen, maken, neus omgezet, materiaal) behouden
  const prev = p.parts.filter(x => x.stair === s.id);
  if (prev.length) {
    const old = new Map(prev.map(x => [x.name, x])); const ch = [];
    for (const x of parts) {
      const o = old.get(x.name);
      if (!o) { ch.push(`Nieuw: ${x.name} (${f0(x.L)}×${f0(x.W)})`); continue; }
      if (Math.abs(o.L - x.L) > 1 || Math.abs(o.W - x.W) > 1 || Math.abs(o.volume - x.volume) > 0.05) ch.push(`Gewijzigd: ${x.name} ${f0(o.L)}×${f0(o.W)} → ${f0(x.L)}×${f0(x.W)}`);
      x.include = o.include; x.make = o.make; if (o.materialManual) { x.material = o.material; x.materialManual = true; }
      if (o.noseManual && x.hasNose) P.flipNose(x);
      old.delete(x.name);
    }
    for (const o of old.values()) if (o.source !== 'handmatig') ch.push(`Vervallen: ${o.name}`); else parts.push(o);
    s.changes = ch;
  } else s.changes = null;
  for (const x of parts) x.stair = s.id;
  p.parts = p.parts.filter(x => x.stair !== s.id).concat(parts);
 
  s.importWarnings = warnings;
  s.files = Object.assign({}, s.files, names);
  if (/^Nieuw project$/.test(p.name)) p.name = s.name;
  refreshNames(p);
  return s;
}
const norm = (s) => String(s).toLowerCase().replace(/d\.d\..*$/, '').replace(/[^a-z0-9]/g, '');


CLICK.push(function click_importeren(a, t, v, p, e) {
  switch (a) {
    case 'delstair': {
      const s = stairOf(p, v); if (!s) break;
      if (confirm(`Trap "${s.name}" met ${p.parts.filter(x => x.stair === v).length} onderdelen uit dit project verwijderen?`)) {
        p.stairs = p.stairs.filter(x => x.id !== v); p.parts = p.parts.filter(x => x.stair !== v); refreshNames(p); save();
      }
      render(); break;
    }
    case 'stgdel': ui.staged = ui.staged.filter(f => f.id !== v); if (!ui.staged.length && ui.stgDoel !== 'new') stgLeeg(); render(); break;
    case 'stgclear': stgLeeg(); ui.impOpen = false; render(); break;
    case 'stgcommit': commitStaged(); break;
    case 'impnieuw': stgLeeg(); ui.impOpen = true; ui.stagedFor = p.id; render(); break;
    // nieuwe trap heeft dezelfde naam als een bestaande: dan toch die trap opnieuw inlezen
    case 'stgvervang': ui.stgDoel = v; ui.staged.forEach(f => { f.target = v; }); render(); break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_importeren(b, t, p, part, numv) {
  switch (b) {
    case 'stgnaam': ui.stgNaam = t.value; return 'skip'; // geen herteken nodig
    case 'stgaantal': ui.stgAantal = Math.max(1, Math.min(99, Math.round(parseFloat(String(t.value).replace(',', '.')) || 1))); return 'skip';
    case 'sname': { const s = stairOf(p, t.dataset.s); if (s) s.name = t.value; refreshNames(p); break; }
    // trap meerdere keren uitvoeren: indeling, inkoop en begroting tellen alles × aantal
    case 'saantal': { const s = stairOf(p, t.dataset.s); if (s) s.aantal = Math.max(1, Math.min(99, Math.round(parseFloat(String(t.value).replace(',', '.')) || 1)));
      cfAuto(p); break; }   // configurator-keuzes (bv. verdiepingsbalustrades × aantal) meteen opnieuw doorzetten
    default: return false;
  }
});
