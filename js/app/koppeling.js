// Koppeling: de Zaagplanner op meerdere laptops en met meerdere gebruikers (ZP.sync + ZP.cloud), de timer-app en de gemeten tijden.
// Scherm "Koppeling" (algemeen scherm, hoort bij geen project): instellen → inloggen → eerste keer koppelen → daarna vanzelf.
// De app blijft werken op de eigen opslag; kp.motor stuurt wijzigingen door en haalt die van anderen op (zie js/sync.js).
const kp = { motor: null, gebruiker: null, kanaal: null, aanwezig: [], fout: '', bezig: false, uitgesteld: false, metingen: null, metFout: '', t: 0, serverLeeg: null };

// lijst stukken voor de timer-app: wat elk stuk is zoals de Zaagplanner het rekent (tekening of eigen keuze)
const kpWerkDoc = (p) => ZP.werk.werkDoc(p, {
  code: (sid) => stairCode(p, sid), hout: (x) => hoWood(N.materialOf(x, S(), p.typeMaterial || {})), afw: (x) => uvAfwNaam(CO.afwVanPart(C(), p.begroting || {}, x)),
  vorm: (x) => uvVormVan(p, x), verdreven: (x) => uvVerdreven(p, x), profiel: ((p.begroting || {}).leuning || {}).profiel || '', spijl: (p.begroting || {}).spijl || '' });

// wijzigingen van een ander apparaat zijn binnen: opslaan, en het scherm bijwerken (niet midden in het typen)
function kpBinnen(ids) {
  ZP.store.save(db, true);
  for (const id of ids) if (id.startsWith('project:')) delete ongedaan.laatst[id.slice(8)];   // ongedaan maken begint opnieuw vanaf de nieuwe stand
  if (db.current && !db.projects.some(p => p.id === db.current)) { db.current = null; if (!GLOBAAL.includes(ui.screen)) ui.screen = 'projecten'; }
  const a = document.activeElement, typt = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  if (typt || ui.busy) { kp.uitgesteld = true; return; }
  kp.uitgesteld = false; ui.msg = { text: 'Bijgewerkt: wijzigingen van een ander apparaat zijn binnengekomen.', kind: 'ok' }; render();
}
document.addEventListener('focusout', () => { if (kp.uitgesteld) setTimeout(() => { const a = document.activeElement; if (kp.uitgesteld && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) { kp.uitgesteld = false; render(); } }, 150); });

// een ronde plannen (kort na een wijziging; anders elke 25 seconden en bij terugkomen in het venster)
function kpPlan(ms) { if (!kp.motor || !kp.motor.gestart()) return; clearTimeout(kp.t); kp.t = setTimeout(() => kp.motor.ronde(), ms === undefined ? 2000 : ms); }
// verbinding opzetten als de koppeling is ingesteld en er iemand is ingelogd
async function kpVerbind() {
  if (!ZP.cloud.ingesteld()) return;
  try {
    kp.gebruiker = await ZP.cloud.sessie();
    if (!kp.gebruiker) { kp.motor = null; return; }
    if (!kp.motor) kp.motor = ZP.sync.maak({ backend: ZP.cloud.backend, db, werkDoc: kpWerkDoc, opWijziging: kpBinnen, opStatus: () => kpChipBij() });
    if (!kp.kanaal) kp.kanaal = await ZP.cloud.backend.luister(() => kpPlan(300), (l) => { kp.aanwezig = l; kpChipBij(); });
    kpMeld(); kp.fout = '';
    if (kp.motor.gestart()) kp.motor.ronde(); else kp.serverLeeg = await kp.motor.serverLeeg();
  } catch (e) { kp.fout = (e && e.message) || String(e); }
}
// aan de anderen laten weten wie hier werkt en aan welk project
function kpMeld() { if (!kp.kanaal) return; const p = proj(), o = { app: ZP.cloud.apparaat(), naam: ZP.cloud.cfg().naam || (kp.gebruiker && kp.gebruiker.email) || '', pid: p && !GLOBAAL.includes(ui.screen) ? p.id : '', project: p && !GLOBAAL.includes(ui.screen) ? p.name : '' };
  const s = JSON.stringify(o); if (s === kp.gemeld) return; kp.gemeld = s; kp.kanaal.meld(o); }   // alleen als er iets veranderd is
