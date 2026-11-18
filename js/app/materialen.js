// Beheer: materialenlijst (houtsoort › plank soort › maten)
// ---------------- Materialenlijst ----------------
// Opbouw: houtsoort (bv. "Rustiek eiken") › plank soort (bv. "Panelen 40 mm", met bruto en netto dikte) › maten.
// Elke maat is één regel met een eigen prijs; de app rekent altijd uit wat één plank kost.
// Welk onderdeel van de trap uit welke houtsoort of plank soort komt, kies je per project bij Hout.
const PM = { stuk: 'per stuk', m3: 'per m³', dm3: 'per dm³', m2: 'per m²', m1: 'per m¹' };
const pmOpts = (sel) => Object.entries(PM).map(([k, t]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${t}</option>`).join('');
const woodOf = (m) => M.canonMaterial(m.material);
const woodNames = () => [...new Set(db.materials.map(woodOf).concat(db.matExtra || []).concat((db.subExtra || []).map(s => s.material)))].sort((a, b) => a.localeCompare(b));
// plank soorten van een houtsoort, met dikte en maten
function plankSoorten(wood) {
  const map = new Map();
  for (const m of db.materials.filter(m => woodOf(m) === wood)) {
    const s = map.get(m.sub) || { material: wood, sub: m.sub, grossT: m.grossT, netT: m.netT, types: m.types || null, rows: [] };
    s.rows.push(m); map.set(m.sub, s);
  }
  for (const e of (db.subExtra || []).filter(e => e.material === wood)) if (!map.has(e.sub)) map.set(e.sub, Object.assign({ rows: [] }, e));
  return [...map.values()].sort((a, b) => a.sub.localeCompare(b.sub, 'nl', { numeric: true }))
    .map(s => Object.assign(s, { rows: s.rows.sort((a, b) => (a.stock ? 1 : 0) - (b.stock ? 1 : 0) || a.width - b.width || a.length - b.length) }));
}
const subRows = (wood, sub) => db.materials.filter(m => woodOf(m) === wood && m.sub === sub);
const keepWood = (w) => { db.matExtra = db.matExtra || []; if (!db.matExtra.includes(w)) db.matExtra.push(w); };
const keepSub = (s) => { db.subExtra = db.subExtra || []; if (!db.subExtra.some(e => e.material === s.material && e.sub === s.sub)) db.subExtra.push({ material: s.material, sub: s.sub, grossT: s.grossT, netT: s.netT, types: s.types || null }); };
const m3 = (m) => m.grossT * m.width * m.length / 1e9;

function subBlockHtml(ps, id) {
  const fk = 'mlp:' + ps.material + ':' + ps.sub, shut = folded(fk);
  const dv = `data-w="${esc(ps.material)}" data-s="${esc(ps.sub)}"`;
  const last = ps.rows.filter(r => !r.stock).slice(-1)[0];
  // voorraad wordt niet meer bijgehouden (wens gebruiker); alleen oude voorraadregels tonen nog een kolom om ze leeg te maken
  const oudeVoorraad = ps.rows.some(r => r.stock);
  const body = ps.rows.map(m => `<tr class="${m.stock ? 'is-stock' : ''}">
      <td><input class="w5 num" data-bind="m" data-f="width" data-id="${m.id}" value="${m.width}"></td>
      <td><input class="w5 num" data-bind="m" data-f="length" data-id="${m.id}" value="${m.length}"></td>
      <td class="nowrap"><input class="w5 num" data-bind="m" data-f="price" data-id="${m.id}" value="${m.price}"> <select data-bind="m" data-f="priceMode" data-id="${m.id}">${pmOpts(m.priceMode)}</select></td>
      <td class="num"><b>${eur(M.boardPrice(m))}</b></td>
      <td class="num muted">${m3(m).toFixed(3).replace('.', ',')}</td>
      ${oudeVoorraad ? `<td><input class="w3 num" data-bind="m" data-f="stockN" data-id="${m.id}" value="${m.stock ? (m.available ?? 1) : ''}" placeholder="–" title="Oude voorraadregel: maak leeg om er een gewone maat van te maken"></td>` : ''}
      <td><button class="ghost small" data-act="mrowdel" data-v="${m.id}" title="Deze maat weghalen">✕</button></td></tr>`).join('');
  return `<div class="mlsub ${shut ? 'shut' : ''}" ${dv}>
    <div class="mlsub-h">${foldBtn(fk, ps.sub)}
      <input class="ml-subname" data-bind="mlsubname" ${dv} value="${esc(ps.sub)}" title="Naam van de plank soort, bv. Panelen 40 mm">
      <span class="nowrap small">dikte <input class="w3 num" data-bind="mlsubt" data-f="grossT" ${dv} value="${ps.grossT}" title="Bruto dikte (wat je koopt)"> bruto → <input class="w3 num" data-bind="mlsubt" data-f="netT" ${dv} value="${ps.netT}" title="Netto dikte (na schaven)"> netto mm</span>
      <span class="muted small">${ps.rows.length} ${ps.rows.length === 1 ? 'maat' : 'maten'}${ps.rows.length ? ' · ' + eur(Math.min(...ps.rows.map(M.boardPrice))) + ' – ' + eur(Math.max(...ps.rows.map(M.boardPrice))) + ' per plank' : ''}</span>
      <button class="ghost small danger ml-del" data-act="mlsubdel" ${dv}>Verwijderen</button></div>
    <div class="ml-for small"><span class="muted">Geschikt voor:</span>${M.TYPE_KEYS.map(k => `<label class="tchip ${M.allows(ps, k) ? 'on' : ''}"><input type="checkbox" data-bind="mlsubtype" ${dv} data-t="${k}" ${M.allows(ps, k) ? 'checked' : ''}>${P.TYPES[k].label}</label>`).join('')}</div>
    ${shut ? '' : `<table class="tbl mltable"><thead><tr><th>Breedte</th><th>Lengte</th><th>Prijs</th><th class="num">Per plank</th><th class="num">m³</th>${oudeVoorraad ? '<th title="Voorraad wordt niet meer bijgehouden">Voorraad (oud)</th>' : ''}<th></th></tr></thead>
      <tbody>${body || '<tr><td colspan="6" class="muted">Nog geen maten. Vul hieronder de eerste in.</td></tr>'}</tbody>
      <tfoot><tr class="addrow-l">
        <td><input class="w6" id="${id}-w" placeholder="breedte" title="Breedte in mm (meerdere met komma's: 250, 300)"></td>
        <td><input class="w6" id="${id}-l" placeholder="lengte" title="Lengte in mm (meerdere met komma's: 2000, 3000)"></td>
        <td class="nowrap"><input class="w5 num" id="${id}-p" value="${last ? esc(last.price) : ''}" placeholder="prijs"> <select id="${id}-pm">${pmOpts(last ? last.priceMode : 'stuk')}</select></td>
        <td></td><td></td>${oudeVoorraad ? '<td></td>' : ''}
        <td><button class="small primary" data-act="mladd" data-id="${id}" ${dv}>+ Maat</button></td></tr></tfoot></table>`}
  </div>`;
}

function woodCardHtml(wood, idx) {
  const fk = 'ml-' + wood, shut = folded(fk), subs = plankSoorten(wood);
  const rows = db.materials.filter(m => woodOf(m) === wood);
  const suppliers = [...new Set(rows.map(m => m.supplier).filter(Boolean))];
  const id = 'ml' + idx;
  return `<section class="card mlsec" data-mat="${esc(wood)}">
    <div class="ml-head">${foldBtn(fk, wood)}<input class="ml-name" data-bind="mlname" data-v="${esc(wood)}" value="${esc(wood)}" title="Naam van de houtsoort">
      <span class="muted small">${subs.length} plank ${subs.length === 1 ? 'soort' : 'soorten'} · ${rows.length} maten${shut && subs.length ? ': ' + subs.map(s => esc(s.sub)).join(', ') : ''}</span>
      <label class="small ml-sup">Leverancier <input class="w8" data-bind="mlsup" data-v="${esc(wood)}" value="${suppliers.length === 1 ? esc(suppliers[0]) : ''}" placeholder="${suppliers.length > 1 ? 'verschilt' : 'optioneel'}"></label>
      ${fotoKnop('hout', wood)}${houtStijlVeld(wood)}<label class="small ml-factor" title="Factor op de werkplaats-uren voor onderdelen van deze houtsoort (zagen, schuren, frezen): 1 = normaal, 0,9 = sneller (zacht hout), 1,1 = trager (hard hout)">uren × <input class="w3 num ${(C().houtFactor || {})[wood] && +(C().houtFactor)[wood] !== 1 ? 'set' : ''}" data-bind="mlfactor" data-v="${esc(wood)}" value="${String((C().houtFactor || {})[wood] || 1).replace('.', ',')}"></label><button class="ghost small danger ml-del" data-act="mlmatdel" data-v="${esc(wood)}">Verwijderen</button></div>
    ${shut ? '' : `
    ${(() => { const d = (db.matDatum || {})[wood], mnd = d ? Math.floor((Date.now() - new Date(d).getTime()) / (864e5 * 30.4)) : null;
      return `<div class="row wrap small ml-bulk"><span class="${mnd !== null && mnd >= 9 ? 'warnc' : 'muted'}">${d ? `Prijzen bijgewerkt op ${new Date(d).toLocaleDateString('nl-NL')}${mnd >= 9 ? ` (${mnd} maanden geleden – controleer ze)` : ''}` : 'Prijsdatum onbekend'}</span>
        <span class="nowrap">Alle prijzen van ${esc(wood)} <input class="w3 num" id="${id}-bulk" placeholder="+6" title="Percentage: 6 = 6% duurder, -3 = 3% goedkoper"> % <button class="small" data-act="mlbulk" data-id="${id}" data-v="${esc(wood)}">Aanpassen</button></span></div>`; })()}
    ${subs.map((s, j) => subBlockHtml(s, `${id}-${j}`)).join('')}
    <div class="ml-addsub"><b class="small">Plank soort toevoegen</b>
      <input class="w10" id="${id}-sn" placeholder="bv. Panelen, Massief, Gelamineerd">
      <span class="nowrap small">dikte <input class="w3 num" id="${id}-sg" placeholder="50" title="Bruto dikte"> bruto → <input class="w3 num" id="${id}-st" placeholder="40" title="Netto dikte"> netto mm</span>
      <button class="small primary" data-act="mlsubnew" data-id="${id}" data-v="${esc(wood)}">+ Plank soort</button></div>`}
  </section>`;
}

function scrMaterials() {
  const names = woodNames();
  return pageHead('Materialen', 'Per houtsoort de plank soorten (met dikte) en per plank soort de maten die je kunt bestellen, elk met een eigen prijs. Welk onderdeel van de trap uit welk hout komt, kies je per project bij <i>Hout</i>; de app kiest zelf de voordeligste lengtes. <b>De voorbeeldprijzen zijn indicatief.</b>',
      `<label class="btn">Excel/CSV inlezen<input type="file" accept=".csv,.txt,.tsv" data-act="mcsv" hidden></label><button data-act="mexample">Voorbeeldbestand</button><button data-act="mexport">Exporteren</button>`) + `
    <section class="card ml-new"><b class="small">Nieuwe houtsoort</b>
      <input id="mlnew-name" class="w12" placeholder="bv. Rustiek eiken, Beuken">
      <button class="primary" data-act="mlnew">+ Houtsoort</button>
      ${names.length > 1 ? `<span class="ml-jump">${names.map(n => `<a href="#" data-act="mljump" data-v="${esc(n)}">${esc(n)}</a>`).join('')}</span>` : ''}</section>
    ${names.map((n, i) => woodCardHtml(n, i)).join('') || '<section class="card"><p class="muted">Nog geen houtsoorten. Typ hierboven een naam en klik op "+ Houtsoort".</p></section>'}
    <details class="card sub"><summary>Plakken uit Excel</summary>
      <p class="muted small">Kolommen (met kopregel, volgorde vrij): <b>${M.CSV_HEAD.join(' · ')}</b>. "per" is stuk, m3, dm3, m2 of m1.
        Een kolom "voorraad" mag leeg blijven (voorraad wordt niet bijgehouden). Klik op <i>Voorbeeldbestand</i> voor een bestand dat je in Excel kunt openen en aanvullen.</p>
      <textarea id="csvpaste" rows="5" style="width:100%" placeholder="Selecteer in Excel de regels (met kopregel), kopieer en plak hier"></textarea>
      <div class="row"><button data-act="mpaste">Geplakte regels toevoegen</button><button class="ghost" data-act="mreset">Voorbeeldlijst herstellen</button></div></details>`;
}
// nieuwe maten uit de invoerregel van een plank soort
function readAddRow(id, wood, sub) {
  const val = (k) => ((document.getElementById(id + '-' + k) || {}).value || '').trim();
  const num = (s) => parseFloat(String(s).replace(',', '.'));
  const list = (s) => [...new Set(s.split(/[\s,;\/]+/).map(num).filter(x => x > 0))];
  const ws = list(val('w')), ls = list(val('l')), n = Math.round(num(val('n')));
  const miss = [!ws.length && 'breedte', !ls.length && 'lengte'].filter(Boolean);
  if (miss.length) return { err: 'Vul nog in: ' + miss.join(' en ') + '.' };
  const ps = plankSoorten(wood).find(s => s.sub === sub); if (!ps) return { err: 'Plank soort niet gevonden.' };
  const ref = ps.rows[0];
  const rows = [];
  for (const w of ws) for (const l of ls) rows.push({ id: M.uid(), material: wood, sub, grossT: ps.grossT, netT: ps.netT, width: w, length: l,
    price: num(val('p')) || 0, priceMode: val('pm') || 'stuk', available: n > 0 ? n : null, stock: n > 0, supplier: ref ? ref.supplier || '' : '', types: ps.types ? ps.types.slice() : null });
  return { rows };
}
const sameSize = (a, m) => !!m.stock === !!a.stock && m.width === a.width && m.length === a.length;
// ingelezen maten toevoegen; bestaande maten (zelfde houtsoort, plank soort, breedte, lengte) krijgen de nieuwe prijs
function importRows(rows, src) {
  let nNew = 0, nUpd = 0;
  for (const r of rows) {
    const ex = db.materials.find(m => woodOf(m) === woodOf(r) && m.sub === r.sub && sameSize(r, m));
    if (ex) { Object.assign(ex, { grossT: r.grossT, netT: r.netT, price: r.price, priceMode: r.priceMode, available: r.available, supplier: r.supplier || ex.supplier }); nUpd++; }
    else { db.materials.push(r); nNew++; }
  }
  ui.msg = rows.length ? { text: `${src}: ${nNew} nieuwe maten, ${nUpd} bijgewerkt.`, kind: 'ok' } : { text: `${src}: geen maten gevonden. Controleer de kopregel (zie Voorbeeldbestand).`, kind: 'err' };
  save();
}
// voorbeeldbestand voor Excel: zelfde kolommen als inlezen en exporteren
function exampleCsv() {
  const ex = [
    ['Rustiek eiken', 'Massief 50 mm', 50, 40, 250, 2000, 72, 'stuk', '', 'Houthandel X', ''],
    ['Rustiek eiken', 'Massief 50 mm', 50, 40, 250, 3000, 105, 'stuk', '', 'Houthandel X', ''],
    ['Rustiek eiken', 'Massief 50 mm', 50, 40, 300, 4000, 2400, 'm3', '', 'Houthandel X', ''],
    ['Rustiek eiken', 'Panelen 40 mm', 42, 40, 650, 1200, 95, 'stuk', '', 'Houthandel X', 'treden'],
    ['Rustiek eiken', 'Panelen 40 mm', 42, 40, 650, 2500, 180, 'stuk', '', 'Houthandel X', 'treden'],
    ['Beuken', 'Gelamineerd 40 mm', 40, 40, 600, 3000, 65, 'm2', '', '', 'treden, trapbomen, leuningen'],
    ['Beuken', 'Massief 27 mm', 27, 22, 200, 3000, 9.5, 'm1', '', '', ''],
    ['Beuken', 'Massief 27 mm', 27, 22, 200, 2000, 2.6, 'dm3', 4, '', ''],
  ];
  return M.CSV_HEAD.join(';') + '\r\n' + ex.map(r => r.map(x => String(x).replace('.', ',')).join(';')).join('\r\n') + '\r\n';
}


CLICK.push(function click_materialen(a, t, v, p, e) {
  switch (a) {
    // ---- materialen (houtsoort › plank soort › maten) ----
    case 'mlnew': {
      const name = ((document.getElementById('mlnew-name') || {}).value || '').trim();
      if (!name) { ui.msg = { text: 'Typ eerst de naam van de houtsoort, bv. "Rustiek eiken".', kind: 'err' }; return render(); }
      if (woodNames().includes(name)) { ui.msg = { text: `"${name}" staat al in de lijst.`, kind: 'err' }; return render(); }
      keepWood(name); if (folded('ml-' + name)) toggleFold('ml-' + name);
      ui.msg = { text: `${name} toegevoegd. Voeg nu een plank soort toe (bv. Panelen of Massief) met de dikte.`, kind: 'ok' }; save(); render();
      setTimeout(() => { const s = document.querySelector(`.mlsec[data-mat="${CSS.escape(name)}"]`); if (s) { s.scrollIntoView({ block: 'start' }); const i = s.querySelector('.ml-addsub input'); if (i) i.focus(); } }, 0);
      break;
    }
    case 'mlsubnew': {
      const id = t.dataset.id, val = (k) => ((document.getElementById(id + '-' + k) || {}).value || '').trim(), num = (s) => parseFloat(String(s).replace(',', '.'));
      const sub = val('sn'), gt = num(val('sg')), nt = num(val('st')) || gt;
      const miss = [!sub && 'naam', !(gt > 0) && 'bruto dikte'].filter(Boolean);
      if (miss.length) { ui.msg = { text: 'Vul nog in: ' + miss.join(' en ') + '.', kind: 'err' }; return render(); }
      if (nt > gt) { ui.msg = { text: 'De netto dikte kan niet groter zijn dan de bruto dikte.', kind: 'err' }; return render(); }
      if (plankSoorten(v).some(s => s.sub === sub)) { ui.msg = { text: `"${sub}" bestaat al bij ${v}.`, kind: 'err' }; return render(); }
      keepSub({ material: v, sub, grossT: gt, netT: nt });
      if (folded('mlp:' + v + ':' + sub)) toggleFold('mlp:' + v + ':' + sub);
      ui.msg = { text: `${v} › ${sub} toegevoegd. Vul nu de maten in.`, kind: 'ok' }; save(); render();
      setTimeout(() => { const b = document.querySelector(`.mlsub[data-w="${CSS.escape(v)}"][data-s="${CSS.escape(sub)}"]`); if (b) { b.scrollIntoView({ block: 'center' }); const w = b.querySelector('tfoot input'); if (w) w.focus(); } }, 0);
      break;
    }
    case 'mladd': {
      const wood = t.dataset.w, sub = t.dataset.s;
      const r = readAddRow(t.dataset.id, wood, sub); if (r.err) { ui.msg = { text: r.err, kind: 'err' }; return render(); }
      const fresh = r.rows.filter(a => !subRows(wood, sub).some(m => sameSize(a, m)));
      db.materials.push(...fresh);
      const what = (n) => `${n} ${n === 1 ? 'maat' : 'maten'}`;
      ui.msg = { text: fresh.length ? `${what(fresh.length)} toegevoegd aan ${wood} › ${sub}.` + (fresh.length < r.rows.length ? ` (${r.rows.length - fresh.length} stonden er al)` : '') : 'Die maten stonden er al.', kind: fresh.length ? 'ok' : 'err' };
      save(); render();
      setTimeout(() => { const i = document.getElementById(t.dataset.id + '-w'); if (i) i.focus(); }, 0);
      break;
    }
    case 'mrowdel': {
      const m = db.materials.find(m => m.id === v); if (!m) break;
      // houtsoort en plank soort blijven staan, ook als de laatste maat weg is
      keepSub({ material: woodOf(m), sub: m.sub, grossT: m.grossT, netT: m.netT });
      db.materials = db.materials.filter(x => x.id !== v); save(); render(); break;
    }
    case 'mlsubdel': {
      const wood = t.dataset.w, sub = t.dataset.s, n = subRows(wood, sub).length;
      if (confirm(`Plank soort "${wood} › ${sub}"${n ? ` met ${n} maten` : ''} verwijderen?`)) {
        db.materials = db.materials.filter(m => !(woodOf(m) === wood && m.sub === sub));
        db.subExtra = (db.subExtra || []).filter(e => !(e.material === wood && e.sub === sub)); keepWood(wood); save();
      }
      render(); break;
    }
    // alle prijzen van één houtsoort met een percentage aanpassen (bv. prijsverhoging van de leverancier)
    case 'mlbulk': {
      const pct = parseFloat(((document.getElementById(t.dataset.id + '-bulk') || {}).value || '').replace(',', '.').replace('%', ''));
      if (!pct || Math.abs(pct) > 90) { ui.msg = { text: 'Vul een percentage in, bv. 6 (duurder) of -3 (goedkoper).', kind: 'err' }; return render(); }
      const rows = db.materials.filter(m => woodOf(m) === v); if (!rows.length || !confirm(`${rows.length} prijzen van ${v} ${pct > 0 ? 'verhogen' : 'verlagen'} met ${String(Math.abs(pct)).replace('.', ',')}%?`)) return render();
      for (const m of rows) m.price = Math.round(m.price * (1 + pct / 100) * 100) / 100;
      (db.matDatum = db.matDatum || {})[v] = new Date().toISOString();
      ui.msg = { text: `${rows.length} prijzen van ${v} ${pct > 0 ? '+' : '−'}${String(Math.abs(pct)).replace('.', ',')}%.`, kind: 'ok' }; save(); render(); break;
    }
    case 'mlmatdel': {
      const n = db.materials.filter(m => woodOf(m) === v).length;
      if (confirm(`Houtsoort "${v}"${n ? ` met ${n} maten` : ''} verwijderen?`)) {
        db.materials = db.materials.filter(m => woodOf(m) !== v); db.matExtra = (db.matExtra || []).filter(x => x !== v);
        db.subExtra = (db.subExtra || []).filter(e => e.material !== v); save();
      }
      render(); break;
    }
    case 'mljump': { if (folded('ml-' + v)) toggleFold('ml-' + v); render(); const s = document.querySelector(`.mlsec[data-mat="${CSS.escape(v)}"]`); if (s) s.scrollIntoView({ block: 'start' }); break; }
    case 'mexample': ZP.store.download('voorbeeld materialenlijst.csv', '﻿' + exampleCsv(), 'text/csv'); break;
    case 'mreset': if (confirm('Materialenlijst vervangen door de voorbeeldlijst?')) { db.materials = M.defaults(); save(); render(); } break;
    case 'mexport': ZP.store.download('materialenlijst.csv', '﻿' + M.toCsv(db.materials) + '\r\n', 'text/csv'); break;
    case 'mpaste': { importRows(M.parseCsv(document.getElementById('csvpaste').value), 'geplakte regels'); render(); break; }
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_materialen(b, t, p, part, numv) {
  switch (b) {
    // houtsoort-factor op de werkplaats-uren (costing houtFactor); 1 of leeg = geen invloed
    case 'mlfactor': { const f = numv(t.value), F = C().houtFactor = C().houtFactor || {}; if (f > 0 && Math.abs(f - 1) > 0.0001) F[t.dataset.v] = f; else delete F[t.dataset.v]; break; }
    case 'mlname': {
      // houtsoort hernoemen: geldt voor al zijn plank soorten, en voor de keuze bij Hout in projecten
      const old = t.dataset.v, nw = t.value.trim(); if (!nw || nw === old) break;
      if (woodNames().includes(nw)) { ui.msg = { text: `"${nw}" bestaat al. Kies een andere naam.`, kind: 'err' }; break; }
      for (const m of db.materials.filter(m => woodOf(m) === old)) m.material = nw;
      if (ZP.fotos.heeft('hout', old)) { const f = ZP.fotos.get('hout', old); ZP.fotos.set('hout', nw, f); ZP.fotos.del('hout', old); }
      if (ZP.fotos.heeft('nerf', old)) { const f = ZP.fotos.get('nerf', old); ZP.fotos.set('nerf', nw, f); ZP.fotos.del('nerf', old); }
      const hk = C().houtKleur; if (hk && hk[old]) { hk[nw] = hk[old]; delete hk[old]; }   // kleur/nerf in de tekening (spectekening.js)
      db.matExtra = (db.matExtra || []).map(x => x === old ? nw : x);
      for (const e of db.subExtra || []) if (e.material === old) e.material = nw;
      for (const pr of db.projects) for (const k of Object.keys(pr.typeMaterial || {})) {
        const c = pr.typeMaterial[k]; if (c === old || c.startsWith(old + M.SEP)) pr.typeMaterial[k] = nw + c.slice(old.length);
      }
      if (folded('ml-' + old)) { toggleFold('ml-' + old); toggleFold('ml-' + nw); }
      break;
    }
    case 'mlsubname': {
      const wood = t.dataset.w, old = t.dataset.s, nw = t.value.trim(); if (!nw || nw === old) break;
      if (plankSoorten(wood).some(s => s.sub === nw)) { ui.msg = { text: `"${nw}" bestaat al bij ${wood}.`, kind: 'err' }; break; }
      for (const m of subRows(wood, old)) m.sub = nw;
      for (const e of db.subExtra || []) if (e.material === wood && e.sub === old) e.sub = nw;
      for (const pr of db.projects) for (const k of Object.keys(pr.typeMaterial || {})) if (pr.typeMaterial[k] === wood + M.SEP + old) pr.typeMaterial[k] = wood + M.SEP + nw;
      break;
    }
    case 'mlsubt': {
      // dikte hoort bij de plank soort: geldt voor al zijn maten
      const wood = t.dataset.w, sub = t.dataset.s, f = t.dataset.f, x = numv(t.value);
      if (!(x > 0)) { ui.msg = { text: 'Vul een dikte in.', kind: 'err' }; break; }
      const ps = plankSoorten(wood).find(s => s.sub === sub); if (!ps) break;
      const gt = f === 'grossT' ? x : ps.grossT, nt = f === 'netT' ? x : ps.netT;
      if (nt > gt) { ui.msg = { text: 'De netto dikte kan niet groter zijn dan de bruto dikte.', kind: 'err' }; break; }
      for (const m of subRows(wood, sub)) { m.grossT = gt; m.netT = nt; }
      for (const e of db.subExtra || []) if (e.material === wood && e.sub === sub) { e.grossT = gt; e.netT = nt; }
      break;
    }
    case 'mlsup': for (const m of db.materials.filter(m => woodOf(m) === t.dataset.v)) m.supplier = t.value.trim(); break;
    case 'mlsubtype': {
      // voor welke onderdelen deze plank soort geschikt is (bv. gelamineerd niet voor spillen); alles aan = alle onderdelen
      const wood = t.dataset.w, sub = t.dataset.s, ps = plankSoorten(wood).find(s => s.sub === sub); if (!ps) break;
      const cur = new Set(ps.types && ps.types.length ? ps.types : M.TYPE_KEYS);
      if (t.checked) cur.add(t.dataset.t); else cur.delete(t.dataset.t);
      if (!cur.size) { ui.msg = { text: 'Minstens één onderdeel moet aan staan.', kind: 'err' }; break; }
      const types = cur.size === M.TYPE_KEYS.length ? null : M.TYPE_KEYS.filter(k => cur.has(k));
      for (const m of subRows(wood, sub)) m.types = types ? types.slice() : null;
      for (const e of db.subExtra || []) if (e.material === wood && e.sub === sub) e.types = types ? types.slice() : null;
      break;
    }
    case 'm': {
      const m = db.materials.find(m => m.id === t.dataset.id); const fld = t.dataset.f;
      if (fld === 'price' || fld === 'priceMode') (db.matDatum = db.matDatum || {})[woodOf(m)] = new Date().toISOString();   // prijsdatum per houtsoort
      if (fld === 'stock') m.stock = t.checked;
      else if (fld === 'types') {
        // aanvinken per onderdeelsoort; alles aan (of alles uit) = geschikt voor alle soorten
        const cur = new Set(m.types && m.types.length ? m.types : M.TYPE_KEYS);
        if (t.checked) cur.add(t.dataset.t); else cur.delete(t.dataset.t);
        m.types = cur.size === M.TYPE_KEYS.length || cur.size === 0 ? null : M.TYPE_KEYS.filter(k => cur.has(k));
      }
      else if (['material', 'supplier', 'priceMode'].includes(fld)) m[fld] = t.value;
      else if (fld === 'stockN') { const n = Math.round(numv(t.value)); m.stock = n > 0; m.available = n > 0 ? n : null; }
      else if (fld === 'available') m.available = t.value.trim() === '' ? null : numv(t.value);
      else m[fld] = numv(t.value);
      break;
    }
    default: return false;
  }
});
