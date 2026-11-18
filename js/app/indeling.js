// Scherm 4 Indeling: planken, zaagschema, handmatig bewerken (slepen, draaien, ongedaan maken)
// ---------------- 4 Indeling ----------------
function scrLayout() {
  const p = proj(), st = S();
  const lays = layouts(p);
  const canUndo = undo.some(u => u.pid === p.id && u.v === (p.variant || 'hout'));
  const actions = `<button data-act="undo" ${canUndo ? '' : 'disabled'} title="Ongedaan maken (Ctrl+Z)">↶ Ongedaan maken</button><button data-act="calcall">Drie varianten vergelijken</button><button class="primary" data-act="calc">${lays.length ? 'Opnieuw berekenen' : 'Berekenen'}</button>`;
  const head = pageHead('Indeling', 'Links de planken met vullingsgraad, rechts het zaagschema. Klik een onderdeel om het te kiezen; slepen, draaien en verplaatsen wordt direct gecontroleerd.', actions) + staleBanner(p) + variantSwitch(p);
  if (!lays.length) return head + `<section class="card empty-state"><div class="hero-art">${stairArt()}</div><h3>Nog geen indeling voor deze variant</h3><p class="muted">Druk op Berekenen; dat duurt enkele seconden per groep.</p><button class="primary" data-act="calc">Berekenen</button></section>` + hoCard(p);
  const nums = boardNumbering(lays);
  let total = { price: 0, gross: 0, net: 0, cmp: 0, boards: 0, planks: 0, panels: 0, unpl: 0 };
  const listHtml = lays.map(l => {
    const s = LY.stats(l, st);
    total.price += s.price; total.gross += s.gross; total.net += s.netVol; total.cmp += s.compareVol; total.boards += s.boards; total.unpl += l.unplaced.length;
    for (const b of l.boards) { total.planks += b.stock.panel ? b.stock.panel.planks.length : 1; if (b.stock.panel) total.panels++; }
    const gk = 'grp-' + p.id + '-' + l.groupKey;
    const items = l.boards.map((b, i) => {
      const bs = s.per[i], pct = Math.round(bs.fill * 100);
      return `<li class="${ui.board === b.id ? 'on' : ''}" data-act="selboard" data-v="${b.id}" data-g="${esc(l.groupKey)}" title="${esc(boardTip(b, l, bs))}">
        <div class="bl-top"><b>P${nums.get(b.id)}</b><span>${f0(b.W)} × ${b.L}</span>${b.stock.panel ? `<span class="tag paneltag" title="Verlijmd paneel">paneel ${b.stock.panel.planks.map(p => p.width).join('+')}</span>` : ''}<span class="pct ${pct >= 70 ? 'hi' : pct >= 50 ? 'mid' : 'lo'}">${pct}%</span></div>
        ${R.miniBoard(b, 240)}
        <div class="bl-bot"><span>${b.pl.length} delen</span><span>${eur(bs.price)}</span></div></li>`;
    }).join('');
    const un = l.unplaced.map(id => { const pc = l._pmap.get(id); return `<li class="unpl"><span>${esc(pc.label)}</span> <button class="small" data-act="autoplace" data-g="${esc(l.groupKey)}" data-v="${id}">plaats</button></li>`; }).join('');
    const alt = l.alternatives && l.alternatives.length > 1 ? `<div class="gnote">Treden: ${l.alternatives.map(a => `<span class="${a.mode === l.mode ? 'win' : ''}">${{ auto: 'plank/paneel', breed: 'brede plank', verlijmd: 'paneel', lamellen: 'lamellen' }[a.mode] || a.mode} ${a.cost > 1e5 ? '(past niet)' : eur(a.cost)}</span>`).join(' · ')}</div>` : '';
    const lb = l.lowerBound > 0 && s.price > 0 && !l.unplaced.length ? `<div class="gnote" title="Netto oppervlak (met overmaat en zaagsnede) tegen de goedkoopste prijs per m²; het echte optimum ligt hier altijd boven.">Ondergrens ${eur(l.lowerBound)} · +${Math.round((s.price / l.lowerBound - 1) * 100)}%</div>` : '';
    return `<div class="grp"><div class="grp-h">${foldBtn(gk, l.material + ' ' + l.thickness + ' mm')}<b>${esc(l.material)} ${l.thickness} mm</b><span>${s.boards} pl. · ${eur(s.price)}</span></div>
      ${folded(gk) ? (l.unplaced.length ? `<div class="warn small">${l.unplaced.length} niet geplaatst</div>` : '') : `
      <div class="tags">${[...new Set(l.pieces.map(pc => pc.type))].map(t => `<span class="tag"><span class="tdot t-${t}"></span>${P.TYPES[t].label}</span>`).join('')}</div>${alt}${lb}
      ${l.problems.length ? `<div class="warn small">${l.problems.map(esc).join('<br>')}</div>` : ''}
      <ul class="boards">${items}${un ? `<li class="unpl-h">Niet geplaatst</li>${un}` : ''}</ul>`}</div>`;
  }).join('');
  const listShut = folded('blist');
  const sd = summaryOf(p);
  const cur = findBoard(ui.board) || { l: lays[0], b: lays[0].boards[0] };
  if (cur && cur.b) { ui.board = cur.b.id; ui.group = cur.l.groupKey; }
  const detail = cur && cur.b ? boardDetail(cur.l, cur.b, nums.get(cur.b.id)) : '<p class="muted">Kies een plank.</p>';
  const rend = total.gross ? Math.round(total.net / total.gross * 100) : 0;
  const sdG = sd.reduce((a, s) => a + s.gross, 0);
  return head + `
    <div class="kpis">${kpi('Inkoop', eur(total.price), total.planks + ' planken' + (total.panels ? ` · ${total.panels} verlijmd tot paneel` : ''), 'accent')}${kpi('Ingekocht', f1(total.gross) + ' <i>dm³</i>', 'bruto dikte')}${kpi('Netto', f1(total.net) + ' <i>dm³</i>', 'in de onderdelen')}
      ${kpi('Rendement', rend + '%', 'netto / ingekocht', rend >= 55 ? 'ok' : '')}
      ${sdG ? kpi('StairDesigner bruto', f1(sdG) + ' <i>dm³</i>', 'plankoppervlak × netto dikte: ' + f1(total.cmp)) : ''}
      ${total.unpl ? kpi('Niet geplaatst', total.unpl, 'zie lijst links', 'warn') : ''}</div>
    <div class="split ${listShut ? 'nolist' : ''}"><aside class="blist"><div class="blist-h">${foldBtn('blist', 'plankenlijst')}${listShut ? '' : `<b>Planken</b><span class="muted small">${total.boards}</span>`}</div>${listShut ? '' : `<input class="findpiece" list="piecelist" data-bind="findpiece" placeholder="Zoek onderdeel, bv. Trede #7" title="Springt naar de plank waar dit onderdeel op ligt"><datalist id="piecelist">${lays.flatMap(l => l.pieces.map(pc => `<option value="${esc(pc.label)}">`)).join('')}</datalist>`}${listShut ? `<div class="vlabel">Planken · ${total.boards}</div>` : listHtml}</aside><div class="bdetail card">${detail}</div></div>
    ${hoCard(p)}`;
}
// varianten als schakelaar met hun uitkomst
function variantSwitch(p) {
  const items = Object.entries(N.VARIANTS).map(([k, v]) => {
    let info = '<small>nog niet berekend</small>';
    if (p.layouts[k] && Object.keys(p.layouts[k]).length) {
      const ls = Object.values(p.layouts[k]).map(l => { if (!hydrated.has(l)) { LY.hydrate(l); hydrated.set(l, true); } return l; });
      let price = 0, boards = 0, gross = 0, net = 0;
      for (const l of ls) { const s = LY.stats(l, S()); price += s.price; boards += s.boards; gross += s.gross; net += s.netVol; }
      info = `<small><b>${eur(price)}</b> · ${boards} pl. · ${gross ? Math.round(net / gross * 100) : 0}%</small>`;
    }
    return `<button class="vsw ${(p.variant || 'hout') === k ? 'on' : ''}" data-act="pickvariant" data-v="${k}"><span>${v.label}</span>${info}</button>`;
  }).join('');
  return `<div class="vswitch">${items}</div>`;
}
function findBoard(id) {
  for (const l of layouts()) { const b = l.boards.find(b => b.id === id); if (b) return { l, b }; }
  return null;
}
function boardDetail(l, b, num) {
  const st = S(); const bs = N.boardStats(b, st); const plan = LY.sawPlan(b, st);
  const q = b.pl.find(q => q.piece === ui.piece);
  // alleen planken/maten die bedoeld zijn voor de onderdelen die erop liggen
  const others = layouts().find(x => x.groupKey === l.groupKey).boards.filter(o => o !== b && (!q || N.canUse(o.stock, q.pc)));
  const nums = boardNumbering(layouts());
  const stocks = stockPool(l, null).filter(s => b.pl.every(x => N.canUse(s, x.pc)));
  const tools = q ? `<div class="toolbar sel"><span class="selname"><span class="tdot t-${q.pc.part.type}"></span>${esc(q.pc.label)}</span>
      <button data-act="rot">↻ Draai 180°${q.edge ? ' (andere rand)' : ''}</button>
      <select data-act="moveto"><option value="">Naar plank…</option>${others.map(o => `<option value="${o.id}">P${nums.get(o.id)} ${o.W}×${o.L}</option>`).join('')}</select>
      <button data-act="snapleft">⇤ Aanschuiven</button><button class="ghost" data-act="unplace">Van plank halen</button></div>`
    : `<div class="toolbar hint">Klik een onderdeel om het te kiezen · slepen verplaatst het · treden blijven met de neus op de plankrand · toetsen: <kbd>R</kbd> draaien, <kbd>←</kbd><kbd>→</kbd> schuiven (Shift = 10 mm), <kbd>Del</kbd> van plank, <kbd>Ctrl</kbd>+<kbd>Z</kbd> ongedaan</div>`;
  const pct = Math.round(bs.fill * 100);
  return `<div class="bhead"><div><span class="eyebrow">${b.stock.panel ? `Verlijmd paneel P${num} · planken ${b.stock.panel.planks.map(p => p.width).join(' + ')} mm in de breedte` : 'Plank P' + num}</span><h2>${f0(b.W)} × ${b.L} mm <span class="muted">${esc(l.material)} ${b.stock.grossT} → ${l.thickness} mm</span></h2></div>
    <div class="bh-stats"><div><b>${pct}%</b><small>vulling</small></div><div><b>${eur(bs.price)}</b><small>prijs</small></div><div><b>${b.pl.length}</b><small>delen</small></div></div></div>
    <div class="row wrap small"><label>Andere maat <select data-act="resize"><option value="">—</option>${stocks.filter(s => s.id !== b.stock.id).sort((a, c) => a.width - c.width || a.length - c.length).map(s => `<option value="${s.id}">${s.panel ? 'paneel ' + s.panel.planks.map(p => p.width).join('+') + ' → ' : ''}${f0(s.width)}×${s.length} (${eur(M.boardPrice(s))})</option>`).join('')}</select></label>
    <button class="ghost small" data-act="delboard">Plank leegmaken</button></div>
    ${tools}<div class="svgwrap" id="boardwrap">${R.boardSVG(b, l, { S: st, selected: ui.piece, plan, stats: bs, rows: screenRows(b) })}</div>
    <div class="legend small">${legendHtml(b)}</div>
    ${boardProps(b, l, bs)}
    <div class="props"><div class="props-h">${foldBtn('cuts', 'Zaagvolgorde')}<h3>Zaagvolgorde</h3><span class="muted small">${plan.cuts.length} stappen</span></div>
    ${folded('cuts') ? '' : `<ol class="cuts">${plan.cuts.map(c => `<li class="${c.kind}"><span class="cn">${c.n}</span><span class="ck">${{ lijm: 'lijmen', dwars: 'afkorten', langs: 'langs', vorm: 'vorm' }[c.kind]}</span><span>${esc(c.text)}${c.kind === 'dwars' ? ` op <b>${f0(c.x)} mm</b>` : c.kind === 'langs' ? ` op <b>${f0(c.y)} mm</b> vanaf rand A` : ''}</span></li>`).join('')}</ol>`}</div>`;
}
// Op het scherm een lange plank over meer regels zetten, zodat het schema in de breedte past en leesbaar blijft.
// Op het scherm altijd de hele plank als één geheel (niet in stukken onder elkaar).
function screenRows() { return 1; }
// Eigenschappen van een plank (of verlijmd paneel): wat je koopt, wat het kost, wat erop mag en wat het oplevert.
function boardFacts(b, l, bs) {
  const s = b.stock, pm = { m3: 'per m³', m1: 'per m¹', stuk: 'per stuk' };
  const area = b.L * b.W, used = bs.net;
  const pieces = b.pl.length, types = [...new Set(b.pl.map(q => P.TYPES[q.pc.part.type].label.toLowerCase()))].join(', ');
  const facts = [
    ['Houtsoort', esc(M.fullName(s))],
    ['Dikte', `${s.grossT} mm bruto → ${s.netT} mm netto`],
    ['Maat', `${f0(b.W)} × ${b.L} mm${s.panel ? ' (paneel)' : ''}`],
    ['Prijs', s.panel ? `${eur(M.boardPrice(s))} <span class="muted">(planken + lijmkosten)</span>` : `${eur(M.boardPrice(s))} <span class="muted">(${eur(s.price)} ${pm[s.priceMode] || ''})</span>`],
    ['Inkoopvolume', `${f2(M.boardVolume(s))} dm³`],
    ['Bruikbare lengte', `${f0(b.xmax - b.xmin)} mm <span class="muted">(kopse marge ${f0(b.xmin)} mm per kant)</span>`],
    ['Geschikt voor', esc(s.panel ? 'treden (verlijmd paneel)' : M.typesText(s))],
    ['Leverancier', esc(s.supplier || '—')],
    ['Herkomst', s.stock ? 'eigen voorraad (prijs = restwaarde)' : 'inkoop' + (s.available !== null && s.available !== undefined ? ` · ${s.available} beschikbaar` : '')],
    ['Op deze plank', `${pieces} ${pieces === 1 ? 'deel' : 'delen'} · ${esc(types)}`],
    ['Vulling', `${Math.round(bs.fill * 100)}% · netto ${f2(used * l.thickness / 1e6)} dm³ · afval ${Math.round((1 - used / area - bs.remArea / area) * 100)}%`],
    ['Bruikbare rest', bs.rems.length ? bs.rems.map(r => `${f0(r.w)} × ${f0(r.h)}`).join(', ') : '—'],
  ];
  if (b.line !== null && b.line !== undefined) facts.splice(6, 0, ['Middenlijn', `${f0(b.line)} mm vanaf rand A · ${b.pl.filter(q => q.edge === 'M').length} treden met de neus op deze lijn`]);
  if (s.panel) facts.splice(3, 0, ['Verlijmd uit', s.panel.planks.map(p => `${p.width} × ${p.length}`).join(' + ') + ` mm · ${s.panel.seams.length} ${s.panel.seams.length === 1 ? 'naad' : 'naden'} op ${s.panel.seams.map(y => f0(y)).join(', ')} mm vanaf rand A`]);
  return facts;
}
function boardProps(b, l, bs) {
  const fk = 'props';
  return `<div class="props"><div class="props-h">${foldBtn(fk, 'Plankgegevens')}<h3>Plankgegevens</h3></div>
    ${folded(fk) ? '' : `<dl>${boardFacts(b, l, bs).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`}</div>`;
}
const boardTip = (b, l, bs) => boardFacts(b, l, bs).slice(0, 6).map(([k, v]) => k + ': ' + String(v).replace(/<[^>]+>/g, '')).join('\n');
function legendHtml(b) {
  const types = [...new Set(b.pl.map(q => q.pc.part.type))];
  return types.map(t => `<span class="lg-i"><span class="tdot t-${t}"></span>${P.TYPES[t].label}</span>`).join('') +
    (b.stock.panel ? `<span class="lg-i"><span class="lg seam"></span>lijmnaad (planken in de breedte verlijmd)</span>` : '') +
    (b.line !== null && b.line !== undefined ? `<span class="lg-i"><span class="lg mid"></span>middenlijn: rechte langssnede, vormt de neus van de middentreden</span>` : '') +
    `<span class="lg-i"><span class="lg nose"></span>neus = plankrand, niet zagen</span><span class="lg-i"><span class="lg grain">↔</span>nerf</span><span class="lg-i"><span class="lg rem"></span>bruikbare rest</span><span class="lg-i"><span class="lg waste"></span>afval / kopse marge</span>`;
}


// ---------------- handmatig bewerken van de indeling ----------------
function curLayout() { const f = findBoard(ui.board); return f ? f.l : null; }
// Ongedaan maken: vóór elke handmatige wijziging een momentopname van de indeling van deze variant.
const undo = [];
function pushUndo() {
  const p = proj(); const v = p.variant || 'hout';
  undo.push({ pid: p.id, v, snap: ZP.store.serialize(p.layouts[v] || {}), edited: !!(p.edited && p.edited[v]), board: ui.board, piece: ui.piece });
  if (undo.length > 40) undo.shift();
}
function doUndo() {
  const p = proj(); const v = p.variant || 'hout';
  let i = undo.length - 1; while (i >= 0 && (undo[i].pid !== p.id || undo[i].v !== v)) i--;
  if (i < 0) { ui.msg = { text: 'Niets om ongedaan te maken.', kind: 'err' }; return render(); }
  const u = undo.splice(i, 1)[0];
  p.layouts[v] = JSON.parse(u.snap); p.edited = p.edited || {}; p.edited[v] = u.edited;
  ui.board = u.board; ui.piece = u.piece; ui.msg = { text: 'Laatste wijziging ongedaan gemaakt.', kind: 'ok' };
  save(); render();
}
function afterEdit() { const p = proj(); p.edited = p.edited || {}; p.edited[p.variant || 'hout'] = true; save(); render(); }
function rotatePiece() {
  const f = findBoard(ui.board); if (!f) return; const { l, b } = f;
  const q = b.pl.find(q => q.piece === ui.piece); if (!q) return;
  pushUndo();
  const pc = q.pc, cur = q.key;
  const flip = { A: 'B', B: 'A', Am: 'Bm', Bm: 'Am', MA: 'MB', MB: 'MA', MAm: 'MBm', MBm: 'MAm', 0: '180', 180: '0' }[cur];
  const target = pc.variants.find(v => v.key === flip) || pc.variants.find(v => v.key !== cur);
  const old = { key: q.key, x: q.x, y: q.y };
  q.key = target.key;
  if (target.edge === 'A') q.y = 0; else if (target.edge === 'B') q.y = b.W - target.h;
  else if (target.edge === 'M') q.y = target.key.startsWith('MA') ? b.line : b.line - b.lineKerf - target.h; // andere kant van de middenlijn
  else q.y = Math.min(Math.max(0, q.y), b.W - target.h);
  LY.place(q, pc, l.rectMode);
  if (!LY.valid(b, q)) {
    // zoek een vrije plek met deze ligging op dezelfde plank
    const idx = b.pl.indexOf(q); b.pl.splice(idx, 1);
    const pos = N.findPosition(b, pc, l.rectMode, target.key);
    if (pos) { q.x = pos.x; q.y = pos.y; setLine(b, pos); LY.place(q, pc, l.rectMode); b.pl.splice(idx, 0, q); }
    else { Object.assign(q, old); LY.place(q, pc, l.rectMode); b.pl.splice(idx, 0, q); ui.msg = { text: 'Gedraaid past het hier niet; probeer een andere plank.', kind: 'err' }; }
  }
  afterEdit();
}
function snapLeft() {
  const f = findBoard(ui.board); if (!f) return; const { l, b } = f;
  const q = b.pl.find(q => q.piece === ui.piece); if (!q) return;
  pushUndo();
  const idx = b.pl.indexOf(q); b.pl.splice(idx, 1);
  const pos = N.findPosition(b, q.pc, l.rectMode, q.key) || N.findPosition(b, q.pc, l.rectMode);
  if (pos) { q.key = pos.v.key; q.x = pos.x; q.y = pos.y; setLine(b, pos); LY.place(q, q.pc, l.rectMode); }
  b.pl.splice(idx, 0, q); afterEdit();
}
function moveTo(targetId) {
  const f = findBoard(ui.board), t = findBoard(targetId); if (!f || !t) return;
  const q = f.b.pl.find(q => q.piece === ui.piece); if (!q) return;
  if (!N.canUse(t.b.stock, q.pc)) { ui.msg = { text: `Die plank is niet bedoeld voor ${esc(q.pc.label)} (materialenlijst of keuze breed/verlijmd).`, kind: 'err' }; return render(); }
  const pos = N.findPosition(t.b, q.pc, t.l.rectMode);
  if (!pos) { ui.msg = { text: `${q.pc.label} past niet op die plank.`, kind: 'err' }; return render(); }
  pushUndo();
  f.b.pl.splice(f.b.pl.indexOf(q), 1); dropLine(f.b);
  putOn(t.b, q.piece, pos, q.pc, t.l.rectMode);
  ui.board = t.b.id; afterEdit();
}
function unplace() {
  const f = findBoard(ui.board); if (!f) return;
  const q = f.b.pl.find(q => q.piece === ui.piece); if (!q) return;
  pushUndo();
  f.b.pl.splice(f.b.pl.indexOf(q), 1); dropLine(f.b); f.l.unplaced.push(q.piece); ui.piece = null;
  if (!f.b.pl.length) { f.l.boards.splice(f.l.boards.indexOf(f.b), 1); ui.board = null; }
  afterEdit();
}
function autoPlace(groupKey, pieceId) {
  const l = layouts().find(x => x.groupKey === groupKey); if (!l) return;
  const pc = l._pmap.get(pieceId);
  let best = null;
  for (const b of l.boards) { if (!N.canUse(b.stock, pc)) continue; const pos = N.findPosition(b, pc, l.rectMode); if (pos && (!best || pos.right < best.pos.right)) best = { b, pos }; }
  if (!best) {
    // nieuwe plank: goedkoopste maat waar het op past
    const stocks = stockPool(l, proj().groupCfg[groupKey]).filter(s => N.canUse(s, pc)).sort((a, c) => M.boardPrice(a) - M.boardPrice(c));
    for (const s of stocks) { const nb = N.newBoard(s, S()); const pos = N.findPosition(nb, pc, l.rectMode); if (pos) { nb.stock = Object.assign({}, s); l.boards.push(nb); best = { b: nb, pos }; break; } }
  }
  if (!best) { ui.msg = { text: `${pc.label} past op geen enkele maat uit de materialenlijst.`, kind: 'err' }; return render(); }
  pushUndo();
  putOn(best.b, pieceId, best.pos, pc, l.rectMode);
  l.unplaced.splice(l.unplaced.indexOf(pieceId), 1);
  ui.board = best.b.id; ui.piece = pieceId; afterEdit();
}
// gewone maten uit de materialenlijst plus de verlijmde panelen die daaruit te maken zijn
function stockPool(l, cfg) {
  const base = N.stocksFor({ material: l.material, thickness: l.thickness }, db.materials, cfg);
  let pool = base.concat(N.panelsFor(base, S(), 0));
  // panelen voor brede delen van andere soorten (bordes e.d.) die alleen verlijmd kunnen
  for (const t of [...new Set((l.pieces || []).filter(pc => pc.panel === 'only' && pc.type !== 'trede').map(pc => pc.type))])
    pool = pool.concat(N.panelsFor(base, S(), Math.max(...l.pieces.filter(pc => pc.type === t).map(pc => pc.h)), t));
  return pool;
}
function resizeBoard(stockId) {
  const f = findBoard(ui.board); if (!f) return;
  const s = stockPool(f.l, null).find(m => m.id === stockId); if (!s) return;
  const nb = N.newBoard(s, S()); nb.id = f.b.id; nb.stock = Object.assign({}, s);
  const pcs = f.b.pl.map(q => q.pc).sort((a, c) => c.area - a.area);
  const bad = pcs.find(pc => !N.canUse(s, pc));
  if (bad) { ui.msg = { text: `Die maat is niet bedoeld voor ${bad.label} (materialenlijst of keuze breed/verlijmd).`, kind: 'err' }; return render(); }
  for (const pc of pcs) {
    const pos = N.findPosition(nb, pc, f.l.rectMode);
    if (!pos) { ui.msg = { text: `Niet alles past op ${s.width}×${s.length} (${pc.label}).`, kind: 'err' }; return render(); }
    putOn(nb, f.b.pl.find(q => q.pc === pc).piece, pos, pc, f.l.rectMode);
  }
  pushUndo(); f.l.boards[f.l.boards.indexOf(f.b)] = nb; afterEdit();
}
// middenlijn vastleggen bij de eerste middentrede, en loslaten als er geen middentrede meer op de plank ligt
function setLine(b, pos) { if (pos.line !== undefined && pos.line !== null && (b.line === null || b.line === undefined)) { b.line = pos.line; b.lineKerf = pos.lineKerf; } }
function dropLine(b) { if (!b.pl.some(q => q.edge === 'M')) { b.line = null; b.lineKerf = 0; } }
function putOn(b, pieceId, pos, pc, rectMode) { setLine(b, pos); b.pl.push(LY.place({ piece: pieceId, key: pos.v.key, x: pos.x, y: pos.y }, pc, rectMode)); }
function clearBoard() {
  const f = findBoard(ui.board); if (!f) return;
  pushUndo();
  for (const q of f.b.pl) f.l.unplaced.push(q.piece);
  f.l.boards.splice(f.l.boards.indexOf(f.b), 1); ui.board = null; ui.piece = null; afterEdit();
}

// slepen in het schema
function bindDrag() {
  const svg = document.querySelector('#boardwrap svg'); if (!svg) return;
  const f = findBoard(ui.board); if (!f) return; const { l, b } = f;
  let drag = null;
  const toMM = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = pt.matrixTransform(svg.getScreenCTM().inverse()); return [m.x, m.y]; };
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.part-g'); if (!g) return;
    const q = b.pl.find(q => q.piece === g.dataset.piece); if (!q) return;
    if (ui.piece !== q.piece) { ui.piece = q.piece; render(); return; }
    pushUndo(); drag = { q, start: toMM(e), x: q.x, y: q.y, g }; svg.setPointerCapture(e.pointerId); e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [mx, my] = toMM(e); const q = drag.q;
    q.x = Math.round((drag.x + mx - drag.start[0]) * 2) / 2;
    if (!q.edge) q.y = Math.round((drag.y - (my - drag.start[1])) * 2) / 2;
    LY.place(q, q.pc, l.rectMode);
    const ok = LY.valid(b, q);
    // zelfde afbeelding als render.boardSVG: X = 30 + x, Y = padT + W − y (padT uit de eerste rand van de plank)
    const outline = svg.querySelector('.b-outline'); const padT = +outline.getAttribute('y');
    const d = 'M' + q.poly.map(([x, y]) => (30 + x).toFixed(1) + ' ' + (padT + b.W - y).toFixed(1)).join('L') + 'Z';
    svg.querySelectorAll(`.part-g[data-piece="${q.piece}"]`).forEach(g => {
      g.querySelectorAll('path').forEach(pa => pa.setAttribute('d', d)); g.querySelector('path').classList.toggle('is-bad', !ok);
      g.querySelectorAll('text,line').forEach(t => t.style.display = 'none');
    });
  });
  const end = () => {
    if (!drag) return; const q = drag.q;
    if (!LY.valid(b, q)) { q.x = drag.x; q.y = drag.y; LY.place(q, q.pc, l.rectMode); ui.msg = { text: 'Daar botst het met een ander onderdeel of de plankrand; teruggezet.', kind: 'err' }; }
    drag = null; afterEdit();
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}


