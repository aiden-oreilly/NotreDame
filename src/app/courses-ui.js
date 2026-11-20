import { terms, defaultTerm, search, group, toCourses, CORE, coreOf, seatState, conflicts, suggestBuilding } from './catalog.js';
import { importCourses, deleteCourse, saveCourse } from './store.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const DAYNAME = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };
const t12 = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`; };
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export function initCourses({ world, store, toast, showTab, esc }) {
  let termList = [], term = null, open = new Set(), timer = null, seq = 0;
  const core = $('#catCore');
  core.innerHTML += CORE.map(([c, n]) => `<option value="${c}">Core: ${n}</option>`).join('');

  terms().then(list => {
    termList = list; term = defaultTerm(list);
    world.termRange = code => { const t = list.find(x => x.code === code); return t ? [t.starts, t.ends] : null; };
    const total = list.reduce((a, t) => a + (t.sections || 0), 0);
    $('#catLede').innerHTML = `${total.toLocaleString()} sections across ${list.map(t => esc(t.label)).join(' and ')}, straight from Notre Dame's class search. Find the CRN, check the seats, add it to your week.`;
    $('#catFine').textContent = `Course data from Notre Dame PATH Class Search, refreshed ${new Date(list[0].refreshed_at).toLocaleDateString()}. Seats change through the day; NOVO is the final word at registration. Rooms and instructors appear after Notre Dame NetID sign-in.`;
    renderTerms(); renderPlan(); run();
  }).catch(e => { $('#catResults').innerHTML = `<div class="empty">Course catalog unavailable right now (${esc(e.message)}).</div>`; });

  function renderTerms() {
    $('#termSeg').innerHTML = termList.map(t => `<button data-t="${t.code}" class="${t.code === term ? 'on' : ''}">${esc(t.label)}</button>`).join('');
    $$('#termSeg button').forEach(b => b.onclick = () => { term = b.dataset.t; renderTerms(); renderPlan(); run(); });
  }
  $('#catQ').oninput = () => { clearTimeout(timer); timer = setTimeout(run, 220); };
  core.onchange = run; $('#catOpen').onchange = run;

  async function run() {
    if (!term) return;
    const q = $('#catQ').value.trim(), c = core.value || null, o = $('#catOpen').checked;
    if (!q && !c) { $('#catResults').innerHTML = `<div class="hint">Start typing a course, or pick a Core requirement to browse everything that fills it.</div>`; return; }
    const my = ++seq; $('#catResults').classList.add('busy');
    try {
      const rows = await search(q, term, { core: c, open: o });
      if (my !== seq) return;
      const groups = group(rows);
      if (groups.length === 1) open.add(groups[0].code);
      $('#catResults').innerHTML = groups.length ? `<div class="count">${groups.length} course${groups.length > 1 ? 's' : ''} · ${rows.length} section${rows.length > 1 ? 's' : ''}${rows.length >= 120 ? ' (first 120, narrow the search)' : ''}</div>` + groups.map(card).join('') : `<div class="empty">Nothing in ${esc(termList.find(t => t.code === term)?.label)} matches “${esc(q)}”. Try the subject code, like THEO or FIN.</div>`;
      bind();
    } catch (e) { $('#catResults').innerHTML = `<div class="empty">Search failed: ${esc(e.message)}</div>`; }
    finally { $('#catResults').classList.remove('busy'); }
  }

  const inPlan = crn => store.courses.some(c => c.crn === crn && c.term === term);
  function card(g) {
    const cores = coreOf(g.attributes), isOpen = open.has(g.code);
    const other = (g.attributes || []).filter(a => !/^WK/.test(a) && !/^Z[A-Z]{3} /.test(a)).map(a => a.replace(/\s*\([A-Z0-9]+\)$/, ''));
    return `<article class="course ${isOpen ? 'open' : ''}" data-code="${esc(g.code)}">
      <header data-toggle><div class="cc"><span class="code">${esc(g.code)}</span><span class="cr">${esc(g.credits || '')} cr</span></div><h3>${esc(g.title)}</h3>
        <div class="badges">${cores.map(c => `<span class="tag gold" title="${esc(CORE.find(x => x[0] === c)?.[1] || c)}">Core ${c.slice(2)}</span>`).join('')}<span class="tag">${g.sections.length} section${g.sections.length > 1 ? 's' : ''}</span></div></header>
      <div class="body">
        ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
        ${g.restrictions ? `<p class="note"><b>Requirements</b> ${esc(g.restrictions.replace(/\n/g, ' '))}</p>` : ''}
        ${g.corequisites ? `<p class="note"><b>Take with</b> ${esc(g.corequisites.replace(/\n/g, ' '))}</p>` : ''}
        ${g.cannot?.length ? `<p class="note"><b>Not if you took</b> ${g.cannot.map(esc).join(', ')}</p>` : ''}
        ${g.crosslists?.length ? `<p class="note"><b>Same class as</b> ${[...new Set(g.crosslists)].map(esc).join(', ')}</p>` : ''}
        ${other.length ? `<p class="note"><b>Counts toward</b> ${other.slice(0, 4).map(esc).join(' · ')}</p>` : ''}
        <ol class="sections">${g.sections.map(sec).join('')}</ol>
      </div></article>`;
  }
  function sec(s) {
    const st = seatState(s), added = inPlan(s.crn);
    const days = (s.meets || 'TBA').replace(/\s+/g, ' ');
    return `<li class="${st.cls}">
      <div class="sn"><span>Sec ${esc(s.section)}</span><button class="crn" data-copy="${esc(s.crn)}" title="Copy CRN">CRN <b>${esc(s.crn)}</b></button></div>
      <div class="sm"><b>${esc(days)}</b><span>${fmtDate(s.start_date)} – ${fmtDate(s.end_date)}${s.schedule_type && s.schedule_type !== 'CL' ? ' · ' + esc({ LB: 'Lab', TU: 'Tutorial', SM: 'Seminar', ST: 'Studio', DS: 'Discussion', IS: 'Independent study', RE: 'Research' }[s.schedule_type] || s.schedule_type) : ''}</span></div>
      <div class="ss"><span>${esc(st.label)}</span>${st.pct != null ? `<i><em style="width:${Math.round(st.pct * 100)}%"></em></i>` : ''}</div>
      <button class="btn sm ${added ? '' : 'gold'}" data-add="${esc(s.crn)}" ${added || !(s.meeting_times || []).length ? 'disabled' : ''}>${added ? 'In plan' : (s.meeting_times || []).length ? 'Add' : 'No set time'}</button>
    </li>`;
  }
  let last = [];
  function bind() {
    $$('#catResults [data-toggle]').forEach(h => h.onclick = () => { const a = h.closest('.course'); a.classList.toggle('open'); a.classList.contains('open') ? open.add(a.dataset.code) : open.delete(a.dataset.code); });
    $$('#catResults [data-copy]').forEach(b => b.onclick = e => { e.stopPropagation(); navigator.clipboard?.writeText(b.dataset.copy); toast(`CRN ${b.dataset.copy} copied`); });
    $$('#catResults [data-add]').forEach(b => b.onclick = () => add(b.dataset.add, b));
  }
  async function add(crn, btn) {
    const rows = await search(crn, term); const s = rows.find(r => r.crn === crn); if (!s) return toast('Section not found');
    const rec = suggestBuilding(s.subject, world.findBuilding);
    const list = toCourses(s, rec?.slug);
    try { await importCourses(list); } catch (e) { toast('Added here; sync failed: ' + e.message); }
    if (btn) { btn.textContent = 'In plan'; btn.disabled = true; btn.classList.remove('gold'); }
    const clash = conflicts(store.courses.filter(c => c.term === term)).size;
    toast(`${s.code} sec ${s.section} added${rec ? ` · building set to ${rec.name}, change it if needed` : ''}${clash ? ' · heads up: time conflict' : ''}`, 5200);
    renderPlan();
  }

  function renderPlan() {
    const label = termList.find(t => t.code === term)?.label || '';
    $('#planTitle').textContent = `My plan · ${label}`;
    const mine = store.courses.filter(c => c.term === term && c.crn);
    const clash = conflicts(mine);
    const crns = [...new Set(mine.map(c => c.crn))];
    const credits = crns.reduce((a, crn) => a + (parseFloat(mine.find(c => c.crn === crn)?.credits) || 0), 0);
    $('#planSummary').innerHTML = mine.length ? `<div><b>${crns.length}</b><span>Classes</span></div><div><b>${credits || '—'}</b><span>Credits</span></div><div class="${clash.size ? 'bad' : ''}"><b>${clash.size}</b><span>Time clashes</span></div>` : '';
    const opts = world.directory?.map(r => `<option value="${r.slug}">${esc(r.name)}</option>`).join('') || '';
    $('#planList').innerHTML = mine.length ? mine.map(c => `<li class="${clash.has(c.id) ? 'clash' : ''}"><div class="swatch"></div><div class="w"><b>${esc(c.code)} · Sec ${esc(c.section || '')}</b><span>${[...c.days].map(d => DAYNAME[d]).join(' ')} · ${t12(c.start)}–${t12(c.end)} · CRN ${esc(c.crn)}${clash.has(c.id) ? ' · <em class="badtxt">overlaps another class</em>' : ''}</span><div class="where"><select data-bld="${c.id}" aria-label="Building">${opts}</select><input data-room="${c.id}" placeholder="Room" value="${esc(c.room || '')}"></div></div><button class="tag" data-map="${c.id}">Map</button><button class="tag" data-del="${c.id}" aria-label="Remove">×</button></li>`).join('')
      : `<div class="empty">Nothing planned for ${esc(label)} yet. Add sections above and your CRNs collect here, ready to paste into NOVO.</div>`;
    mine.forEach(c => { const s = $(`#planList [data-bld="${c.id}"]`); if (s && c.building) s.value = c.building; });
    $$('#planList [data-bld]').forEach(s => s.onchange = () => { const c = store.courses.find(x => x.id === s.dataset.bld); saveCourse({ ...c, building: s.value }); });
    $$('#planList [data-room]').forEach(i => i.onchange = () => { const c = store.courses.find(x => x.id === i.dataset.room); saveCourse({ ...c, room: i.value.trim() }); });
    $$('#planList [data-del]').forEach(b => b.onclick = () => deleteCourse(b.dataset.del));
    $$('#planList [data-map]').forEach(b => b.onclick = () => { const c = store.courses.find(x => x.id === b.dataset.map); const r = world.bySlug.get(c.building); if (r) world.select(r); });
  }
  $('#btnCopyCrn').onclick = () => {
    const crns = [...new Set(store.courses.filter(c => c.term === term && c.crn).map(c => c.crn))];
    if (!crns.length) return toast('Add a section first');
    navigator.clipboard?.writeText(crns.join('\n')).then(() => toast(`${crns.length} CRN${crns.length > 1 ? 's' : ''} copied. In NOVO, choose Register for Classes, then Enter CRNs.`, 6000), () => toast(crns.join(', '), 9000));
  };
  store.on(w => { if (w === 'courses') { renderPlan(); if ($('#catResults .course')) run(); } });
  world.renderPlan = renderPlan;
  world.findCourse = q => { showTab('courses'); $('#catQ').value = q || ''; run(); $('#catQ').focus(); };
}
