// Scherm 6 Afdrukken
// ---------------- 5 Afdrukken ----------------
function scrPrint() {
  const p = proj(), st = S(), o = ui.printOpts;
  const lays = layouts(p);
  if (!lays.length) return pageHead('Afdrukken', 'Zaagschema\'s, inkooplijst en etiketten.') + `<section class="card empty-state"><h3>Eerst een indeling berekenen</h3><button class="primary" data-act="go" data-v="indeling">Naar indeling</button></section>`;
  const nums = boardNumbering(lays);
  const opt = (k, t) => `<label><input type="checkbox" data-bind="popt" data-v="${k}" ${o[k] ? 'checked' : ''}> ${t}</label>`;
  let pages = '';
  const date = new Date().toLocaleDateString('nl-NL');
  const header = (t) => `<div class="phead"><b>${esc(p.name)}</b><span>${esc(t)}</span><span>${date} · ${N.VARIANTS[p.variant || 'hout'].label}</span></div>`;
  if (o.boards) for (const l of lays) for (const b of l.boards) {
    const bs = N.boardStats(b, st), plan = LY.sawPlan(b, st);
    pages += `<div class="ppage">${header(`Plank P${nums.get(b.id)} van ${nums.size}`)}
      <h2>P${nums.get(b.id)} · ${esc(l.material)} ${b.stock.grossT} mm (netto ${l.thickness}) · ${b.stock.panel ? `verlijmd paneel ${b.stock.panel.planks.map(p => p.width).join(' + ')} → ` : ''}${f0(b.W)} × ${b.L} mm · vulling ${Math.round(bs.fill * 100)}%</h2>
      ${R.boardSVG(b, l, { S: st, plan, stats: bs })}
      <ol class="cuts print">${plan.cuts.map(c => `<li value="${c.n}">${esc(c.text)}${c.kind === 'dwars' ? ` op ${f0(c.x)} mm` : c.kind === 'langs' ? ` op ${f0(c.y)} mm vanaf rand A` : ''}</li>`).join('')}</ol>
      <div class="legend small">${legendHtml(b)}</div></div>`;
  }
  if (o.buy) {
    const pl = LY.purchaseList(lays);
    pages += `<div class="ppage">${header('Inkooplijst')}<h2>Inkooplijst</h2><table class="tbl"><thead><tr><th>Materiaal</th><th>Dikte bruto/netto</th><th>Breedte</th><th>Lengte</th><th>Aantal</th><th>m³</th><th>Prijs/st</th><th>Totaal</th><th>Leverancier</th></tr></thead><tbody>
      ${pl.map(e => `<tr><td>${esc(e.material)}${e.stock ? ' (voorraad)' : ''}</td><td>${e.grossT}/${e.netT}</td><td class="num">${e.width}</td><td class="num">${e.length}</td><td class="num">${e.n}</td><td class="num">${(e.vol * e.n / 1000).toFixed(3)}</td><td class="num">${eur(e.price)}</td><td class="num">${eur(e.price * e.n)}</td><td>${esc(e.supplier || '')}</td></tr>`).join('')}
      ${pl.glue ? `<tr><td colspan="4">Verlijmen in de breedte (${pl.glue.seams} naden, ${f1(pl.glue.m)} m)</td><td></td><td></td><td></td><td class="num">${eur(pl.glue.total)}</td><td></td></tr>` : ''}
      <tr class="tot"><td colspan="4">Totaal</td><td class="num">${pl.reduce((a, e) => a + e.n, 0)}</td><td class="num">${(pl.reduce((a, e) => a + e.vol * e.n, 0) / 1000).toFixed(3)}</td><td></td><td class="num">${eur(pl.reduce((a, e) => a + e.price * e.n, 0) + (pl.glue ? pl.glue.total : 0))}</td><td></td></tr></tbody></table></div>`;
  }
  if (o.yield) {
    const sumByType = {};
    for (const s of summaryOf(p)) sumByType[s.group] = s;
    pages += `<div class="ppage">${header('Rendement')}<h2>Rendement per groep</h2><table class="tbl"><thead><tr><th>Groep</th><th>Onderdelen</th><th>Planken</th><th>Netto dm³</th><th>Ingekocht dm³</th><th>Rendement</th><th>Plankopp. × netto dikte</th><th>StairDesigner bruto</th></tr></thead><tbody>
      ${lays.map(l => { const s = LY.stats(l, st); const types = [...new Set(l.pieces.map(pc => P.TYPES[pc.type].label))]; const sd = types.reduce((a, t) => a + ((sumByType[t === 'Spillen' ? 'Trapspillen' : t] || {}).gross || 0), 0);
        return `<tr><td>${esc(l.material)} ${l.thickness} mm</td><td>${esc(types.join(', '))}</td><td class="num">${s.boards}</td><td class="num">${f1(s.netVol)}</td><td class="num">${f1(s.gross)}</td><td class="num">${s.gross ? Math.round(s.netVol / s.gross * 100) : 0}%</td><td class="num">${f1(s.compareVol)}</td><td class="num">${sd ? f1(sd) : '—'}</td></tr>`; }).join('')}</tbody></table>
      <p class="muted small">Ingekocht = bruto dikte × breedte × lengte. "Plankoppervlak × netto dikte" is direct vergelijkbaar met het bruto volume uit StairDesigner.</p></div>`;
  }
  if (o.parts) {
    const where = new Map();
    for (const l of lays) { for (const b of l.boards) for (const q of b.pl) { const k = q.pc.pid; (where.get(k) || where.set(k, []).get(k)).push('P' + nums.get(b.id) + (q.pc.lamel ? ` (lamel ${q.pc.lamel.k + 1})` : '')); } for (const id of l.unplaced) { const pc = l._pmap.get(id); (where.get(pc.pid) || where.set(pc.pid, []).get(pc.pid)).push('niet geplaatst'); } }
    const parts = P.sortParts(p.parts.filter(x => x.include));
    pages += `<div class="ppage">${header('Onderdelenlijst')}<h2>Onderdelenlijst</h2><table class="tbl"><thead><tr><th>Onderdeel</th><th>Materiaal</th><th>Maat</th><th>Plank</th><th></th></tr></thead><tbody>
      ${parts.map(x => { const lam = lays.flatMap(l => l.pieces.filter(pc => pc.pid === x.id && pc.lamel)).map(pc => pc.lamel);
        return `<tr><td>${esc(x.dispName || x.name)}</td><td>${esc(x.material)} ${x.thickness}</td><td class="num">${f0(x.L)} × ${f0(x.W)}</td><td>${esc((where.get(x.id) || ['—']).join(', '))}</td><td>${lam.length ? R.treadGlueSVG(x, lam, 160, 50) : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  if (o.rems) {
    const rows = [];
    for (const l of lays) for (const b of l.boards) for (const r of N.boardStats(b, st).rems) rows.push(`<tr><td>P${nums.get(b.id)}</td><td>${esc(l.material)}</td><td>${b.stock.grossT}</td><td class="num">${f0(r.w)} × ${f0(r.h)}</td></tr>`);
    pages += `<div class="ppage">${header('Restantenlijst')}<h2>Restantenlijst</h2><p class="muted small">Groter dan ${st.minRemnant.L} × ${st.minRemnant.W} mm.</p><table class="tbl"><thead><tr><th>Plank</th><th>Materiaal</th><th>Dikte</th><th>Maat</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4">Geen</td></tr>'}</tbody></table></div>`;
  }
  if (o.labels) {
    const labs = [];
    for (const l of lays) for (const b of l.boards) for (const q of b.pl) labs.push(`<div class="label"><b>${esc(q.pc.label)}</b><span>${esc(p.name)}</span><span>Plank P${nums.get(b.id)} · ${esc(l.material)} ${l.thickness} mm</span></div>`);
    pages += `<div class="ppage labels">${labs.join('')}</div>`;
  }
  return `<div class="no-print">${pageHead('Afdrukken', 'A4 liggend, één plank per pagina. Kies in het printvenster "Opslaan als PDF" voor een PDF-bestand.', '<button class="primary" data-act="print">Afdrukken / PDF</button>')}</div>
    <section class="card no-print"><div class="optgrid">${opt('boards', 'Zaagschema per plank')}${opt('buy', 'Inkooplijst')}${opt('yield', 'Rendement')}${opt('parts', 'Onderdelenlijst')}${opt('rems', 'Restantenlijst')}${opt('labels', 'Etiketten')}</div>
      <p class="small"><label><input type="checkbox" data-bind="popt" data-v="kleur" ${o.kleur ? 'checked' : ''}> In kleur afdrukken (houtkleuren en arcering, meer inkt)</label> <span class="muted">Standaard inktzuinig: zwarte lijnen op wit.</span></p></section>
    ${staleBanner(p)}<div class="pa-kop no-print"><b>Voorbeeld</b><span class="muted small">${ui.paGroot ? 'alle pagina’s op ware grootte' : 'klik een pagina om hem groot te bekijken'}</span>
      <button class="small" data-act="pagroot">${ui.paGroot ? 'Miniaturen' : 'Alles groot'}</button></div>
    <div class="print-area ${o.kleur ? '' : 'inktzuinig'} ${ui.paGroot ? '' : 'mini'}">${pages.replace(/<div class="ppage/g, '<div data-act="ppgroot" class="ppage')}</div>`;
}


CLICK.push(function click_afdrukken(a, t) {
  switch (a) {
    case 'pagroot': ui.paGroot = !ui.paGroot; render(); break;
    // miniatuur aanklikken: groot (over de hele breedte) en weer klein, zonder opnieuw te tekenen
    case 'ppgroot': if (!t.closest('.print-area.mini')) return false; t.classList.toggle('groot'); if (t.classList.contains('groot')) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_afdrukken(b, t, p, part, numv) {
  switch (b) {
    case 'popt': ui.printOpts[t.dataset.v] = t.checked; break;
    default: return false;
  }
});
