// Gebeurtenissen: klikken/wijzigen verdelen over de schermen (CLICK/CHANGE), sneltoetsen, start van de app. Wordt als laatste geladen.
// ---------------- gebeurtenissen ----------------
function afterRender() {
  const drop = document.getElementById('drop');
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); stageFiles([...e.dataTransfer.files]); });
  }
  if (ui.screen === 'indeling') bindDrag();
  if (ui.screen === 'uitvoering') { mount3d(); bindOps(); }   // 3D en opstelling staan bij Uitvoering
  if (ui.screen === 'configurator') { bindVb(); mountCf3d(); bindSchets(); }
  if (ui.screen === 'projecten') bindMappen();
  if (kpAan()) { if (ui.screen === 'koppeling') kpQr(); kpMeld(); }   // aan gekoppelde apparaten laten weten aan welk project hier gewerkt wordt
  // Prijzen en normen: zoekterm → alleen de kaarten/rijen tonen waar de term in staat (ook in invoervelden)
  if (ui.screen === 'prijzen' && ui.prZoek) { const q = ui.prZoek.toLowerCase();
    for (const el of document.querySelectorAll('main .bwcard, main .balcard, main section.pcard2 table tbody tr')) {
      const tekst = (el.textContent + ' ' + [...el.querySelectorAll('input:not([type=file]):not([type=checkbox])')].map(i => i.value).join(' ')).toLowerCase();
      el.hidden = !tekst.includes(q); }
    for (const s of document.querySelectorAll('main section.pcard2')) s.hidden = ![...s.querySelectorAll('.bwcard, .balcard, table tbody tr')].some(e => !e.hidden); }
  if (ui.screen === 'klant') bindSpecBlad();                   // specificatiestaat en tekeningblad staan bij Klant
  sectieNav();
}
// ---------------- lange pagina's: balk "Ga naar" met de onderdelen, alles in-/uitklappen, knop "naar boven" ----------------
function sectieNav() {
  const main = document.querySelector('main'); if (!main) return;
  const lijst = snavKaarten().map(s => { const fb = s.querySelector(':scope > * > .foldbtn'), h = fb.parentElement;
    const e = h.querySelector('h2,h3,h4,b,strong'), inp = h.querySelector('input.ml-name, input.stair-name'), code = h.querySelector('.scode');
    let t = ((code ? code.textContent.trim() + ' · ' : '') + (e ? e.textContent : inp ? inp.value : '')).replace(/\s+/g, ' ').trim();
    // meerdere trappen onder elkaar (Controleren): trapletter ervoor
    const blok = s.closest('.stairblock'), blokken = blok ? [...main.querySelectorAll('.stairblock')] : [];
    if (blokken.length > 1) t = String.fromCharCode(65 + blokken.indexOf(blok)) + ' · ' + t;
    return { s, t, k: fb.dataset.v }; }).filter(x => x.t);
  // alleen op lange pagina's – of als er iets ingeklapt is (anders verdwijnt "Alles uitklappen" na inklappen)
  if (lijst.length < 3 || (document.scrollingElement.scrollHeight < innerHeight * 1.8 && !lijst.some(x => folded(x.k)))) return;
  const kort = (t) => t.length > 30 ? t.slice(0, 28) + '…' : t, open = lijst.filter(x => !folded(x.k)).length;
  const nav = document.createElement('nav'); nav.className = 'snav no-print'; nav.setAttribute('aria-label', 'Onderdelen van deze pagina');
  nav.innerHTML = `<span class="snav-l">Ga naar</span><div class="snav-chips">${lijst.map((x, i) => `<button class="snav-chip ${folded(x.k) ? 'dicht' : ''}" data-i="${i}" title="${esc(x.t)}${folded(x.k) ? ' (ingeklapt – wordt uitgeklapt)' : ''}">${esc(kort(x.t))}</button>`).join('')}</div>
    <div class="snav-r"><button class="small ghost" data-snav="dicht" ${open ? '' : 'disabled'} title="Alle onderdelen inklappen: alleen de koppen blijven staan">Alles inklappen</button><button class="small ghost" data-snav="open" ${open === lijst.length ? 'disabled' : ''}>Alles uitklappen</button></div>`;
  // onder de vaste kerncijferbalk van de begroting (.bbalk) als die er is, anders onder de paginakop
  const kop = main.querySelector('.phd'), bb = main.querySelector('.bbalk');
  if (bb) { bb.after(nav); nav.style.top = bb.offsetHeight + 'px'; } else if (kop) kop.after(nav); else main.prepend(nav);
  const naar = (k) => { const fb = document.querySelector(`main .foldbtn[data-v="${CSS.escape(k)}"]`), s = fb && fb.closest('section.card'); if (!s) return;
    const nb = document.querySelector('.snav'), off = (nb ? nb.offsetHeight : 0) + (bb ? bb.offsetHeight : 0) + 12; window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - off, behavior: 'smooth' }); };
  nav.addEventListener('click', (e) => {
    const c = e.target.closest('.snav-chip'), b = e.target.closest('[data-snav]');
    if (c) { const x = lijst[+c.dataset.i]; if (folded(x.k)) { toggleFold(x.k); render(); } naar(x.k); }
    if (b) { const dicht = b.dataset.snav === 'dicht'; for (const x of lijst) if (folded(x.k) !== dicht) toggleFold(x.k); render(); }
  });
  snavSpy();
}
// kaarten met een inklapknop in hun kopregel (niet genest, niet alleen-afdruk)
const snavKaarten = () => [...document.querySelectorAll('main section.card')].filter(s => !s.closest('.print-only') && !s.parentElement.closest('section.card') && s.querySelector(':scope > * > .foldbtn'));
// actieve chip volgen tijdens scrollen; knop "naar boven"
function snavSpy() {
  const nav = document.querySelector('.snav'), top = document.querySelector('.naarboven');
  if (top) top.classList.toggle('on', scrollY > 1200);
  if (!nav) return;
  const lijn = nav.getBoundingClientRect().bottom + 30; let act = 0;
  snavKaarten().forEach((s, i) => { if (s.getBoundingClientRect().top < lijn) act = i; });
  nav.querySelectorAll('.snav-chip').forEach((c, i) => c.classList.toggle('on', i === act && scrollY > 40));
}
(function () {
  const maak = () => { if (document.querySelector('.naarboven')) return; const b = document.createElement('button'); b.className = 'naarboven no-print'; b.title = 'Naar boven'; b.setAttribute('aria-label', 'Naar boven'); b.textContent = '↑';
    b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })); document.body.appendChild(b); };
  if (document.body) maak(); else document.addEventListener('DOMContentLoaded', maak);
  let t = 0; window.addEventListener('scroll', () => { if (t) return; t = requestAnimationFrame(() => { t = 0; snavSpy(); }); }, { passive: true });
})();
CLICK.push(function click_events(a, t, v, p, e) {
  switch (a) {
    case 'go': { const ander = ui.screen !== v; ui.screen = v; ui.msg = null; ui.menuOpen = false; render(); if (ander) window.scrollTo(0, 0); break; }
    case 'closemsg': ui.msg = null; render(); break;
    // projecttabbladen
    case 'ongedaan': undoGlobaal(); break;
    case 'tab': tabOpen(v); break;
    case 'tabdicht': tabSluit(v); break;
    case 'fold': toggleFold(v); render(); break;
    case 'print': window.print(); break;
    // foto groot bekijken (keuzetegels, beheer, foto's van de situatie)
    case 'fotozoom': { const k = t.dataset.kind; toonFoto(k === 'situatie' ? ((p && p.config && p.config.fotos.find(f => f.id === v)) || {}).img : fotoVan(k, v), t.dataset.t || ''); break; }
    case 'fotodel': { const k = t.dataset.kind; ZP.fotos.del(k, v).then(() => {}, () => {}); if (FOTO_OUD.includes(k)) { const o = imgList(k).find(x => x.id === v); if (o) delete o.img; save(); } render(); break; }
    // menu (smal scherm, bv. iPad staand): uitschuiven over de inhoud en weer dicht
    case 'menu': ui.menuOpen = !ui.menuOpen; render(); break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_events(b, t, p, part, numv) {
  switch (b) {
    case 'pname': p.name = t.value; break;
    default: return false;
  }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  const a = t.dataset.act, v = t.dataset.v; const p = proj();
  if (t.tagName === 'A') e.preventDefault();
  if (a !== 'closemsg') ui.msg = null;
    for (const h of CLICK) if (h(a, t, v, p, e) !== false) return;
  });
// middelste muisknop op een project of tabblad: openen op de achtergrond / tabblad sluiten
document.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return; const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'open') { e.preventDefault(); tabOpen(t.dataset.v, { achtergrond: true }); }
  else if (t.dataset.act === 'tab' || t.dataset.act === 'tabdicht') { e.preventDefault(); tabSluit(t.dataset.v); }
});
// sneltoetsen (niet tijdens typen): Ctrl+Z = ongedaan maken (buiten de indeling), 1–8 = naar die stap, / = projecten zoeken
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable || ui.busy) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && ui.screen !== 'indeling' && proj() && !GLOBAAL.includes(ui.screen)) { e.preventDefault(); return undoGlobaal(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-8]$/.test(e.key) && proj() && SCREENS[+e.key - 1]) { e.preventDefault(); const k = SCREENS[+e.key - 1][0], ander = ui.screen !== k; ui.screen = k; ui.msg = null; render(); if (ander) window.scrollTo(0, 0); return; }
  if (e.key === '/') { e.preventDefault(); ui.screen = 'projecten'; render(); const z = document.querySelector('[data-bind=pzoek]'); if (z) z.focus(); }
});
// sneltoetsen tabbladen: Alt+→ / Alt+← = volgend/vorig projecttabblad (Ctrl+Tab en Ctrl+W houdt de browser zelf)
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || tabs.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  e.preventDefault(); const i = Math.max(0, tabs.findIndex(t => t.pid === db.current)), n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  tabOpen(n.pid);
});
document.addEventListener('change', async (e) => {
  const t = e.target; const p = proj();
  if (t.dataset.act === 'files') { const fl = [...t.files]; t.value = ''; return stageFiles(fl, t.dataset.s || null); }
  if (t.dataset.act === 'planpdf') { const fl = t.files[0]; t.value = ''; return leesPlan(fl, t.dataset.s); }
  if (t.dataset.act === 'restore') {
    try { const d = JSON.parse(await t.files[0].text()); if (!d.projects) throw new Error('geen back-up'); if (d.fotos) { await ZP.fotos.zetAlles(d.fotos); delete d.fotos; } Object.assign(db, d); db.materials = M.normalize(db.materials || [], 'Massief'); db.matExtra = db.matExtra || []; db.subExtra = db.subExtra || []; db.settings = ZP.store.deepMerge(M.defaultSettings(), d.settings || {}); ui.msg = { text: 'Back-up teruggezet.', kind: 'ok' }; save(); }
    catch (err) { ui.msg = { text: 'Back-up niet leesbaar: ' + err.message, kind: 'err' }; }
    return render();
  }
  if (t.dataset.act === 'imgup') {
    // eigen tekening/foto bij een bewerking of spijltype (verkleind, bewaard in de browser)
    const fl = t.files[0]; t.value = ''; if (!fl) return;
    const o = imgList(t.dataset.kind).find(x => x.id === t.dataset.id); if (!o) return;
    try { o.img = await ZP.drawings.shrink(fl); ui.msg = { text: `Afbeelding toegevoegd aan "${o.naam}".`, kind: 'ok' }; save(); }
    catch (err) { ui.msg = { text: err.message, kind: 'err' }; }
    return render();
  }
  if (t.dataset.act === 'fotoup') {
    // eigen foto bij een keuze (houtsoort, afwerking, bewerking, spijltype, profiel, spil, drager): groot genoeg om te vergroten
    const fl = t.files[0]; t.value = ''; if (!fl) return;
    const k = t.dataset.kind, id = t.dataset.id;
    try { await ZP.fotos.set(k, id, await ZP.drawings.shrink(fl, 1400)); if (FOTO_OUD.includes(k)) { const o = imgList(k).find(x => x.id === id); if (o && o.img) { delete o.img; save(); } } ui.msg = { text: 'Foto toegevoegd.', kind: 'ok' }; }
    catch (err) { ui.msg = { text: 'Foto niet opgeslagen: ' + ((err && err.message) || err), kind: 'err' }; }
    return render();
  }
  if (t.dataset.act === 'cffoto') {
    // foto's van de situatie bij de klant (verkleind)
    const fl = [...t.files]; t.value = ''; const c = p.config;
    for (const f of fl) { try { c.fotos.push({ id: 'f' + Date.now().toString(36) + c.fotos.length, img: await ZP.drawings.shrink(f, 900) }); } catch (err) { ui.msg = { text: err.message, kind: 'err' }; } }
    save(); return render();
  }
  if (t.dataset.act === 'normxlsx') {
    const fl = t.files[0]; t.value = '';
    return readNorms(fl);
  }
  if (t.dataset.act === 'mcsv') { const fl = t.files[0]; t.value = ''; importRows(M.parseCsv(await fl.text()), fl.name); return render(); }
  ui.msg = null;
  if (t.dataset.act === 'moveto') return t.value && moveTo(t.value);
  if (t.dataset.act === 'resize') return t.value && resizeBoard(t.value);
  const b = t.dataset.bind; if (!b) return;
  const part = t.dataset.id && p ? p.parts.find(x => x.id === t.dataset.id) : null;
  const numv = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
    for (const h of CHANGE) { const r = h(b, t, p, part, numv); if (r === false) continue; if (r !== 'skip') { save(); render(); } return; }
  });
