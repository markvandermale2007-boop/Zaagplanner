// Scherm Projecten
// ---------------- Projecten ----------------
// ---------------- mappen ----------------
// db.mappen = [{id, naam, ouder (null = bovenaan), dicht}]; project.map = id van de map (leeg = zonder map).
// Bv. per jaar een map met de standaard submappen Begroting, Opdracht, Afgerond, Vervallen, Niet uitgevoerd.
const MAP_STD = ['Begroting', 'Opdracht', 'Afgerond', 'Vervallen', 'Niet uitgevoerd'];
const mappen = () => (db.mappen = db.mappen || []);
const mapVan = (id) => mappen().find(m => m.id === id) || null;
const kinderen = (ouder) => mappen().filter(m => (m.ouder || null) === (ouder || null)).sort(mapSort);
// jaartallen nieuwste eerst, standaard submappen in vaste volgorde, de rest op naam
function mapSort(a, b) {
  const ja = /^\d{4}$/.test(a.naam), jb = /^\d{4}$/.test(b.naam);
  if (ja && jb) return b.naam.localeCompare(a.naam);
  if (ja !== jb) return ja ? -1 : 1;
  const sa = MAP_STD.indexOf(a.naam), sb = MAP_STD.indexOf(b.naam);
  if (sa >= 0 || sb >= 0) return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
  return a.naam.localeCompare(b.naam, 'nl', { numeric: true });
}
// de map en al zijn submappen (ids)
function mapBoom(id) { const out = [id]; for (const k of kinderen(id)) out.push(...mapBoom(k.id)); return out; }
const mapPad = (id) => { const r = []; for (let m = mapVan(id); m; m = mapVan(m.ouder)) r.unshift(m.naam); return r.join(' › '); };
function nieuweMap(naam, ouder) {
  const bestaand = kinderen(ouder).find(m => m.naam.toLowerCase() === naam.toLowerCase());
  if (bestaand) return bestaand;
  const m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), naam, ouder: ouder || null };
  mappen().push(m); return m;
}
// jaarmap met de standaard submappen (bestaande mappen blijven staan)
function jaarMap(jaar) { const j = nieuweMap(String(jaar), null); for (const n of MAP_STD) nieuweMap(n, j.id); return j; }
// alle mappen als keuzelijst, ingesprongen
function mapOpties(cur) {
  const r = [['', '– zonder map –']];
  const loop = (ouder, d) => { for (const m of kinderen(ouder)) { r.push([m.id, '  '.repeat(d) + m.naam]); loop(m.id, d + 1); } };
  loop(null, 0);
  return r.map(([v, t]) => `<option value="${v}" ${v === (cur || '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
}
// welke projecten bij de gekozen map horen (inclusief submappen)
function inMap(p, sel) {
  if (!sel || sel === 'alle') return true;
  if (sel === 'geen') return !p.map || !mapVan(p.map);
  return mapBoom(sel).includes(p.map);
}
function mapTree() {
  const sel = ui.map || 'alle', n = (s) => db.projects.filter(p => inMap(p, s)).length;
  const rij = (id, label, cls, d, m) => `<div class="mt-row ${sel === id ? 'on' : ''} ${cls || ''}" data-map="${id}" style="--d:${d}">
      ${m && kinderen(m.id).length ? `<button class="mt-tog" data-act="maptoggle" data-v="${m.id}" title="${m.dicht ? 'Openklappen' : 'Inklappen'}">${m.dicht ? '▸' : '▾'}</button>` : '<span class="mt-tog"></span>'}
      <a href="#" data-act="mapkies" data-v="${id}"><span class="mt-ic">${ICON.map}</span>${esc(label)}</a><span class="mt-n">${n(id)}</span></div>`;
  const loop = (ouder, d) => kinderen(ouder).map(m => rij(m.id, m.naam, '', d, m) + (m.dicht ? '' : loop(m.id, d + 1))).join('');
  const m = mapVan(sel);
  return `<aside class="card maptree"><div class="mt-head"><h3>Mappen</h3>
      <span class="btngroup"><button class="small" data-act="mapjaar" title="Map voor een jaar met de submappen ${MAP_STD.join(', ')}">+ Jaar</button><button class="small ghost" data-act="mapnew" title="Nieuwe map${m ? ' in ' + esc(m.naam) : ''}">+ Map</button></span></div>
    ${rij('alle', 'Alle projecten', 'mt-all', 0)}${loop(null, 0)}${mappen().length ? rij('geen', 'Zonder map', 'mt-none', 0) : ''}
    ${m ? `<div class="mt-act"><b>${esc(m.naam)}</b><span class="btngroup"><button class="small ghost" data-act="mapnew" data-v="${m.id}">+ Submap</button><button class="small ghost" data-act="mapren" data-v="${m.id}">Hernoemen</button><button class="small ghost danger" data-act="mapdel" data-v="${m.id}">Verwijderen</button></span></div>` : ''}
    <p class="muted small">Sleep een project naar een map, of kies de map op de kaart.</p></aside>`;
}

function scrProjects() {
  const sel = ui.map || 'alle';
  if (sel !== 'alle' && sel !== 'geen' && !mapVan(sel)) ui.map = 'alle';
  // status (Offerte → Opdracht → In productie …) staat bij de klantgegevens; filteren op status en zoeken op naam/klant/plaats
  const statusVan = (p) => ((p.begroting || {}).klant || {}).status || 'Offerte', klantVan = (p) => (p.begroting || {}).klant || {};
  const zoek = (ui.projZoek || '').trim().toLowerCase(), fst = ui.projStatus || '';
  const inMapLijst = db.projects.filter(p => inMap(p, ui.map || 'alle'));
  const list = inMapLijst.filter(p => (!fst || statusVan(p) === fst) && (!zoek || [p.name, klantVan(p).naam, klantVan(p).plaats, klantVan(p).nr, ...(p.stairs || []).map(s => s.name)].some(s => String(s || '').toLowerCase().includes(zoek))))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  db.projects.forEach(ensureStairs);
  const filter = db.projects.length ? `<div class="pfilter"><input type="search" class="w16" data-bind="pzoek" value="${esc(ui.projZoek || '')}" placeholder="Zoek op project, klant, plaats of nummer" aria-label="Projecten zoeken">
    <span class="btngroup"><button class="small ${fst ? 'ghost' : 'on'}" data-act="pstatusf" data-v="">Alle <span class="count">${inMapLijst.length}</span></button>${CO.STATUS.map(s => { const n = inMapLijst.filter(p => statusVan(p) === s).length; return n || fst === s ? `<button class="small ${fst === s ? 'on' : 'ghost'}" data-act="pstatusf" data-v="${esc(s)}">${esc(s)} <span class="count">${n}</span></button>` : ''; }).join('')}</span></div>` : '';
  // back-up: herinnering als de laatste ouder is dan 14 dagen (of er nog geen is)
  const bDagen = db.laatsteBackup ? Math.floor((Date.now() - new Date(db.laatsteBackup).getTime()) / 864e5) : null;
  const bTekst = bDagen === null ? 'Nog geen back-up gemaakt in deze browser.' : bDagen === 0 ? 'Laatste back-up: vandaag.' : `Laatste back-up: ${bDagen} ${bDagen === 1 ? 'dag' : 'dagen'} geleden.`;
  const bOud = db.projects.length > 0 && (bDagen === null || bDagen > 14);
  const cards = list.map(p => {
    const lays = Object.values((p.layouts || {})[p.variant || 'hout'] || {});
    let boards = 0, price = 0;
    for (const l of lays) { boards += l.boards.length; for (const b of l.boards) price += M.boardPrice(b.stock); }
    const types = [...new Set((p.parts || []).map(x => x.type))].sort((a, b) => P.TYPES[a].order - P.TYPES[b].order).map(t => `<span class="tag">${P.TYPES[t].label}</span>`).join('');
    return `<article class="projcard ${p.id === db.current ? 'cur' : ''}" draggable="true" data-pid="${p.id}">
      <div class="pc-top"><h3><a href="#" data-act="open" data-v="${p.id}">${esc(p.name)}</a></h3>${p.id === db.current ? '<span class="pill">open</span>' : ''}</div>
      <div class="pc-klant">${klantVan(p).naam ? `<span>${esc(klantVan(p).naam)}${klantVan(p).plaats ? ' · ' + esc(klantVan(p).plaats) : ''}</span>` : '<span class="muted small">nog geen klant ingevuld</span>'}
        <select class="small pc-status st-${CO.STATUS.indexOf(statusVan(p))}" data-bind="pstatus" data-v="${p.id}" title="Status van dit project" aria-label="Status">${opts(CO.STATUS, statusVan(p))}</select></div>
      <label class="pc-map"><span class="mt-ic">${ICON.map}</span><select data-bind="pmap" data-v="${p.id}" title="Map van dit project">${mapOpties(mapVan(p.map) ? p.map : '')}</select></label>
      ${CONFIGURATOR && p.config ? `<div class="pc-cfg">${ICON.config}<span>${esc((p.config.klant || {}).naam || 'Configuratie')} · ${p.config.varianten.length} ${p.config.varianten.length === 1 ? 'variant' : 'varianten'}${p.config.gekozen ? ' · ' + esc((p.config.varianten.find(v => v.id === p.config.gekozen) || {}).naam || '') + ' gekozen' : ''}</span><button class="small ghost" data-act="cfopen" data-v="${p.id}">Configurator</button></div>` : ''}
      <div class="pc-meta">${p.stairs.length ? `${p.stairs.length === 1 ? '1 trap' : p.stairs.length + ' trappen'}${p.stairs.some(s => P.aantalVan(s) > 1) ? ' (' + p.stairs.reduce((a, s) => a + P.aantalVan(s), 0) + ' × uitvoeren)' : ''} · ${(p.parts || []).length} onderdelen` : 'nog niets ingelezen'}</div>
      ${p.stairs.length > 1 ? `<div class="pc-stairs">${p.stairs.map(s => `<span><b>${stairCode(p, s.id)}</b> ${esc(s.name)}</span>`).join('')}</div>` : ''}
      <div class="tags">${types}</div>
      <div class="pc-stats">${boards ? `<div><b>${boards}</b><small>planken</small></div><div><b>${eur(price)}</b><small>inkoop</small></div>` : '<div class="muted small">Nog geen indeling</div>'}</div>
      <div class="pc-foot"><small>${p.updated ? 'Gewijzigd ' + new Date(p.updated).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</small>
        <span><button class="ghost small" data-act="delproj" data-v="${p.id}">Verwijderen</button><button class="small" data-act="dupproj" data-v="${p.id}" title="Kopie maken om iets uit te proberen">Kopie</button><button class="primary small" data-act="open" data-v="${p.id}">Openen</button></span></div></article>`;
  }).join('');
  const hero = `<div class="hero"><div class="hero-art">${stairArt()}</div><div><h2>Van StairDesigner naar zaagschema</h2>
    <p>Lees de DXF en PDF van een trap in. De app deelt alle onderdelen in op echte planken: de neus van elke trede op de rechte plankrand, de nerf altijd in de lengte, met zo min mogelijk hout.</p></div></div>`;
  return pageHead('Projecten', 'Elke trap is een project. Een herziene tekening lees je opnieuw in binnen hetzelfde project; de app laat zien wat er veranderd is.') + `
    ${db.projects.length ? '' : hero}
    <section class="card newproj"><div class="row wrap"><input id="newname" placeholder="Naam van de trap of klant (leeg = naam uit het bestand)">
      ${CONFIGURATOR ? `<button class="primary" data-act="cfnew" title="Bij de klant: keuzes vastleggen, de tekening volgt later">${ICON.config} Nieuwe trap bij klant</button><button data-act="newproj">+ Project met tekening</button>` : '<button class="primary" data-act="newproj">+ Nieuw project</button>'}</div>
      ${mapVan(ui.map) ? `<p class="muted small">Nieuwe projecten komen in de map <b>${esc(mapPad(ui.map))}</b>.</p>` : ''}</section>
    ${bOud ? `<div class="warn no-print">${bTekst} Alles staat alleen in deze browser: maak een back-up. <button class="small" data-act="backup">Nu back-up downloaden</button></div>` : ''}
    <div class="projwrap">${mapTree()}<div>
      ${filter}
      ${sel !== 'alle' ? `<h3 class="pw-h">${sel === 'geen' ? 'Zonder map' : esc(mapPad(sel))} <span class="muted small">${list.length} ${list.length === 1 ? 'project' : 'projecten'}</span></h3>` : ''}
      ${list.length ? `<div class="projgrid">${cards}</div>` : `<p class="muted pw-leeg">${zoek || fst ? 'Geen projecten gevonden met dit filter.' : db.projects.length ? 'Geen projecten in deze map. Sleep een project hierheen of kies de map op de projectkaart.' : 'Nog geen projecten.'}</p>`}</div></div>
    <section class="card sub"><h3>Back-up</h3><p class="muted">Projecten, materialenlijst en instellingen staan in deze browser. Maak af en toe een back-up. <span class="pback">${bTekst}</span></p>
    <div class="row wrap"><button data-act="backup">Back-up downloaden</button><label class="btn">Back-up terugzetten<input type="file" accept=".json" data-act="restore" hidden></label></div></section>`;
}
// kleine illustratie: trap met nerf
function stairArt() {
  let s = '<svg viewBox="0 0 220 150" aria-hidden="true">';
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 30, y = 120 - i * 18;
    s += `<rect x="${x}" y="${y}" width="${200 - x}" height="12" rx="2" fill="var(--wood-${i % 2 ? 'b' : 'a'})" stroke="var(--wood-line)" stroke-width="1"/>`;
    s += `<line x1="${x + 6}" x2="${190}" y1="${y + 4}" y2="${y + 4}" stroke="var(--wood-line)" stroke-opacity=".25"/><line x1="${x + 14}" x2="${180}" y1="${y + 8}" y2="${y + 8}" stroke="var(--wood-line)" stroke-opacity=".18"/>`;
    s += `<line x1="${x}" x2="${200}" y1="${y + 12}" y2="${y + 12}" stroke="var(--nose)" stroke-width="2.5"/>`;
  }
  return s + '<path d="M14 136h196" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round"/></svg>';
}
function newProject(name) {
  const p = { id: 'p' + Date.now().toString(36), name: name || 'Nieuw project', created: new Date().toISOString(), updated: new Date().toISOString(),
    stairs: [], parts: [], groupCfg: {}, layouts: {}, variant: 'hout' };
  if (mapVan(ui.map)) p.map = ui.map;   // nieuw project in de gekozen map
  db.projects.push(p); db.current = p.id; save(); return p;
}


CLICK.push(function click_projecten(a, t, v, p, e) {
  switch (a) {
    case 'newproj': { const n = document.getElementById('newname').value.trim(); newProject(n); ui.screen = 'importeren'; render(); break; }
    // openen in een tabblad; Ctrl/⌘-klik of middelste muisknop = op de achtergrond (zoals in de browser)
    case 'open': tabOpen(v, { achtergrond: !!(e && (e.ctrlKey || e.metaKey || e.button === 1)) }); break;
    case 'cfopen': db.current = v; ui.screen = 'configurator'; save(); render(); break;
    case 'delproj': if (confirm('Project verwijderen? Dit kan niet ongedaan worden.')) { db.projects = db.projects.filter(x => x.id !== v); if (db.current === v) db.current = null; save(); render(); } break;
    // back-up inclusief de foto's bij keuzes (staan los in IndexedDB)
    case 'pstatusf': ui.projStatus = v || ''; render(); break;
    case 'backup': db.laatsteBackup = new Date().toISOString(); ZP.store.save(db); setTimeout(render, 0); ZP.store.download('zaagplanner-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(Object.assign(JSON.parse(ZP.store.serialize(db)), ZP.fotos.aantal ? { fotos: ZP.fotos.alles() } : {}))); break;
    case 'dupproj': {
      const src = db.projects.find(x => x.id === v); if (!src) break;
      const cp = JSON.parse(ZP.store.serialize(src)); cp.id = 'p' + Date.now().toString(36); cp.name = src.name + ' (kopie)';
      cp.created = cp.updated = new Date().toISOString(); db.projects.push(cp);
      ui.msg = { text: `Kopie gemaakt: ${cp.name}.`, kind: 'ok' }; save(); render(); break;
    }
    // ---- mappen ----
    case 'mapkies': ui.map = v; render(); break;
    case 'maptoggle': { const m = mapVan(v); if (m) { m.dicht = !m.dicht; save(); render(); } break; }
    case 'mapjaar': {
      const j = (prompt(`Jaar (maakt de map met de submappen ${MAP_STD.join(', ')})`, String(new Date().getFullYear())) || '').trim(); if (!j) break;
      const m = jaarMap(j); ui.map = m.id; save(); render(); break;
    }
    case 'mapnew': {
      const ouder = mapVan(v) ? v : null, naam = (prompt(ouder ? `Naam van de submap in ${mapPad(ouder)}` : 'Naam van de nieuwe map') || '').trim(); if (!naam) break;
      const m = nieuweMap(naam, ouder); if (ouder) mapVan(ouder).dicht = false; ui.map = m.id; save(); render(); break;
    }
    case 'mapren': { const m = mapVan(v); if (!m) break; const naam = (prompt('Nieuwe naam van de map', m.naam) || '').trim(); if (naam) { m.naam = naam; save(); render(); } break; }
    case 'mapdel': {
      // projecten en submappen gaan naar de bovenliggende map; er gaat niets verloren
      const m = mapVan(v); if (!m) break;
      const nP = db.projects.filter(p => p.map === m.id).length, nK = kinderen(m.id).length;
      if (!confirm(`Map "${m.naam}" verwijderen?${nP || nK ? ` ${nP} project(en) en ${nK} submap(pen) gaan naar ${m.ouder ? '"' + mapVan(m.ouder).naam + '"' : '"Zonder map"'}.` : ''}`)) break;
      for (const p of db.projects) if (p.map === m.id) p.map = m.ouder || null;
      for (const k of kinderen(m.id)) k.ouder = m.ouder || null;
      db.mappen = mappen().filter(x => x.id !== m.id); ui.map = m.ouder || 'alle'; save(); render(); break;
    }
    default: return false;
  }
});
CHANGE.push(function change_projecten(b, t, p, part, numv) {
  switch (b) {
    case 'pzoek': ui.projZoek = t.value; render(); return 'skip';
    case 'pstatus': { const q = db.projects.find(x => x.id === t.dataset.v); if (q) { q.begroting = q.begroting || {}; (q.begroting.klant = q.begroting.klant || {}).status = t.value; q.updated = new Date().toISOString(); ZP.store.save(db); } render(); return 'skip'; }
    case 'pmap': { const q = db.projects.find(x => x.id === t.dataset.v); if (q) { q.map = t.value || null; q.updated = new Date().toISOString(); } break; }
    default: return false;
  }
});
// project naar een map slepen (vanuit afterRender)
function bindMappen() {
  for (const c of document.querySelectorAll('.projcard[draggable]')) c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/zp-project', c.dataset.pid); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); });
  for (const c of document.querySelectorAll('.projcard[draggable]')) c.addEventListener('dragend', () => c.classList.remove('drag'));
  for (const r of document.querySelectorAll('.maptree .mt-row[data-map]')) {
    if (r.dataset.map === 'alle') continue;
    r.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/zp-project')) { e.preventDefault(); r.classList.add('drop'); } });
    r.addEventListener('dragleave', () => r.classList.remove('drop'));
    r.addEventListener('drop', (e) => {
      e.preventDefault(); r.classList.remove('drop');
      const q = db.projects.find(x => x.id === e.dataTransfer.getData('text/zp-project')); if (!q) return;
      q.map = r.dataset.map === 'geen' ? null : r.dataset.map;
      ui.msg = { text: `${q.name} → ${q.map ? mapPad(q.map) : 'zonder map'}.`, kind: 'ok' }; save(); render();
    });
  }
}