// wie werkt er nog meer aan dit project (andere apparaten)
const kpAnderen = (pid) => kp.aanwezig.filter(a => a.app !== ZP.cloud.apparaat() && (!pid || a.pid === pid));

// regeltje onderaan het menu: stand van de koppeling
function kpChip() {
  if (!ZP.cloud.ingesteld()) return `<button class="kp-chip uit" data-act="go" data-v="koppeling" title="Deze Zaagplanner koppelen aan andere laptops en de timer-app">○ Niet gekoppeld</button>`;
  if (!kp.gebruiker) return `<button class="kp-chip let" data-act="go" data-v="koppeling">○ Koppeling: inloggen</button>`;
  if (!kp.motor || !kp.motor.gestart()) return `<button class="kp-chip let" data-act="go" data-v="koppeling">○ Koppeling: nog starten</button>`;
  const s = kp.motor.status, n = kpAnderen().length;
  return `<button class="kp-chip ${s.fout ? 'fout' : 'aan'}" data-act="go" data-v="koppeling" title="${s.fout ? esc(s.fout) : 'Gekoppeld' + (s.laatst ? ' · laatst bijgewerkt ' + new Date(s.laatst).toLocaleTimeString('nl-NL') : '')}">${s.fout ? '⚠ Geen verbinding' : s.bezig ? '↻ Bijwerken…' : '● Gekoppeld'}${n ? ` · ${n} ander${n === 1 ? '' : 'en'}` : ''}</button>`;
}
function kpChipBij() { const el = document.querySelector('.kp-chip'); if (el) el.outerHTML = kpChip(); const b = document.querySelector('.kp-ook'); if (b) b.outerHTML = kpOok(); }
// in de tabbalk: wie heeft dit project nog meer open
function kpOok() { const p = proj(), l = p && !GLOBAAL.includes(ui.screen) ? kpAnderen(p.id) : []; return `<span class="kp-ook">${l.length ? 'Ook open bij: ' + esc(l.map(a => a.naam || 'iemand').join(', ')) : ''}</span>`; }

