import { ERAS, TOUR } from '../data/meta.js';
import { CONFIG } from '../config.js';
import { parseICS, detectCourses, expand, fetchICS, fetchGoogleEvents, ndDate, wall } from './calendar.js';
import { saveCourse, deleteCourse, importCourses, saveCard, deleteCard, logDecision, setEvents, setPref, signInGoogle, supabase } from './store.js';
import { PROVIDERS, signIn, signOut, ndIdentity } from './auth.js';
import { initCourses } from './courses-ui.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const fmtT = ms => { const w = wall(new Date(ms)); const h = w.hh % 12 || 12; return `${h}:${pad(w.mm)}${w.hh >= 12 ? 'p' : 'a'}`; };
const DAYS = 'UMTWRFS';
const CATS = [['all', 'All'], ['landmark', 'Landmarks'], ['academic', 'Academic'], ['residence', 'Residence halls'], ['student', 'Student life'], ['dining', 'Dining'], ['athletic', 'Athletics'], ['lost', 'Lost buildings']];
const LANDMARK_LABELS = ['Main Building', 'Basilica of the Sacred Heart', 'Hesburgh Library', 'Notre Dame Stadium', 'Duncan Student Center', 'LaFortune Student Center', 'Mendoza College of Business', 'DeBartolo Hall', 'Joyce Athletic Center', 'Raclin Murphy Museum of Art', 'Morris Inn', 'South Dining Hall', 'North Dining Hall', 'Jordan Hall of Science', 'Eck Visitors Center', 'Old Fieldhouse', 'Compton Family Ice Arena'];