// opstelling: Esc = stoppen met tekenen (wand/balustrade)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || ui.screen !== 'uitvoering' ||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (ui.opsStart || ui.opsBal) { ui.opsStart = null; ui.opsBal = null; render(); }
});
// sneltoetsen in de indeling (niet tijdens typen in een veld)
document.addEventListener('keydown', (e) => {
  if (ui.screen !== 'indeling' || ui.busy) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return doUndo(); }
  if (!ui.piece) return;
  const f = findBoard(ui.board); if (!f) return;
  const q = f.b.pl.find(x => x.piece === ui.piece); if (!q) return;
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); return rotatePiece(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return unplace(); }
  if (e.key === 'Escape') { ui.piece = null; return render(); }
  const step = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
  if (!d) return;
  e.preventDefault();
  if (d[1] && q.edge) { ui.msg = { text: 'Een trede blijft met de neus op de rand of middenlijn; alleen links/rechts schuiven.', kind: 'err' }; return render(); }
  const old = { x: q.x, y: q.y };
  pushUndo();
  q.x += d[0]; q.y += d[1]; LY.place(q, q.pc, f.l.rectMode);
  if (!LY.valid(f.b, q)) { q.x = old.x; q.y = old.y; LY.place(q, q.pc, f.l.rectMode); undo.pop(); ui.msg = { text: 'Verder schuiven kan niet: zaagsnede of plankrand.', kind: 'err' }; return render(); }
  afterEdit();
});
// opslaan mislukt (bv. browseropslag vol): niet stil laten gebeuren
ZP.store.onError = (err) => { ui.msg = { text: 'Opslaan is mislukt (' + (err && err.name === 'QuotaExceededError' ? 'browseropslag vol' : err && err.message) + '). Maak een back-up via Projecten en verwijder oude projecten.', kind: 'err' }; render(); };

window.ZPapp = { db, ui, render, applyImport, calculate, proj, newProject, layouts, inputHash, doUndo, tabOpen, tabSluit, get tabs() { return tabs; }, folded, toggleFold };
render();
// foto's komen asynchroon uit IndexedDB: daarna opnieuw tekenen
ZP.fotos.ready.then(() => { if (ZP.fotos.aantal) render(); });
ZP.fotos.onError = ZP.store.onError;
// smal ↔ breed (iPad draaien): menu opnieuw opbouwen
(function () { let smal = smalScherm(); addEventListener('resize', () => { const s = smalScherm(); if (s !== smal) { smal = s; ui.menuOpen = false; render(); } }); })();