CLICK.push(function click_indeling(a, t, v, p, e) {
  switch (a) {
    case 'undo': doUndo(); break;
    case 'selboard': ui.board = v; ui.piece = null; render(); break;
    case 'rot': rotatePiece(); break;
    case 'snapleft': snapLeft(); break;
    case 'unplace': unplace(); break;
    case 'autoplace': autoPlace(t.dataset.g, v); break;
    case 'delboard': clearBoard(); break;
    default: return false;
  }
});
// geeft 'skip' terug als er niet opgeslagen/hertekend hoeft te worden
CHANGE.push(function change_indeling(b, t, p, part, numv) {
  switch (b) {
    case 'findpiece': {
      // springen naar de plank waar het onderdeel ligt
      const q = t.value.trim().toLowerCase(); if (!q) return 'skip';
      for (const l of layouts()) {
        for (const b of l.boards) { const hit = b.pl.find(x => x.pc.label.toLowerCase() === q) || b.pl.find(x => x.pc.label.toLowerCase().includes(q)); if (hit) { ui.board = b.id; ui.piece = hit.piece; return render(); } }
        const un = l.unplaced.map(id => l._pmap.get(id)).find(pc => pc.label.toLowerCase().includes(q));
        if (un) { ui.msg = { text: `${un.label} is niet geplaatst (zie "Niet geplaatst" in de lijst).`, kind: 'err' }; return render(); }
      }
      ui.msg = { text: `Geen onderdeel gevonden voor "${t.value}".`, kind: 'err' }; return render();
    }
    case 'variant': p.variant = t.value; ui.board = ui.piece = null; break;
    default: return false;
  }
});