export function initUI(world, store) {
  const listeners = {};
  world.emit = (ev, d) => (listeners[ev] || []).forEach(f => f(d));
  const on = (ev, f) => (listeners[ev] = listeners[ev] || []).push(f);
  const toast = (m, ms = 2800) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms); };
  on('toast', toast);

  // ---------- tabs & drawer ----------
  const showTab = (t) => { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t)); $('#drawer').classList.remove('closed'); if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t); };
  $$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#drawerToggle').onclick = () => $('#drawer').classList.toggle('closed');
  if (/^#(explore|schedule|courses|calendar|dispatch)$/.test(location.hash)) showTab(location.hash.slice(1));
  $$('#startHere [data-go]').forEach(li => li.onclick = () => showTab(li.dataset.go));
  initCourses({ world, store, toast, showTab, esc });

  // ---------- explore ----------
  let cat = 'all';
  $('#catChips').innerHTML = CATS.map(([k, l]) => `<button data-c="${k}" class="${k === 'all' ? 'on' : ''}">${l}</button>`).join('');
  $$('#catChips button').forEach(b => b.onclick = () => { cat = b.dataset.c; $$('#catChips button').forEach(x => x.classList.toggle('on', x === b)); renderList(); });
  $('#bSearch').oninput = () => renderList();
  const exists = r => world.shared.uEra.value >= r.built - 0.5 && world.shared.uEra.value < r.demo;
  function renderList() {
    const q = $('#bSearch').value.trim().toLowerCase();
    const pool = world.directory.concat(world.recs.filter(r => r.lost));
    const list = pool.filter(r => (cat === 'all' || (r.meta?.cat || 'other') === cat) && (!q || r.name.toLowerCase().includes(q) || (r.meta?.codes || []).some(c => c.includes(q)))).slice(0, 220);
    $('#bList').innerHTML = list.map(r => `<li data-id="${r.id}" class="${exists(r) ? '' : 'dim'}"><b>${esc(r.name)}</b><span>${r.lost ? r.built + '–' + r.demo : r.meta?.built ? 'est. ' + r.built : ''}</span></li>`).join('') || '<div class="empty">No match. Try a hall name or a short code like DBRT.</div>';
    $$('#bList li').forEach(li => li.onclick = () => { const r = world.recs[+li.dataset.id]; if (!exists(r)) { const era = ERAS.find(e => e.year >= r.built && e.year < r.demo); if (era) setEra(era.year); } world.select(r); });
  }
  on('data', () => {
    const d = world.data;
    $('#stats').innerHTML = `<div><b>${d.buildings.length.toLocaleString()}</b><span>Buildings</span></div><div><b>${world.directory.length}</b><span>Named on campus</span></div><div><b>${(world.graph?.nodes.length || 0).toLocaleString()}</b><span>Walk nodes</span></div>`;
    $('#credits').innerHTML = `Building footprints, walks and lakes ${esc(d.attribution)}, refreshed ${new Date(d.generated).toLocaleDateString()}. ${esc(CONFIG.imageryAttribution)}. Heights and construction years are curated; estimated values are approximate. Weather by Open-Meteo.`;
    $('#attrib').textContent = `${CONFIG.imageryAttribution} · © OpenStreetMap contributors`;
    const sel = $('#cBld'); sel.innerHTML = world.directory.map(r => `<option value="${r.slug}">${esc(r.name)}</option>`).join('');
    const home = $('#cHome'); home.innerHTML = '<option value="">Not set</option>' + world.directory.filter(r => r.meta?.cat === 'residence' || /Hall$/.test(r.name)).map(r => `<option value="${r.slug}">${esc(r.name)}</option>`).join('');
    home.value = store.prefs.home || ''; home.onchange = () => { setPref('home', home.value || null); renderSchedule(); };
    renderList(); buildLabels(); renderSchedule(); renderCalendarList(); world.renderPlan?.();
  });

  // ---------- building card ----------
  on('select', rec => {
    const card = $('#bcard'); if (!rec) { card.hidden = true; return; }
    card.hidden = false; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    const m = rec.meta || {};
    const catName = { landmark: 'Landmark', academic: 'Academic', residence: 'Residence hall', student: 'Student life', dining: 'Dining', athletic: 'Athletics', admin: 'Administration', lost: 'Lost building' }[m.cat] || (rec.campus ? 'Campus building' : 'South Bend');
    $('#bcEyebrow').textContent = `${catName}${rec.built && (m.built || rec.lost) ? ' · est. ' + rec.built : ''}`;
    $('#bcName').textContent = rec.name || (rec.kind ? rec.kind[0].toUpperCase() + rec.kind.slice(1) : 'Building');
    $('#bcBlurb').textContent = m.blurb || (rec.campus ? 'Footprint from OpenStreetMap; roof from aerial imagery.' : 'Part of the neighborhood around campus.');
    const ft = Math.round(rec.h * 3.281);
    $('#bcFacts').innerHTML = `<div><dt>Height</dt><dd>${ft} ft</dd></div><div><dt>Built</dt><dd>${m.built || rec.lost ? rec.built : '—'}</dd></div><div><dt>Floors</dt><dd>~${Math.max(1, Math.round((rec.h - rec.base) / 3.8))}</dd></div>`;
    const cls = store.courses.filter(c => c.building === rec.slug);
    let walk = '';
    const home = world.bySlug.get(store.prefs.home); if (home && home !== rec) { const mins = world.walkMinutes(home, rec); if (mins) walk = `<div class="mini">🚶 <b>${Math.round(mins)} min</b> walk from ${esc(home.name)}</div>`; }
    $('#bcClasses').innerHTML = (cls.length ? `<div class="rule-h"><span>Your classes here</span></div>` + cls.map(c => `<div class="mini"><b>${esc(c.title)}</b> · ${c.days} ${c.start}–${c.end}${c.room ? ' · ' + esc(c.room) : ''}</div>`).join('') : '') + walk;
    $('#bcWalk').onclick = () => { const from = world.bySlug.get(store.prefs.home) || prevStopFor(rec); if (!from) { openPalette('walk', r => doWalk(r, rec)); return; } doWalk(from, rec); };
    $('#bcOrbit').onclick = () => world.cam.flyTo(new world.THREE.Vector3(rec.cx, rec.h * 0.5, rec.cz), { dist: Math.max(140, rec.h * 4), el: 18 });
    $('#bcAdd').onclick = () => { showTab('schedule'); openCourseForm(); $('#cBld').value = rec.slug; };
  });
  $('#bcardX').onclick = () => world.select(null);
  const doWalk = (a, b) => { const r = world.walk(a, b); if (r) toast(`${a.name} → ${b.name}: ${Math.round(r.meters)} m, about ${Math.max(1, Math.round(r.minutes))} min on foot`, 5000); else toast('No walking route found between those buildings'); };

  // ---------- labels ----------
  let labels = [];
  function buildLabels() {
    const box = $('#labels'); box.innerHTML = ''; labels = [];
    const add = (rec, cls, sub, y) => { if (!rec) return; const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = `<div class="stem"></div><div class="tagl">${esc(rec.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`; el.onclick = () => world.select(rec); box.appendChild(el); labels.push({ el, rec, p: new world.THREE.Vector3(rec.cx, y ?? (rec.h + 4), rec.cz) }); };
    for (const n of LANDMARK_LABELS) { const r = world.directory.find(x => x.name === n) || world.recs.find(x => x.name === n); if (r) add(r, '', null, n === 'Main Building' ? 62 : n === 'Basilica of the Sacred Heart' ? 72 : n === 'Hesburgh Library' ? 68 : undefined); }
    const today = itemsOn(new Date()).filter(i => i.rec); const done = new Set();
    for (const i of today) { if (done.has(i.rec.id)) continue; done.add(i.rec.id); const ex = labels.find(l => l.rec === i.rec); if (ex) { ex.el.classList.add('class'); ex.el.querySelector('.tagl').innerHTML = `${esc(i.rec.name)}<small>${fmtT(i.start)}</small>`; } else add(i.rec, 'class', fmtT(i.start)); }
  }
  const v = new world.THREE.Vector3();
  on('frame', () => {
    const w = window.innerWidth, h = window.innerHeight; const cam = world.camera; const dist = cam.position.distanceTo(world.controls.target);
    for (const l of labels) {
      const show = exists(l.rec) && !document.body.classList.contains('touring');
      v.copy(l.p).project(cam);
      const d = cam.position.distanceTo(l.p);
      const vis = show && v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1 && (l.el.classList.contains('class') || d < Math.max(1400, dist * 1.6));
      if (!vis) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; l.el.style.pointerEvents = 'none'; continue; }
      const op = l.el.classList.contains('class') ? 1 : Math.max(0, Math.min(1, (2400 - d) / 900));
      l.el.style.opacity = op.toFixed(2); l.el.style.pointerEvents = op > 0.3 ? 'auto' : 'none';
      l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
      l.el.style.zIndex = String(10000 - Math.round(d));
    }
    // compass
    const dx = cam.position.x - world.controls.target.x, dz = cam.position.z - world.controls.target.z;
    $('#compass svg').style.transform = `rotate(${Math.atan2(dx, dz) * 180 / Math.PI}deg)`;
  });

  // ---------- time machine dock ----------
  const rail = $('#eraRail'); rail.innerHTML = '<div class="fill"></div>' + ERAS.map(e => `<button data-y="${e.year}" class="${e.year === 2026 ? 'on' : ''}">${e.label}</button>`).join('');
  const setEra = (y) => { world.setEra(y); $$('#eraRail button').forEach(b => b.classList.toggle('on', +b.dataset.y === y)); const i = ERAS.findIndex(e => e.year === y); rail.querySelector('.fill').style.width = `calc(${(i / (ERAS.length - 1)) * 100}% - ${i === ERAS.length - 1 ? 16 : 8}px)`; };
  $$('#eraRail button').forEach(b => b.onclick = () => setEra(+b.dataset.y));
  rail.querySelector('.fill').style.width = 'calc(100% - 16px)';
  on('eraTick', y => { $('#yearBig').textContent = Math.round(y); });
  on('era', era => {
    $('#yearBig').textContent = era ? (era.year === 2026 ? new Date().getFullYear() : era.year) : '';
    const cap = $('#eraCaption');
    if (era && era.year !== 2026) { cap.hidden = false; $('#ecEyebrow').textContent = `Notre Dame, ${era.year}`; $('#ecTitle').textContent = era.title; $('#ecText').textContent = era.text; cap.style.animation = 'none'; void cap.offsetWidth; cap.style.animation = ''; }
    else cap.hidden = true;
    setTimeout(renderList, 400);
  });
  $$('#seasonSeg button').forEach(b => b.onclick = () => { $$('#seasonSeg button').forEach(x => x.classList.toggle('on', x === b)); world.setSeason(b.dataset.s); if (b.dataset.s === 'live') { world.setTod(null); $('#todOut').textContent = 'Now'; } });
  $('#tod').oninput = e => { const h = +e.target.value; world.setTod(h); const hh = Math.floor(h), mm = Math.round((h - hh) * 60); $('#todOut').textContent = `${hh % 12 || 12}:${pad(mm)} ${hh >= 12 ? 'PM' : 'AM'}`; };
  on('weather', c => {
    const codes = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm' };
    $('#wx span').textContent = `South Bend ${Math.round(c.temperature_2m)}°F · ${codes[c.weather_code] || 'Live'}`;
  });

  // ---------- HUD ----------
  $('#compass').onclick = () => { const t = world.controls.target; const d = world.camera.position.distanceTo(t); const el = Math.asin((world.camera.position.y - t.y) / d) * 180 / Math.PI; world.cam.flyTo(t.clone(), { az: 180, el, dist: d, dur: 1.2, arc: 0 }); };
  const zoom = f => { const t = world.controls.target; const d = world.camera.position.distanceTo(t) * f; const off = world.camera.position.clone().sub(t).setLength(Math.max(30, Math.min(4000, d))); world.cam.flyTo(t.clone(), { ...azEl(off), dist: off.length(), dur: 0.6, arc: 0 }); };
  const azEl = off => ({ az: (Math.atan2(off.x, -off.z) * 180 / Math.PI + 360) % 360, el: Math.asin(off.y / off.length()) * 180 / Math.PI });
  $('#zIn').onclick = () => zoom(0.6); $('#zOut').onclick = () => zoom(1.6); $('#btnHome').onclick = () => world.overview();
  $('#quality').onchange = e => world.setQuality(e.target.value);

  // ---------- schedule ----------
  function itemsOn(date) {
    const w = wall(date); const L = DAYS[w.wd]; const out = [];
    for (const c of store.courses) {
      if (!c.days.includes(L)) continue;
      // a class from the catalog only meets inside its own term (Spring classes don't show up in November)
      const tr = c.term && world.termRange?.(c.term); if (tr) { const iso = `${w.y}-${pad(w.m)}-${pad(w.d)}`; if (iso < tr[0] || iso > tr[1]) continue; } const [sh, sm] = c.start.split(':').map(Number), [eh, em] = c.end.split(':').map(Number);
      out.push({ kind: 'class', id: c.id, title: c.title, start: ndDate(w.y, w.m, w.d, sh, sm).getTime(), end: ndDate(w.y, w.m, w.d, eh, em).getTime(), rec: world.bySlug.get(c.building), room: c.room });
    }
    const day0 = ndDate(w.y, w.m, w.d).getTime(), day1 = day0 + 864e5;
    for (const e of store.events) {
      if (e.allDay || e.start < day0 || e.start >= day1) continue;
      if (out.some(o => o.kind === 'class' && Math.abs(o.start - e.start) < 60000 && o.title === e.title)) continue;
      out.push({ kind: 'event', id: e.id, title: e.title, start: e.start, end: e.end, rec: world.findBuilding(e.location), location: e.location });
    }
    return out.sort((a, b) => a.start - b.start);
  }
  world.itemsOn = itemsOn;
  function nextUp() { const now = Date.now(); for (let k = 0; k < 8; k++) { const d = new Date(now + k * 864e5); const it = itemsOn(d).find(i => i.end > now); if (it) return it; } return null; }
  function prevStopFor(rec) { const now = Date.now(); const today = itemsOn(new Date()); const before = today.filter(i => i.end <= now && i.rec && i.rec !== rec).pop(); return before?.rec || null; }
  function renderSchedule() {
    const now = Date.now(); const nx = nextUp();
    $('#schedTitle').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!nx) $('#nextUp').innerHTML = `<div class="empty">Nothing scheduled this week. Find your classes in <b>Courses</b>, link your <b>Calendar</b>, or add one by hand below.</div>`;
    else {
      const live = nx.start <= now; const ms = (live ? nx.end : nx.start) - now; const mins = Math.floor(ms / 60000);
      const cd = mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor(mins % 1440 / 60)}h` : mins >= 60 ? `${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : `${mins}m ${pad(Math.floor(ms / 1000) % 60)}s`;
      const from = itemsOn(new Date(nx.start)).filter(i => i.end <= nx.start && i.rec && i.rec !== nx.rec).pop()?.rec || world.bySlug.get(store.prefs.home);
      let walk = ''; if (nx.rec && from) { const m = world.walkMinutes(from, nx.rec); if (m) { const leave = nx.start - (Math.ceil(m) + 3) * 60000; walk = `<div class="walk"><span>🚶 <b>${Math.max(1, Math.round(m))} min</b> from ${esc(from.name)}${!live ? ` · leave by <b>${fmtT(leave)}</b>` : ''}</span><button class="btn sm" id="nxWalk">Show route</button></div>`; } }
      const day = new Date(nx.start).toDateString() === new Date().toDateString() ? '' : new Date(nx.start).toLocaleDateString(undefined, { weekday: 'long' }) + ' · ';
      $('#nextUp').innerHTML = `<div class="next"><div class="eyebrow">${live ? 'In progress · ends in' : 'Next up · starts in'}</div><div class="count">${cd}</div><h3>${esc(nx.title)}</h3><div class="meta">${day}${fmtT(nx.start)}–${fmtT(nx.end)}${nx.rec ? ' · ' + esc(nx.rec.name) : nx.location ? ' · ' + esc(nx.location) : ''}${nx.room ? ' ' + esc(nx.room) : ''}</div>${walk}${nx.rec && !walk ? `<div class="walk"><span>${esc(nx.rec.name)}</span><button class="btn sm" id="nxFly">Fly there</button></div>` : ''}</div>`;
      const w = $('#nxWalk'); if (w) w.onclick = () => doWalk(from, nx.rec); const f = $('#nxFly'); if (f) f.onclick = () => world.select(nx.rec);
    }
    const items = itemsOn(new Date());
    $('#todayList').innerHTML = items.length ? items.map((i, k) => { const prev = items[k - 1]; let gap = ''; if (prev && prev.rec && i.rec && prev.rec !== i.rec) { const m = world.walkMinutes(prev.rec, i.rec); const free = Math.round((i.start - prev.end) / 60000); if (m) gap = `<li class="gap">🚶 ${Math.max(1, Math.round(m))} min walk · ${free} min between</li>`; } return gap + `<li class="${i.end < now ? 'past' : i.start <= now ? 'now' : ''}"><div class="t">${fmtT(i.start)}</div><div class="w"><b>${esc(i.title)}</b><span>${i.rec ? esc(i.rec.name) : esc(i.location || '')}${i.room ? ' · ' + esc(i.room) : ''}</span></div>${i.rec ? `<button class="tag ${i.kind === 'class' ? 'gold' : ''}" data-fly="${i.rec.id}">Map</button>` : `<span class="tag">${i.kind}</span>`}</li>`; }).join('') : '<div class="empty">No timed items today.</div>';
    $$('#todayList [data-fly]').forEach(b => b.onclick = () => world.select(world.recs[+b.dataset.fly]));
    $('#courseList').innerHTML = store.courses.length ? store.courses.map(c => `<li><div class="swatch"></div><div class="w"><b>${esc(c.title)}</b><span>${c.days.split('').join(' ')} · ${c.start}–${c.end} · ${esc(world.bySlug.get(c.building)?.name || 'No building')}${c.room ? ' ' + esc(c.room) : ''}${c.crn ? ' · CRN ' + esc(c.crn) : c.source !== 'manual' ? ' · from calendar' : ''}</span></div><button class="tag" data-edit="${c.id}">Edit</button><button class="tag" data-del="${c.id}">×</button></li>`).join('') : '<div class="empty">No courses yet. Search the <b>Courses</b> tab, link your calendar, or add one by hand.</div>';
    $$('#courseList [data-del]').forEach(b => b.onclick = () => deleteCourse(b.dataset.del));
    $$('#courseList [data-edit]').forEach(b => b.onclick = () => openCourseForm(store.courses.find(c => c.id === b.dataset.edit)));
  }
  setInterval(() => { if ($('#pane-schedule').classList.contains('on')) renderSchedule(); }, 1000);
  store.on(w => { if (w === 'courses' || w === 'events') { renderSchedule(); buildLabels(); } if (w === 'cards') renderBoard(); if (w === 'auth') renderAuth(); });
  let editing = null;
  function openCourseForm(c) { editing = c || null; const f = $('#courseForm'); f.hidden = false; $('#cTitle').value = c?.title || ''; if (c?.building) $('#cBld').value = c.building; $('#cStart').value = c?.start || '09:30'; $('#cEnd').value = c?.end || '10:45'; $('#cRoom').value = c?.room || ''; $$('#cDays button').forEach(b => b.classList.toggle('on', !!c && c.days.includes(b.dataset.d))); $('#cTitle').focus(); }
  $('#btnAddCourse').onclick = () => openCourseForm();
  $$('#cDays button').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#cCancel').onclick = () => { $('#courseForm').hidden = true; };
  $('#courseForm').onsubmit = async e => { e.preventDefault(); const days = $$('#cDays button.on').map(b => b.dataset.d).join(''); if (!days) return toast('Pick at least one day'); try { await saveCourse({ ...(editing || {}), title: $('#cTitle').value.trim(), building: $('#cBld').value, room: $('#cRoom').value.trim(), days, start: $('#cStart').value, end: $('#cEnd').value, source: editing?.source || 'manual' }); $('#courseForm').hidden = true; toast('Course saved'); } catch (err) { toast('Saved here; sync failed: ' + err.message); } };
  $('#btnRecap').onclick = () => {
    const items = itemsOn(new Date()); const lines = [`Good morning. ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`];
    if (!items.length) lines.push('Nothing timed today.'); items.forEach((i, k) => { const p = items[k - 1]; const m = p?.rec && i.rec && p.rec !== i.rec ? world.walkMinutes(p.rec, i.rec) : null; lines.push(`${fmtT(i.start)}  ${i.title}${i.rec ? ' · ' + i.rec.name : ''}${m ? `  (${Math.round(m)} min walk)` : ''}`); });
    const open = store.cards.filter(c => c.status !== 'Done').slice(0, 5); if (open.length) { lines.push('', 'Queue:'); open.forEach(c => lines.push(`  [${c.owner}] ${c.title} · ${c.status}`)); }
    const text = lines.join('\n'); navigator.clipboard?.writeText(text).then(() => toast('Recap copied to clipboard'), () => toast(text, 8000));
  };

  // ---------- calendar ----------
  const status = (m, err) => { const s = $('#calStatus'); s.hidden = !m; s.textContent = m || ''; s.classList.toggle('err', !!err); };
  if (!CONFIG.googleOAuth) $('#mGoogleNote').textContent = 'Needs Google sign-in enabled for this site; use the iCal address meanwhile';
  $('#mGoogle').onclick = async () => {
    if (!CONFIG.googleOAuth) { status('Google sign-in is not switched on for this deployment yet. The secret iCal address gives the same result today.'); $('#icsForm').hidden = false; return; }
    const tok = store.session?.provider_token; if (tok) return ingestGoogle(tok);
    status('Opening Google…'); const { error } = await signInGoogle(true); if (error) status(error.message, true);
  };
  async function ingestGoogle(tok) { try { status('Reading your Google Calendar…'); const evs = await fetchGoogleEvents(tok); ingest(evs, 'gcal'); } catch (e) { status(e.message, true); } }
  $('#mIcs').onclick = () => { $('#icsForm').hidden = false; $('#icsUrl').value = store.prefs.icsUrl || ''; $('#icsUrl').focus(); };
  $('#icsCancel').onclick = () => { $('#icsForm').hidden = true; };
  $('#icsForm').onsubmit = async e => { e.preventDefault(); const url = $('#icsUrl').value.trim(); if (!url) return; try { status('Reading calendar…'); const evs = await fetchICS(url); setPref('icsUrl', url); $('#icsForm').hidden = true; ingest(evs, 'ics'); } catch (err) { status(err.message, true); } };
  $('#icsFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { ingest(parseICS(await f.text()), 'import'); } catch (err) { status('Could not read that file: ' + err.message, true); } e.target.value = ''; };
  $('#btnCalRefresh').onclick = async () => { if (store.session?.provider_token) return ingestGoogle(store.session.provider_token); if (store.prefs.icsUrl) { try { status('Refreshing…'); ingest(await fetchICS(store.prefs.icsUrl), 'ics', true); } catch (e) { status(e.message, true); } } else toast('Link a calendar first'); };
  let candidates = [];
  function ingest(events, source, quiet) {
    const occ = expand(events, new Date(ndDate(...(() => { const w = wall(new Date()); return [w.y, w.m, w.d]; })()).getTime()), 8);
    setEvents(occ);
    candidates = detectCourses(events, world.findBuilding).map(c => ({ ...c, source }));
    status(`${events.length} events read · ${occ.length} in the next week · ${candidates.length} look like weekly classes`);
    if (!quiet) renderDetect(); renderCalendarList();
  }
  function renderDetect() {
    if (!candidates.length) { $('#detect').innerHTML = '<div class="empty">No recurring weekly classes found. Classes usually appear as weekly events with a building in the location.</div>'; return; }
    const opts = world.directory.map(r => `<option value="${r.slug}">${esc(r.name)}</option>`).join('');
    $('#detect').innerHTML = `<div class="rule-h"><span>Classes found</span><button class="link" id="impBtn">Import selected</button></div>` + candidates.map((c, i) => `<div class="cand"><input type="checkbox" data-i="${i}" ${c.selected ? 'checked' : ''}><div><b>${esc(c.title)}</b><span>${c.days.split('').join(' ')} · ${c.start}–${c.end}${c.location ? ' · ' + esc(c.location) : ''}</span><span class="conf" title="Match confidence"><i style="width:${Math.round(c.confidence * 100)}%"></i></span><select data-b="${i}"><option value="">Building: not matched</option>${opts}</select></div></div>`).join('');
    candidates.forEach((c, i) => { const s = $(`select[data-b="${i}"]`); if (c.building) s.value = c.building; s.onchange = () => { c.building = s.value || null; }; });
    $$('#detect input[type=checkbox]').forEach(cb => cb.onchange = () => { candidates[+cb.dataset.i].selected = cb.checked; });
    $('#impBtn').onclick = async () => { const pick = candidates.filter(c => c.selected).map(c => ({ title: c.title, code: c.code, days: c.days, start: c.start, end: c.end, building: c.building, room: c.room, source: c.source === 'gcal' ? 'gcal' : c.source === 'ics' ? 'ics' : 'import', source_uid: c.source_uid })); if (!pick.length) return toast('Select at least one class'); try { await importCourses(pick); } catch (e) { toast('Imported here; sync failed: ' + e.message); } toast(`${pick.length} course${pick.length > 1 ? 's' : ''} on your map`); $('#detect').innerHTML = ''; showTab('schedule'); };
  }
  function renderCalendarList() {
    const evs = store.events.filter(e => e.end > Date.now()).slice(0, 60);
    const byDay = {}; for (const e of evs) { const k = new Date(e.start).toDateString(); (byDay[k] = byDay[k] || []).push(e); }
    $('#eventList').innerHTML = evs.length ? Object.entries(byDay).map(([k, l]) => `<div class="rule-h" style="margin-top:12px"><span>${new Date(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>` + l.map(e => { const r = world.findBuilding(e.location); return `<li><div class="w"><b>${esc(e.title)}</b><span>${e.allDay ? 'All day' : fmtT(e.start) + '–' + fmtT(e.end)}${e.location ? ' · ' + esc(e.location) : ''}</span></div>${r ? `<button class="tag gold" data-fly="${r.id}">${esc(r.name.split(' ')[0])}</button>` : ''}</li>`; }).join('')).join('') : '<div class="empty">No calendar linked yet.</div>';
    $$('#eventList [data-fly]').forEach(b => b.onclick = () => world.select(world.recs[+b.dataset.fly]));
  }
  // returning from Google OAuth
  supabase.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' && session?.provider_token && location.hash === '#calendar') { showTab('calendar'); ingestGoogle(session.provider_token); } });

  // ---------- dispatch ----------
  const STATUSES = ['Inbox', 'Triage', 'Active', 'Review', 'Waiting on tool', 'Done'];
  const d2 = new Date(Date.now() + 2 * 864e5); $('#kCheck').value = d2.toISOString().slice(0, 10);
  $('#cardForm').onsubmit = async e => { e.preventDefault(); const t = $('#kTitle').value.trim(); if (!t) return; try { await saveCard({ title: t, owner: $('#kOwner').value, status: 'Inbox', done_when: $('#kDone').value.trim(), check_in: $('#kCheck').value || null }); } catch (err) { toast('Saved here; sync failed'); } $('#kTitle').value = ''; $('#kDone').value = ''; };
  function renderBoard() {
    const today = new Date().toISOString().slice(0, 10);
    $('#board').innerHTML = STATUSES.map(s => { const cs = store.cards.filter(c => c.status === s); return `<div class="col"><h4>${s}<span>${cs.length}</span></h4>${cs.map(c => { const i = STATUSES.indexOf(s); const nxt = STATUSES[i + 1]; const over = c.check_in && c.check_in < today && s !== 'Done'; return `<div class="kcard ${c.owner}"><b>${esc(c.title)}</b>${c.done_when ? `<div class="dw">Done when ${esc(c.done_when)}</div>` : ''}<div class="row"><span class="tag">${esc(c.owner)}</span>${c.check_in ? `<span class="tag ${over ? 'over' : ''}">${c.check_in.slice(5)}</span>` : ''}${nxt && nxt !== 'Done' ? `<button data-mv="${c.id}" data-to="${nxt}">→ ${nxt}</button>` : ''}${s !== 'Done' ? `<button data-close="${c.id}">Close</button>` : `<button data-rm="${c.id}">Remove</button>`}</div></div>`; }).join('')}</div>`; }).join('');
    $$('#board [data-mv]').forEach(b => b.onclick = () => { const c = { ...store.cards.find(x => x.id === b.dataset.mv), status: b.dataset.to }; saveCard(c); });
    $$('#board [data-close]').forEach(b => b.onclick = () => { const card = b.closest('.kcard'); if (card.querySelector('.dec')) return; card.insertAdjacentHTML('beforeend', `<div class="dec" style="margin-top:6px;display:grid;gap:4px"><input placeholder="Decision, in your words (optional)" style="border:1px solid var(--rule);padding:5px;font-size:12px"><div class="row"><button data-ok>Close card</button></div></div>`); const inp = card.querySelector('.dec input'); inp.focus(); card.querySelector('[data-ok]').onclick = async () => { const c = { ...store.cards.find(x => x.id === b.dataset.close), status: 'Done', closed_at: new Date().toISOString() }; await saveCard(c); await logDecision(c.id, inp.value.trim()); toast('Closed. Decision logged.'); }; });
    $$('#board [data-rm]').forEach(b => b.onclick = () => deleteCard(b.dataset.rm));
    const stale = store.cards.filter(c => c.status !== 'Done' && Date.now() - new Date(c.updated_at || c.created_at).getTime() > 7 * 864e5);
    $('#stale').innerHTML = stale.length ? stale.map(c => `<li><div class="w"><b>${esc(c.title)}</b><span>${c.status} · ${esc(c.owner)}</span></div><button class="tag" data-c="${c.id}">Continue</button><button class="tag" data-p="${c.id}">Park</button><button class="tag" data-k="${c.id}">Kill</button></li>`).join('') : '<div class="empty">Nothing stale. The queue is honest.</div>';
    $$('#stale [data-c]').forEach(b => b.onclick = () => saveCard({ ...store.cards.find(x => x.id === b.dataset.c), status: 'Active' }));
    $$('#stale [data-p]').forEach(b => b.onclick = () => saveCard({ ...store.cards.find(x => x.id === b.dataset.p), status: 'Waiting on tool' }));
    $$('#stale [data-k]').forEach(b => b.onclick = () => deleteCard(b.dataset.k));
  }
  renderBoard();

  // ---------- account ----------
  function renderAuth() { const id = ndIdentity(store.user); $('#btnAcct').textContent = store.user ? (id?.netid || (store.user.email || 'Account').split('@')[0]) : 'Sign in'; }
  $('#providers').innerHTML = PROVIDERS.map(p => `<button class="provider ${p.enabled() ? '' : 'soon'}" data-p="${p.key}"><b>${esc(p.label)}</b><span>${esc(p.enabled() ? p.note : p.soon)}</span>${p.enabled() ? '<i>→</i>' : '<em>Coming soon</em>'}</button>`).join('');
  $$('#providers [data-p]').forEach(b => b.onclick = async () => {
    const key = b.dataset.p; $('#authNote').textContent = '';
    if (key === 'email') { $('#authForm').hidden = false; $('#authEmail').focus(); return; }
    const { error } = await signIn(key); if (error) $('#authNote').textContent = error.message;
  });
  $('#btnAcct').onclick = async () => { if (store.user) { if (confirm('Sign out of Domer OS on this device?')) { await signOut(); store.user = null; store.emit('auth'); } return; } $('#authModal').hidden = false; };
  $$('#authModal [data-close]').forEach(b => b.onclick = () => { $('#authModal').hidden = true; });
  $('#authModal').onclick = e => { if (e.target.id === 'authModal') $('#authModal').hidden = true; };
  $('#authForm').onsubmit = async e => { e.preventDefault(); const { error } = await signIn('email', $('#authEmail').value.trim()); $('#authNote').textContent = error ? error.message : 'Check your inbox for a sign-in link.'; };
  renderAuth();

  // ---------- President's Tour ----------
  let touring = null;
  async function startTour() {
    if (touring) return; const id = {}; touring = id; document.body.classList.add('touring'); world.select(null); world.clearRoute();
    const tc = $('#tourCap'); tc.hidden = false; const tour = { stop: () => { if (touring === id) endTour(); }, orbiting: false }; world.cam.setTour(tour);
    for (let i = 0; i < TOUR.length && touring === id; i++) {
      const s = TOUR[i]; let target;
      if (s.poi) { const p = world.data.pois.find(x => x.n === s.poi); if (!p) continue; target = new world.THREE.Vector3(p.p[0] / 10, 4, p.p[1] / 10); }
      else { const r = world.directory.find(x => x.name === s.name); if (!r) continue; target = new world.THREE.Vector3(r.cx, Math.min(r.h, 30) * 0.5, r.cz); }
      $('#tcIdx').textContent = `${pad(i + 1)} / ${pad(TOUR.length)}`; $('#tcText').textContent = s.caption; $('#tcText').style.animation = 'none'; void $('#tcText').offsetWidth; $('#tcText').style.animation = '';
      tour.orbiting = false; await world.cam.flyTo(target, { az: s.az, el: s.el, dist: s.dist, dur: i === 0 ? 3.5 : 4.2, arc: 0.18 });
      if (touring !== id) break; tour.orbiting = true; await new Promise(r => setTimeout(r, s.hold * 1000));
    }
    if (touring === id) endTour();
  }
  function endTour() { touring = null; world.cam.setTour(null); document.body.classList.remove('touring'); $('#tourCap').hidden = true; }
  $('#btnTour').onclick = startTour; $('#tcStop').onclick = endTour;

  // ---------- command palette ----------
  let palItems = [], palSel = 0, palPick = null;
  function actions() {
    return [
      { l: "Start the President's Tour", k: 'tour', f: startTour },
      { l: 'Campus overview', k: 'view', f: () => world.overview() },
      ...ERAS.map(e => ({ l: `Travel to ${e.label === 'Today' ? 'today' : e.year} · ${e.title}`, k: 'time', f: () => setEra(e.year) })),
      ...['spring', 'summer', 'fall', 'winter', 'live'].map(s => ({ l: s === 'live' ? 'Live season and weather' : `Show ${s}`, k: 'season', f: () => $(`#seasonSeg [data-s="${s}"]`).click() })),
      { l: 'Golden hour', k: 'light', f: () => { $('#tod').value = 17.6; $('#tod').dispatchEvent(new Event('input')); } },
      { l: 'Night on campus', k: 'light', f: () => { $('#tod').value = 21.5; $('#tod').dispatchEvent(new Event('input')); } },
      { l: 'Find a course or CRN', k: 'courses', f: () => world.findCourse('') },
      { l: 'Link Google Calendar', k: 'calendar', f: () => showTab('calendar') },
      { l: 'Morning recap', k: 'schedule', f: () => { showTab('schedule'); $('#btnRecap').click(); } },
      { l: 'Add a task', k: 'tasks', f: () => { showTab('dispatch'); $('#kTitle').focus(); } },
      ...world.directory.map(r => ({ l: r.name, k: r.meta?.cat || 'building', f: () => world.select(r) })),
    ];
  }
  function openPalette(mode, pick) { palPick = pick || null; $('#palette').hidden = false; const i = $('#palInput'); i.value = ''; i.placeholder = mode === 'walk' ? 'Walk from which building?' : 'Fly to a building, change the season, travel to 1931…'; i.focus(); palRender(); }
  const closePalette = () => { $('#palette').hidden = true; palPick = null; };
  function palRender() { const q = $('#palInput').value.toLowerCase().trim(); const src = palPick ? world.directory.map(r => ({ l: r.name, k: 'from', f: () => palPick(r) })) : actions(); palItems = src.filter(a => !q || a.l.toLowerCase().includes(q)).slice(0, 12); if (!palPick && /^([a-z]{2,5}\s?\d{0,5}|\d{5})$/i.test(q)) palItems.unshift({ l: `Search courses for “${q.toUpperCase()}”`, k: 'courses', f: () => world.findCourse(q) }); palSel = 0; $('#palList').innerHTML = palItems.map((a, i) => `<li class="${i === 0 ? 'sel' : ''}" data-i="${i}">${esc(a.l)}<span class="k">${esc(a.k)}</span></li>`).join(''); $$('#palList li').forEach(li => li.onclick = () => go(+li.dataset.i)); }
  const go = i => { const a = palItems[i]; if (!a) return; closePalette(); a.f(); };
  $('#palInput').oninput = palRender;
  $('#palInput').onkeydown = e => { if (e.key === 'ArrowDown') palSel = Math.min(palItems.length - 1, palSel + 1); else if (e.key === 'ArrowUp') palSel = Math.max(0, palSel - 1); else if (e.key === 'Enter') return go(palSel); else if (e.key === 'Escape') return closePalette(); else return; e.preventDefault(); $$('#palList li').forEach((li, i) => li.classList.toggle('sel', i === palSel)); };
  $('#palette').onclick = e => { if (e.target.id === 'palette') closePalette(); };
  $('#btnPalette').onclick = () => openPalette();
  window.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } else if (e.key === 'Escape') { closePalette(); if (touring) endTour(); world.select(null); } });
  on('ready', () => { if (!store.courses.length) setTimeout(() => toast('New here? Start with Courses to find your classes, or take the tour.', 4500), 2500); });
}
