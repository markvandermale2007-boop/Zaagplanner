// Indeling bewaren/herstellen, zaagvolgorde, statistiek en lijsten.
ZP.layout = (function () {
  const G = ZP.geom, N = ZP.nest, M = ZP.materials;

  // Optimalisatieresultaat -> bewaarbare indeling (gewone JSON).
  function fromResult(res, S) {
    const r = res.chosen;
    const ids = new Map();
    const pieces = r.pieces.map((pc, i) => {
      const id = 'pc' + i; ids.set(pc, id);
      return { id, pid: pc.pid, label: pc.label, kerf: pc.kerf, nose: pc.nose, lamel: pc.lamel, layer: pc.layer, net: pc.net, area: pc.area, w: pc.w, h: pc.h, panel: pc.panel, type: pc.part.type, nr: pc.part.nr, side: pc.part.side, stair: pc.part.stair, variants: pc.variants };
    });
    const boards = r.sol.boards.map(b => ({ id: b.id, stock: Object.assign({}, b.stock), L: b.L, W: b.W, xmin: b.xmin, xmax: b.xmax,
      midOK: b.midOK, line: b.line, lineKerf: b.lineKerf, minSeam: b.minSeam,
      pl: b.pl.map(q => ({ piece: ids.get(q.pc), key: q.key, x: q.x, y: q.y })) }));
    return { groupKey: res.group.key, material: res.group.material, thickness: res.group.thickness, variant: res.variant, mode: r.mode, rectMode: res.rectMode,
      pieces, boards, unplaced: r.sol.unplaced.map(pc => ids.get(pc)), problems: res.problems,
      alternatives: res.alternatives.map(a => ({ mode: a.mode, cost: a.cost })), lowerBound: r.lowerBound, iterations: r.iterations, stockIds: res.stocks.map(s => s.id) };
  }

  // Runtime-objecten (met polygonen en omhullenden) voor bewerken en tekenen.
  function hydrate(lay) {
    const pmap = new Map(lay.pieces.map(p => [p.id, p]));
    for (const p of lay.pieces) p.part = p.part || { type: p.type, nr: p.nr, side: p.side, stair: p.stair, id: p.pid };
    for (const b of lay.boards) for (const q of b.pl) place(q, pmap.get(q.piece), lay.rectMode);
    lay._pmap = pmap;
    return lay;
  }
  function place(q, pc, rectMode) {
    const v = pc.variants.find(v => v.key === q.key) || pc.variants[0];
    q.pc = pc; q.kerf = pc.kerf; q.edge = v.edge; q.v = v;
    q.poly = N.polyAt(v, q.x, q.y, rectMode); q.bb = G.bbox(q.poly);
    return q;
  }
  function dehydrate(lay) {
    const strip = Object.assign({}, lay);
    delete strip._pmap;
    strip.pieces = lay.pieces.map(p => { const c = Object.assign({}, p); delete c.part; return c; });
    strip.boards = lay.boards.map(b => ({ id: b.id, stock: b.stock, L: b.L, W: b.W, xmin: b.xmin, xmax: b.xmax, midOK: b.midOK, line: b.line, lineKerf: b.lineKerf, minSeam: b.minSeam, pl: b.pl.map(q => ({ piece: q.piece, key: q.key, x: q.x, y: q.y })) }));
    return strip;
  }

  // Regelcontrole van één plaatsing (voor slepen/draaien).
  function valid(board, q) {
    return N.inBoard(board, q.bb) && !N.collides(board, q.poly, q.bb, q.kerf, q) && noseOk(board, q);
  }
  // neus van een trede ligt op de juiste rand of op de middenlijn
  function noseOk(board, q) {
    if (!q.edge) return true;
    if (q.edge === 'A') return Math.abs(q.bb.y0) < 0.01;
    if (q.edge === 'B') return Math.abs(q.bb.y1 - board.W) < 0.01;
    if (board.line === null || board.line === undefined) return false;
    return q.key.startsWith('MA') ? Math.abs(q.bb.y0 - board.line) < 0.01 : Math.abs(q.bb.y1 - (board.line - board.lineKerf)) < 0.01;
  }
  // y-coördinaat van de neuslijn van een trede (voor tekenen en controle)
  function noseY(board, q) {
    if (q.edge === 'A') return 0;
    if (q.edge === 'B') return board.W;
    return q.key.startsWith('MA') ? board.line : board.line - board.lineKerf;
  }

  // ---------- zaagvolgorde ----------
  // Eerst afkorten (dwars) in stukken op lengte, dan langs, dan vormzagen.
  function sawPlan(board, S) {
    const cuts = [];
    const pl = board.pl.slice().sort((a, b) => a.bb.x0 - b.bb.x0);
    const clusters = [];
    for (const q of pl) {
      const last = clusters[clusters.length - 1];
      if (last && q.bb.x0 < last.x1 + 0.1) { last.x1 = Math.max(last.x1, q.bb.x1); last.items.push(q); }
      else clusters.push({ x0: q.bb.x0, x1: q.bb.x1, items: [q] });
    }
    let n = 1;
    const pan = board.stock.panel;
    if (pan) cuts.push({ n: n++, kind: 'lijm', text: `Paneel verlijmen in de breedte: planken ${pan.planks.map(p => p.width).join(' + ')} mm × ${board.L} mm naast elkaar, naden vlakken; paneel ${Math.round(board.W)} mm breed` });
    if (clusters.length) {
      cuts.push({ n: n++, kind: 'dwars', x: Math.min(S.endTrim, clusters[0].x0 - clusters[0].items[0].kerf / 2), text: 'Kop afkorten (eindscheuren)' });
      for (let i = 0; i < clusters.length - 1; i++) {
        const a = clusters[i], b = clusters[i + 1];
        cuts.push({ n: n++, kind: 'dwars', x: (a.x1 + b.x0) / 2, text: 'Afkorten' });
      }
      const last = clusters[clusters.length - 1];
      cuts.push({ n: n++, kind: 'dwars', x: last.x1 + Math.max(...last.items.map(q => q.kerf)) / 2, text: board.L - last.x1 > S.minRemnant.L ? 'Afkorten, rest bewaren' : 'Afkorten' });
    }
    // langs: binnen elk segment horizontale scheidingen tussen stukken
    clusters.forEach((c, ci) => {
      const items = c.items.slice().sort((a, b) => a.bb.y0 - b.bb.y0);
      const bands = [];
      for (const q of items) {
        const last = bands[bands.length - 1];
        if (last && q.bb.y0 < last.y1 + 0.1) { last.y1 = Math.max(last.y1, q.bb.y1); last.items.push(q); } else bands.push({ y0: q.bb.y0, y1: q.bb.y1, items: [q] });
      }
      // middenlijn: één rechte langssnede die de neus van alle middentreden vormt
      const hasLine = board.line !== null && board.line !== undefined;
      const lineY = hasLine ? board.line - board.lineKerf / 2 : null;
      if (hasLine && items.some(q => q.edge === 'M'))
        cuts.push({ n: n++, kind: 'langs', y: lineY, x0: c.x0, x1: c.x1, text: `Middenlijn langs zagen in segment ${ci + 1}, recht en schoon: deze snede vormt de neus van ${items.filter(q => q.edge === 'M').map(q => q.pc.label).join(', ')}` });
      for (let i = 0; i < bands.length - 1; i++) {
        const y = (bands[i].y1 + bands[i + 1].y0) / 2;
        if (hasLine && Math.abs(y - lineY) < board.lineKerf + 0.5 && items.some(q => q.edge === 'M')) continue;
        cuts.push({ n: n++, kind: 'langs', y, x0: c.x0, x1: c.x1, text: `Langs zagen in segment ${ci + 1}` });
      }
      for (const q of items) {
        // schuine snede gedeeld: buurdeel ligt op precies één zaagsnede afstand
        const shared = items.some(o => o !== q && G.polyDistance(q.poly, o.poly, 0) <= Math.max(q.kerf, o.kerf) + 0.6);
        const lbl = q.pc.label;
        const t = q.edge === 'M' ? `${lbl}: vormzagen; neus = middenlijn (al gezaagd)` : q.edge ? `${lbl}: vormzagen; neus = plankrand ${q.edge}, niet zagen` : `${lbl}: vormzagen`;
        cuts.push({ n: n++, kind: 'vorm', piece: q.piece, text: shared ? t + ' (schuine snede gedeeld met buurdeel)' : t });
      }
    });
    return { cuts, clusters };
  }

  function stats(lay, S) {
    let price = 0, gross = 0, area = 0, net = 0;
    const per = lay.boards.map(b => {
      const st = N.boardStats(b, S);
      price += st.price; gross += M.boardVolume(b.stock); area += b.L * b.W; net += st.net;
      return st;
    });
    return { per, price, gross, area, netArea: net, netVol: net * lay.thickness / 1e6, boards: lay.boards.length,
      fill: area ? net / area : 0, compareVol: area * lay.thickness / 1e6 };
  }

  function purchaseList(layouts) {
    const map = new Map();
    let glue = null;
    const addPlank = (s, price) => {
      const k = [M.fullName(s), s.grossT, s.netT, s.width, s.length, s.stock ? 'v' : ''].join('|');
      const e = map.get(k) || { material: M.fullName(s), grossT: s.grossT, netT: s.netT, width: s.width, length: s.length, supplier: s.supplier, stock: s.stock, n: 0, price, vol: s.grossT * s.width * s.length / 1e6 };
      e.n++; map.set(k, e);
    };
    for (const lay of layouts) for (const b of lay.boards) {
      const s = b.stock;
      if (s.panel) {
        // een verlijmd paneel koop je als losse planken; de lijmkosten komen apart op de lijst
        for (const pl of s.panel.planks) addPlank(pl, pl.price);
        const rest = M.boardPrice(s) - s.panel.planks.reduce((a, p) => a + p.price, 0);
        if (rest > 0.001) { glue = glue || { glue: true, seams: 0, m: 0, total: 0 }; glue.seams += s.panel.seams.length; glue.m += s.panel.seams.length * s.length / 1000; glue.total += rest; }
      } else addPlank(s, M.boardPrice(s));
    }
    const list = [...map.values()].sort((a, b) => b.grossT - a.grossT || a.width - b.width || a.length - b.length);
    list.glue = glue;
    return list;
  }

  return { fromResult, hydrate, dehydrate, place, valid, noseOk, noseY, sawPlan, stats, purchaseList };
})();
