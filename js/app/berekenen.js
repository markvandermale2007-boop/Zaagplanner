// Berekenen van de indeling (optimalisatie starten, verouderd-melding)
// ---------------- berekenen ----------------
// Vingerafdruk van alles wat de indeling bepaalt. Wijkt die af van die bij de berekening, dan is de
// indeling verouderd: dat wordt gemeld (met knop), in plaats van de indeling stilletjes te wissen.
function inputHash(p) {
  const st = Object.assign({}, S()); delete st.timeBudget;
  const parts = p.parts.map(x => [x.id, x.include, x.material, x.thickness, x.make, x.type, Math.round(x.L), Math.round(x.W), x.poly.length, Math.round(x.poly[0][0]), Math.round(x.poly[0][1])]);
  const mats = db.materials.map(m => [m.id, m.material, m.sub, m.grossT, m.netT, m.width, m.length, m.price, m.priceMode, m.types, m.available, m.stock]);
  const s = JSON.stringify([parts, p.typeMaterial || {}, p.groupCfg || {}, st, mats, p.stairs.map(x => P.aantalVan(x))]);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + s.length.toString(36);
}
const isStale = (p) => !!(p.calcHash && p.calcHash !== inputHash(p));
function staleBanner(p) {
  if (!isStale(p)) return '';
  return `<div class="warn stale no-print"><b>Deze indeling is verouderd.</b> Na de berekening zijn onderdelen, materialen of instellingen gewijzigd.
    <button class="small" data-act="calc">Opnieuw berekenen</button></div>`;
}
async function calculate(variants) {
  const p = proj(), st = S();
  const groups = N.groupsOf(p.parts, st, p.typeMaterial, db.materials, p.stairs);
  if (!groups.length) { ui.msg = { text: 'Geen onderdelen die meedoen.', kind: 'err' }; return render(); }
  // handwerk niet ongemerkt overschrijven
  const edited = variants.filter(v => p.edited && p.edited[v] && p.layouts[v] && Object.keys(p.layouts[v]).length);
  if (edited.length && !confirm(`Je hebt de indeling "${edited.map(v => N.VARIANTS[v].label).join('", "')}" met de hand aangepast. Opnieuw berekenen overschrijft die aanpassingen. Doorgaan?`)) return;
  N.stopFlag = false;
  const total = groups.length * variants.length; let k = 0;
  for (const v of variants) {
    const set = {};
    for (const g of groups) {
      setBusy(`${N.VARIANTS[v].label}: ${g.material} ${g.thickness} mm (${g.parts.length} onderdelen)…`, k / total);
      const t0 = performance.now();
      const res = await N.optimizeGroup(g, db.materials, st, p.groupCfg[g.key], v, (it) => setBusy(`${N.VARIANTS[v].label}: ${g.material} ${g.thickness} mm — ronde ${it}`, (k + Math.min(1, (performance.now() - t0) / (st.timeBudget * 1000))) / total));
      set[g.key] = LY.fromResult(res, st);
      k++;
    }
    p.layouts[v] = set;
    if (p.edited) delete p.edited[v];
  }
  p.variant = variants.includes(p.variant) ? p.variant : variants[0];
  p.calcHash = inputHash(p);
  undo.length = 0;
  const stopped = N.stopFlag; N.stopFlag = false;
  ui.busy = null; ui.board = null; ui.piece = null; ui.screen = 'indeling';
  if (stopped) ui.msg = { text: 'Berekening gestopt; dit is de beste indeling tot dat moment.', kind: 'ok' };
  save(); render();
}
function setBusy(text, f) { ui.busy = { text, f }; const el = document.querySelector('.busy'); if (el) { el.querySelector('.btxt').textContent = text; el.querySelector('i').style.width = Math.round(f * 100) + '%'; } else render(); }


CLICK.push(function click_berekenen(a, t, v, p, e) {
  switch (a) {
    case 'stopcalc': N.stopFlag = true; t.disabled = true; t.textContent = 'Stoppen…'; break;
    case 'calc': calculate([p.variant || 'hout']); break;
    case 'calcall': calculate(Object.keys(N.VARIANTS)); break;
    case 'pickvariant': p.variant = v; ui.board = ui.piece = null; save(); render(); break;
    default: return false;
  }
});