// ---------- scherm ----------
function scrKoppeling() {
  const c = ZP.cloud.cfg(), ing = ZP.cloud.ingesteld(), m = kp.motor, gestart = !!(m && m.gestart()), st = m ? m.status : {};
  const stap = (n, titel, klaar, body) => `<section class="card kp-stap ${klaar ? 'klaar' : ''}"><div class="ml-head"><span class="scode">${klaar ? '✓' : n}</span><h3>${titel}</h3></div>${body}</section>`;
  const s1 = stap(1, 'Gedeelde opslag instellen', ing, `<p class="muted small">Eén keer per apparaat. Het adres en de openbare sleutel staan in Supabase bij <i>Project Settings › API</i> (zie KOPPELEN.md). Op een tweede laptop kun je ook de koppelcode van de eerste plakken.</p>
    <div class="tar-grid"><label>Adres (Project URL) <input data-bind="kpurl" value="${esc(c.url || '')}" placeholder="https://….supabase.co"></label>
      <label>Openbare sleutel (Publishable key, niet de secret key) <input data-bind="kpkey" value="${esc(c.key || '')}" placeholder="sb_publishable_…"></label>
      <label>Of: koppelcode van een ander apparaat <input data-bind="kpcode" value="" placeholder="plak hier de koppelcode"></label>
      <label>Naam van deze gebruiker / dit apparaat <input data-bind="kpnaam" value="${esc(c.naam || '')}" placeholder="bv. Tim – kantoor"></label></div>`);
  const s2 = !ing ? '' : stap(2, 'Inloggen', !!kp.gebruiker, kp.gebruiker
    ? `<p>Ingelogd als <b>${esc(kp.gebruiker.email || '')}</b>. <button class="small ghost" data-act="kpuit">Uitloggen</button></p>`
    : `<p class="muted small">Met het e-mailadres en wachtwoord van een gebruiker die je in Supabase hebt aangemaakt (<i>Authentication › Users › Add user</i>). Het wachtwoord wordt niet bewaard; deze browser onthoudt alleen dat je bent ingelogd.</p>
      <div class="row wrap"><input id="kp-mail" type="email" class="w16" placeholder="e-mailadres" autocomplete="username"> <input id="kp-ww" type="password" class="w12" placeholder="wachtwoord" autocomplete="current-password"> <button class="primary" data-act="kplogin">Inloggen</button></div>`);
  const nLok = db.projects.length;
  const s3 = !kp.gebruiker ? '' : stap(3, 'Dit apparaat koppelen', gestart, gestart
    ? `<p>Gekoppeld. Wijzigingen gaan vanzelf heen en weer${st.laatst ? ` · laatst bijgewerkt ${new Date(st.laatst).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' })}` : ''}${st.samengevoegd ? ` · ${st.samengevoegd} keer wijzigingen van twee kanten samengevoegd` : ''}.</p>
      ${st.fout ? `<div class="warn">Geen verbinding: ${esc(st.fout)}. Je kunt gewoon doorwerken; de wijzigingen gaan mee zodra er weer verbinding is.</div>` : ''}
      <div class="row wrap"><button data-act="kpnu">↻ Nu bijwerken</button><button class="ghost danger" data-act="kplos" title="Dit apparaat werkt daarna weer alleen voor zichzelf; de gegevens blijven hier en op de server staan">Dit apparaat loskoppelen</button></div>
      <p class="muted small">${kpAnderen().length ? 'Nu ook aan het werk: ' + kpAnderen().map(a => `<b>${esc(a.naam || 'iemand')}</b>${a.project ? ' (' + esc(a.project) + ')' : ''}`).join(', ') + '.' : 'Er is nu niemand anders aan het werk.'}</p>`
    : `<p><b>Maak eerst een back-up</b> van dit apparaat: <button class="small" data-act="backup">Back-up downloaden</button></p>
      ${kp.serverLeeg === true ? `<p>De gedeelde opslag is nog leeg. Dit apparaat zet er alles in: ${nLok} ${nLok === 1 ? 'project' : 'projecten'}, de materialenlijst, prijzen en normen.</p><button class="primary" data-act="kpstart" data-v="hier">Alles van dit apparaat naar de gedeelde opslag →</button>`
      : `<p>In de gedeelde opslag staan al gegevens. Projecten worden altijd samengevoegd (niets verdwijnt; van een project dat op beide staat blijft de nieuwste). Kies wat er met de <b>materialenlijst, prijzen, normen en instellingen</b> gebeurt:</p>
        <div class="kp-keuze"><button class="primary" data-act="kpstart" data-v="server">Die van de gedeelde opslag overnemen →<small>voor een nieuwe of tweede laptop (aanbevolen)</small></button>
          <button data-act="kpstart" data-v="hier">Die van dit apparaat houden →<small>dit apparaat heeft de juiste prijzen; ze gaan naar de gedeelde opslag</small></button></div>`}
      ${kp.bezig ? '<p class="muted">Bezig met koppelen…</p>' : ''}`);
  // timer-app: adres met koppelcode (adres + openbare sleutel; inloggen doet elke gebruiker zelf)
  const basis = location.href.replace(/[^/]*([?#].*)?$/, ''), link = ing ? basis + 'timer.html#k=' + ZP.cloud.code() : '';
  const s4 = !ing ? '' : `<section class="card kp-timer"><div class="ml-head"><h3>Timer-app voor de werkplaats</h3><span class="muted small">op de telefoon tijden bijhouden per onderdeel</span></div>
    <div class="kp-qr-rij"><div id="kp-qr" class="kp-qr" data-link="${esc(link)}"></div><div>
      <p>Scan de code met de telefoon (of open de link), log in en zet de app op het beginscherm. Projecten met de status <b>${ZP.werk.IN_WERK.join('</b>, <b>')}</b> staan in de timer-app.</p>
      ${/^file:/.test(location.protocol) ? '<div class="warn small">De Zaagplanner is nu vanaf de schijf geopend (file://). Een telefoon kan daar niet bij: zet de map op een webadres (https), zie KOPPELEN.md.</div>' : ''}
      <p class="small"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(basis)}timer.html</a></p>
      <label class="small">Koppelcode (voor een andere laptop of telefoon) <input readonly class="w16" value="${esc(ZP.cloud.code())}" onclick="this.select()"></label></div></div></section>`;
  return pageHead('Koppeling', 'Werk op meerdere laptops en met meerdere mensen aan dezelfde projecten, en houd in de werkplaats tijden bij met de timer-app. Zonder internet werk je gewoon door; bij verbinding wordt alles bijgewerkt.') + `
    ${kp.fout ? `<div class="warn">${esc(kp.fout)}</div>` : ''}${s1}${s2}${s3}${s4}${gestart ? kpMetingenKaart() : ''}`;
}

// ---------- gemeten tijden: overzicht en voorstel voor de normen ----------
function kpMetingenKaart() {
  const M = kp.metingen, c = C();
  const kop = `<div class="ml-head"><h3>Gemeten tijden</h3><span class="muted small">uit de timer-app · voorstel voor de normen</span><button class="small" data-act="kpmetingen">${M ? '↻ Opnieuw ophalen' : 'Ophalen'}</button></div>`;
  if (!M) return `<section class="card kp-met">${kop}${kp.metFout ? `<div class="warn">${esc(kp.metFout)}</div>` : '<p class="muted small">Haal de metingen op om te zien hoeveel tijd het werk echt kost en of de normen bijgesteld moeten worden.</p>'}</section>`;
  if (!M.length) return `<section class="card kp-met">${kop}<p class="muted">Nog geen metingen. Start in de timer-app een klok bij een onderdeel.</p></section>`;
  const V = ZP.werk.voorstellen(M, 3), u = (x) => f2(x) + ' u';
  const rij = (v) => { const nu = +CO.normGet(c, v.pad) || 0, bron = CO.normBronVan(c, v.pad), afw = nu > 0 ? (v.gemeten / nu - 1) * 100 : 0;
    return `<tr class="${v.genoeg && v.compleet ? '' : 'kp-dun'}"><td><b>${esc(ZP.werk.padNaam(v.pad))}</b><div class="muted small">${v.delen.map(d => `${esc(d.t.toLowerCase())} ${f2(d.u)} (${d.n}×)`).join(' + ')}${v.mist.length ? ` · <span class="warnc">nog niet gemeten: ${esc(v.mist.join(', ').toLowerCase())}</span>` : ''}</div></td>
      <td class="num">${nu > 0 ? u(nu) : '–'}<div class="muted small">${bron ? (bron.bron === 'gemeten' ? 'gemeten' : 'eigen') : 'Excel'}</div></td>
      <td class="num"><b>${u(v.gemeten)}</b><div class="muted small">${f2(v.p25)}–${f2(v.p75)}</div></td>
      <td class="num ${Math.abs(afw) > 15 ? 'warnc' : ''}">${nu > 0 ? (afw > 0 ? '+' : '') + f0(afw) + '%' : ''}</td><td class="num">${v.n}</td>
      <td>${v.genoeg && v.compleet ? `<button class="small" data-act="kpnorm" data-v="${esc(v.pad)}" data-u="${v.gemeten}" data-n="${v.n}">Overnemen</button>` : `<span class="muted small">${v.compleet ? 'minstens 3 metingen nodig' : 'nog niet alle werkzaamheden gemeten'}</span>`}</td></tr>`; };
  const recent = M.slice(0, 25).map(x => { const w = ZP.werk.werkVan(x.onderdeel, x.werk), per = ZP.werk.urenPer(x);
    return `<tr class="${x.telt === false ? 'sp-uit' : ''}"><td class="small">${new Date(x.gemaakt).toLocaleDateString('nl-NL')}</td><td>${esc(x.projectnaam || '')}${x.trapnaam ? ' · ' + esc(x.trapnaam) : ''}</td><td>${esc((ZP.werk.WERK[x.onderdeel] || { t: x.onderdeel }).t)} – ${esc(w ? w.t.toLowerCase() : x.werk)}${x.kenmerk && (x.kenmerk.soort || x.kenmerk.vorm) ? ` <span class="muted small">${esc((x.kenmerk.soort || x.kenmerk.vorm).toLowerCase())}</span>` : ''}</td>
      <td class="num">${f2((+x.seconden || 0) / 3600)} u</td><td class="num small">${w ? (w.per === 'm' ? f1(+x.meters || 0) + ' m' : (+x.aantal || 0) + ' ' + ZP.werk.EENHEID[w.per]) : ''}</td><td class="num small">${per !== null ? f2(per) + ' u/' + (w.per === 'm' ? 'm' : w.per) : ''}</td><td class="small">${esc(x.wie || '')}${x.notitie ? ' · ' + esc(x.notitie) : ''}</td>
      <td><label class="small" title="Uit = niet meenemen in de normen (bv. fout of leerling)"><input type="checkbox" data-bind="kptelt" data-id="${esc(x.id)}" ${x.telt === false ? '' : 'checked'}> telt mee</label></td></tr>`; }).join('');
  return `<section class="card kp-met">${kop}
    <div class="tblwrap"><table class="tbl compact"><thead><tr><th>Norm</th><th class="num">Nu</th><th class="num">Gemeten</th><th class="num">Verschil</th><th class="num">Metingen</th><th></th></tr></thead><tbody>${V.map(rij).join('') || '<tr><td colspan="6" class="muted">Nog geen metingen die bij een norm horen.</td></tr>'}</tbody></table></div>
    <p class="muted small">Gemeten = de middelste waarde (mediaan) van de laatste 10 metingen per werkzaamheid, opgeteld tot de norm van het onderdeel. Overnemen zet de norm bij Prijzen en normen (label "gemeten"); Excel overschrijft hem daarna niet meer.</p>
    <h4>Laatste metingen</h4><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Datum</th><th>Project</th><th>Werk</th><th class="num">Tijd</th><th class="num">Aantal</th><th class="num">Per eenheid</th><th>Wie</th><th></th></tr></thead><tbody>${recent}</tbody></table></div></section>`;
}
// op het scherm Prijs: gewerkte uren van dit project naast de begrote uren
function kpNacalc(p, r) {
  if (!kp.metingen) return '';
  const l = ZP.werk.urenPerOnderdeel(kp.metingen, p.id); if (!l.length) return '';
  const tot = l.reduce((a, x) => a + x.uren, 0), beg = r.tot.urenWerk + r.tot.urenMontage;
  return `<section class="card kp-nacalc"><div class="ml-head"><h3>Gemeten uren (timer-app)</h3><span class="muted small">begroot ${f1(beg)} u · gewerkt tot nu ${f1(tot)} u</span></div>
    <table class="tbl compact">${l.map(x => `<tr><td>${esc(x.titel)}</td><td class="num">${f1(x.uren)} u</td></tr>`).join('')}<tr class="tot"><td>Totaal gewerkt</td><td class="num"><b>${f1(tot)} u</b></td></tr></table></section>`;
}
// QR-code van de timer-link (bibliotheek van het CDN; zonder internet alleen de link)
function kpQr() {
  const el = document.getElementById('kp-qr'); if (!el || !el.dataset.link || el.dataset.klaar) return;
  const teken = () => { try { el.innerHTML = ''; new window.QRCode(el, { text: el.dataset.link, width: 168, height: 168, correctLevel: window.QRCode.CorrectLevel.L }); el.dataset.klaar = '1'; } catch (e) { el.textContent = ''; } };
  if (window.QRCode) return teken();
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = teken; document.head.appendChild(s);
}

CLICK.push(function click_koppeling(a, t, v) {
  switch (a) {
    case 'kplogin': {
      const mail = (document.getElementById('kp-mail') || {}).value || '', ww = (document.getElementById('kp-ww') || {}).value || '';
      if (!mail || !ww) { kp.fout = 'Vul het e-mailadres en het wachtwoord in.'; return render(); }
      kp.fout = ''; ZP.cloud.inloggen(mail.trim(), ww).then(() => kpVerbind()).catch(e => { kp.fout = 'Inloggen lukt niet: ' + e.message; }).then(() => render()); return;
    }
    case 'kpuit': ZP.cloud.uitloggen().catch(() => {}).then(() => { if (kp.kanaal) kp.kanaal.stop(); kp.kanaal = null; kp.motor = null; kp.gebruiker = null; render(); }); return;
    case 'kpstart': if (!kp.motor || kp.bezig) return; kp.bezig = true; render();
      kp.motor.start(v === 'hier' ? 'hier' : 'server').then(() => { kp.bezig = false; kp.fout = kp.motor.status.fout ? 'Koppelen lukt niet: ' + kp.motor.status.fout : ''; if (!kp.fout) ui.msg = { text: 'Gekoppeld. Wijzigingen gaan nu vanzelf heen en weer.', kind: 'ok' }; ZP.store.save(db, true); render(); }); return;
    case 'kpnu': if (kp.motor) kp.motor.ronde().then(() => render()); return;
    case 'kplos': if (kp.motor && confirm('Dit apparaat loskoppelen? De gegevens blijven hier en in de gedeelde opslag staan; wijzigingen gaan niet meer heen en weer.')) { kp.motor.stop(); render(); } return;
    case 'kpmetingen': kp.metFout = ''; ZP.cloud.backend.metingen({ max: 3000 }).then(l => { kp.metingen = l; }).catch(e => { kp.metFout = 'Ophalen lukt niet: ' + e.message; }).then(() => render()); return;
    // gemeten norm overnemen (blijft staan bij Excel inlezen; ↺ bij Prijzen en normen zet de oude waarde terug)
    case 'kpnorm': CO.normSet(C(), v, Math.round(+t.dataset.u * 10000) / 10000, 'gemeten', { n: +t.dataset.n || 0 }); ui.msg = { text: `${ZP.werk.padNaam(v)}: norm nu ${f2(+t.dataset.u)} u (gemeten).`, kind: 'ok' }; save(); render(); return;
    default: return false;
  }
});
CHANGE.push(function change_koppeling(b, t) {
  switch (b) {
    case 'kpurl': ZP.cloud.zetCfg({ url: t.value.trim() }); break;
    case 'kpkey': ZP.cloud.zetCfg({ key: t.value.trim() }); break;
    case 'kpnaam': ZP.cloud.zetCfg({ naam: t.value.trim() }); kpMeld(); render(); return 'skip';
    case 'kpcode': if (!t.value.trim()) return 'skip'; if (!ZP.cloud.uitCode(t.value)) { kp.fout = 'Dit is geen geldige koppelcode.'; render(); return 'skip'; } kp.fout = ''; break;
    case 'kptelt': { const m = (kp.metingen || []).find(x => String(x.id) === t.dataset.id); if (m) { m.telt = t.checked; ZP.cloud.backend.metingZet(m.id, { telt: t.checked }).catch(e => { kp.metFout = e.message; }); } render(); return 'skip'; }
    default: return false;
  }
  // andere instelling: verbinding opnieuw opzetten
  if (kp.kanaal) { kp.kanaal.stop(); kp.kanaal = null; } kp.motor = null; kp.gebruiker = null;
  kpVerbind().then(() => render()); render(); return 'skip';
});

// elke opslag van de app plant een ronde; verder elke 25 seconden en als je terugkomt in het venster of weer internet hebt
(function () {
  const oud = ZP.store.save;
  ZP.store.save = function (d, nu) { oud(d, nu); kpPlan(); };
  setInterval(() => { if (document.visibilityState === 'visible') kpPlan(0); }, 25000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kpPlan(0); });
  window.addEventListener('online', () => kpPlan(0));
  kpVerbind().then(() => { if (kp.gebruiker) render(); });
})();
