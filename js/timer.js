// Timer-app voor de werkplaats (timer.html, telefoon): tijd bijhouden per werkzaamheid en per stuk.
// Projecten komen uit de gedeelde opslag (documenten 'werk:<id>' die de gekoppelde Zaagplanner verstuurt, alleen bij status
// Opdracht / In productie / Gereed in werkplaats). Metingen gaan naar de tabel zp_metingen; zonder internet blijven ze in de
// wachtrij (localStorage) en gaan ze mee zodra er weer verbinding is.
// Er loopt geen teller: de tijd = nu − start − pauzes. Daarom loopt de klok door als de telefoon op slot gaat of de app sluit.
// Logica (ZP.timer.maak) los van het scherm, zodat de tests hem met de nagebootste server kunnen gebruiken.
window.ZP = window.ZP || {};
ZP.timer = (function () {
  const W = () => ZP.werk;
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const BOMEN = ['trapboom', 'keepboom'];
  const VOLGORDE = ['trede', 'stootbord', 'trapboom', 'keepboom', 'spil', 'leuning', 'baluster', 'bordes', 'overig'];
  const VERGETEN = 2 * 3600 * 1000;          // na 2 uur zonder actie: vragen of de timer nog loopt
  const NIET_TELLEN = ['Fout gemaakt', 'Leerling', 'Storing machine'];
  const BIJZ = ['Nieuwe machine', 'Moeilijk hout', 'Fout gemaakt', 'Leerling', 'Storing machine'];

  // opslag: {projecten[], opgehaald, loopt, wachtrij[], mijn[], klaar{}, gebruiker}
  function maak(o) {
    const nu = o.nu || (() => Date.now()), sleutel = o.sleutel || 'zaagplanner.timer';
    let st;
    try { st = JSON.parse(localStorage.getItem(sleutel)) || {}; } catch (e) { st = {}; }
    st = Object.assign({ projecten: [], opgehaald: null, loopt: null, wachtrij: [], mijn: [], klaar: {}, gebruiker: null }, st);
    const bewaar = () => { try { localStorage.setItem(sleutel, JSON.stringify(st)); } catch (e) { /* vol */ } };
    const be = () => o.backend;

    // ---------- projecten ----------
    async function haalProjecten() {
      const rijen = await be().haalSoort('werk');
      st.projecten = rijen.map(r => r.data).filter(Boolean).sort((a, b) => String(a.naam).localeCompare(String(b.naam)));
      st.opgehaald = new Date(nu()).toISOString(); bewaar();
      return st.projecten;
    }
    const project = (pid) => st.projecten.find(p => p.id === pid) || null;
    const trap = (pid, sid) => { const p = project(pid); return p ? p.trappen.find(t => t.id === sid) || null : null; };
    // onderdelen die in deze trap zitten (+ voorbereiden en montage, die altijd kunnen)
    function onderdelen(t) {
      const l = VOLGORDE.filter(k => t && t.stukken.some(s => s.t === k) && W().WERK[k]);
      return l.concat(['opzetten', 'montage']);
    }
    function stukkenVan(t, ond) {
      return (t ? t.stukken.filter(s => s.t === ond) : []).slice().sort((a, b) => (a.nr || 0) - (b.nr || 0) || String(a.n).localeCompare(String(b.n), 'nl', { numeric: true }));
    }
    const klaarSleutel = (pid, sid, ond, werk) => [pid, sid, ond, werk].join('|');
    const klaarVan = (pid, sid, ond, werk) => st.klaar[klaarSleutel(pid, sid, ond, werk)] || [];
    // standaard: alles wat voor deze werkzaamheid nog niet klaar is (alles klaar → weer alles)
    function standaardSel(pid, sid, ond, werk) {
      const alle = stukkenVan(trap(pid, sid), ond).map(s => s.id), k = klaarVan(pid, sid, ond, werk);
      const rest = alle.filter(id => !k.includes(id));
      return rest.length ? rest : alle;
    }

    // ---------- de klok ----------
    function seconden(l, tot) {
      if (!l) return 0;
      const eind = tot || l.eind || nu();
      let ms = eind - l.start;
      for (const [a, b] of l.pauzes || []) ms -= (b - a);
      if (l.pauzeVan) ms -= (eind - l.pauzeVan);
      return Math.max(0, Math.round(ms / 1000));
    }
    function start(pid, sid, ond, werk, stukken) {
      if (st.loopt) return false;              // één timer tegelijk
      st.loopt = { pid, sid, ond, werk, stukken: stukken || [], start: nu(), pauzes: [], pauzeVan: null, actie: nu() };
      bewaar(); return true;
    }
    function pauze() { const l = st.loopt; if (!l || l.pauzeVan) return; l.pauzeVan = nu(); l.actie = nu(); bewaar(); }
    function hervat() { const l = st.loopt; if (!l || !l.pauzeVan) return; l.pauzes.push([l.pauzeVan, nu()]); l.pauzeVan = null; l.actie = nu(); bewaar(); }
    function nogBezig() { if (st.loopt) { st.loopt.actie = nu(); bewaar(); } }
    // gestopt op een eerder tijdstip (vergeten timer)
    function gestoptOm(ms) { const l = st.loopt; if (!l) return; l.eind = Math.max(l.start, Math.min(ms, nu())); if (l.pauzeVan && l.pauzeVan > l.eind) l.pauzeVan = null; bewaar(); }
    function annuleer() { st.loopt = null; bewaar(); }
    // vergeten? (na 2 uur zonder actie, of de timer is gisteren gestart)
    function vergeten() {
      const l = st.loopt; if (!l || l.eind || l.pauzeVan) return false;
      const gisteren = new Date(l.start).toDateString() !== new Date(nu()).toDateString();
      return nu() - (l.actie || l.start) > VERGETEN || gisteren;
    }

    // ---------- klaar: voorstel aantal en de metingen ----------
    // invoer voor het scherm "Hoeveel?": groepen (zelfde soort/vorm/hout/afwerking), voorgevuld totaal in de eenheid van de werkzaamheid
    function voorstel(b) {   // b = {pid, sid, ond, werk, stukken[ids]}
      const w = W().werkVan(b.ond, b.werk), t = trap(b.pid, b.sid);
      if (!w) return null;
      const sel = t ? t.stukken.filter(s => b.stukken.includes(s.id)) : [];
      const treden = t ? t.treden || 0 : 0;
      let groepen;
      if (sel.length) groepen = W().verdeel(sel, 1000, w).map(g => ({ kenmerk: g.kenmerk, stukken: g.stukken.map(s => s.id), aantal: g.aantal, meters: g.meters, deel: g.seconden / 1000 }));
      else {
        // zonder stukken (voorbereiden, montage): per trap, of meters leuning uit de tekening
        const leun = t ? t.stukken.filter(s => s.t === 'leuning').reduce((a, s) => a + s.l, 0) / 1000 : 0;
        groepen = [{ kenmerk: {}, stukken: [], aantal: w.per === 'trap' ? 1 : 0, meters: b.ond === 'montage' && b.werk === 'leuning' ? Math.round(leun * 100) / 100 : 0, deel: 1 }];
      }
      // hoeveelheid per groep in de eenheid van de werkzaamheid
      for (const g of groepen) g.hoeveel = w.per === 'm' ? g.meters : w.per === 'tred' ? (BOMEN.includes(b.ond) ? g.aantal * treden : treden) : g.aantal;
      const totaal = Math.round(groepen.reduce((a, g) => a + g.hoeveel, 0) * 100) / 100;
      const verdreven = sel.filter(s => s.k && (s.k.soort === 'Verdreven' || s.k.vorm === 'Gebogen')).length;
      return { w, eenheid: W().EENHEID[w.per], groepen, totaal, verdreven, stuks: sel.length, gemengd: groepen.length > 1, afwerken: b.werk === 'afwerken' };
    }
    // invoer = {totaal, notitie, bijz[], telt, liters, start (ms), eind (ms), seconden}
    function metingenVan(b, inv) {
      const v = voorstel(b), p = project(b.pid), t = trap(b.pid, b.sid);
      const factor = v.totaal > 0 ? (+inv.totaal || 0) / v.totaal : 1;
      const telt = inv.telt !== undefined ? !!inv.telt : !(inv.bijz || []).some(x => NIET_TELLEN.includes(x));
      const notitie = [].concat(inv.bijz || [], inv.notitie ? [inv.notitie] : []).join(' · ');
      const sec = Math.max(0, Math.round(+inv.seconden || 0));
      const enkel = v.groepen.length === 1;
      return v.groepen.map(g => {
        const hoeveel = enkel ? +inv.totaal || 0 : Math.round(g.hoeveel * factor * 100) / 100;
        const kenmerk = Object.assign({}, g.kenmerk);
        if (inv.liters) kenmerk.liters = Math.round(+inv.liters * g.deel * 100) / 100;
        if (v.gemengd) kenmerk.gemengd = true;
        return {
          id: uuid(), project: b.pid, projectnaam: p ? p.naam + (p.klant ? ' – ' + p.klant : '') : '', trap: b.sid || null, trapnaam: t ? (t.code ? t.code + ' – ' : '') + (t.naam || '') : '',
          onderdeel: b.ond, werk: b.werk, stukken: g.stukken, kenmerk,
          start: new Date(inv.start).toISOString(), eind: new Date(inv.eind).toISOString(), seconden: Math.round(sec * g.deel),
          aantal: v.w.per === 'm' ? g.aantal : hoeveel, meters: v.w.per === 'm' ? hoeveel : g.meters,
          wie: o.wie ? o.wie() : '', notitie, telt, gemaakt: new Date(nu()).toISOString(),
        };
      });
    }
    // opslaan: metingen in de wachtrij, stukken als klaar markeren, timer stoppen
    function opslaan(b, inv) {
      const ms = metingenVan(b, inv);
      for (const m of ms) { st.mijn.unshift(Object.assign({ _wacht: true }, m)); st.wachtrij.push({ op: 'nieuw', m }); }
      st.mijn = st.mijn.slice(0, 300);
      if (b.stukken.length) { const k = klaarSleutel(b.pid, b.sid, b.ond, b.werk); st.klaar[k] = [...new Set((st.klaar[k] || []).concat(b.stukken))]; }
      if (inv.vanTimer) st.loopt = null;
      bewaar(); return ms;
    }
    // achteraf corrigeren: tijd, aantal/meters, telt, of weghalen
    function wijzig(id, patch) {
      const m = st.mijn.find(x => x.id === id); if (!m) return;
      Object.assign(m, patch);
      const wacht = st.wachtrij.find(x => x.op === 'nieuw' && x.m.id === id);
      if (wacht) Object.assign(wacht.m, patch); else { m._wacht = true; st.wachtrij.push({ op: 'zet', id, patch }); }
      bewaar();
    }
    function weg(id) {
      const i = st.wachtrij.findIndex(x => x.op === 'nieuw' && x.m.id === id);
      if (i >= 0) st.wachtrij.splice(i, 1); else st.wachtrij.push({ op: 'weg', id });
      st.wachtrij = st.wachtrij.filter(x => !(x.op === 'zet' && x.id === id));
      st.mijn = st.mijn.filter(x => x.id !== id); bewaar();
    }
    // wachtrij versturen (in volgorde); bij geen verbinding stoppen en later opnieuw
    let bezig = false;
    async function verstuur() {
      if (bezig || !st.wachtrij.length) return { verstuurd: 0, over: st.wachtrij.length };
      bezig = true; let n = 0, fout = null;
      try {
        while (st.wachtrij.length) {
          const x = st.wachtrij[0];
          try {
            if (x.op === 'nieuw') await be().metingBewaar(x.m);
            else if (x.op === 'zet') await be().metingZet(x.id, x.patch);
            else if (x.op === 'weg') await be().metingWeg(x.id);
          } catch (e) {
            x.pogingen = (x.pogingen || 0) + 1; fout = e.message || String(e);
            if (x.pogingen < 8 || /fetch|network|verbinding|Failed|offline|JWT|token/i.test(fout)) break;
            st.mislukt = (st.mislukt || []).concat([Object.assign({ fout }, x)]).slice(-50);   // blijft hangen: apart zetten
          }
          st.wachtrij.shift(); n++;
          const id = x.op === 'nieuw' ? x.m.id : x.id, m = st.mijn.find(y => y.id === id);
          if (m && !st.wachtrij.some(y => (y.op === 'nieuw' ? y.m.id : y.id) === id)) delete m._wacht;
          bewaar();
        }
      } finally { bezig = false; bewaar(); }
      return { verstuurd: n, over: st.wachtrij.length, fout };
    }
    const vandaag = () => { const d = new Date(nu()).toDateString(); return st.mijn.filter(m => new Date(m.start).toDateString() === d); };

    return { st: () => st, bewaar, haalProjecten, project, trap, onderdelen, stukkenVan, klaarVan, standaardSel, seconden, start, pauze, hervat, nogBezig, gestoptOm, annuleer, vergeten,
      voorstel, metingenVan, opslaan, wijzig, weg, verstuur, vandaag };
  }

  // =================================================================== scherm (timer.html) ===================================================================
  function scherm(root) {
    const C = ZP.cloud;
    const T = maak({ backend: C.backend, wie: () => C.cfg().naam || '' });
    const ui = { scherm: 'start', pid: null, sid: null, ond: null, werk: null, sel: [], achteraf: false, inv: null, melding: '', fout: '', bewerk: null, bezig: false, online: navigator.onLine };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tijd = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const duur = (s) => { s = Math.max(0, Math.round(s)); const u = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return u + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
    const duurKort = (s) => { const u = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return u ? u + ' u ' + m + ' min' : m + ' min'; };
    const getal = (x) => (Math.round((+x || 0) * 100) / 100).toString().replace('.', ',');
    const leesGetal = (s) => +String(s).replace(',', '.') || 0;
    const ondNaam = (k) => (W().WERK[k] || { t: k }).t;
    const werkNaam = (ond, k) => { const w = W().werkVan(ond, k); return w ? w.t : k; };
    const st = () => T.st();

    // ---------- melding met de starttijd (Android; iPhone alleen als web-app op het beginscherm) ----------
    async function meldingToon(tekst, extra) {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission !== 'granted') return;
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        const opt = Object.assign({ body: tekst, tag: 'zp-timer', renotify: false, requireInteraction: true, icon: 'icons/timer-192.png', badge: 'icons/timer-192.png', silent: true }, extra || {});
        if (reg) await reg.showNotification('Timer loopt', opt); else new Notification('Timer loopt', opt);
      } catch (e) { /* geen meldingen */ }
    }
    async function meldingWeg() { try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) (await reg.getNotifications({ tag: 'zp-timer' })).forEach(n => n.close()); } catch (e) { /* niets */ } }
    const looptTekst = (l) => werkNaam(l.ond, l.werk) + ' – ' + ondNaam(l.ond).toLowerCase() + ' · sinds ' + tijd(l.start);

    // ---------- opstarten: koppelcode uit de link, inloggen, naam ----------
    async function opstart() {
      const m = /[#&]k=([^&]+)/.exec(location.hash);
      if (m) { C.uitCode(decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname); }
      if (!C.ingesteld()) { ui.scherm = 'koppel'; return teken(); }
      ui.scherm = 'laden'; teken();
      let u = null;
      try { u = await C.sessie(); } catch (e) { u = null; }
      if (!u && !st().gebruiker) { ui.scherm = 'inloggen'; return teken(); }
      if (u) { st().gebruiker = u.email; T.bewaar(); }
      if (!C.cfg().naam) { ui.scherm = 'naam'; return teken(); }
      ui.scherm = st().loopt ? 'klok' : 'projecten';
      if (st().loopt) { ui.pid = st().loopt.pid; ui.sid = st().loopt.sid; }
      teken(); vernieuw();
    }
    async function vernieuw() {
      if (!C.ingesteld() || ['koppel', 'inloggen', 'naam', 'laden'].includes(ui.scherm)) return;   // nog niet gekoppeld/ingelogd
      try { await T.haalProjecten(); ui.fout = ''; } catch (e) { ui.fout = st().projecten.length ? 'Geen verbinding – lijst van ' + (st().opgehaald ? new Date(st().opgehaald).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'eerder') + '.' : 'Projecten ophalen lukt niet: ' + e.message; }
      await stuur(); teken();
    }
    async function stuur() { if (!st().wachtrij.length) return; const r = await T.verstuur(); if (r.fout && r.over) ui.fout = 'Nog ' + r.over + ' meting(en) te versturen – gaat vanzelf bij verbinding.'; }

    // ---------- schermen ----------
    const kop = (titel, terug, rechts) => `<header class="tk"><div class="tk-l">${terug ? `<button class="tk-terug" data-a="terug" data-v="${terug}" aria-label="Terug">‹</button>` : ''}<h1>${titel}</h1></div><div class="tk-r">${rechts || ''}</div></header>`;
    const balkLoopt = () => { const l = st().loopt; if (!l || ui.scherm === 'klok') return ''; return `<button class="t-loopt" data-a="naarklok"><span class="t-stip ${l.pauzeVan ? 'p' : ''}"></span><span>${esc(looptTekst(l))}</span><b class="t-mini" data-klok>${duur(T.seconden(l))}</b></button>`; };
    const voet = () => { const w = st().wachtrij.length; return `<footer class="tv"><button data-a="vandaag">Vandaag${T.vandaag().length ? ' (' + T.vandaag().length + ')' : ''}</button><button data-a="achteraf">+ Achteraf invullen</button><span class="tv-st ${ui.online ? '' : 'uit'}">${ui.online ? (w ? '⏳ ' + w + ' te versturen' : '✓ bij') : '○ geen internet' + (w ? ' · ' + w + ' wacht' : '')}</span></footer>`; };

    function scrKoppel() {
      return kop('Timer koppelen') + `<main class="tm"><p>Scan op de laptop de QR-code bij <b>Koppeling › Timer-app</b>, of plak hier de koppelcode.</p>
        <label class="tl">Koppelcode<textarea id="t-code" rows="3" placeholder="plak de code of de hele link"></textarea></label>
        <button class="t-groot" data-a="koppel">Koppelen</button>${ui.fout ? `<p class="t-fout">${esc(ui.fout)}</p>` : ''}</main>`;
    }
    function scrInloggen() {
      return kop('Inloggen') + `<main class="tm"><p>Log één keer in met je e-mail en wachtwoord (aangemaakt in Supabase). Het wachtwoord wordt niet bewaard.</p>
        <form id="t-login"><label class="tl">E-mail<input id="t-mail" type="email" autocomplete="username" required></label>
        <label class="tl">Wachtwoord<input id="t-ww" type="password" autocomplete="current-password" required></label>
        <button class="t-groot" type="submit" ${ui.bezig ? 'disabled' : ''}>${ui.bezig ? 'Bezig…' : 'Inloggen'}</button></form>${ui.fout ? `<p class="t-fout">${esc(ui.fout)}</p>` : ''}
        <p class="t-klein"><button class="t-link" data-a="ontkoppel">Andere koppeling instellen</button></p></main>`;
    }
    function scrNaam() {
      return kop('Wie werkt er met deze telefoon?') + `<main class="tm"><p>Deze naam staat bij elke meting (bv. "Tim" of "Werkplaats 2").</p>
        <label class="tl">Naam<input id="t-naam" value="${esc(C.cfg().naam || '')}" autocomplete="name"></label><button class="t-groot" data-a="naam">Opslaan</button></main>`;
    }
    function scrProjecten() {
      const P = st().projecten;
      const lijst = P.length ? P.map(p => `<button class="t-tegel t-proj" data-a="proj" data-v="${esc(p.id)}"><b>${esc(p.naam)}</b><span>${esc([p.klant, p.plaats].filter(Boolean).join(' · '))}</span><small>${esc(p.status)} · ${p.trappen.length} trap${p.trappen.length === 1 ? '' : 'pen'}</small></button>`).join('')
        : `<p class="t-leeg">Geen projecten in de werkplaats. Zet in de Zaagplanner de status van een project op <b>${W().IN_WERK.join('</b>, <b>')}</b>.</p>`;
      return kop('Projecten', '', `<button class="tk-knop" data-a="vernieuw" aria-label="Vernieuwen">↻</button><button class="tk-knop" data-a="instel" aria-label="Instellingen">⚙</button>`) + balkLoopt()
        + `<main class="tm">${ui.achteraf ? '<p class="t-achteraf">Achteraf invullen: kies het werk. <button class="t-link" data-a="achteraftwijfel">Stoppen</button></p>' : ''}${ui.fout ? `<p class="t-fout">${esc(ui.fout)}</p>` : ''}<div class="t-raster een">${lijst}</div></main>` + voet();
    }
    function scrTrap() {
      const p = T.project(ui.pid); if (!p) { ui.scherm = 'projecten'; return scrProjecten(); }
      return kop(esc(p.naam), 'projecten') + balkLoopt() + `<main class="tm"><p class="t-sub">Welke trap?</p><div class="t-raster">${p.trappen.map(t => `<button class="t-tegel" data-a="trap" data-v="${esc(t.id)}"><b>${esc(t.code || '')}</b><span>${esc(t.naam || '')}</span><small>${t.treden} treden${t.aantal > 1 ? ' · ' + t.aantal + '×' : ''}</small></button>`).join('')}</div></main>` + voet();
    }
    function scrOnderdeel() {
      const p = T.project(ui.pid), t = T.trap(ui.pid, ui.sid); if (!t) { ui.scherm = 'projecten'; return scrProjecten(); }
      const tg = T.onderdelen(t).map(k => { const n = T.stukkenVan(t, k).length; return `<button class="t-tegel t-ond o-${k}" data-a="ond" data-v="${k}"><b>${esc(ondNaam(k))}</b>${n ? `<small>${n} stuk${n === 1 ? '' : 's'}</small>` : '<small>per trap</small>'}</button>`; }).join('');
      return kop(esc((t.code ? t.code + ' – ' : '') + (t.naam || p.naam)), p.trappen.length > 1 ? 'trap' : 'projecten') + balkLoopt() + `<main class="tm">${ui.melding ? `<p class="t-ok">✓ ${esc(ui.melding)}</p>` : ''}<p class="t-sub">${esc(p.naam)}${p.klant ? ' · ' + esc(p.klant) : ''}</p><div class="t-raster">${tg}</div></main>` + voet();
    }
    function scrWerk() {
      const D = W().WERK[ui.ond], t = T.trap(ui.pid, ui.sid), stukken = T.stukkenVan(t, ui.ond);
      const tg = D.werk.map(w => { const k = T.klaarVan(ui.pid, ui.sid, ui.ond, w.k).filter(id => stukken.some(s => s.id === id)).length;
        return `<button class="t-tegel ${stukken.length && k >= stukken.length ? 'af' : ''}" data-a="werk" data-v="${w.k}"><b>${esc(w.t)}</b><small>${stukken.length ? (k ? k + ' van ' + stukken.length + ' klaar' : 'per ' + (w.per === 'm' ? 'meter' : w.per === 'tred' ? 'trede' : w.per === 'trap' ? 'trap' : 'stuk')) : 'per ' + W().EENHEID[w.per].replace(/s$/, '')}</small></button>`; }).join('');
      return kop(esc(D.t) + ' – wat ga je doen?', 'onderdeel') + balkLoopt() + `<main class="tm"><div class="t-raster">${tg}</div></main>` + voet();
    }
    function stukTegel(s) {
      const op = ui.sel.includes(s.id), zwaar = s.k && (s.k.soort === 'Verdreven' || s.k.vorm === 'Gebogen');
      const klein = s.t === 'trede' || s.t === 'stootbord' || s.t === 'baluster';
      const label = klein ? (s.nr || s.n) : s.n;
      const sub = klein ? '' : [s.z, s.k && (s.k.vorm || s.k.soort), s.l ? getal(s.l / 1000) + ' m' : ''].filter(Boolean).join(' · ');
      return `<button class="t-stuk ${klein ? 'klein' : ''} ${zwaar ? 'zwaar' : ''} ${op ? 'op' : ''}" data-a="stuk" data-v="${esc(s.id)}" title="${esc(s.n)}"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
    }
    function scrStukken() {
      const t = T.trap(ui.pid, ui.sid), stukken = T.stukkenVan(t, ui.ond), w = W().werkVan(ui.ond, ui.werk);
      const zwaar = stukken.filter(s => s.k && (s.k.soort === 'Verdreven' || s.k.vorm === 'Gebogen')).length;
      const leg = ui.ond === 'trede' ? `<span class="t-leg"><i class="g"></i>recht <i class="o"></i>verdreven${zwaar ? ' (' + zwaar + ')' : ''}</span>` : BOMEN.includes(ui.ond) || ui.ond === 'leuning' ? `<span class="t-leg"><i class="g"></i>recht <i class="o"></i>gebogen</span>` : '';
      return kop(esc(w.t) + ' – welke stukken?', 'werk') + balkLoopt() + `<main class="tm"><div class="t-selbalk"><button data-a="selalle">Alles</button><button data-a="selrest">Nog niet klaar</button><button data-a="selniets">Niets</button>${leg}</div>
        <div class="t-stukken">${stukken.map(stukTegel).join('')}</div></main>
        <div class="t-onder"><button class="t-groot t-start" data-a="startnu" ${ui.sel.length ? '' : 'disabled'}>${ui.achteraf ? 'Verder' : '▶ Start'} · ${ui.sel.length} stuk${ui.sel.length === 1 ? '' : 's'}</button></div>`;
    }
    function scrKlok() {
      const l = st().loopt; if (!l) { ui.scherm = 'projecten'; return scrProjecten(); }
      const p = T.project(l.pid), t = T.trap(l.pid, l.sid), ver = T.vergeten();
      const st_ = l.stukken.length ? (t ? t.stukken.filter(s => l.stukken.includes(s.id)) : []) : [];
      const ken = l.ond === 'trede' && st_.length ? st_.filter(s => s.k.soort === 'Verdreven').length + ' verdreven van ' + st_.length : st_.length ? st_.length + ' stuk' + (st_.length === 1 ? '' : 's') : '';
      return kop(esc(werkNaam(l.ond, l.werk)) + ' – ' + esc(ondNaam(l.ond).toLowerCase()), 'onderdeel') + `<main class="tm t-klokscherm">
        <p class="t-sub">${esc(p ? p.naam : '')}${t ? ' · ' + esc(t.code || t.naam || '') : ''}${ken ? ' · ' + esc(ken) : ''}</p>
        ${ver ? `<div class="t-vergeten"><b>Loopt "${esc(werkNaam(l.ond, l.werk))}" nog sinds ${tijd(l.start)}?</b><div class="t-rij"><button data-a="nogbezig">Ja, loopt nog</button><label>Gestopt om <input type="time" id="t-stopom" value="${tijd(l.actie || l.start)}"></label><button data-a="stopom">Opslaan</button></div></div>` : ''}
        <div class="t-klok ${l.pauzeVan ? 'pauze' : ''}" data-klok>${duur(T.seconden(l))}</div>
        <p class="t-sinds">gestart ${tijd(l.start)}${l.pauzes.length ? ' · ' + l.pauzes.length + '× pauze' : ''}${l.pauzeVan ? ' · <b>pauze</b>' : ''}</p>
        <div class="t-knoppen">${l.pauzeVan ? `<button class="t-groot t-hervat" data-a="hervat">▶ Verder</button>` : `<button class="t-groot t-pauze" data-a="pauze">❚❚ Pauze</button>`}
        <button class="t-groot t-klaar" data-a="klaar">■ Klaar</button></div>
        <p class="t-klein"><button class="t-link" data-a="annuleer">Timer weggooien (niet bewaren)</button></p></main>` + voet();
    }
    function scrAantal() {
      const b = ui.inv.b, v = T.voorstel(b), w = v.w, inv = ui.inv;
      const eenh = w.per === 'm' ? 'meter' : w.per === 'tred' ? 'treden' : w.per === 'trap' ? 'trap' : 'stuks';
      const groepen = v.gemengd ? `<p class="t-sub">Tijd wordt verdeeld: ${v.groepen.map(g => esc(g.stukken.length + '× ' + ([g.kenmerk.soort || g.kenmerk.vorm, g.kenmerk.hout].filter(Boolean).join(' ') || 'stuk'))).join(', ')}.</p>` : '';
      const tijdVeld = ui.achteraf ? `<div class="t-rij2"><label class="tl">Datum<input type="date" id="t-dat" value="${inv.datum}"></label><label class="tl">Begonnen<input type="time" id="t-van" value="${inv.van}"></label></div>
          <label class="tl">Gewerkt (uren:minuten, zonder pauzes)<input id="t-duur" inputmode="numeric" placeholder="1:30" value="${esc(inv.duur || '')}"></label>`
        : `<p class="t-tijd">Gewerkt: <b>${duurKort(inv.seconden)}</b> (${tijd(inv.start)}–${tijd(inv.eind)})</p>`;
      return kop('Hoeveel ' + eenh + '?', ui.achteraf ? 'stukkenterug' : '') + `<main class="tm">${tijdVeld}
        <div class="t-teller"><button data-a="min">−</button><input id="t-tot" inputmode="decimal" value="${getal(inv.totaal)}"><button data-a="plus">+</button></div>
        ${v.stuks && ui.inv.b.ond === 'trede' ? `<p class="t-sub">${v.verdreven} verdreven van ${v.stuks} treden (uit de tekening)</p>` : v.stuks && v.verdreven ? `<p class="t-sub">${v.verdreven} gebogen van ${v.stuks}</p>` : ''}
        ${groepen}
        ${v.afwerken ? `<label class="tl">Liters gebruikt (mag leeg)<input id="t-liter" inputmode="decimal" value="${esc(inv.liters || '')}"></label>` : ''}
        <p class="t-sub">Bijzonderheid (optioneel)</p><div class="t-chips">${BIJZ.map(x => `<button class="t-chip ${inv.bijz.includes(x) ? 'op' : ''}" data-a="bijz" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        ${inv.bijz.some(x => NIET_TELLEN.includes(x)) ? `<label class="t-check"><input type="checkbox" id="t-telt" ${inv.telt ? 'checked' : ''}> Toch meetellen voor de normen</label>` : ''}
        <label class="tl">Opmerking<input id="t-notitie" value="${esc(inv.notitie || '')}"></label>
        ${ui.fout ? `<p class="t-fout">${esc(ui.fout)}</p>` : ''}</main>
        <div class="t-onder"><button class="t-groot t-klaar" data-a="opslaan">Opslaan</button></div>`;
    }
    function scrVandaag() {
      const l = T.vandaag(), tot = l.reduce((a, m) => a + (+m.seconden || 0), 0);
      const rij = (m) => ui.bewerk === m.id ? `<div class="t-mrij open"><b>${esc(werkNaam(m.onderdeel, m.werk))} – ${esc(ondNaam(m.onderdeel).toLowerCase())}</b>
          <div class="t-rij2"><label class="tl">Tijd (u:mm)<input id="t-bduur" inputmode="numeric" value="${Math.floor(m.seconden / 3600)}:${String(Math.round(m.seconden % 3600 / 60)).padStart(2, '0')}"></label>
          <label class="tl">${(W().werkVan(m.onderdeel, m.werk) || {}).per === 'm' ? 'Meters' : 'Aantal'}<input id="t-baant" inputmode="decimal" value="${getal((W().werkVan(m.onderdeel, m.werk) || {}).per === 'm' ? m.meters : m.aantal)}"></label></div>
          <label class="t-check"><input type="checkbox" id="t-btelt" ${m.telt !== false ? 'checked' : ''}> Telt mee voor de normen</label>
          <div class="t-rij"><button class="t-prim" data-a="bewaar" data-v="${esc(m.id)}">Opslaan</button><button data-a="bewerk" data-v="">Annuleren</button><button class="t-weg" data-a="mweg" data-v="${esc(m.id)}">Weghalen</button></div></div>`
        : `<button class="t-mrij" data-a="bewerk" data-v="${esc(m.id)}"><span><b>${esc(werkNaam(m.onderdeel, m.werk))} – ${esc(ondNaam(m.onderdeel).toLowerCase())}</b><small>${esc(m.projectnaam || '')}${m.trapnaam ? ' · ' + esc(m.trapnaam) : ''} · ${tijd(Date.parse(m.start))}</small></span><span class="t-mr"><b>${duurKort(m.seconden)}</b><small>${getal((W().werkVan(m.onderdeel, m.werk) || {}).per === 'm' ? m.meters : m.aantal)} ${esc(W().EENHEID[(W().werkVan(m.onderdeel, m.werk) || { per: 'stuk' }).per])}${m.telt === false ? ' · telt niet' : ''}${m._wacht ? ' · ⏳' : ''}</small></span></button>`;
      return kop('Vandaag', 'projecten') + balkLoopt() + `<main class="tm"><p class="t-sub">${l.length} meting${l.length === 1 ? '' : 'en'} · ${duurKort(tot)} gewerkt</p>${l.map(rij).join('') || '<p class="t-leeg">Vandaag nog niets bijgehouden.</p>'}
        ${(st().mislukt || []).length ? `<p class="t-fout">${st().mislukt.length} meting(en) konden niet worden verstuurd (${esc(st().mislukt[st().mislukt.length - 1].fout)}).</p>` : ''}</main>` + voet();
    }
    function scrInstel() {
      return kop('Instellingen', 'projecten') + `<main class="tm"><label class="tl">Naam op deze telefoon<input id="t-naam" value="${esc(C.cfg().naam || '')}"></label><button class="t-groot" data-a="naam">Naam opslaan</button>
        <p class="t-sub">Ingelogd als ${esc(st().gebruiker || '—')}</p>
        <div class="t-rij"><button data-a="melding">Meldingen toestaan</button><button data-a="uitlog">Uitloggen</button></div>
        <p class="t-klein">Tip: zet deze pagina op het beginscherm (Safari: Deel › Zet op beginscherm; Chrome: ⋮ › Toevoegen aan startscherm). Een meelopende klok op het vergrendelscherm kan alleen met een echte app; Android toont wel een melding met de starttijd.</p></main>`;
    }
    const SCR = { koppel: scrKoppel, inloggen: scrInloggen, naam: scrNaam, projecten: scrProjecten, trap: scrTrap, onderdeel: scrOnderdeel, werk: scrWerk, stukken: scrStukken, klok: scrKlok, aantal: scrAantal, vandaag: scrVandaag, instel: scrInstel,
      laden: () => kop('Timer') + '<main class="tm"><p class="t-leeg">Even geduld…</p></main>', start: () => '' };
    function teken() { root.innerHTML = (SCR[ui.scherm] || scrProjecten)(); root.dataset.scherm = ui.scherm; if (ui.scherm !== 'onderdeel' && ui.scherm !== 'aantal') ui.melding = ''; }

    // ---------- naar het scherm "Hoeveel?" ----------
    function naarAantal(b, achteraf) {
      const v = T.voorstel(b); if (!v) return;
      const l = st().loopt, nuMs = Date.now();
      const eind = achteraf ? nuMs : (l.eind || nuMs);
      ui.inv = { b, totaal: v.totaal, bijz: [], telt: true, notitie: '', liters: '', seconden: achteraf ? 0 : T.seconden(l, eind), start: achteraf ? nuMs : l.start, eind,
        datum: new Date(nuMs - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), van: '07:30', duur: '' };
      ui.fout = ''; ui.scherm = 'aantal'; teken();
    }
    function leesAantal() {
      const i = ui.inv, q = (id) => root.querySelector('#' + id);
      if (q('t-tot')) i.totaal = leesGetal(q('t-tot').value);
      if (q('t-notitie')) i.notitie = q('t-notitie').value.trim();
      if (q('t-liter')) i.liters = q('t-liter').value.trim();
      if (q('t-telt')) i.telt = q('t-telt').checked;
      if (q('t-dat')) { i.datum = q('t-dat').value; i.van = q('t-van').value; i.duur = q('t-duur').value.trim(); }
    }
    const leesDuur = (s) => { const m = /^(\d+)(?:[:.,u ]+(\d{1,2}))?/.exec(String(s).trim()); if (!m) return 0; return (+m[1]) * 3600 + (+(m[2] || 0)) * 60; };

    // ---------- klikken ----------
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-a]'); if (!el) return;
      const a = el.dataset.a, v = el.dataset.v;
      ui.fout = '';
      switch (a) {
        case 'terug':
          if (v === 'stukkenterug') { ui.scherm = W().WERK[ui.inv.b.ond].los ? 'werk' : 'stukken'; break; }
          if (!v) { const l = st().loopt; if (l && l.eind) { delete l.eind; T.bewaar(); } ui.scherm = l ? 'klok' : 'projecten'; break; }
          ui.scherm = v; break;
        case 'achteraftwijfel': ui.achteraf = false; break;
        case 'koppel': {
          const s = (root.querySelector('#t-code').value || '').trim(), m = /k=([^&\s]+)/.exec(s);
          if (!C.uitCode(m ? decodeURIComponent(m[1]) : s)) { ui.fout = 'Deze code klopt niet. Kopieer de code uit de Zaagplanner (Koppeling).'; break; }
          return opstart();
        }
        case 'ontkoppel': C.zetCfg({ url: '', key: '' }); ui.scherm = 'koppel'; break;
        case 'naam': { const n = root.querySelector('#t-naam').value.trim(); if (!n) { ui.fout = 'Vul een naam in.'; break; } C.zetCfg({ naam: n }); ui.scherm = st().loopt ? 'klok' : 'projecten'; vernieuw(); break; }
        case 'vernieuw': ui.fout = ''; teken(); return vernieuw();
        case 'instel': ui.scherm = 'instel'; break;
        case 'melding': await meldingToon(st().loopt ? looptTekst(st().loopt) : 'Meldingen staan aan.'); break;
        case 'uitlog': try { await C.uitloggen(); } catch (x) { /* offline */ } st().gebruiker = null; T.bewaar(); ui.scherm = 'inloggen'; break;
        case 'proj': { ui.pid = v; const p = T.project(v); if (p.trappen.length === 1) { ui.sid = p.trappen[0].id; ui.scherm = 'onderdeel'; } else ui.scherm = 'trap'; break; }
        case 'trap': ui.sid = v; ui.scherm = 'onderdeel'; break;
        case 'ond': ui.ond = v; ui.scherm = 'werk'; break;
        case 'werk': {
          ui.werk = v;
          const t = T.trap(ui.pid, ui.sid);
          if (W().WERK[ui.ond].los || !T.stukkenVan(t, ui.ond).length) { ui.sel = []; return beginWerk(); }
          ui.sel = T.standaardSel(ui.pid, ui.sid, ui.ond, ui.werk); ui.scherm = 'stukken'; break;
        }
        case 'stuk': ui.sel = ui.sel.includes(v) ? ui.sel.filter(x => x !== v) : ui.sel.concat([v]); break;
        case 'selalle': ui.sel = T.stukkenVan(T.trap(ui.pid, ui.sid), ui.ond).map(s => s.id); break;
        case 'selniets': ui.sel = []; break;
        case 'selrest': ui.sel = T.standaardSel(ui.pid, ui.sid, ui.ond, ui.werk); break;
        case 'startnu': return beginWerk();
        case 'naarklok': ui.scherm = 'klok'; break;
        case 'pauze': T.pauze(); break;
        case 'hervat': T.hervat(); break;
        case 'nogbezig': T.nogBezig(); break;
        case 'stopom': { const l = st().loopt, [u, m] = (root.querySelector('#t-stopom').value || '').split(':').map(Number), d = new Date(l.start); d.setHours(u || 0, m || 0, 0, 0); if (d.getTime() < l.start) d.setDate(d.getDate() + 1); T.gestoptOm(d.getTime()); return naarAantal(l, false); }
        case 'klaar': { const l = st().loopt; if (!l) break; if (!l.eind) { l.eind = Date.now(); if (l.pauzeVan) { l.pauzes.push([l.pauzeVan, l.eind]); l.pauzeVan = null; } T.bewaar(); } return naarAantal(l, false); }
        case 'annuleer': if (confirm('Deze tijd weggooien? Er wordt niets bewaard.')) { T.annuleer(); meldingWeg(); ui.scherm = 'projecten'; } break;
        case 'min': case 'plus': leesAantal(); { const w = T.voorstel(ui.inv.b).w, stap = w.per === 'm' ? 0.5 : 1; ui.inv.totaal = Math.max(0, Math.round(((+ui.inv.totaal || 0) + (a === 'plus' ? stap : -stap)) * 100) / 100); } break;
        case 'bijz': leesAantal(); { const i = ui.inv; i.bijz = i.bijz.includes(v) ? i.bijz.filter(x => x !== v) : i.bijz.concat([v]); i.telt = !i.bijz.some(x => NIET_TELLEN.includes(x)); } break;
        case 'opslaan': {
          leesAantal(); const i = ui.inv;
          if (!(i.totaal > 0)) { ui.fout = 'Vul in hoeveel (meer dan 0).'; break; }
          if (ui.achteraf) {
            const s = leesDuur(i.duur); if (!s) { ui.fout = 'Vul de gewerkte tijd in, bv. 1:30.'; break; }
            const st0 = new Date(i.datum + 'T' + (i.van || '07:30')).getTime(); if (!st0) { ui.fout = 'Datum of tijd klopt niet.'; break; }
            i.seconden = s; i.start = st0; i.eind = st0 + s * 1000;
          }
          T.opslaan(i.b, Object.assign({}, i, { vanTimer: !ui.achteraf }));
          if (!ui.achteraf) meldingWeg();
          ui.melding = 'Opgeslagen.'; ui.achteraf = false; ui.pid = i.b.pid; ui.sid = i.b.sid; ui.inv = null; ui.scherm = 'onderdeel';
          teken(); await stuur(); break;
        }
        case 'vandaag': ui.scherm = 'vandaag'; ui.bewerk = null; break;
        case 'achteraf': ui.achteraf = true; ui.scherm = ui.pid ? 'onderdeel' : 'projecten'; if (!T.trap(ui.pid, ui.sid)) ui.scherm = 'projecten'; break;
        case 'bewerk': ui.bewerk = v || null; break;
        case 'bewaar': {
          const m = st().mijn.find(x => x.id === v), w = W().werkVan(m.onderdeel, m.werk) || { per: 'stuk' };
          const s = leesDuur(root.querySelector('#t-bduur').value), n = leesGetal(root.querySelector('#t-baant').value);
          const patch = { seconden: s, telt: root.querySelector('#t-btelt').checked }; patch[w.per === 'm' ? 'meters' : 'aantal'] = n;
          T.wijzig(v, patch); ui.bewerk = null; teken(); await stuur(); break;
        }
        case 'mweg': if (confirm('Deze meting weghalen?')) { T.weg(v); ui.bewerk = null; teken(); await stuur(); } break;
      }
      teken();
    });
    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 't-login') return; e.preventDefault();
      ui.bezig = true; ui.fout = ''; teken();
      try { const u = await C.inloggen(root.querySelector('#t-mail') ? e.target.querySelector('#t-mail').value.trim() : '', e.target.querySelector('#t-ww').value); st().gebruiker = u.email; T.bewaar(); ui.bezig = false; return opstart(); }
      catch (x) { ui.bezig = false; ui.fout = /Invalid login/i.test(x.message) ? 'E-mail of wachtwoord klopt niet.' : x.message; teken(); }
    });
    // bij het submitten worden de velden opnieuw getekend; e-mail onthouden voor de volgende keer
    function beginWerk() {
      const b = { pid: ui.pid, sid: ui.sid, ond: ui.ond, werk: ui.werk, stukken: ui.sel.slice() };
      if (ui.achteraf) return naarAantal(b, true);
      if (st().loopt) { if (!confirm('Er loopt al een timer (' + looptTekst(st().loopt) + '). Die eerst afronden?')) return teken(); ui.scherm = 'klok'; return teken(); }
      T.start(b.pid, b.sid, b.ond, b.werk, b.stukken);
      meldingToon(looptTekst(st().loopt));
      ui.scherm = 'klok'; teken();
    }

    // ---------- klok bijwerken, vergeten timer, verbinding ----------
    let gemeld = false;
    setInterval(() => {
      const l = st().loopt; if (!l) return;
      for (const el of root.querySelectorAll('[data-klok]')) el.textContent = duur(T.seconden(l));
      if (T.vergeten() && !gemeld) { gemeld = true; meldingToon('Loopt "' + werkNaam(l.ond, l.werk) + '" nog? Gestart om ' + tijd(l.start) + '.', { silent: false }); if (ui.scherm === 'klok') teken(); }
    }, 1000);
    addEventListener('online', () => { ui.online = true; vernieuw(); });
    addEventListener('offline', () => { ui.online = false; teken(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { gemeld = false; if (st().loopt && ui.scherm !== 'aantal') ui.scherm = 'klok'; teken(); vernieuw(); } });
    setInterval(() => { if (navigator.onLine) stuur().then(teken); }, 60000);
    opstart();
    return { T, ui, teken };
  }

  return { maak, scherm, BIJZ, NIET_TELLEN };
})();
