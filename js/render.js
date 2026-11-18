// SVG-tekeningen: zaagschema per plank (scherm en print gebruiken dezelfde tekening) en onderdeelminiaturen.
ZP.render = (function () {
  const G = ZP.geom;
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f0 = (v) => Math.round(v).toString();

  // Plank in mm; y=0 (rand A) onderaan. Marges rondom voor maatvoering.
  function boardSVG(board, lay, o = {}) {
    const S = o.S, W = board.W, L = board.L;
    // Lange smalle planken over meerdere regels tekenen, zodat alles leesbaar blijft.
    const rows = o.rows || Math.max(1, Math.min(3, Math.round(L / W / 6)));
    const Lr = Math.ceil(L / rows);
    const fs = Math.max(14, Math.min(28, Lr / 70)); // tekstgrootte in mm
    const padL = 30, padR = 30, padT = Math.round(fs * 3.6 + 22), padB = Math.round(fs * 2.2);
    const rowH = W + padT + padB;
    const vbW = Lr + padL + padR, vbH = rowH * rows;
    const X = (x) => padL + x, Y = (y) => padT + (W - y);
    const plan = o.plan || ZP.layout.sawPlan(board, S);
    const st = o.stats || ZP.nest.boardStats(board, S);
    let s = `<svg class="board-svg" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" data-board="${esc(board.id)}" data-rows="${rows}" preserveAspectRatio="xMinYMin meet" style="font-family:inherit${o.minHeightPx ? `;min-width:${Math.min(3000, Math.round(vbW / vbH * o.minHeightPx))}px` : ''}">`;
    let defs = '';
    for (let r = 0; r < rows; r++) defs += `<clipPath id="row-${esc(board.id)}-${r}" clipPathUnits="userSpaceOnUse"><rect x="${r === 0 ? 0 : X(r * Lr)}" y="0" width="${Lr + (r === 0 ? padL : 0) + (r === rows - 1 ? padR : 0)}" height="${rowH}"/></clipPath>`;
    s += `<defs>${defs}<pattern id="hatch-${esc(board.id)}" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="24" stroke="var(--rem-line)" stroke-width="6"/></pattern>
      <pattern id="grain-${esc(board.id)}" width="420" height="22" patternUnits="userSpaceOnUse"><path d="M0 6c70-5 140 5 210 0s140-5 210 0M0 15c60 4 150-4 210 1s150 3 210-1" fill="none" stroke="var(--wood-line)" stroke-opacity=".16" stroke-width="1.4"/></pattern>
      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--grain)"/></marker></defs>`;
    // plank, kopse marges en afval
    let c0 = s.length; s += `<rect x="${X(0)}" y="${Y(W)}" width="${L}" height="${W}" class="b-waste"/>`;
    s += `<rect x="${X(0)}" y="${Y(W)}" width="${board.xmin}" height="${W}" class="b-end"/><rect x="${X(board.xmax)}" y="${Y(W)}" width="${L - board.xmax}" height="${W}" class="b-end"/>`;
    for (const r of st.rems) {
      s += `<rect x="${X(r.x)}" y="${Y(r.y + r.h)}" width="${r.w}" height="${r.h}" fill="url(#hatch-${esc(board.id)})" class="b-rem"/>`;
      s += `<text x="${X(r.x + r.w / 2)}" y="${Y(r.y + r.h / 2) + fs * 0.35}" font-size="${fs * 0.85}" text-anchor="middle" class="t-rem">rest ${f0(r.w)}×${f0(r.h)}</text>`;
    }
    // onderdelen
    for (const q of board.pl) {
      const pc = q.pc, sel = o.selected === q.piece;
      const d = 'M' + q.poly.map(([x, y]) => X(x).toFixed(1) + ' ' + Y(y).toFixed(1)).join('L') + 'Z';
      const type = (pc.part && pc.part.type) || pc.type || 'overig';
      const cls = 'b-part t-' + type + (pc.nose ? ' is-tread' : '') + (sel ? ' is-sel' : '') + (o.invalid === q.piece ? ' is-bad' : '');
      s += `<g class="part-g" data-piece="${esc(q.piece)}"><path d="${d}" class="${cls}"/><path d="${d}" fill="url(#grain-${esc(board.id)})" class="b-grainfill"/>`;
      // lijmnaden en echte trede-contour binnen de overmaat
      if (pc.nose) {
        const y = ZP.layout.noseY(board, q);
        const xs = q.poly.filter(p => Math.abs(p[1] - y) < 0.6).map(p => p[0]);
        if (xs.length >= 2) s += `<line x1="${X(Math.min(...xs))}" x2="${X(Math.max(...xs))}" y1="${Y(y)}" y2="${Y(y)}" class="b-nose"/>`;
      }
      const c = G.centroid(q.poly), bw = q.bb.x1 - q.bb.x0, bh = q.bb.y1 - q.bb.y0;
      const small = bh < fs * 2.6;
      const name = pc.label;
      const dims = `${f0(bw)}×${f0(bh)}`;
      const ty = Y(c[1]);
      s += `<text x="${X(c[0])}" y="${small ? ty + fs * 0.35 : ty - fs * 0.2}" font-size="${fs}" text-anchor="middle" class="t-part">${esc(name)}${small ? ' · ' + dims : ''}</text>`;
      if (!small) s += `<text x="${X(c[0])}" y="${ty + fs * 0.95}" font-size="${fs * 0.8}" text-anchor="middle" class="t-dim">${dims}</text>`;
      // nerfpijl
      const aw = Math.min(bw * 0.35, 260), ay = small ? ty - fs * 0.9 : ty + fs * 1.9;
      if (bh > fs * 1.6 || !small) s += `<line x1="${X(c[0]) - aw / 2}" x2="${X(c[0]) + aw / 2}" y1="${ay}" y2="${ay}" class="b-grain" marker-end="url(#arr)" marker-start="url(#arr)"/>`;
      s += `</g>`;
    }
    // zaagsneden met nummers en maat vanaf de linker plankrand
    const cutNo = (x, y, n) => `<circle cx="${x}" cy="${y}" r="${fs * 0.75}" class="c-no"/><text x="${x}" y="${y + fs * 0.33}" font-size="${fs * 0.9}" text-anchor="middle" class="t-cno">${n}</text>`;
    for (const c of plan.cuts) {
      if (c.kind === 'dwars') {
        s += `<line x1="${X(c.x)}" x2="${X(c.x)}" y1="${Y(W) - 18}" y2="${Y(0) + 8}" class="cut-x"/>`;
        s += cutNo(X(c.x), Y(W) - 18 - fs * 0.8, c.n);
        s += `<text x="${X(c.x)}" y="${Y(W) - 18 - fs * 2}" font-size="${fs * 0.8}" text-anchor="middle" class="t-dim">${f0(c.x)}</text>`;
      } else if (c.kind === 'langs') {
        s += `<line x1="${X(c.x0)}" x2="${X(c.x1)}" y1="${Y(c.y)}" y2="${Y(c.y)}" class="cut-y"/>`;
        s += cutNo(X(c.x0) + fs, Y(c.y), c.n);
      } else if (c.kind === 'vorm') {
        const q = board.pl.find(p => p.piece === c.piece); if (!q) continue;
        s += cutNo(X(q.bb.x0) + fs * 1.2, Y(q.bb.y1 > W - fs * 2 ? q.bb.y1 - fs * 1.3 : q.bb.y1) + fs * 1.2, c.n);
      }
    }
    // lijmnaden van een verlijmd paneel (planken in de breedte naast elkaar), over de hele lengte
    if (board.stock.panel) for (const sy of board.stock.panel.seams) {
      s += `<line x1="${X(0)}" x2="${X(L)}" y1="${Y(sy)}" y2="${Y(sy)}" class="b-seam"/>`;
      s += `<text x="${X(L) - 6}" y="${Y(sy) - 5}" font-size="${fs * 0.75}" text-anchor="end" class="t-seam">lijmnaad · ${f0(sy)} mm vanaf rand A</text>`;
    }
    // middenlijn: gezaagde rechte lijn waarop de neuzen van de middentreden liggen (zaagbaan)
    if (board.line !== null && board.line !== undefined) {
      s += `<rect x="${X(board.xmin)}" y="${Y(board.line)}" width="${board.xmax - board.xmin}" height="${board.lineKerf}" class="b-midband"/>`;
      s += `<text x="${X(board.xmin) + 6}" y="${Y(board.line) - 5}" font-size="${fs * 0.75}" class="t-mid">middenlijn · ${f0(board.line)} mm vanaf rand A</text>`;
    }
    // plankmaat en randen
    s += `<rect x="${X(0)}" y="${Y(W)}" width="${L}" height="${W}" class="b-outline"/>`;
    s += `<text x="${X(0)}" y="${Y(0) + fs * 1.3}" font-size="${fs * 0.8}" class="t-dim">rand A</text><text x="${X(0)}" y="${Y(W) - 4}" font-size="${fs * 0.8}" class="t-dim">rand B</text>`;
    s += `<text x="${X(L)}" y="${Y(0) + fs * 1.3}" font-size="${fs * 0.8}" text-anchor="end" class="t-dim">${L} × ${W} mm</text>`;
    // inhoud per regel herhalen, verschoven en bijgeknipt
    const body = s.slice(c0); s = s.slice(0, c0);
    for (let r = 0; r < rows; r++) {
      s += `<g transform="translate(${-r * Lr},${r * rowH})"><g clip-path="url(#row-${esc(board.id)}-${r})">${body}</g>`;
      if (rows > 1 && r < rows - 1) s += `<text x="${X((r + 1) * Lr) - 4}" y="${Y(0) + fs * 1.3}" font-size="${fs * 0.75}" text-anchor="end" class="t-dim">vervolg ↓ (${Math.round((r + 1) * Lr)} mm)</text>`;
      s += `</g>`;
    }
    s += `</svg>`;
    return s;
  }

  // Kleine plank voor de plankenlijst: onderdelen in hun kleur, zonder tekst.
  function miniBoard(board, w = 240) {
    const h = Math.max(14, Math.min(46, w * board.W / board.L * 2.2));
    const sx = w / board.L, sy = h / board.W;
    let s = `<svg class="mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><rect width="${w}" height="${h}" rx="2" class="m-board"/>`;
    for (const q of board.pl) {
      const type = (q.pc.part && q.pc.part.type) || q.pc.type || 'overig';
      s += `<path d="M${q.poly.map(([x, y]) => (x * sx).toFixed(1) + ' ' + (h - y * sy).toFixed(1)).join('L')}Z" class="m-part t-${type}"/>`;
    }
    if (board.stock.panel) for (const y of board.stock.panel.seams) s += `<line x1="0" x2="${w}" y1="${(h - y * sy).toFixed(1)}" y2="${(h - y * sy).toFixed(1)}" class="m-seam"/>`;
    if (board.line !== null && board.line !== undefined) s += `<line x1="0" x2="${w}" y1="${(h - board.line * sy).toFixed(1)}" y2="${(h - board.line * sy).toFixed(1)}" class="m-mid"/>`;
    return s + '</svg>';
  }

  // Miniatuur van een onderdeel met neus (voor importeren/controleren).
  function partThumb(p, w = 160, h = 70) {
    const b = G.bbox(p.poly); const sc = Math.min((w - 8) / b.w, (h - 8) / b.h);
    const X = (x) => 4 + (x - b.x0) * sc, Y = (y) => h - 4 - (y - b.y0) * sc;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="thumb">`;
    s += `<path d="M${p.poly.map(([x, y]) => X(x).toFixed(1) + ' ' + Y(y).toFixed(1)).join('L')}Z" class="th-part t-${p.type}"/>`;
    if (p.hasNose && p.noseSpan) s += `<line x1="${X(p.noseSpan[0])}" x2="${X(p.noseSpan[1])}" y1="${Y(0)}" y2="${Y(0)}" class="th-nose"/>`;
    s += `</svg>`;
    return s;
  }

  // Trede met lijmnaden (onderdelenlijst / print).
  function treadGlueSVG(part, lamels, w = 240, h = 90) {
    const b = G.bbox(part.poly); const sc = Math.min((w - 8) / b.w, (h - 8) / b.h);
    const X = (x) => 4 + (x - b.x0) * sc, Y = (y) => h - 4 - (y - b.y0) * sc;
    let s = `<svg width="${w}" height="${h}" class="thumb"><path d="M${part.poly.map(([x, y]) => X(x) + ' ' + Y(y)).join('L')}Z" class="th-part"/>`;
    for (const l of lamels) if (l.k > 0) s += `<line x1="${X(b.x0)}" x2="${X(b.x1)}" y1="${Y(l.y0)}" y2="${Y(l.y0)}" class="th-glue"/>`;
    if (part.noseSpan) s += `<line x1="${X(part.noseSpan[0])}" x2="${X(part.noseSpan[1])}" y1="${Y(0)}" y2="${Y(0)}" class="th-nose"/>`;
    return s + '</svg>';
  }

  return { boardSVG, miniBoard, partThumb, treadGlueSVG, esc };
})();
