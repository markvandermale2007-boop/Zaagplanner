// Tekeningen van bewerkingen en spijltypes: schematische doorsneden en aanzichten (SVG, 160 × 100).
// Een bewerking kan een tekening uit deze bibliotheek krijgen (sleutel), een eigen afbeelding (data-URL),
// of automatisch een tekening op basis van de naam.
ZP.drawings = (function () {
  const W = (d) => `<path class="dw-wood" d="${d}"/>`;          // hout
  const L = (d) => `<path class="dw-line" d="${d}"/>`;          // hulplijn
  const K = (d) => `<path class="dw-mark" d="${d}"/>`;          // de bewerking zelf (accentkleur)
  const T = (x, y, t, a = 'middle') => `<text class="dw-txt" x="${x}" y="${y}" text-anchor="${a}">${t}</text>`;
  const grain = (x0, x1, ys) => ys.map(y => `<path class="dw-grain" d="M${x0} ${y}h${x1 - x0}"/>`).join('');

  // tekeningen (bibliotheek). Elke tekening: titel + svg-inhoud.
  const LIB = {
    'neus-rond': { t: 'Neus afronden', s: () => W('M20 40h104q16 0 16 12t-16 12H20z') + grain(26, 120, [48, 56]) + K('M124 40q16 0 16 12t-16 12') + T(80, 88, 'doorsnede trede') + L('M140 52h12') + T(150, 34, 'R', 'end') },
    'neus-profiel': { t: 'Neus profileren', s: () => W('M20 40h108c8 0 6 8 12 8 0 8-6 8-6 16H20z') + grain(26, 120, [50, 58]) + K('M128 40c8 0 6 8 12 8 0 8-6 8-6 16') + T(80, 88, 'ojief / halfrond profiel') },
    'antislip-groef': { t: 'Antislipgroeven', s: () => W('M14 22h132v56H14z') + grain(20, 140, [34, 46, 58, 70]) + K('M30 70h100M30 64h100M30 58h100') + L('M14 78h132') + T(80, 94, 'groeven bij de neus') },
    'antislip-profiel': { t: 'Antislipprofiel inlaten', s: () => W('M20 40h120v24H20z') + grain(26, 116, [50, 58]) + `<rect class="dw-metal" x="110" y="38" width="26" height="6" rx="1"/>` + K('M108 36v10h30') + T(80, 88, 'profiel verdiept in de trede') },
    'led-groef': { t: 'LED-groef', s: () => W('M20 34h120v24H20z') + grain(26, 116, [42, 50]) + `<rect class="dw-led" x="118" y="56" width="14" height="4" rx="1"/>` + K('M116 58v-6h18v6') + `<path class="dw-ray" d="M125 62l-8 18M125 62l0 20M125 62l8 18"/>` + T(70, 88, 'groef onder de neus') },
    'inkeping-spil': { t: 'Inkeping rond spil', s: () => W('M14 24h132v52H62a14 14 0 0 0-28 0H14z') + grain(20, 140, [36, 48, 60]) + `<rect class="dw-wood2" x="36" y="62" width="24" height="24"/>` + K('M62 76a14 14 0 0 0-28 0') + T(100, 94, 'uitgezaagd rond spil') },
    'bloktrede': { t: 'Bloktrede', s: () => W('M24 30h112v44H24z') + grain(30, 130, [40, 50, 60, 66]) + K('M24 52h112') + T(80, 90, 'dikke, verlijmde trede') },
    'overzettrede': { t: 'Overzettrede', s: () => `<path class="dw-wood2" d="M20 52h110v14H20z"/>` + W('M14 38h126v14H14z') + grain(20, 132, [44]) + K('M14 38h126v14') + T(66, 84, 'nieuwe trede over de oude') },
    'trede-staal': { t: 'Trede op stalen trap', s: () => W('M18 34h124v18H18z') + grain(24, 136, [42]) + `<path class="dw-metal" d="M30 52h16v34H30zM114 52h16v34h-16z"/>` + K('M38 30v26M122 30v26') + T(80, 96, 'bevestigen op staal') },
    'wand-scriben': { t: 'Wandaansluiting scriben', s: () => `<path class="dw-wall" d="M10 10h18c-6 14 4 26-2 40s6 26 0 40H10z"/>` + W('M30 14c-6 14 4 26-2 40s6 26 0 34h100V14z') + grain(40, 124, [30, 50, 70]) + K('M30 14c-6 14 4 26-2 40s6 26 0 34') + T(86, 96, 'passend tegen scheve wand') },
    'boom-afschuinen': { t: 'Boom afschuinen / profileren', s: () => W('M10 20l140 30v30L10 50z') + grain(20, 140, [40, 52]) + K('M10 50l140 30M10 44l140 30') + T(80, 96, 'onderkant boom afgeschuind') },
    'boom-ophanging': { t: 'Ophanging boom', s: () => `<path class="dw-wall" d="M110 10h40v20h-40z"/>` + W('M20 80L118 28l14 14-98 52z') + `<path class="dw-metal" d="M112 30h20v14h-20z"/>` + K('M116 30v14M128 30v14') + T(72, 96, 'beugel aan balk / vloer') },
    'smetplank': { t: 'Smetplank', s: () => `<path class="dw-wall" d="M10 10h16v80H10z"/>` + W('M26 20h14v70H26z') + K('M40 20q8 6 0 12') + W('M40 30l100 -10v16l-100 10z') + T(98, 70, 'plank langs de wand,') + T(98, 82, 'eventueel geprofileerd') },
    'spil-verlijmd': { t: 'Spil verlijmen uit lagen', s: () => W('M50 14h60v72H50z') + K('M70 14v72M90 14v72') + grain(54, 106, [30, 50, 70]) + L('M48 14h-12M48 86h-12M42 14v72') + T(30, 54, '90', 'end') + T(80, 98, '3 lagen gelijmd + geschaafd') },
    'spil-gedraaid': { t: 'Spil draaien', s: () => W('M66 6h28v14q-8 6 0 12q10 8 0 16v10q-10 8 0 16 8 6 0 12v8H66v-8q-8-6 0-12 10-8 0-16V48q-10-8 0-16 8-6 0-12z') + K('M94 20q-8 6 0 12M66 20q8 6 0 12M94 58q-10 8 0 16M66 58q10 8 0 16') + T(130, 54, 'gedraaid') },
    'spil-geprofileerd': { t: 'Spil profileren', s: () => W('M60 8h40v84H60z') + K('M70 18v64M80 18v64M90 18v64') + T(130, 54, 'gefreesd') },
    'spilkop': { t: 'Spilkop', s: () => W('M14 56h28v34H14zM66 56h28v34H66zM118 56h28v34h-28z') + K('M14 56q14-26 28 0M66 56l14-20 14 20M118 56v-6h28v6') + T(28, 98, 'bol') + T(80, 98, 'piramide') + T(132, 98, 'plat') },
    'pen-gat': { t: 'Pen-/gatverbinding', s: () => W('M20 20h26v72H20z') + W('M54 30l92-14v16l-92 14z') + K('M46 34h12v8H46z') + L('M46 34v8') + T(104, 72, 'pen in de spil') },
    'spil-inlaten': { t: 'Spil inlaten in vloer', s: () => `<path class="dw-wall" d="M10 70h140v20H10z"/>` + W('M62 10h36v74H62z') + K('M62 70v14h36V70') + T(80, 98, 'spil ingelaten / gesteld') },
    'leuning-gebogen': { t: 'Leuning gebogen verlijmen', s: () => W('M14 78q66-80 132-56v10Q82 12 14 88z') + K('M14 83q66-80 132-56') + `<path class="dw-line" d="M24 74q60-70 118-50"/>` + T(96, 94, 'lamellen op een mal') },
    'leuning-namaken': { t: 'Leuning namaken', s: () => W('M20 50c0-24 46-24 46 0 0 10-8 16-8 22H28c0-6-8-12-8-22z') + W('M94 50c0-24 46-24 46 0 0 10-8 16-8 22h-30c0-6-8-12-8-22z') + K('M76 50h10M82 46l4 4-4 4') + T(43, 90, 'bestaand') + T(117, 90, 'kopie') },
    'spijlgaten': { t: 'Spijlgaten boren', s: () => W('M10 14h140v12H10zM10 80h140v10H10z') + [30, 60, 90, 120].map(x => `<rect class="dw-wood2" x="${x - 4}" y="26" width="8" height="54"/>` + K(`M${x - 4} 26v-6h8v6M${x - 4} 80v6h8v-6`)).join('') + T(80, 99, '') },
    'spijl-gedraaid': { t: 'Gedraaide spijlen', s: () => [36, 80, 124].map(x => W(`M${x - 6} 10h12v10q-6 6 0 12q8 8 0 18v10q-8 8 0 16v14h-12V66q-8-8 0-16V32q-8-6 0-12z`)).join('') + T(80, 98, 'draaiwerk per spijl') },
    'leuningkrul': { t: 'Leuningkrul / eindkap', s: () => W('M10 40h80q30 0 30 22t-24 22-20-14 10-14v12q-14 4-6 10t16-4-12-18H10z') + K('M90 40q30 0 30 22t-24 22') + T(70, 96, 'krul aan het einde') },
    'muurhouder': { t: 'Muurleuninghouder', s: () => `<path class="dw-wall" d="M10 10h20v80H10z"/>` + `<path class="dw-metal" d="M30 46h8v12h-8zM38 52h40v6H38zM74 40h8v18h-8z"/>` + W('M68 22a16 16 0 1 1 0 0.1z') + K('M30 46h8v12h-8z') + T(114, 88, 'houder + leuning') },
    'leuningverbinding': { t: 'Leuningverbinding', s: () => W('M10 36h68v28H10zM82 36h68v28H82z') + `<path class="dw-metal" d="M50 48h60v4H50z"/>` + K('M80 30v40') + T(80, 88, 'verbindingsschroef in de las') },
    'hekwerk': { t: 'Hekwerk overloop', s: () => `<path class="dw-wall" d="M6 82h148v12H6z"/>` + W('M10 18h140v8H10zM10 74h140v8H10z') + [20, 40, 60, 80, 100, 120, 140].map(x => `<rect class="dw-wood2" x="${x - 2}" y="26" width="5" height="48"/>`).join('') + K('M10 18h140') + T(80, 12, '') },
    'rozet': { t: 'Rozet / kapje', s: () => W('M66 8h28v70H66z') + `<path class="dw-wall" d="M10 78h140v14H10z"/>` + K('M52 78q0-10 28-10t28 10z') + T(122, 70, 'rozet', 'start') },
    'algemeen': { t: 'Bewerking', s: () => W('M20 46h120v20H20z') + grain(26, 134, [54, 60]) + `<path class="dw-metal" d="M76 12h8v26h-8zM72 34h16v8H72z"/>` + K('M80 42v6') + T(80, 88, 'bewerking') },
  };
  // automatisch een tekening kiezen op basis van de naam van de bewerking
  const AUTO = [
    [/neus.*(afrond|radius)/i, 'neus-rond'], [/neus.*(profiel|ojief|halfrond)/i, 'neus-profiel'], [/antislipgroe/i, 'antislip-groef'], [/antislip/i, 'antislip-profiel'],
    [/led|verlicht/i, 'led-groef'], [/inkeping|uitspar/i, 'inkeping-spil'], [/bloktrede/i, 'bloktrede'], [/overzet/i, 'overzettrede'], [/staal|stalen/i, 'trede-staal'],
    [/scrib|wandaansl/i, 'wand-scriben'], [/afschuin/i, 'boom-afschuinen'], [/ophang|bevestiging boom/i, 'boom-ophanging'], [/smetplank/i, 'smetplank'],
    [/spil.*(verlijm|lagen)/i, 'spil-verlijmd'], [/spil.*draai|gedraaide spil/i, 'spil-gedraaid'], [/spil.*profil/i, 'spil-geprofileerd'], [/spilkop|kop maken/i, 'spilkop'],
    [/pen|gatverbinding/i, 'pen-gat'], [/inlaten|voet stellen/i, 'spil-inlaten'], [/buig|gebogen/i, 'leuning-gebogen'], [/namaken|replica/i, 'leuning-namaken'],
    [/spijlgat|gaten boren/i, 'spijlgaten'], [/gedraaide spijl/i, 'spijl-gedraaid'], [/krul|eindkap/i, 'leuningkrul'], [/muurleuninghouder|houder/i, 'muurhouder'],
    [/leuningverbind|verbindingsschroef/i, 'leuningverbinding'], [/hekwerk|overloop/i, 'hekwerk'], [/rozet|kapje/i, 'rozet']];
  function keyFor(b) {
    if (b && b.tek && LIB[b.tek]) return b.tek;
    const n = (b && b.naam) || '';
    const hit = AUTO.find(([re]) => re.test(n));
    return hit ? hit[1] : 'algemeen';
  }
  const svg = (key, cls = '') => `<svg class="dw ${cls}" viewBox="0 0 160 100" aria-hidden="true">${(LIB[key] || LIB.algemeen).s()}</svg>`;
  // tekening van een bewerking: eigen afbeelding gaat voor
  // eigen foto (ZP.fotos) of oude afbeelding (o.img) gaat voor de tekening
  const foto = (kind, o) => (o && ((ZP.fotos && o.id !== undefined && ZP.fotos.get(kind, o.id)) || o.img)) || '';
  const forBew = (b, cls = '') => (foto('bew', b) ? `<img class="dw dw-img ${cls}" src="${foto('bew', b)}" alt="${(b.naam || '').replace(/"/g, '')}">` : svg(keyFor(b), cls));

  // spijltypes: silhouet op basis van de naam (vierkant, plat, rond, gedraaid, geprofileerd, RVS)
  function spijl(s, cls = '') {
    if (foto('spijl', s)) return `<img class="dw dw-img ${cls}" src="${foto('spijl', s)}" alt="">`;
    const n = (s && s.naam) || '';
    const bw = Math.max(4, Math.min(30, (+s.breedte || 40) / 2.2));
    let body;
    if (/gedraaid/i.test(n)) body = W(`M${80 - bw / 2} 8h${bw}v10q-6 6 0 12q8 8 0 18v12q-8 8 0 16v16h-${bw}V76q-8-8 0-16V48q-8-10 0-18q6-6 0-12z`);
    else if (/rvs|staal/i.test(n)) body = `<rect class="dw-metal" x="${80 - bw / 2}" y="8" width="${bw}" height="84" rx="${bw / 2}"/>`;
    else if (/rond/i.test(n)) body = W(`M${80 - bw / 2} 8h${bw}v84h-${bw}z`) + `<path class="dw-grain" d="M${80 - bw / 4} 10v80M${80 + bw / 4} 10v80"/>`;
    else if (/profil|gefreesd/i.test(n)) body = W(`M${80 - bw / 2} 8h${bw}v84h-${bw}z`) + K(`M${80 - bw / 4} 20v60M80 20v60M${80 + bw / 4} 20v60`);
    else body = W(`M${80 - bw / 2} 8h${bw}v84h-${bw}z`) + `<path class="dw-grain" d="M80 10v80"/>`;
    return `<svg class="dw ${cls}" viewBox="0 0 160 100" aria-hidden="true">${body}<path class="dw-line" d="M40 92h80"/></svg>`;
  }

  // eigen afbeelding verkleinen tot max. 480 px (blijft klein genoeg voor de opslag in de browser)
  function shrink(file, max = 480) {
    return new Promise((res, rej) => {
      if (/svg/i.test(file.type)) { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); return; }
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const f = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Afbeelding niet leesbaar.')); };
      img.src = url;
    });
  }

  // ---------- configurator: plattegrond per type trap (120 × 120), looprichting = spiegelen ----------
  // rechte loop: rechthoek met n treden; richting 'up' | 'right' | 'down'
  function run(x0, y0, x1, y1, n, dir) {
    let s = `<rect class="cf-run" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
    for (let i = 1; i < n; i++) {
      if (dir === 'right') { const x = x0 + (x1 - x0) * i / n; s += `<path class="cf-tl" d="M${x} ${y0}V${y1}"/>`; }
      else { const y = y0 + (y1 - y0) * i / n; s += `<path class="cf-tl" d="M${x0} ${y}H${x1}"/>`; }
    }
    return s;
  }
  // draai met verdreven treden: hoekvak + lijnen vanuit de binnenhoek
  function fan(x0, y0, x1, y1, ix, iy, outer) {
    return `<rect class="cf-run" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>` + outer.map(([x, y]) => `<path class="cf-tl" d="M${ix} ${iy}L${x} ${y}"/>`).join('');
  }
  const arrow = (d) => `<path class="cf-arrow" d="${d}" marker-end="url(#cfa)"/>`;
  const PLAN = {
    'Rechte steektrap': () => run(44, 8, 76, 112, 13) + arrow('M60 106V16'),
    'Kwartslag': () => run(18, 46, 48, 112, 7) + fan(18, 16, 48, 46, 48, 46, [[18, 38], [18, 26], [18, 16], [30, 16], [40, 16]]) + run(48, 16, 112, 46, 7, 'right') + arrow('M33 106V31H106'),
    'Dubbele kwartslag': () => run(10, 44, 38, 112, 6) + fan(10, 16, 38, 44, 38, 44, [[10, 34], [10, 24], [10, 16], [22, 16], [30, 16]])
      + run(38, 16, 82, 44, 4, 'right') + fan(82, 16, 110, 44, 82, 44, [[90, 16], [100, 16], [110, 16], [110, 26], [110, 34]]) + run(82, 44, 110, 96, 5) + arrow('M24 106V30H96V90'),
    'Spiltrap': () => { let s = '<circle class="cf-run" cx="60" cy="60" r="50"/>'; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 - Math.PI / 2; s += `<path class="cf-tl" d="M${60 + 7 * Math.cos(a)} ${60 + 7 * Math.sin(a)}L${60 + 50 * Math.cos(a)} ${60 + 50 * Math.sin(a)}"/>`; }
      return s + '<circle class="cf-spil" cx="60" cy="60" r="7"/>' + arrow('M66 100A40 40 0 1 1 100 62'); },
    'Bordestrap': () => run(18, 46, 48, 112, 7) + '<rect class="cf-landing" x="18" y="16" width="30" height="30"/>' + run(48, 16, 112, 46, 7, 'right') + arrow('M33 106V31H106'),
    'S-trap': () => run(14, 82, 42, 112, 3) + fan(14, 54, 42, 82, 42, 82, [[14, 74], [14, 64], [14, 54], [24, 54], [34, 54]])
      + run(42, 54, 78, 82, 4, 'right') + fan(78, 54, 106, 82, 78, 54, [[86, 82], [96, 82], [106, 82], [106, 72], [106, 62]]) + run(78, 8, 106, 54, 5) + arrow('M28 108V68H92V14'),
    'Zoldertrap / steile trap': () => run(48, 10, 72, 110, 9) + arrow('M60 104V18') + '<text class="cf-lbl" x="96" y="64" text-anchor="middle">steil</text>',
  };
  // modellen zoals StairDesigner (Nieuwe trap › Modellen); bestaande vormen hergebruikt
  Object.assign(PLAN, {
    m1: PLAN['Rechte steektrap'], m2: PLAN['Kwartslag'], m3: PLAN['Dubbele kwartslag'], m7: PLAN['Bordestrap'],
    spil: PLAN['Spiltrap'], s: PLAN['S-trap'], zolder: PLAN['Zoldertrap / steile trap'],
    m4: () => run(40, 40, 72, 112, 6) + fan(40, 8, 72, 40, 72, 40, [[40, 32], [40, 20], [40, 8], [52, 8], [62, 8]]) + run(72, 8, 104, 40, 2, 'right') + arrow('M56 106V24H98'),
    m5: () => run(72, 80, 104, 112, 2, 'right') + fan(40, 80, 72, 112, 72, 80, [[62, 112], [52, 112], [40, 112], [40, 100], [40, 90]]) + run(40, 8, 72, 80, 7) + arrow('M98 96H56V16'),
    m6: () => { let s = run(16, 54, 46, 112, 5) + run(74, 54, 104, 112, 5) + '<path class="cf-run" d="M16 54A44 44 0 0 1 104 54H74A14 14 0 0 0 46 54z"/>';
      for (let i = 1; i < 6; i++) { const a = Math.PI + (i / 6) * Math.PI; s += `<path class="cf-tl" d="M${60 + 14 * Math.cos(a)} ${54 + 14 * Math.sin(a)}L${60 + 44 * Math.cos(a)} ${54 + 44 * Math.sin(a)}"/>`; }
      return s + arrow('M31 106V54A29 29 0 0 1 89 54V104'); },
    m8: () => run(10, 46, 38, 112, 6) + '<rect class="cf-landing" x="10" y="16" width="100" height="30"/>' + run(82, 46, 110, 96, 4) + arrow('M24 106V31H96V90'),
    m9: () => run(40, 40, 72, 112, 6) + '<rect class="cf-landing" x="40" y="8" width="32" height="32"/>' + run(72, 8, 104, 40, 2, 'right') + arrow('M56 106V24H98'),
    m10: () => run(16, 54, 46, 112, 5) + '<rect class="cf-landing" x="16" y="16" width="88" height="38"/>' + run(74, 54, 104, 112, 5) + arrow('M31 106V35H89V104'),
  });
  // boomsoort in zijaanzicht (120 × 70)
  function boom(kind, cls = '') {
    const tr = (x, y) => `<rect x="${x}" y="${y}" width="22" height="5" rx="1" class="cf-run"/>`;
    let s = '';
    if (kind === 'muurboom') s += '<rect x="0" y="0" width="120" height="70" fill="#ece8e1"/><path d="M0 8L12 0M0 24L36 0M0 40L60 0M0 56L84 0M6 70L111 0M30 70L120 10M54 70L120 26M78 70L120 42M102 70L120 58" stroke="#d3cdc3" stroke-width="1.5"/>';
    if (kind === 'keepboom') { s += '<path d="M8 66L8 58L28 58L28 48L48 48L48 38L68 38L68 28L88 28L88 18L108 18L112 22L28 70z" class="cf-landing"/>'; for (let i = 0; i < 5; i++) s += tr(6 + i * 20, 53 - i * 10); }
    else if (kind === 'geen') { for (let i = 0; i < 5; i++) s += tr(10 + i * 20, 56 - i * 10); s += '<rect x="6" y="20" width="7" height="48" class="cf-landing"/><rect x="104" y="0" width="7" height="30" class="cf-landing"/>'; }
    else { s += '<path d="M4 70L4 54L112 4L116 4L116 22L22 70z" class="cf-landing"/>'; for (let i = 0; i < 5; i++) s += tr(14 + i * 20, 52 - i * 10); }
    return `<svg class="dw ${cls}" viewBox="0 0 120 70" aria-hidden="true">${s}</svg>`;
  }
  // welke kant (gezien naar boven lopend): bovenaanzicht van een loop met de kant gemarkeerd
  function kantPlan(k, cls = '') {
    const x = k === 'links' ? 38 : 82;
    return `<svg class="dw ${cls}" viewBox="0 0 120 90" aria-hidden="true">${defs}${run(40, 8, 80, 84, 8)}<path d="M${x} 6V86" class="cf-kant"/>${arrow('M60 80V16')}<text x="${k === 'links' ? 20 : 100}" y="50" class="cf-lbl" text-anchor="middle">${k === 'links' ? 'L' : 'R'}</text></svg>`;
  }
  const defs = '<defs><marker id="cfa" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="cf-arrowhead"/></marker></defs>';
  function plan(type, richting = 'rechts', cls = '') {
    const body = (PLAN[type] || PLAN['Rechte steektrap'])();
    return `<svg class="dw cf-plan ${cls}" viewBox="0 0 120 120" aria-hidden="true">${defs}<g${richting === 'links' ? ' transform="translate(120 0) scale(-1 1)"' : ''}>${body}</g></svg>`;
  }

  // ---------- configurator: houtkleur per houtsoort en afwerking ----------
  function woodColor(hout, afw) {
    const a = String(afw || ''), h = String(hout || '').toLowerCase();
    if (/wit/i.test(a)) return { f: '#f4f1ea', l: '#b9b2a4' };
    let c = /noten|walnut/.test(h) ? '#7a5338' : /beuken/.test(h) ? '#d9a982' : /essen/.test(h) ? '#e4cfa3' : /grenen|vuren/.test(h) ? '#e8c995' : /meranti|sapeli|mahonie/.test(h) ? '#a8613e' : /merbau/.test(h) ? '#8a4b2c' : /rustiek/.test(h) ? '#c29560' : '#cfa46c';
    if (/gebeitst|kleur/i.test(a)) c = '#8b6a4a';
    return { f: c, l: '#5b3f24' };
  }

  // ---------- configurator: zijaanzicht (schets, niet op maat) ----------
  // o: {open, houtTrede, houtRest, afwTreden, afwRest, leuning:{aan, profiel}, bal:{aan, spijl:{naam, breedte}, onderslof}, boom}
  function aanzicht(o) {
    const n = 10, dx = 24, dy = 12.5, x0 = 34, y0 = 192, tw = 31, tt = 6;
    const tr = woodColor(o.houtTrede, o.afwTreden), rs = woodColor(o.houtRest || o.houtTrede, o.afwRest);
    const nose = (i) => [x0 + i * dx, y0 - (i + 1) * dy];
    let s = `<path d="M8 ${y0 + 2}H312" stroke="#bdb6a8" stroke-width="2"/><path d="M${x0 + n * dx + 6} ${y0 - n * dy}H312" stroke="#bdb6a8" stroke-width="2"/>`;
    // boom (achter de treden): bij een keepboom met inkepingen, bij een trapboom recht
    const bt = o.boom === 'keepboom' ? 0 : 12;
    s += `<path d="M${x0 - 4} ${y0}L${x0 + n * dx + 6} ${y0 - n * dy - bt}v34L${x0 + 24} ${y0}z" fill="${rs.f}" stroke="${rs.l}" stroke-width="1.2"/>`;
    for (let i = 0; i < n; i++) {
      const [x, y] = nose(i);
      if (!o.open) s += `<rect x="${x + 2}" y="${y + tt}" width="5" height="${dy - tt}" fill="${rs.f}" stroke="${rs.l}" stroke-width=".8"/>`;
      s += `<rect x="${x}" y="${y}" width="${tw}" height="${tt}" rx="1.5" fill="${tr.f}" stroke="${tr.l}" stroke-width="1"/>`;
    }
    // balustrade + leuning (vrije zijde, op de voorgrond)
    const H = 50, top =(x) => y0 - (x - x0 + 12) / dx * dy - H;
    if (o.bal && o.bal.aan) {
      const sp = o.bal.spijl || {}, nm = sp.naam || '', w = Math.max(2.5, Math.min(9, (+sp.breedte || 40) / 6));
      if (o.bal.onderslof) s += `<path d="M${x0 - 2} ${y0 - 18}L${x0 + n * dx + 6} ${y0 - n * dy - 18}" stroke="${rs.l}" stroke-width="7" stroke-linecap="round"/><path d="M${x0 - 2} ${y0 - 18}L${x0 + n * dx + 6} ${y0 - n * dy - 18}" stroke="${rs.f}" stroke-width="5" stroke-linecap="round"/>`;
      const metal = /rvs|staal/i.test(nm);
      for (let i = 0; i < n * 2; i++) {
        const x = x0 + 6 + i * dx / 2, yb = o.bal.onderslof ? y0 - (x - x0) / dx * dy - 16 : nose(Math.floor(i / 2))[1], yt = top(x) + 3;
        if (/gedraaid/i.test(nm)) {
          // gedraaide spijl: recht, bol, recht, bol, recht (schaalt met de lengte)
          const Ls = yb - yt, a = Ls * .18, b = Ls * .16, c = Ls * .32, r = Ls - 2 * a - 2 * b - c, bw = w * .45;
          s += `<path d="M${x - w / 2} ${yt}h${w}v${a}q${bw} ${b / 2} 0 ${b}v${c}q${bw} ${b / 2} 0 ${b}v${a + r}h-${w}v-${a + r}q-${bw} -${b / 2} 0 -${b}v-${c}q-${bw} -${b / 2} 0 -${b}z" fill="${rs.f}" stroke="${rs.l}" stroke-width=".7"/>`;
        }
        else s += `<rect x="${x - w / 2}" y="${yt}" width="${w}" height="${yb - yt}" rx="${/rond|rvs/i.test(nm) ? w / 2 : .6}" fill="${metal ? '#b8bec4' : rs.f}" stroke="${metal ? '#7d858c' : rs.l}" stroke-width=".7"/>`;
      }
    }
    if (!o.leuning || o.leuning.aan !== false) {
      const lc = woodColor(o.leuning && o.leuning.hout || o.houtRest || o.houtTrede, o.afwRest), xA = x0 - 4, xB = x0 + n * dx + 10;
      s += `<path d="M${xA} ${top(xA)}L${xB} ${top(xB)}" stroke="${lc.l}" stroke-width="10" stroke-linecap="round"/><path d="M${xA} ${top(xA)}L${xB} ${top(xB)}" stroke="${lc.f}" stroke-width="7.5" stroke-linecap="round"/>`;
      if (!(o.bal && o.bal.aan)) s += [0, 1].map(k => { const x = k ? xB - 6 : xA + 6; return `<rect x="${x - 4}" y="${top(x)}" width="8" height="${(k ? y0 - n * dy : y0) - top(x)}" fill="${lc.f}" stroke="${lc.l}" stroke-width=".8"/>`; }).join('');
    }
    return `<svg class="dw cf-side" viewBox="0 0 320 206" aria-hidden="true">${s}<text class="cf-lbl" x="314" y="203" text-anchor="end">schets – niet op maat</text></svg>`;
  }

  // ---------- leuningprofiel (doorsnede, 160 × 100) ----------
  function profiel(naam, cls = '') {
    const n = String(naam || ''), f = ZP.fotos && ZP.fotos.get('profiel', n);
    if (f) return `<img class="dw dw-img ${cls}" src="${f}" alt="">`;
    let b;
    if (/muurleuning/i.test(n)) b = `<path class="dw-wall" d="M10 6h18v88H10z"/><path class="dw-metal" d="M28 62h10v10H28zM38 66h30v4H38zM66 60h6v10h-6z"/>` + W('M69 46a20 20 0 1 1 .1 0z');
    else if (/smetplank|handregel/i.test(n)) b = W('M58 40h44v54H58z') + W('M64 18q16-14 32 0v22H64z') + grain(62, 98, [60, 76]);
    else if (/sleutelgat/i.test(n)) b = W('M80 14a24 24 0 0 1 14 43.5L100 86H60l6-28.5A24 24 0 0 1 80 14z');
    else if (/stok/i.test(n)) b = W('M80 20a18 18 0 1 1-.1 0z') + `<path class="dw-metal" d="M78 56h4v32h-4z"/>`;
    else if (/vlak|plank/i.test(n)) b = W('M44 36h72a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6z') + grain(46, 114, [44, 52]);
    else if (/decoratief|gefreesd/i.test(n)) b = W('M58 22q22-14 44 0q6 8 0 16q8 6 4 16q-4 12-14 16H68q-10-4-14-16-4-10 4-16-6-8 0-16z') + K('M60 38h40M62 54h36');
    else if (/vierkant/i.test(n)) b = W('M66 26h28a12 12 0 0 1 12 12v28a12 12 0 0 1-12 12H66a12 12 0 0 1-12-12V38a12 12 0 0 1 12-12z') + grain(58, 102, [42, 52, 62]);
    else if (/ovaal/i.test(n)) b = W('M80 24c20 0 32 12 32 26s-12 26-32 26-32-12-32-26 12-26 32-26z') + grain(54, 106, [44, 56]);
    else b = W('M80 24a26 26 0 1 1-.1 0z') + grain(60, 100, [42, 52, 60]);
    return `<svg class="dw ${cls}" viewBox="0 0 160 100" aria-hidden="true">${b}</svg>`;
  }

  // ---------- leuningdrager (160 × 100): kleur volgens de naam ----------
  function drager(d, cls = '') {
    if (foto('drager', d)) return `<img class="dw dw-img ${cls}" src="${foto('drager', d)}" alt="">`;
    const n = String((d && d.naam) || '');
    const c = /zwart/i.test(n) ? ['#2f2f2f', '#111'] : /messing|goud/i.test(n) ? ['#d2ad48', '#8a6d1e'] : /chroom/i.test(n) ? ['#e9edf0', '#8a949c'] : /hout|eiken/i.test(n) ? ['#cfa46c', '#5b3f24'] : ['#b8bec4', '#6f777e'];
    const m = (dd) => `<path d="${dd}" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.2" stroke-linejoin="round"/>`;
    const verdekt = /verdekt|onzichtbaar|ingebouwd/i.test(n);
    const arm = verdekt ? m('M28 44h22v8H28z') : /hout|eiken/i.test(n) ? m('M28 34h16v34H28z') + m('M44 46h30v10H44z') + m('M70 40h10v14H70z') : m('M28 40h6v24h-6z') + m('M34 50q20 0 30-6l4 6q-12 8-34 8z') + m('M64 38h14v6H64z');
    const lx = verdekt ? 70 : 92;
    return `<svg class="dw ${cls}" viewBox="0 0 160 100" aria-hidden="true"><path class="dw-wall" d="M8 4h20v92H8z"/>${arm}${W(`M${lx} 14a22 22 0 1 1-.1 0z`)}${grain(lx - 16, lx + 16, [28, 38])}</svg>`;
  }

  return { LIB, keyFor, svg, forBew, spijl, shrink, plan, aanzicht, profiel, drager, boom, kantPlan, woodColor, list: () => Object.entries(LIB).map(([k, v]) => [k, v.t]) };
})();
