// Optimalisatie: onderdelen indelen op planken.
// Harde regels: nerf langs x (alleen 180° draaien), treden met de neus exact op plankrand A (y=0) of B (y=W),
// zaagsnede per type (tussen twee delen telt de grootste), overmaat, kopse marges.
ZP.nest = (function () {
  const G = ZP.geom, M = ZP.materials;

  // ---------- stukken (wat er werkelijk uit de plank moet komen) ----------
  function kerfOf(type, S) { return (S.kerf[type] !== undefined ? S.kerf[type] : S.kerf.overig) || 0; }

  // Een te breed onderdeel in stroken (lamellen) zagen en daarna verlijmen: elke strook staat los op de zaaglijst.
  // Stroken zo breed als de breedste plank toelaat, plus één reststrook (minstens MIN_REST breed).
  // Bij een trede is de eerste strook de neusstrook (op y = 0), minstens minFirstSeam breed.
  const MIN_REST = 50;
  function lamellae(part, S, maxW, nose = true) {
    const D = part.W, minFirst = S.glue.minFirstSeam, ga = Math.max(S.overWidth, S.glue.allowance);
    const lw = S.glue.lamelWidth > 0 ? S.glue.lamelWidth : Math.max(minFirst, maxW - 2 * ga);   // strook + lijmmarge aan beide kanten
    const lwFirst = S.glue.lamelWidth > 0 ? S.glue.lamelWidth : Math.max(minFirst, nose ? maxW - ga : lw);
    const widths = []; let rest = D;
    while (rest > 0.5) { const w = Math.min(widths.length ? lw : lwFirst, rest); widths.push(w); rest -= w; }
    // te smalle reststrook: van de strook ervoor afnemen
    const n = widths.length;
    if (n > 1 && widths[n - 1] < MIN_REST) { const d = MIN_REST - widths[n - 1]; widths[n - 1] = MIN_REST; widths[n - 2] -= d; }
    if (nose && n > 1 && widths[0] < minFirst) { const d = minFirst - widths[0]; widths[0] = minFirst; widths[1] -= d; }
    const out = []; let y = 0;
    for (let i = 0; i < n; i++) {
      const y1 = i === n - 1 ? D + 1 : y + widths[i];
      const band = G.clipY(part.poly, y - (i === 0 ? 1 : 0), y1);
      if (band && G.bbox(band).h > 5) out.push({ k: i, n, y0: y, y1: Math.min(y1, D), poly: G.normalize(band) });
      y = y1;
    }
    return out;
  }

  // Treden maken:
  //  'breed'    – uit één (brede) plank
  //  'verlijmd' – uit een paneel: planken in de breedte naast elkaar verlijmd (naden evenwijdig aan de neus)
  //  'lamellen' – elke trede apart in stroken gezaagd en weer verlijmd
  //  'auto'     – uit één plank als het past, anders in stroken (lamellen)
  //  'zuinig'   – brede plank of verlijmd paneel, wat het minste hout kost (ook als de trede op één plank past)
  // Andere onderdelen (bordes, brede stootborden, …) die breder zijn dan de breedste plank voor die soort, of die met
  // "lamellen" gekozen zijn, worden in stroken gezaagd. maxWOf(type) = breedste plank voor die soort.
  function buildPieces(parts, S, mode, maxW, maxWOf) {
    const pieces = [];
    for (const p of parts) {
      const k = kerfOf(p.type, S), isT = p.type === 'trede';
      // breedste plank voor deze soort; geen plank (0) = niet in stroken delen (melding volgt bij "niet geplaatst")
      const mw = (isT ? maxW : (maxWOf ? maxWOf(p.type) : 0)) || Infinity;
      // spil en baluster: vierkant/rechthoekig profiel, nooit in de breedte in stroken (een spil in lagen: zie spilPlan).
      // Uit een balk die precies op maat is (bv. spil 90×90 uit een balk van 90 breed) zonder overmaat in de breedte.
      const isPost = p.type === 'spil' || p.type === 'baluster';
      const ow = isPost && mw < p.W + 2 * S.overWidth && mw >= p.W - 0.6 ? 0 : S.overWidth;
      let make = isT ? (p.make && p.make !== 'auto' ? p.make : mode) : isPost ? 'breed' : (p.make === 'lamellen' ? 'lamellen' : 'auto');
      // automatisch: past het (met overmaat) op één plank, dan heel; anders stroken
      if (make === 'auto') make = p.W + (isT ? S.overWidth : 2 * S.overWidth) <= mw ? 'breed' : 'lamellen';
      if (make === 'zuinig' && !isT) make = 'auto';
      if (make === 'lamellen' && isT && p.W < 2 * S.glue.minFirstSeam && p.W + S.overWidth <= maxW) make = 'breed'; // te ondiep om te verlijmen
      if (make !== 'lamellen') {
        const grown = p.hasNose ? G.grow(p.poly, S.overLen, 0, S.overWidth) : G.grow(p.poly, S.overLen, ow, ow);
        const pc = piece(p, p.dispName || p.name, grown, k, p.hasNose, null, S);
        if (p.spilLayer) pc.layer = p.spilLayer; // laag van een verlijmde spil
        // zuinig: brede plank of verlijmd paneel, wat het minste hout kost; verlijmd: altijd paneel
        pc.panel = isT && make === 'verlijmd' ? 'only' : isT && make === 'zuinig' ? 'any' : 'never';
        pieces.push(pc);
      } else {
        for (const lm of lamellae(p, S, mw, isT)) {
          const ga = Math.max(S.overWidth, S.glue.allowance);
          const nose = isT && lm.k === 0;
          const grown = G.grow(lm.poly, S.overLen, nose ? 0 : ga, ga);
          const label = isT ? `${p.dispName || p.name} lamel ${lm.k + 1}/${lm.n}` + (nose ? ' (neus)' : '') : `${p.dispName || p.name} deel ${lm.k + 1}/${lm.n}`;
          const pc = piece(p, label, grown, kerfOf('lamel', S), nose, { k: lm.k, n: lm.n, y0: lm.y0, y1: lm.y1 }, S);
          pc.panel = 'never';
          pieces.push(pc);
        }
      }
    }
    return pieces;
  }
  const b0 = (pc) => Math.min(...pc.variants.map(v => v.h));   // benodigde breedte (dwars op de nerf)
  function piece(part, label, grown, kerf, nose, lamel, S) {
    const poly = G.normalize(grown);
    const b = G.bbox(poly);
    const variants = [];
    const add = (key, pl, edge) => { const q = G.normalize(pl); const bb = G.bbox(q); variants.push({ key, poly: q, rect: [[0, 0], [bb.w, 0], [bb.w, bb.h], [0, bb.h]], w: bb.w, h: bb.h, edge }); };
    if (nose) {
      add('A', poly, 'A'); add('B', G.rot180(poly), 'B');
      if (S.mirrorAllowed) { add('Am', G.mirrorX(poly), 'A'); add('Bm', G.rot180(G.mirrorX(poly)), 'B'); }
      // middenlijn (instelling): neus op een gezaagde rechte lijn midden in een brede plank;
      // MA = trede boven de lijn (neus omlaag), MB = trede onder de lijn (neus omhoog)
      if (S.midLine && S.midLine.enabled) {
        add('MA', poly, 'M'); add('MB', G.rot180(poly), 'M');
        if (S.mirrorAllowed) { add('MAm', G.mirrorX(poly), 'M'); add('MBm', G.rot180(G.mirrorX(poly)), 'M'); }
      }
    } else {
      add('0', poly, null); add('180', G.rot180(poly), null);
    }
    return { pid: part.id, part, label, kerf, nose, lamel, w: b.w, h: b.h, area: Math.abs(G.area(poly)), net: lamel ? Math.abs(G.area(G.clipY(part.poly, lamel.y0 - 1, lamel.y1) || part.poly)) : part.netArea, variants };
  }

  // Mag dit stuk uit deze maat komen? (soort onderdeel volgens de materialenlijst, en paneel ja/nee)
  function canUse(stock, pc) {
    if (!M.allows(stock, pc.part.type)) return false;
    const pm = pc.panel || 'never';
    return stock.panel ? pm !== 'never' : pm !== 'only';
  }

  // Verlijmde panelen: twee (of drie) planken van dezelfde lengte in de breedte naast elkaar gelijmd.
  // Na het vlakken van de naden is het paneel 'allowance' per naad smaller. De buitenste planken zijn
  // minstens minFirstSeam breed, zodat de eerste naad nooit vlak achter de neus ligt (neus ligt op een buitenrand).
  // type: voor welke onderdeelsoort de panelen zijn (treden, bordes, …); bij brede delen ook panelen van 3–6 planken.
  function panelsFor(stocks, S, needDepth, type = 'trede') {
    const base = stocks.filter(s => !s.panel && M.allows(s, type) && s.width >= S.glue.minFirstSeam);
    const al = S.glue.allowance || 0, seamCost = S.glue.seamCost || 0;
    const byLen = new Map();
    // nooit planken uit verschillende submappen in één paneel
    for (const s of base) { const k = M.fullName(s) + '|' + s.netT + '|' + s.length; if (!byLen.has(k)) byLen.set(k, []); byLen.get(k).push(s); }
    const best = new Map();
    const add = (planks) => {
      const n = planks.length, W = planks.reduce((a, s) => a + s.width, 0) - al * (n - 1), L = planks[0].length;
      const price = planks.reduce((a, s) => a + M.boardPrice(s), 0) + (n - 1) * seamCost * L / 1000;
      const k = M.fullName(planks[0]) + '|' + planks[0].netT + '|' + L + '|' + W;
      const cur = best.get(k);
      if (cur && cur.price <= price) return;
      const seams = []; let y = 0;
      for (let i = 0; i < n - 1; i++) { y += planks[i].width - al / 2; seams.push(y); y += -al / 2; }
      best.set(k, { id: 'pan-' + (type === 'trede' ? '' : type + '-') + planks.map(s => s.id).join('-'), material: planks[0].material, sub: planks[0].sub || '', grossT: planks[0].grossT, netT: planks[0].netT,
        width: W, length: L, price, priceMode: 'stuk', available: null, stock: false, supplier: planks[0].supplier || '', types: [type],
        panel: { planks: planks.map(s => ({ id: s.id, width: s.width, length: s.length, grossT: s.grossT, netT: s.netT, material: s.material, sub: s.sub || '', price: M.boardPrice(s), supplier: s.supplier || '', stock: !!s.stock })), seams } });
    };
    for (const list of byLen.values()) {
      // per breedte de goedkoopste plank
      const byW = new Map(); for (const s of list) { const c = byW.get(s.width); if (!c || M.boardPrice(s) < M.boardPrice(c)) byW.set(s.width, s); }
      const ws = [...byW.values()].sort((a, b) => a.width - b.width), wmax = ws.length ? ws[ws.length - 1].width : 0;
      if (!ws.length) continue;
      // hoeveel planken zijn er minstens nodig voor de breedste vraag (altijd panelen van 2 planken)
      const need = Math.max(2, Math.min(6, Math.ceil((needDepth - al) / (wmax - al || 1))));
      for (let i = 0; i < ws.length; i++) for (let j = i; j < ws.length; j++) add([ws[i], ws[j]]);
      if (need >= 3) for (let i = 0; i < ws.length; i++) for (let j = i; j < ws.length; j++) for (let k = j; k < ws.length; k++) add([ws[i], ws[k], ws[j]]);
      // 4 tot 6 planken: de buitenste twee mogen verschillen, de middelste zijn de breedste
      for (let n = 4; n <= need; n++) for (let i = 0; i < ws.length; i++) for (let j = i; j < ws.length; j++) add([ws[i]].concat(Array(n - 2).fill(ws[ws.length - 1]), [ws[j]]));
    }
    return [...best.values()];
  }

  // ---------- plank en plaatsing ----------
  function newBoard(stock, S) {
    const ml = S.midLine || {};
    return { id: 'b' + Math.random().toString(36).slice(2, 8), stock, L: stock.length, W: stock.width, xmin: S.endTrim, xmax: stock.length - S.endTrim, pl: [], usedRight: S.endTrim,
      midOK: !!ml.enabled && stock.width >= (ml.minWidth || 0), line: null, lineKerf: 0, minSeam: S.glue.minFirstSeam };
  }
  // De middenlijn is een langssnede over de hele plank: geen enkel stuk mag over die zaagbaan liggen.
  function bandHit(bb, line, lk) { return bb.y1 > line - lk + 0.01 && bb.y0 < line - 0.01; }
  // y-ligging van een middentrede ten opzichte van de lijn
  const midY = (v, line, lk) => (v.key.startsWith('MA') ? line : line - lk - v.h);
  function polyAt(v, x, y, rectMode) { return (rectMode ? v.rect : v.poly).map(([a, b]) => [a + x, b + y]); }
  function bboxOf(poly) { return G.bbox(poly); }

  function collides(board, poly, bb, kerf, ignore) {
    if (board.line !== null && board.line !== undefined && bandHit(bb, board.line, board.lineKerf)) return true;
    for (const q of board.pl) {
      if (q === ignore) continue;
      const k = Math.max(kerf, q.kerf);
      if (bb.x0 >= q.bb.x1 + k || q.bb.x0 >= bb.x1 + k || bb.y0 >= q.bb.y1 + k || q.bb.y0 >= bb.y1 + k) continue;
      if (G.polyDistance(poly, q.poly, k) < k - 1e-6) return true;
    }
    return false;
  }
  function inBoard(board, bb) { return bb.x0 >= board.xmin - 1e-6 && bb.x1 <= board.xmax + 1e-6 && bb.y0 >= -1e-6 && bb.y1 <= board.W + 1e-6; }

  // Afstand waarover A naar links kan schuiven tot het B raakt.
  function slideDist(A, B) {
    let d = Infinity;
    const cast = (P, Q, dir) => {
      for (const p of P) for (let i = 0; i < Q.length; i++) {
        const a = Q[i], b = Q[(i + 1) % Q.length];
        const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
        if (!(p[1] >= lo && p[1] < hi) || hi - lo < 1e-9) continue;
        const x = a[0] + (p[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
        const t = dir * (p[0] - x);
        if (t >= -1e-6 && t < d) d = Math.max(0, t);
      }
    };
    cast(A, B, 1); cast(B, A, -1);
    return d;
  }

  // Schuif een geplaatst stuk naar links (axis 'x') of omlaag ('y') tot contact, en dan terug tot de zaagsnede past.
  const swap = (p) => p.map(([a, b]) => [b, a]);
  function slide(board, pc, v, x, y, poly, bb, rectMode, axis) {
    const X = axis === 'x';
    let d = X ? x - board.xmin : y;
    for (const q of board.pl) {
      const k = q.kerf + pc.kerf;
      if (X ? (q.bb.y1 > bb.y0 - k && q.bb.y0 < bb.y1 + k && q.bb.x0 < bb.x1) : (q.bb.x1 > bb.x0 - k && q.bb.x0 < bb.x1 + k && q.bb.y0 < bb.y1))
        d = Math.min(d, X ? slideDist(poly, q.poly) : slideDist(swap(poly), swap(q.poly)));
    }
    if (d <= 1e-3) return { x, y, poly, bb };
    const start = X ? x : y;
    let t = start - d, guard = 0;
    for (;;) {
      const nx = X ? t : x, ny = X ? y : t;
      const np = polyAt(v, nx, ny, rectMode), nb = bboxOf(np);
      if (inBoard(board, nb) && !collides(board, np, nb, pc.kerf)) return { x: nx, y: ny, poly: np, bb: nb };
      let deficit = pc.kerf;
      for (const q of board.pl) { const k = Math.max(pc.kerf, q.kerf); const dd = G.polyDistance(np, q.poly, 0); if (dd < k) deficit = Math.min(deficit, k - dd); }
      t += Math.max(0.3, deficit); if (t >= start || ++guard > 300) return { x, y, poly, bb };
    }
  }

  // Zoek voor een stuk de beste plek op een plank: bottom-left, met schuiven naar links tot contact.
  function findPosition(board, pc, rectMode, only) {
    let best = null;
    const hasLine = board.line !== null && board.line !== undefined;
    for (const v of pc.variants) {
      if (only && v.key !== only) continue;
      if (v.w > board.xmax - board.xmin + 1e-6 || v.h > board.W + 1e-6) continue;
      if (v.edge === 'M') {
        if (!board.midOK) continue;
        // alle middentreden op één lijn: ligt die er al, dan alleen die; anders kandidaat-lijnen proberen
        const lk = hasLine ? board.lineKerf : pc.kerf;
        let lines = hasLine ? [board.line] : [board.W / 2];
        // MA: trede boven de lijn (y = c); MB: trede onder de lijn (bovenkant = c − zaagsnede)
        if (!hasLine) for (const q of board.pl) {
          const k = Math.max(pc.kerf, q.kerf);
          if (v.key.startsWith('MA')) lines.push(q.bb.y1 + Math.max(lk, k), q.bb.y0 - k - v.h);
          else lines.push(q.bb.y0, q.bb.y1 + k + lk + v.h);
        }
        lines = [...new Set(lines.map(c => Math.round(c * 10) / 10))];
        for (const c of lines) {
          const y = midY(v, c, lk);
          if (y < 30 || y + v.h > board.W - 30) continue; // dan is het gewoon een randtrede
          if (!hasLine && board.pl.some(q => bandHit(q.bb, c, lk))) continue;
          if (board.stock.panel && board.stock.panel.seams.some(s => (v.key.startsWith('MA') ? s > c && s < c + board.minSeam : s < c - lk && s > c - lk - board.minSeam))) continue; // naad niet vlak achter de neus
          const save = [board.line, board.lineKerf];
          board.line = c; board.lineKerf = lk;
          const pos = placeAtY(board, pc, v, y, rectMode, best);
          [board.line, board.lineKerf] = save;
          if (pos && (!best || pos.right < best.right - 1e-6)) { pos.line = c; pos.lineKerf = lk; best = pos; }
        }
        continue;
      }
      let ys;
      if (v.edge === 'A') ys = [0]; else if (v.edge === 'B') ys = [board.W - v.h];
      else {
        ys = [0, board.W - v.h];
        for (const q of board.pl) ys.push(q.bb.y1 + Math.max(pc.kerf, q.kerf), q.bb.y0 - Math.max(pc.kerf, q.kerf) - v.h);
        ys = [...new Set(ys.map(y => Math.round(y * 10) / 10))].filter(y => y >= -1e-6 && y + v.h <= board.W + 1e-6);
      }
      for (const y of ys) {
        const starts = [board.xmin];
        for (const q of board.pl) if (q.bb.y1 > y - 10 && q.bb.y0 < y + v.h + 10) starts.push(q.bb.x1 + Math.max(pc.kerf, q.kerf));
        starts.sort((a, b) => a - b);
        for (const sx of starts) {
          if (best && sx + v.w >= best.right) break;
          let x = sx, poly = polyAt(v, x, y, rectMode), bb = bboxOf(poly);
          if (!inBoard(board, bb) || collides(board, poly, bb, pc.kerf)) continue;
          // naar links schuiven tot contact, daarna terug tot de zaagsnede past
          let yy = y;
          ({ x, poly, bb } = slide(board, pc, v, x, yy, poly, bb, rectMode, 'x'));
          if (!v.edge) { // losse delen ook omlaag laten zakken en daarna weer naar links
            const s2 = slide(board, pc, v, x, yy, poly, bb, rectMode, 'y');
            if (s2.y < yy - 0.5) { yy = s2.y; ({ x, poly, bb } = slide(board, pc, v, s2.x, yy, s2.poly, s2.bb, rectMode, 'x')); }
          }
          const right = bb.x1;
          const y0 = yy;
          if (!best || right < best.right - 1e-6 || (Math.abs(right - best.right) < 1e-6 && y0 < best.y)) best = { v, x, y: y0, poly, bb, right };
        }
      }
    }
    return best;
  }
  // Eén vaste y (randtrede of middentrede): links beginnen of achter een buurdeel, en dan naar links schuiven.
  function placeAtY(board, pc, v, y, rectMode, bestSoFar) {
    let best = null;
    const starts = [board.xmin];
    for (const q of board.pl) if (q.bb.y1 > y - 10 && q.bb.y0 < y + v.h + 10) starts.push(q.bb.x1 + Math.max(pc.kerf, q.kerf));
    starts.sort((a, b) => a - b);
    for (const sx of starts) {
      if ((best && sx + v.w >= best.right) || (bestSoFar && sx + v.w >= bestSoFar.right)) break;
      let x = sx, poly = polyAt(v, x, y, rectMode), bb = bboxOf(poly);
      if (!inBoard(board, bb) || collides(board, poly, bb, pc.kerf)) continue;
      ({ x, poly, bb } = slide(board, pc, v, x, y, poly, bb, rectMode, 'x'));
      if (!best || bb.x1 < best.right - 1e-6) best = { v, x, y, poly, bb, right: bb.x1 };
    }
    return best;
  }
  function commit(board, pc, pos) {
    const q = { pc, key: pos.v.key, x: pos.x, y: pos.y, poly: pos.poly, bb: pos.bb, kerf: pc.kerf, edge: pos.v.edge };
    if (pos.v.edge === 'M' && (board.line === null || board.line === undefined)) { board.line = pos.line; board.lineKerf = pos.lineKerf; }
    board.pl.push(q); board.usedRight = Math.max(board.usedRight, pos.bb.x1);
    return q;
  }

  // ---------- greedy decoder ----------
  function decode(order, pieces, stocks, S, opt) {
    const boards = [], unplaced = [], used = new Map();
    const done = new Set();
    const avail = (s) => s.available === null || s.available === undefined || (used.get(s.id) || 0) < s.available;
    for (const idx of order) {
      if (done.has(idx)) continue;
      const pc = pieces[idx];
      // 1. bestaande planken: de plek die het minst nieuw oppervlak opent
      let best = null;
      for (const b of boards) {
        if (!canUse(b.stock, pc)) continue; // maat niet bedoeld voor dit soort onderdeel
        const pos = findPosition(b, pc, opt.rectMode); if (!pos) continue;
        const opened = Math.max(0, pos.right - b.usedRight) * b.W;
        if (!best || opened < best.opened - 1e-6 || (Math.abs(opened - best.opened) < 1e-6 && pos.right < best.pos.right)) best = { b, pos, opened };
      }
      if (best) { commit(best.b, pc, best.pos); done.add(idx); continue; }
      // 2. nieuwe plank: per breedte één keer vullen op de langste lengte; omdat er van links wordt gevuld,
      //    is daaruit voor elke kortere lengte af te lezen wat erop past. Kies laagste prijs per geplaatst oppervlak,
      //    en vul die maat daarna echt.
      const fill = (s) => {
        const tb = newBoard(s, S);
        const pos = findPosition(tb, pc, opt.rectMode); if (!pos) return null;
        commit(tb, pc, pos);
        const filled = [idx];
        // best-fit: steeds het stuk (uit de eerstvolgende in de volgorde) dat het minst nieuw afval maakt
        const cand = order.filter(j => j !== idx && !done.has(j)).slice(0, opt.lookahead);
        const tried = new Set();
        for (;;) {
          let bestJ = null;
          for (const j of cand) {
            if (tried.has(j)) continue;
            if (!canUse(s, pieces[j])) { tried.add(j); continue; }
            const p2 = findPosition(tb, pieces[j], opt.rectMode);
            if (!p2) { tried.add(j); continue; }
            const waste = Math.max(0, p2.right - tb.usedRight) * tb.W - pieces[j].net;
            if (!bestJ || waste < bestJ.waste) bestJ = { j, p2, waste };
          }
          if (!bestJ) break;
          commit(tb, pieces[bestJ.j], bestJ.p2); filled.push(bestJ.j); tried.add(bestJ.j);
        }
        return { tb, filled };
      };
      const byWidth = new Map();
      for (const s of stocks) if (avail(s) && canUse(s, pc)) { if (!byWidth.has(s.width)) byWidth.set(s.width, []); byWidth.get(s.width).push(s); }
      let est = null;
      for (const [, list] of byWidth) {
        const longest = list.reduce((a, b) => (b.length > a.length ? b : a));
        const f = fill(longest); if (!f) continue;
        for (const s of list) {
          const lim = s.length - S.endTrim + 1e-6;
          let net = 0, any = false;
          for (const q of f.tb.pl) if (q.bb.x1 <= lim) { net += q.pc.net; if (q.pc === pc) any = true; }
          if (!any) continue;
          const price = M.boardPrice(s), ratio = price / net;
          if (!est || ratio < est.ratio - 1e-9 || (Math.abs(ratio - est.ratio) < 1e-9 && price < est.price)) est = { s, ratio, price };
        }
      }
      const choice = est && fill(est.s);
      if (!choice) { unplaced.push(pc); done.add(idx); continue; }
      boards.push(choice.tb); used.set(choice.tb.stock.id, (used.get(choice.tb.stock.id) || 0) + 1);
      choice.filled.forEach(j => done.add(j));
    }
    return { boards, unplaced };
  }

  // ---------- kosten ----------
  function remnantsOf(board, S) {
    // vrije rechthoeken via raster van 10 mm (alleen bruikbaar zone tussen kopse marges)
    const cell = 10, nx = Math.floor(board.L / cell), ny = Math.floor(board.W / cell);
    const occ = new Uint8Array(nx * ny);
    for (const q of board.pl) {
      const k = q.kerf;
      for (let gx = Math.max(0, Math.floor((q.bb.x0 - k) / cell)); gx < Math.min(nx, Math.ceil((q.bb.x1 + k) / cell)); gx++)
        for (let gy = Math.max(0, Math.floor((q.bb.y0 - k) / cell)); gy < Math.min(ny, Math.ceil((q.bb.y1 + k) / cell)); gy++) {
          const c = [(gx + 0.5) * cell, (gy + 0.5) * cell];
          if (G.pointInPoly(c, q.poly) || G.polyDistance([[c[0] - 5, c[1] - 5], [c[0] + 5, c[1] - 5], [c[0] + 5, c[1] + 5], [c[0] - 5, c[1] + 5]], q.poly, 0) < k) occ[gx + gy * nx] = 1;
        }
    }
    const x0c = Math.ceil(S.endTrim / cell), x1c = Math.floor((board.L - S.endTrim) / cell);
    for (let gx = 0; gx < nx; gx++) if (gx < x0c || gx >= x1c) for (let gy = 0; gy < ny; gy++) occ[gx + gy * nx] = 2;
    const rems = [];
    const minL = S.minRemnant.L / cell, minW = S.minRemnant.W / cell;
    for (let iter = 0; iter < 4; iter++) {
      // grootste vrije rechthoek (histogram-methode)
      const h = new Array(nx).fill(0); let best = null;
      for (let gy = 0; gy < ny; gy++) {
        for (let gx = 0; gx < nx; gx++) h[gx] = occ[gx + gy * nx] ? 0 : h[gx] + 1;
        const st = [];
        for (let gx = 0; gx <= nx; gx++) {
          const hh = gx < nx ? h[gx] : 0; let start = gx;
          while (st.length && st[st.length - 1][1] >= hh) {
            const [sx, sh] = st.pop(); const w = gx - sx;
            const L = Math.max(w, sh), W = Math.min(w, sh);
            if (w >= minL && sh >= minW && (!best || w * sh > best.a)) best = { a: w * sh, x: sx, y: gy - sh + 1, w, h: sh };
            start = sx;
          }
          st.push([start, hh]);
        }
      }
      if (!best) break;
      rems.push({ x: best.x * cell, y: best.y * cell, w: best.w * cell, h: best.h * cell });
      for (let gx = best.x; gx < best.x + best.w; gx++) for (let gy = best.y; gy < best.y + best.h; gy++) occ[gx + gy * nx] = 1;
    }
    return rems;
  }
  function boardStats(board, S) {
    const net = board.pl.reduce((a, q) => a + (q.pc.net || 0), 0);
    const used = board.pl.reduce((a, q) => a + Math.abs(G.area(q.poly)), 0);
    const area = board.L * board.W;
    const price = M.boardPrice(board.stock);
    const rems = remnantsOf(board, S);
    const remArea = rems.reduce((a, r) => a + r.w * r.h, 0);
    return { net, used, area, fill: net / area, price, rems, remArea, remValue: S.remnantFactor * price * remArea / area };
  }
  function softPenalty(boards, S, weights) {
    if (!weights) return 0;
    const idxOf = new Map();
    boards.forEach((b, i) => b.pl.forEach(q => { if (q.pc.part.type === 'trede' && !(q.pc.lamel && q.pc.lamel.k > 0)) idxOf.set((q.pc.part.stair || '') + '#' + q.pc.part.nr, i); }));
    let pen = 0;
    const treadBoards = new Set(idxOf.values());
    pen += (weights.treadBoards || 0) * Math.max(0, treadBoards.size - 1);
    for (const [k, bi] of idxOf) { const [st, nr] = k.split('#'); const prev = idxOf.get(st + '#' + (nr - 1)); if (prev !== undefined && Math.abs(prev - bi) > 1) pen += (weights.treadJump || 0) * (Math.abs(prev - bi) - 1); }
    return pen;
  }
  function evaluate(sol, S, weights) {
    let price = 0, rem = 0;
    for (const b of sol.boards) { const st = quickStats(b); price += st.price; rem += st.remValue; }
    const unpl = sol.unplaced.length * 1e6;
    return price - rem + softPenalty(sol.boards, S, weights) + unpl;
    function quickStats(b) {
      const p = M.boardPrice(b.stock);
      const free = Math.max(0, b.xmax - b.usedRight - b.pl[0].kerf);
      const remA = free >= S.minRemnant.L ? free * b.W : 0;
      return { price: p, remValue: S.remnantFactor * p * remA / (b.L * b.W) };
    }
  }

  // ---------- verbeterstappen ----------
  // Plank vervangen door goedkopere maat, of twee planken samenvoegen tot één.
  function repack(pcs, stock, S, rectMode) {
    if (!pcs.every(pc => canUse(stock, pc))) return null;
    const b = newBoard(stock, S);
    const sorted = pcs.slice().sort((a, c) => c.area - a.area);
    for (const pc of sorted) { const pos = findPosition(b, pc, rectMode); if (!pos) return null; commit(b, pc, pos); }
    return b;
  }
  function shrinkAndMerge(sol, stocks, S, rectMode) {
    const used = new Map(); sol.boards.forEach(b => used.set(b.stock.id, (used.get(b.stock.id) || 0) + 1));
    const avail = (s) => s.available === null || s.available === undefined || (used.get(s.id) || 0) < s.available;
    const byPrice = stocks.slice().sort((a, b) => M.boardPrice(a) - M.boardPrice(b));
    // samenvoegen
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < sol.boards.length; i++) for (let j = i + 1; j < sol.boards.length; j++) {
        const A = sol.boards[i], B = sol.boards[j]; const cost = M.boardPrice(A.stock) + M.boardPrice(B.stock);
        for (const s of byPrice) {
          if (M.boardPrice(s) >= cost - 0.01) break;
          if (!avail(s) && s.id !== A.stock.id && s.id !== B.stock.id) continue;
          const nb = repack(A.pl.concat(B.pl).map(q => q.pc), s, S, rectMode);
          if (nb) {
            used.set(A.stock.id, used.get(A.stock.id) - 1); used.set(B.stock.id, used.get(B.stock.id) - 1); used.set(s.id, (used.get(s.id) || 0) + 1);
            sol.boards.splice(j, 1); sol.boards[i] = nb; merged = true; break outer;
          }
        }
      }
    }
    // verkleinen
    sol.boards = sol.boards.map(b => {
      const cur = M.boardPrice(b.stock);
      for (const s of byPrice) {
        if (M.boardPrice(s) >= cur - 0.01) break;
        if (!avail(s)) continue;
        const nb = repack(b.pl.map(q => q.pc), s, S, rectMode);
        if (nb) { used.set(b.stock.id, used.get(b.stock.id) - 1); used.set(s.id, (used.get(s.id) || 0) + 1); return nb; }
      }
      return b;
    });
    // ook: onderdelen uit de huidige plank opnieuw dichter leggen
    return sol;
  }

  // Ondergrens: netto (met overmaat en zaagsnede) tegen de goedkoopste prijs per m² plankoppervlak.
  function lowerBound(pieces, stocks, S) {
    if (!stocks.length) return 0;
    let need = 0; for (const pc of pieces) need += (pc.w + pc.kerf) * (pc.h + pc.kerf) * 0 + Math.abs(pc.area) + pc.kerf * (pc.w + pc.h);
    const best = Math.min(...stocks.map(s => M.boardPrice(s) / ((s.length - 2 * S.endTrim) * s.width)));
    return need * best;
  }

  // ---------- hoofdroutine per groep ----------
  function initialOrder(pieces) {
    const idx = pieces.map((_, i) => i);
    const rank = (p) => (p.part.type === 'trapboom' || p.part.type === 'keepboom' ? 3 : p.part.type === 'leuning' ? 2 : 0);
    return idx.sort((a, b) => (rank(pieces[b]) - rank(pieces[a])) || (pieces[b].w * pieces[b].h - pieces[a].w * pieces[a].h));
  }

  async function run(pieces, stocks, S, opt, onTick) {
    const t0 = performance.now();
    // drie startvolgordes (oppervlak, lengte, diepte); de beste is het vertrekpunt
    let order = null, cur = null, curCost = Infinity;
    const base = initialOrder(pieces);
    const starts = [base, base.slice().sort((a, b) => pieces[b].w - pieces[a].w), base.slice().sort((a, b) => pieces[b].h - pieces[a].h)];
    for (const o of starts) { const s = decode(o, pieces, stocks, S, opt), c = evaluate(s, S, opt.weights); if (c < curCost) { order = o; cur = s; curCost = c; } }
    let best = cur, bestCost = curCost, bestOrder = order.slice();
    const budget = (opt.timeBudget || 3) * 1000;
    const T0 = Math.max(1, Math.min(curCost, 1e5) * 0.03); let T = T0, it = 0, lastYield = performance.now();
    const rnd = mulberry(opt.seed || 1);
    // ZP.nest.stopFlag: de gebruiker heeft op "Stoppen" gedrukt; dan de beste indeling tot nu toe
    while (performance.now() - t0 < budget && pieces.length > 1 && !ZP.nest.stopFlag) {
      it++;
      if (performance.now() - lastYield > 60) { await new Promise(r => setTimeout(r, 0)); lastYield = performance.now(); }
      const cand = order.slice();
      const r = rnd();
      const i = Math.floor(rnd() * cand.length), j = Math.floor(rnd() * cand.length);
      if (r < 0.5) [cand[i], cand[j]] = [cand[j], cand[i]];
      else { const [x] = cand.splice(i, 1); cand.splice(j, 0, x); }
      const sol = decode(cand, pieces, stocks, S, opt), cost = evaluate(sol, S, opt.weights);
      if (cost < curCost || rnd() < Math.exp((curCost - cost) / T)) { order = cand; cur = sol; curCost = cost; }
      if (cost < bestCost - 1e-6) { best = sol; bestCost = cost; bestOrder = cand.slice(); }
      const f = 1 - (performance.now() - t0) / budget; T = T0 * Math.max(0.001, f * f);
      if (onTick && it % 10 === 0) onTick(it, bestCost);
    }
    best = shrinkAndMerge(best, stocks, S, opt.rectMode);
    return { sol: best, cost: evaluate(best, S, opt.weights), iterations: it, ms: performance.now() - t0 };
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Houtsoort waaruit een onderdeel gemaakt wordt: keuze in het project per vlucht (trapboom|Links|2), per kant
  // (trapboom|Links) of per onderdeelsoort (trapboom) – zoals de configurator die zet –, anders de tekening.
  function materialOf(p, S, typeMat) {
    // eigen keuze per stuk (Uitvoering, sleutel id:<onderdeel>; kopieën van trap × aantal volgen het origineel) gaat voor alles
    // daarna de keuze voor deze ene trap (s:<trap>|<soort>|<kant>, dan s:<trap>|<soort>: trappen in één project kunnen verschillen), dan per kant, dan per soort
    const t = typeMat && (typeMat['id:' + String(p.id).split('*')[0]] || (p.side && typeMat['s:' + p.stair + '|' + p.type + '|' + p.side]) || typeMat['s:' + p.stair + '|' + p.type] || typeMat[p.type + '|' + p.side + '|' + p.nr] || typeMat[p.type + '|' + p.side] || typeMat[p.type]);
    return t || M.canonMaterial(p.material, S.materialMap) || '(onbekend)';
  }
  // Groepen bepalen: materiaal + netto dikte. Onderdelen met dezelfde houtsoort en dikte (bv. treden, bomen en
  // leuningen in eiken 40 mm) delen planken; krijgen de treden een andere houtsoort, dan vormen ze een eigen groep.
  // Spil verlijmen in de dikte: is er geen plank dik genoeg (bv. spil 90×90, planken netto 42 mm), dan wordt de spil
  // uit lagen gemaakt die op elkaar gelijmd en daarna op maat geschaafd worden: 3 × 42 = 126 ≥ 90 + schaafmarge.
  // Elke laag is een gewoon stuk (lengte × spilbreedte + marge) op een plank van die dikte.
  function spilPlan(p, S, mat, materials) {
    const sp = Object.assign({ mode: 'auto', allowance: 5 }, S.spil || {});
    if (p.type !== 'spil' || !materials || sp.mode === 'massief') return null;
    const rows = materials.filter(m => M.matches(m, mat) && M.allows(m, 'spil') && m.width > 0 && m.length > 0);
    // lengte die een stuk nodig heeft: spil + overmaat op beide koppen + kopse marges van de plank
    const lNeed = p.L + 2 * S.overLen + 2 * S.endTrim - 0.01;
    // automatisch massief alleen als er een balk van die dikte is waar de spil ook in lengte en breedte uit past
    // (een balk die precies op breedte is mag: zie buildPieces); anders verlijmen uit lagen
    const massief = rows.some(m => Math.abs(m.netT - p.thickness) < 0.6 && m.width >= p.W - 0.6 && m.length >= lNeed);
    if (sp.mode === 'auto' && (!rows.length || massief)) return null;
    const need = p.thickness + sp.allowance, wNeed = p.W + sp.allowance + 2 * S.overWidth;
    let best = null;
    for (const t of [...new Set(rows.filter(m => m.netT < p.thickness - 0.6 && m.width >= wNeed && m.length >= lNeed).map(m => m.netT))]) {
      const k = Math.ceil(need / t - 1e-9), waste = k * t - need;
      if (k > 6) continue;
      if (!best || waste < best.waste - 0.01 || (Math.abs(waste - best.waste) < 0.01 && k < best.k)) best = { t, k, waste };
    }
    return best && Object.assign(best, { allowance: sp.allowance });
  }
  function spilLayers(p, plan) {
    const W = p.W + plan.allowance, L = p.L, out = [];
    for (let i = 1; i <= plan.k; i++) out.push(Object.assign({}, p, {
      thickness: plan.t, W, poly: [[0, 0], [L, 0], [L, W], [0, W]], hasNose: false,
      // netto: de spil zelf (L × S × S), verdeeld over de lagen
      netArea: L * p.W * p.thickness / (plan.k * plan.t),
      name: `${p.name} laag ${i}/${plan.k}`, dispName: `${p.dispName || p.name} laag ${i}/${plan.k}`,
      spilLayer: { i, k: plan.k, t: plan.t, of: p.thickness } }));
    return out;
  }
  // stairs (optioneel): trappen met `aantal` > 1 worden zo vaak ingedeeld (P.metAantal)
  function groupsOf(parts, S, typeMat, materials, stairs) {
    const map = new Map();
    for (const p0 of ZP.parts.metAantal(parts, stairs)) {
      if (!p0.include) continue;
      const mat = materialOf(p0, S, typeMat);
      const plan = spilPlan(p0, S, mat, materials);
      for (const p of plan ? spilLayers(p0, plan) : [p0]) {
      const key = mat + '|' + p.thickness;
      if (!map.has(key)) map.set(key, { key, material: mat, thickness: p.thickness, parts: [] });
      map.get(key).parts.push(p);
      }
    }
    return [...map.values()].sort((a, b) => b.thickness - a.thickness);
  }
  function stocksFor(group, materials, groupCfg) {
    const allowed = groupCfg && groupCfg.allowed;
    const types = group.parts ? [...new Set(group.parts.map(p => p.type))] : null;
    const rows = materials.filter(m => M.matches(m, group.material) && Math.abs(m.netT - group.thickness) < 0.6 && m.width > 0 && m.length > 0
      && (!types || types.some(t => M.allows(m, t))));
    // dezelfde maat bij verschillende onderdelen = één inkoopmaat, zodat bv. treden en trapbomen een plank kunnen delen
    return M.mergeStocks(rows).filter(s => !allowed || s.ids.some(id => allowed.includes(id)));
  }

  const VARIANTS = {
    hout: { label: 'Minste hout', weights: { treadBoards: 0, treadJump: 0 }, rectMode: false },
    kleur: { label: 'Mooiste kleurverloop', weights: { treadBoards: 40, treadJump: 25 }, rectMode: false },
    zagen: { label: 'Makkelijkst te zagen', weights: { treadBoards: 5, treadJump: 5 }, rectMode: true },
  };

  // Eén groep optimaliseren; bij treden in 'auto' worden brede plank en verlijmd beide doorgerekend.
  async function optimizeGroup(group, materials, S, groupCfg, variantKey, onTick) {
    const stocks = stocksFor(group, materials, groupCfg);
    const V = VARIANTS[variantKey || 'hout'];
    const rectMode = V.rectMode || !S.contour;
    const weights = Object.assign({}, S.soft, V.weights);
    // grootste maat per onderdeelsoort (treden kunnen bijvoorbeeld alleen uit eigen maten komen)
    const forType = (t) => stocks.filter(s => M.allows(s, t));
    const maxOf = (t, k) => { const l = forType(t); return l.length ? Math.max(...l.map(s => s[k])) : 0; };
    const maxW = maxOf('trede', 'width');
    const mode = (groupCfg && groupCfg.treadMode) || S.treadMode;
    const hasTreads = group.parts.some(p => p.type === 'trede');
    // 'auto': brede planken en verlijmde panelen in één berekening (de goedkoopste wint per plank);
    // lamellen per trede worden ter vergelijking apart doorgerekend.
    // 'auto': per trede één plank als het past, anders stroken; een verlijmd paneel alleen als daar bewust voor gekozen is
    const modes = [hasTreads ? mode : 'auto'];
    const needDepth = Math.max(0, ...group.parts.filter(p => p.type === 'trede').map(p => p.W + S.overWidth));
    const wantPanels = hasTreads && (mode === 'verlijmd' || mode === 'zuinig' || group.parts.some(p => p.type === 'trede' && (p.make === 'verlijmd' || p.make === 'zuinig')));
    const panels = wantPanels ? panelsFor(stocks, S, needDepth) : [];
    const maxWOf = (t) => maxOf(t, 'width');
    const results = [];
    for (const m of modes) {
      const pieces = buildPieces(group.parts, S, m, maxW, maxWOf);
      const usePanels = pieces.some(pc => pc.panel && pc.panel !== 'never');
      const pool = usePanels ? stocks.concat(panels) : stocks;
      const opt = { rectMode, weights, lookahead: 14, timeBudget: S.timeBudget / modes.length, seed: 7 };
      const r = await run(pieces, pool, S, opt, onTick);
      r.mode = m; r.pieces = pieces; r.lowerBound = lowerBound(pieces, pool, S);
      results.push(r);
    }
    results.sort((a, b) => a.cost - b.cost);
    const chosen = results[0];
    const problems = [];
    // duidelijke oorzaak: verkeerde dikte, of plank soort niet aangevinkt voor deze soort onderdeel
    const ofWood = materials.filter(m => M.matches(m, group.material) && m.width > 0 && m.length > 0);
    const ofThick = ofWood.filter(m => Math.abs(m.netT - group.thickness) < 0.6);
    const subsOf = (rows) => [...new Set(rows.map(m => m.sub || M.fullName(m)))].join(', ');
    if (!ofWood.length) problems.push(`Geen houtsoort "${group.material}" in de materialenlijst. Voeg hem toe bij Materialen of kies bij Hout een andere houtsoort.`);
    else if (!ofThick.length) problems.push(`${group.material} heeft geen plank soort met netto ${group.thickness} mm (wel: ${[...new Set(ofWood.map(m => m.netT))].sort((a, b) => a - b).map(t => t + ' mm').join(', ')}). Pas de dikte van het onderdeel aan of voeg een plank soort met die dikte toe.` +
      (group.parts.some(p => p.type === 'spil') ? ' Een spil kan ook uit lagen verlijmd worden: vink bij Materialen → Geschikt voor "Spillen" aan bij een dunnere plank soort die breed en lang genoeg is.' : ''));
    for (const t of [...new Set(group.parts.map(p => p.type))])
      if (ofThick.length && !ofThick.some(m => M.allows(m, t))) problems.push(`Plank soort ${subsOf(ofThick)} van ${group.material} ${group.thickness} mm is niet aangevinkt voor ${ZP.parts.TYPES[t].label.toLowerCase()}. Vink "${ZP.parts.TYPES[t].label}" aan bij Materialen → Geschikt voor.`);
    if (stocks.length) for (const pc of chosen.sol.unplaced) {
      const t = pc.part.type, maxL = maxOf(t, 'length'), maxWt = maxOf(t, 'width');
      if (!forType(t).length) continue;
      const post = t === 'spil' || t === 'baluster';
      const why = pc.w > maxL - 2 * S.endTrim ? `langer (${Math.round(pc.w)} mm incl. overmaat) dan de langste maat (${maxL} mm − kopse marges)` :
        post && pc.h > maxWt + 0.5 ? `${Math.round(pc.part.W)} mm breed (${Math.round(pc.h)} mm met overmaat), de breedste balk/plank voor ${ZP.parts.TYPES[t].label.toLowerCase()} is ${maxWt} mm` :
        pc.h > maxWt && pc.panel === 'never' ? `breder (${Math.round(pc.h)} mm) dan de breedste plank (${maxWt} mm); kies bij Controleren "verlijmd paneel"` :
        pc.panel === 'only' ? `geen verlijmd paneel mogelijk van ${Math.round(pc.h)} × ${Math.round(pc.w)} mm (te lang of te breed voor zes planken van dezelfde lengte)` : 'past niet';
      problems.push(`${pc.label}: ${why}.`);
    }
    return { group, variant: variantKey || 'hout', rectMode, chosen, alternatives: results, stocks, problems };
  }

  return { buildPieces, panelsFor, canUse, findPosition, commit, newBoard, decode, run, optimizeGroup, groupsOf, materialOf, stocksFor, boardStats, remnantsOf, collides, inBoard, polyAt, VARIANTS, kerfOf, lamellae };
})();
