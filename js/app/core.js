// Zaagplanner – kern: opslag, toestand (db, ui), hulpfuncties, schermopbouw. Wordt als eerste geladen.
const G = ZP.geom, P = ZP.parts, M = ZP.materials, N = ZP.nest, LY = ZP.layout, R = ZP.render, esc = R.esc;
const db = ZP.store.load();
// Configurator uit (wens gebruiker: hij tekent de trap zelf). De code blijft bestaan; met true komt alles terug.
// Uit = geen menu-item, cfAuto zet niets door, specificatiestaat/offerte/tekening gebruiken geen configurator-variant.
let CONFIGURATOR = false;   // let: de acceptatietest zet hem tijdelijk aan voor de oude configurator-punten
// startscherm: indeling als er een tekening is, anders importeren (of de configurator als die aan staat)
const startScreen = () => { const p = db.projects.find(x => x.id === db.current); return !p ? 'projecten' : (p.parts || []).length ? 'indeling' : CONFIGURATOR && p.config ? 'configurator' : 'importeren'; };
const ui = { screen: startScreen(), group: null, board: null, piece: null, busy: null, msg: null, lastImport: null, sel3d: new Set(), bwPick: null, printOpts: { boards: true, buy: true, yield: true, parts: true, rems: true, labels: false } };
const SCREENS = [
  ['importeren', '1 Tekening'], ['controleren', '2 Controleren'], ['uitvoering', '3 Uitvoering'], ['hout', '4 Planken'], ['indeling', '5 Zagen'], ['begroting', '6 Prijs'], ['klant', '7 Klant'], ['afdrukken', '8 Werkplaats'],
];
const f0 = (v) => (Math.round(v) || 0).toLocaleString('nl-NL');
const f1 = (v) => (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v) => (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (v) => '€ ' + (+v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const S = () => db.settings;
const proj = () => { const p = db.projects.find(p => p.id === db.current) || null; if (p) ensureStairs(p); return p; };

// ---------------- trappen binnen een project ----------------
// Een project kan meerdere trappen bevatten; elke trap heeft eigen bestanden en onderdelen,
// maar alles wordt samen ingedeeld zodat trappen planken kunnen delen.
function ensureStairs(p) {
  if (p.stairs) return p;
  p.stairs = [];
  if ((p.parts || []).length || (p.files && (p.files.dxf || p.files.pdf))) {
    p.stairs.push({ id: 's1', name: p.name, files: p.files || {}, sawList: p.sawList || [], summary: p.summary || [], importWarnings: p.importWarnings || [], changes: p.changes || null });
    for (const x of p.parts) x.stair = x.stair || 's1';
  }
  refreshNames(p);
  return p;
}
const stairCode = (p, sid) => { const i = p.stairs.findIndex(s => s.id === sid); return i < 0 ? '?' : String.fromCharCode(65 + i); };
const stairOf = (p, sid) => p.stairs.find(s => s.id === sid);
function refreshNames(p) {
  const multi = p.stairs.length > 1;
  for (const x of p.parts) x.dispName = multi ? `${stairCode(p, x.stair)}·${x.name}` : x.name;
}
// StairDesigner-samenvatting (bruto/netto per groep) opgeteld over alle trappen
function summaryOf(p) {
  const m = new Map();
  for (const s of p.stairs) for (const r of (s.summary || [])) { const e = m.get(r.group) || { group: r.group, material: r.material, gross: 0, net: 0 }; e.gross += r.gross || 0; e.net += r.net || 0; m.set(r.group, e); }
  return [...m.values()];
}
function newStairId(p) { let n = 1; while (p.stairs.some(s => s.id === 's' + n)) n++; return 's' + n; }

// ---------------- inklappen ----------------
let folds = new Set();
try { folds = new Set(JSON.parse(localStorage.getItem('zaagplanner.fold') || '[]')); } catch (e) { /* geen opslag */ }
// sleutels met "open:" zijn standaard ingeklapt (bv. onderdelen in de materialenlijst)
const folded = (k) => k.startsWith('open:') ? !folds.has(k) : folds.has(k);
const foldBtn = (k, title = '') => `<button class="foldbtn ${folded(k) ? 'shut' : ''}" data-act="fold" data-v="${esc(k)}" title="${folded(k) ? 'Uitklappen' : 'Inklappen'}${title ? ': ' + esc(title) : ''}" aria-expanded="${!folded(k)}"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
function toggleFold(k) { if (folds.has(k)) folds.delete(k); else folds.add(k); try { localStorage.setItem('zaagplanner.fold', JSON.stringify([...folds])); } catch (e) { /* geen opslag */ } }
// ---------------- ongedaan maken (hele project, behalve de indeling: die heeft een eigen ↶ en wordt opnieuw berekend) ----------------
// Bij elke opslag wordt de vorige toestand van het project bewaard (zonder 3D-model en indeling; max. 30 stappen per sessie).
const ongedaan = { stapel: [], laatst: {} };
const undoSnap = (p) => JSON.stringify(p, (k, v) => (k === 'mesh' || k === 'layouts' || k === 'updated' || k[0] === '_' ? undefined : v));
function undoBasis(p) { try { if (p && !ongedaan.laatst[p.id]) ongedaan.laatst[p.id] = undoSnap(p); } catch (e) { /* geen basis: dan geen ongedaan maken */ } }
function undoStap(p) {
  const s = undoSnap(p), l = ongedaan.laatst[p.id];
  if (l && l !== s) { ongedaan.stapel.push({ pid: p.id, s: l }); if (ongedaan.stapel.length > 30) ongedaan.stapel.shift(); }
  ongedaan.laatst[p.id] = s;
}
const undoKan = (p) => !!p && ongedaan.stapel.some(x => x.pid === p.id);
function undoGlobaal() {
  const p = proj(); if (!p) return;
  let i = ongedaan.stapel.length - 1; while (i >= 0 && ongedaan.stapel[i].pid !== p.id) i--;
  if (i < 0) { ui.msg = { text: 'Er is niets meer om ongedaan te maken.', kind: 'ok' }; return render(); }
  const { s } = ongedaan.stapel.splice(i, 1)[0], o = JSON.parse(s), mesh = new Map(p.parts.map(x => [x.id, x.mesh])), lays = p.layouts;
  for (const k of Object.keys(p)) if (!(k in o) && k !== 'layouts' && k[0] !== '_') delete p[k];
  Object.assign(p, o); p.layouts = lays; for (const x of p.parts) if (mesh.get(x.id)) x.mesh = mesh.get(x.id);
  ongedaan.laatst[p.id] = s; p.updated = new Date().toISOString(); ZP.store.save(db);
  ui.msg = { text: 'Laatste wijziging ongedaan gemaakt.', kind: 'ok' }; render();
}
const save = () => { const p = proj(); if (p) { p.updated = new Date().toISOString(); try { undoStap(p); } catch (e) { /* ongedaan maken mag het opslaan nooit tegenhouden */ } } ZP.store.save(db); };

// ---------------- runtime-indelingen ----------------
const hydrated = new WeakMap();
function layouts(p = proj()) {
  if (!p || !p.layouts) return [];
  const set = p.layouts[p.variant || 'hout'] || {};
  return Object.values(set).map(l => { if (!hydrated.has(l)) { LY.hydrate(l); hydrated.set(l, true); } return l; });
}
function boardNumbering(list) { let n = 0; const m = new Map(); for (const l of list) for (const b of l.boards) m.set(b.id, ++n); return m; }

// ---------------- schermopbouw ----------------
const ICON = {
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M7 25h5v-4h4v-4h4v-4h4V9h1" fill="none" stroke="#fff8ec" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M8 5v4M15 10v4M10 15v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  price: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5V5.5A1.5 1.5 0 0 1 5.5 4h7l7.5 7.5-8.5 8.5L4 12.5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/></svg>',
  proj: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H10l2 2h6.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>',
  config: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4v-4h4v-4h4V8h4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="17" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M18 12.5v1.5M18 20v1.5M13.5 17H15M21 17h1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  get map() { return this.proj; },   // map in het projectoverzicht
  upload: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 31V11m0 0-8 8m8-8 8 8" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 29v6a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4v-6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};
const MAKE_OPTS = [['auto', 'auto: één plank, anders stroken'], ['zuinig', 'zuinig: plank of paneel'], ['breed', 'één brede plank'], ['verlijmd', 'verlijmd paneel'], ['lamellen', 'stroken (lamellen)']];
const STEP_SUB = { importeren: 'DXF en PDF inlezen, per trap', controleren: 'Zaaglijst en neuzen', uitvoering: 'Hout, afwerking, leuning, opties', hout: 'Plankmaten en instellingen', indeling: 'Planken en zaagschema', begroting: 'Uren, materiaal, marge', klant: 'Offerte en specificatiestaat', afdrukken: 'Zaagschema, lijsten, etiketten' };
function stepDone(k, p) { return stepState(k, p) === 'done'; }
// status per stap: 'done' (✓), 'warn' (! iets vraagt aandacht, met uitleg) of '' (nog niet)
function stepState(k, p) { return stepInfo(k, p).s; }
function stepInfo(k, p) {
  if (!p) return { s: '' };
  const lays = p.layouts && p.layouts[p.variant || 'hout'] && Object.keys(p.layouts[p.variant || 'hout']).length;
  const inc = p.parts.filter(x => x.include !== false);
  switch (k) {
    case 'importeren': return !p.parts.length ? { s: '' } : p.stairs.some(s => (s.importWarnings || []).length) ? { s: 'warn', t: 'Inlezen gaf meldingen' } : { s: 'done' };
    case 'controleren': return !p.parts.length ? { s: '' } : inc.some(x => !x.material) ? { s: 'warn', t: 'Onderdelen zonder materiaal' } : { s: 'done' };
    case 'hout': case 'indeling': return !lays ? { s: '' } : isStale(p) ? { s: 'warn', t: 'Indeling verouderd: opnieuw berekenen' } : { s: 'done' };
    // uitvoering: klaar als elk onderdeel een houtsoort heeft (uit de tekening of gekozen)
    case 'uitvoering': return !p.parts.length ? { s: '' } : inc.some(x => /onbekend/.test(N.materialOf(x, S(), p.typeMaterial))) ? { s: 'warn', t: 'Nog niet overal een houtsoort' } : { s: 'done' };
    case 'begroting': return lays && !isStale(p) ? { s: 'done' } : { s: '' };
    case 'klant': return p.begroting && p.begroting.klant && p.begroting.klant.naam ? { s: 'done' } : { s: '' };
    default: return { s: '' };
  }
}
// ---------------- projecten als tabbladen (zoals in de browser) ----------------
// tabs = [{pid, screen, scroll}] (onthouden in localStorage); het actieve tabblad is db.current.
// Projecten, Materialenlijst en Prijzen zijn algemene schermen: die horen bij geen tabblad.
const GLOBAAL = ['projecten', 'materialen', 'prijzen', 'koppeling'];
// gekoppelde versie (hoofdmap) = js/app/koppeling.js geladen; de Excel-versie (map met-excel/) laadt die niet
const kpAan = () => typeof scrKoppeling === 'function';
let tabs = [];
try { tabs = JSON.parse(localStorage.getItem('zaagplanner.tabs') || '[]').filter(t => t && t.pid); } catch (e) { /* geen opslag */ }
const tabsBewaar = () => { try { localStorage.setItem('zaagplanner.tabs', JSON.stringify(tabs)); } catch (e) { /* geen opslag */ } };
// opruimen: alleen bestaande projecten; het open project heeft altijd een tabblad
function tabsBij() {
  tabs = tabs.filter(t => db.projects.some(p => p.id === t.pid));
  if (db.current && db.projects.some(p => p.id === db.current) && !tabs.some(t => t.pid === db.current)) tabs.push({ pid: db.current });
  const t = tabs.find(x => x.pid === db.current); if (t && !GLOBAAL.includes(ui.screen)) t.screen = ui.screen;
  tabsBewaar();
}
// naar een projecttabblad (of het project in een nieuw tabblad openen); achtergrond = alleen toevoegen
function tabOpen(pid, opt = {}) {
  if (!db.projects.some(p => p.id === pid)) return;
  let t = tabs.find(x => x.pid === pid); if (!t) { t = { pid }; tabs.push(t); }
  if (opt.achtergrond && db.current) { tabsBewaar(); return render(); }
  const oud = tabs.find(x => x.pid === db.current); if (oud && !GLOBAAL.includes(ui.screen)) { oud.screen = ui.screen; oud.scroll = scrollY; }
  const ander = db.current !== pid; db.current = pid;
  if (ander) { ui.sel3d = new Set(); ui.board = ui.piece = null; ui.group = null; ui.bwPick = null; }
  const p = proj();
  ui.screen = opt.screen || t.screen || ((p.parts || []).length ? 'indeling' : CONFIGURATOR && p.config ? 'configurator' : 'importeren');
  ui.msg = null; ui.menuOpen = false; save(); render();
  window.scrollTo(0, opt.screen || !ander ? 0 : (t.scroll || 0));
}
function tabSluit(pid) {
  const i = tabs.findIndex(x => x.pid === pid); if (i < 0) return;
  tabs.splice(i, 1); tabsBewaar();
  if (pid !== db.current) return render();
  const n = tabs[i] || tabs[i - 1];
  if (n) { db.current = null; tabOpen(n.pid); } else { db.current = null; ui.screen = 'projecten'; save(); render(); }
}
function tabBalk() {
  if (!tabs.length) return '';
  return `<div class="ptabs no-print" role="tablist" aria-label="Open projecten">${tabs.map(t => {
    const q = db.projects.find(x => x.id === t.pid), on = t.pid === db.current && !GLOBAAL.includes(ui.screen);
    return `<div class="ptab ${on ? 'on' : ''}" role="presentation"><button class="ptab-n" role="tab" aria-selected="${on}" data-act="tab" data-v="${esc(t.pid)}" title="${esc(q.name)}">${esc(q.name)}</button><button class="ptab-x" data-act="tabdicht" data-v="${esc(t.pid)}" title="Tabblad sluiten (het project blijft bewaard)" aria-label="Tabblad ${esc(q.name)} sluiten">×</button></div>`;
  }).join('')}<button class="ptab-plus" data-act="go" data-v="projecten" title="Ander project openen" aria-label="Ander project openen">+</button>
    ${kpAan() ? kpOok() : ''}${proj() && !GLOBAAL.includes(ui.screen) && ui.screen !== 'indeling' ? `<button class="ptab-undo small ghost" data-act="ongedaan" ${undoKan(proj()) ? '' : 'disabled'} title="Laatste wijziging in dit project ongedaan maken (Ctrl+Z)">↶ Ongedaan maken</button>` : ''}</div>`;
}
// knop "Verder" onderaan elk stap-scherm (blijft rechtsonder in beeld)
function verderBalk(p) {
  if (!p || GLOBAAL.includes(ui.screen)) return '';
  const lays = p.layouts && p.layouts[p.variant || 'hout'] && Object.keys(p.layouts[p.variant || 'hout']).length;
  const knop = {
    importeren: p.parts.length && !(ui.stagedFor === p.id && (ui.staged || []).length) ? ['go', 'controleren', 'Verder: controleren →'] : null,
    controleren: p.parts.length ? ['go', 'uitvoering', 'Verder: uitvoering kiezen →'] : null,
    uitvoering: p.parts.length ? ['go', 'hout', 'Verder: planken →'] : null,
    hout: p.parts.length ? (lays && !isStale(p) ? ['go', 'indeling', 'Verder: zagen →'] : ['calc', '', 'Indeling berekenen →']) : null,
    indeling: lays ? ['go', 'begroting', 'Verder: prijs →'] : null,
    begroting: p.parts.length ? ['go', 'klant', 'Verder: offerte en specificatiestaat →'] : null,
  }[ui.screen];
  return knop ? `<div class="verder no-print"><button class="primary hoofd" data-act="${knop[0]}" data-v="${knop[1]}">${knop[2]}</button></div>` : '';
}
// smal scherm (bv. iPad staand): menu als smalle balk, uitschuiven over de inhoud
const smalScherm = () => !!(window.matchMedia && matchMedia('(max-width: 1023px)').matches);
function render() {
  tabsBij(); undoBasis(proj());
  const p = proj(), smal = smalScherm(), mini = smal ? !ui.menuOpen : folded('side');
  const steps = SCREENS.map(([k, t], i) => {
    const st = stepInfo(k, p), done = st.s === 'done', warn = st.s === 'warn';
    return `<button class="step ${ui.screen === k ? 'on' : ''} ${done ? 'done' : ''} ${warn ? 'aandacht' : ''}" data-act="go" data-v="${k}" title="${t.replace(/^\d+\s/, '')}${warn ? ' – ' + esc(st.t) : ''}" ${!p ? 'disabled' : ''}>
      <span class="dot">${done ? '✓' : warn ? '!' : i + 1}</span><span class="st"><b>${t.replace(/^\d+\s/, '')}</b><small>${warn ? esc(st.t) : STEP_SUB[k]}</small></span></button>`;
  }).join('');
  const pcard = p ? `<div class="pcard"><small>Project</small><b title="${esc(p.name)}">${esc(p.name)}</b>
      <span>${p.stairs.length === 1 ? '1 trap' : p.stairs.length + ' trappen'}${p.stairs.some(s => P.aantalVan(s) > 1) ? ' (' + p.stairs.reduce((a, s) => a + P.aantalVan(s), 0) + ' × uitvoeren)' : ''} · ${p.parts.filter(x => x.include).length} onderdelen</span></div>`
    : `<div class="pcard empty"><small>Project</small><b>Geen project open</b><span>Kies of maak een project</span></div>`;
  document.getElementById('app').innerHTML = `
    <div class="shell ${mini ? 'sidemini' : ''} ${smal ? 'smal' : ''} ${smal && ui.menuOpen ? 'menuopen' : ''} ${ui.present && ui.screen === 'configurator' ? 'present' : ''}">
      <aside class="side no-print">
        <div class="brand-row"><div class="brand" data-act="go" data-v="projecten" title="Zaagplanner">${ICON.logo}<div><b>Zaagplanner</b><span>voor trappen</span></div></div>
          <button class="sidefold" data-act="${smal ? 'menu' : 'fold'}" data-v="side" title="${mini ? 'Menu uitklappen' : 'Menu inklappen'}" aria-label="${mini ? 'Menu uitklappen' : 'Menu inklappen'}" aria-expanded="${!mini}">${mini ? '»' : '«'}</button></div>
        ${pcard}
        ${p && CONFIGURATOR ? `<button class="navlink cfnav ${ui.screen === 'configurator' ? 'on' : ''}" data-act="go" data-v="configurator" title="Trap configureren bij de klant">${ICON.config}<span>Configurator<small>${p.config && p.config.gekozen ? 'variant ' + esc((p.config.varianten.find(v => v.id === p.config.gekozen) || {}).naam || '') + ' gekozen' : 'keuzes met de klant'}</small></span></button>` : ''}
        <nav class="steps">${steps}</nav>
        <div class="navsep">Beheer</div>
        <button class="navlink ${ui.screen === 'materialen' ? 'on' : ''}" data-act="go" data-v="materialen" title="Materialenlijst">${ICON.mat}<span>Materialenlijst</span></button>
        <button class="navlink ${ui.screen === 'prijzen' ? 'on' : ''}" data-act="go" data-v="prijzen" title="Prijzen en normen">${ICON.price}<span>Prijzen en normen</span></button>
        <button class="navlink ${ui.screen === 'projecten' ? 'on' : ''}" data-act="go" data-v="projecten" title="Projecten">${ICON.proj}<span>Projecten</span></button>
        ${!kpAan() ? '' : `<button class="navlink ${ui.screen === 'koppeling' ? 'on' : ''}" data-act="go" data-v="koppeling" title="Koppeling: meerdere laptops, gebruikers en de timer-app"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l6-6M10.5 6.5l1.2-1.2a4 4 0 0 1 5.7 5.7l-1.2 1.2M13.5 17.5l-1.2 1.2a4 4 0 0 1-5.7-5.7l1.2-1.2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg><span>Koppeling</span></button>`}
        ${kpAan() ? `<div class="side-foot">${kpChip()}<p>${ZP.cloud.ingesteld() ? 'Werkt ook zonder internet.' : 'Alles blijft op dit apparaat.'}</p></div>` : ''}
      </aside>
      ${smal && ui.menuOpen ? '<button class="menu-dicht no-print" data-act="menu" aria-label="Menu sluiten"></button>' : ''}
      <div class="mainwrap">${tabBalk()}<main class="scr-${ui.screen}">${screenHtml()}${verderBalk(proj())}</main></div>
    </div>
    <div class="toasts no-print">${ui.msg ? `<div class="toast ${ui.msg.kind || ''}"><span>${esc(ui.msg.text)}</span><button class="x" data-act="closemsg" aria-label="Sluiten">×</button></div>` : ''}</div>
    ${ui.busy ? `<div class="busy no-print"><div class="spin"></div><div><b>Bezig met rekenen</b><span class="btxt">${esc(ui.busy.text)}</span><div class="bar"><i style="width:${Math.round((ui.busy.f || 0) * 100)}%"></i></div></div><button class="small" data-act="stopcalc" title="Stoppen en de beste indeling tot nu toe gebruiken">Stoppen</button></div>` : ''}`;
  afterRender();
  // korte bevestigingen verdwijnen vanzelf
  clearTimeout(render.t);
  if (ui.msg && ui.msg.kind === 'ok') { const m = ui.msg; render.t = setTimeout(() => { if (ui.msg === m) { ui.msg = null; const t = document.querySelector('.toast'); if (t) t.remove(); } }, 4500); }
}
// kerncijfer-tegel
const kpi = (label, value, sub, tone) => `<div class="kpi ${tone || ''}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
// paginakop met titel, uitleg en (optioneel) actieknoppen rechts
const pageHead = (title, sub, actions = '') => `<div class="phd"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="phd-act">${actions}</div>` : ''}</div>`;
function screenHtml() {
  const p = proj();
  if (ui.screen === 'materialen') return scrMaterials();
  if (ui.screen === 'prijzen') return scrPrices();
  if (ui.screen === 'koppeling' && kpAan()) return scrKoppeling();
  if (!p || ui.screen === 'projecten') return scrProjects();
  if (ui.screen === 'configurator' && !CONFIGURATOR) ui.screen = 'importeren';
  return { configurator: scrConfig, importeren: scrImport, controleren: scrCheck, uitvoering: scrUitvoering, klant: scrKlant, hout: scrWood, indeling: scrLayout, begroting: scrBudget, afdrukken: scrPrint }[ui.screen]();
}


// ---------------- Prijzen & normen ----------------
// Normtijden en prijzen uit het Excel-bestand, plus wat alleen in de app staat: spijltypes en balustrades.
const CO = ZP.cost, DW = ZP.drawings;
const C = () => CO.ensure(db);
// lijsten met een eigen afbeelding (Afbeelding… / ✕ afb.)
const imgList = (kind) => (kind === 'spijl' ? C().spijltypes : kind === 'drager' ? C().dragers : C().bewerkingen);
// ---------------- foto's bij keuzes (ZP.fotos, IndexedDB) ----------------
// soorten: hout (naam), afw, bew, spijl, profiel (naam), spil (eind/hoek/tussen), drager; oude afbeeldingen (o.img) blijven werken
const FOTO_OUD = ['bew', 'spijl', 'drager'];
const fotoVan = (kind, id) => ZP.fotos.get(kind, id) || (FOTO_OUD.includes(kind) ? ((imgList(kind).find(x => x.id === id) || {}).img || '') : '');
// beheer: miniatuur (tik = groot), Foto… (op de iPad: foto maken of kiezen) en weghalen
const fotoKnop = (kind, id) => { const f = fotoVan(kind, id);
  return `<span class="fotoknop">${f ? `<img src="${f}" alt="" data-act="fotozoom" data-kind="${kind}" data-v="${esc(id)}" title="Groot bekijken">` : ''}<label class="btn small ghost" title="Eigen foto of tekening (jpg, png of svg); op de iPad: foto maken of uit de fotobibliotheek">${f ? 'Andere foto…' : 'Foto…'}<input type="file" accept="image/*" data-act="fotoup" data-kind="${kind}" data-id="${esc(id)}" hidden></label>${f ? `<button class="ghost small" data-act="fotodel" data-kind="${kind}" data-v="${esc(id)}" title="Foto weghalen" aria-label="Foto weghalen">✕</button>` : ''}</span>`; };
// in een keuzetegel: knopje "groot bekijken" (span, want de tegel is zelf een knop)
const fotoZoom = (kind, id, titel) => (fotoVan(kind, id) ? `<span class="fotozoom" role="button" tabindex="0" data-act="fotozoom" data-kind="${kind}" data-v="${esc(id)}" data-t="${esc(titel || '')}" title="Foto groot bekijken" aria-label="Foto groot bekijken"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : '');
// foto groot tonen (over de hele pagina; tikken of Esc = sluiten)
function toonFoto(src, titel) {
  if (!src) return; const d = document.createElement('div'); d.className = 'lightbox no-print'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', titel || 'Foto');
  d.innerHTML = `<figure><img src="${src}" alt="">${titel ? `<figcaption>${esc(titel)}</figcaption>` : ''}</figure><button class="lb-x" aria-label="Sluiten">×</button>`;
  const weg = () => { d.remove(); removeEventListener('keydown', esc2); }, esc2 = (e) => { if (e.key === 'Escape') weg(); };
  d.addEventListener('click', weg); addEventListener('keydown', esc2); document.body.appendChild(d);
}
const pctIn = (bind, attrs, v) => `<input class="w3 num" data-bind="${bind}" ${attrs} data-pct="1" value="${f1((+v || 0) * 100).replace(/,0$/, '')}"> %`;
const numIn = (bind, attrs, v, w = 'w4') => `<input class="${w} num" data-bind="${bind}" ${attrs} value="${v === null || v === undefined || v === '' ? '' : String(Math.round(v * 10000) / 10000).replace('.', ',')}">`;
const opts = (list, cur) => list.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const BEW_ONDERDELEN = ['Treden', 'Stootborden', 'Trapboom', 'Spil', 'Leuning', 'Balustrade', 'Overig'];
const BEW_EENHEDEN = ['per tred', 'per stuk', 'per m', 'per m²', 'per trap'];
const BESLAG_PER = ['per tred', 'per trap', 'per m leuning', 'per spijl', 'per stuk'];

// gebeurtenissen: elk scherm registreert zijn eigen handlers (zie de schermbestanden)
const CLICK = [], CHANGE = [];
