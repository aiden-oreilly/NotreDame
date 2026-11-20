// Calendar ingestion: iCalendar (.ics) parsing, Google Calendar API, recurring-class detection.
const TZ = 'America/New_York';
const BYDAY = { MO: 'M', TU: 'T', WE: 'W', TH: 'R', FR: 'F', SA: 'S', SU: 'U' };
const DAYS = 'UMTWRFS'; // index = Date.getDay()

const wall = (d) => { // wall-clock parts in South Bend time
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const o = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return { y: +o.year, m: +o.month, d: +o.day, hh: (+o.hour) % 24, mm: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
};
const pad = n => String(n).padStart(2, '0');
// Absolute Date for a South Bend wall-clock time
export function ndDate(y, m, d, hh = 0, mm = 0) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh + 5, mm));
  const w = wall(guess); const diff = (w.hh * 60 + w.mm) - (hh * 60 + mm); // minutes guess is ahead
  let adj = diff; if (adj > 720) adj -= 1440; if (adj < -720) adj += 1440;
  return new Date(guess.getTime() - adj * 60000);
}

function parseDT(val, params) {
  if (/^\d{8}$/.test(val)) { return { date: ndDate(+val.slice(0, 4), +val.slice(4, 6), +val.slice(6, 8)), allDay: true }; }
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/); if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (z) return { date: new Date(Date.UTC(+y, mo - 1, +d, +hh, +mi)), allDay: false };
  // TZID or floating: treat as wall-clock (for ND users this is Eastern)
  if (params.TZID && !/New_York|Eastern|Indiana|Detroit/.test(params.TZID)) {
    try { const fake = new Date(Date.UTC(+y, mo - 1, +d, +hh, +mi)); const f = new Intl.DateTimeFormat('en-US', { timeZone: params.TZID, hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }); const o = Object.fromEntries(f.formatToParts(fake).map(p => [p.type, p.value])); const shown = Date.UTC(+o.year, o.month - 1, +o.day, (+o.hour) % 24, +o.minute); return { date: new Date(fake.getTime() - (shown - fake.getTime())), allDay: false }; } catch { /* fall through */ }
  }
  return { date: ndDate(+y, +mo, +d, +hh, +mi), allDay: false };
}
function parseRRule(s) { const o = {}; for (const kv of s.split(';')) { const [k, v] = kv.split('='); o[k] = v; } return { freq: o.FREQ, byday: (o.BYDAY || '').split(',').filter(Boolean).map(x => x.replace(/^[-+\d]+/, '')), until: o.UNTIL ? parseDT(o.UNTIL, {})?.date : null, count: o.COUNT ? +o.COUNT : null, interval: o.INTERVAL ? +o.INTERVAL : 1 }; }

export function parseICS(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev && ev.dtstart) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1);
    const [name, ...ps] = head.split(';'); const params = Object.fromEntries(ps.map(p => p.split('=')));
    const unesc = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    switch (name) {
      case 'UID': ev.uid = val; break;
      case 'SUMMARY': ev.summary = unesc(val); break;
      case 'LOCATION': ev.location = unesc(val); break;
      case 'DESCRIPTION': ev.description = unesc(val).slice(0, 400); break;
      case 'STATUS': ev.status = val; break;
      case 'DTSTART': { const r = parseDT(val, params); if (r) { ev.dtstart = r.date; ev.allDay = r.allDay; } break; }
      case 'DTEND': { const r = parseDT(val, params); if (r) ev.dtend = r.date; break; }
      case 'RRULE': ev.rrule = parseRRule(val); break;
      case 'EXDATE': for (const v of val.split(',')) { const r = parseDT(v, params); if (r) ev.exdates.push(r.date.getTime()); } break;
      case 'RECURRENCE-ID': ev.recurrenceId = parseDT(val, params)?.date; break;
    }
  }
  return out.filter(e => e.status !== 'CANCELLED').map(e => ({ ...e, dtend: e.dtend || new Date(e.dtstart.getTime() + (e.allDay ? 864e5 : 36e5)) }));
}

// Google Calendar API events -> the same normalized shape
export async function fetchGoogleEvents(token) {
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=false&maxResults=2500&timeMin=${encodeURIComponent(since)}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) throw Object.assign(new Error('Google sign-in expired. Link Google Calendar again.'), { code: 'reauth' });
  if (!r.ok) throw new Error('Google Calendar returned ' + r.status);
  const j = await r.json();
  return (j.items || []).filter(it => it.status !== 'cancelled' && it.start).map(it => {
    const allDay = !!it.start.date; const s = allDay ? ndDate(...it.start.date.split('-').map(Number)) : new Date(it.start.dateTime); const e = allDay ? ndDate(...it.end.date.split('-').map(Number)) : new Date(it.end.dateTime);
    const rr = (it.recurrence || []).find(x => x.startsWith('RRULE:'));
    const ex = (it.recurrence || []).filter(x => x.startsWith('EXDATE')).flatMap(x => x.split(':')[1].split(',')).map(v => parseDT(v, {})?.date?.getTime()).filter(Boolean);
    return { uid: it.id, summary: it.summary || '(untitled)', location: it.location || '', description: (it.description || '').slice(0, 400), dtstart: s, dtend: e, allDay, rrule: rr ? parseRRule(rr.slice(6)) : null, exdates: ex, link: it.htmlLink, recurringEventId: it.recurringEventId };
  });
}

const COURSE_CODE = /\b([A-Z]{2,5})\s?-?(\d{4,5})(?:\s?-?\s?(\d{2}))?\b/;
// Recurring weekly events that look like classes -> course candidates
export function detectCourses(events, findBuilding) {
  const groups = new Map();
  for (const e of events) {
    if (e.allDay || !e.rrule || e.rrule.freq !== 'WEEKLY') continue;
    const dur = (e.dtend - e.dtstart) / 60000; if (dur < 30 || dur > 240) continue;
    const s = wall(e.dtstart), en = wall(e.dtend);
    const days = (e.rrule.byday.length ? e.rrule.byday.map(d => BYDAY[d]).filter(Boolean) : [DAYS[s.wd]]).join('');
    const start = `${pad(s.hh)}:${pad(s.mm)}`, end = `${pad(en.hh)}:${pad(en.mm)}`;
    const code = (e.summary || '').match(COURSE_CODE);
    const b = findBuilding(e.location) || findBuilding(e.summary);
    let conf = 0; if (code) conf += 0.5; if (b) conf += 0.35; if (/lecture|lab|seminar|recitation|discussion|class|section/i.test(e.summary + ' ' + (e.description || ''))) conf += 0.2; if (s.hh >= 7 && s.hh <= 21) conf += 0.05;
    const ended = e.rrule.until && e.rrule.until < new Date(Date.now() - 7 * 864e5);
    if (ended) conf -= 0.6;
    const room = b ? roomFrom(e.location, b) : (e.location || '').match(/\b[A-Z]?\d{2,4}[A-Z]?\b/)?.[0] || '';
    const key = (e.summary || '') + '|' + start + '|' + end;
    const prev = groups.get(key);
    if (prev) { prev.days = [...new Set((prev.days + days).split(''))].sort((a, b2) => 'MTWRFSU'.indexOf(a) - 'MTWRFSU'.indexOf(b2)).join(''); prev.confidence = Math.max(prev.confidence, conf); continue; }
    groups.set(key, { source_uid: e.uid, title: (e.summary || 'Class').trim(), code: code ? `${code[1]} ${code[2]}` : '', days, start, end, location: e.location || '', building: b?.slug || null, buildingName: b?.name || null, room, confidence: Math.max(0, Math.min(1, conf)) });
  }
  return [...groups.values()].sort((a, b) => b.confidence - a.confidence).map(c => ({ ...c, selected: c.confidence >= 0.5 }));
}
function roomFrom(loc, b) {
  if (!loc) return ''; let s = loc; for (const t of [b.name, ...(b.meta?.codes || [])]) s = s.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  return (s.match(/\b[A-Z]?\d{2,4}[A-Z]?\b/) || [''])[0];
}

// Concrete occurrences in [from, from+days)
export function expand(events, from, days = 7) {
  const end = new Date(from.getTime() + days * 864e5); const out = [];
  for (const e of events) {
    const dur = e.dtend - e.dtstart;
    if (!e.rrule) { if (e.dtstart < end && e.dtend > from) out.push(occ(e, e.dtstart, dur)); continue; }
    if (e.rrule.freq !== 'WEEKLY' && e.rrule.freq !== 'DAILY') { if (e.dtstart < end && e.dtend > from) out.push(occ(e, e.dtstart, dur)); continue; }
    const s = wall(e.dtstart); const want = e.rrule.freq === 'DAILY' ? null : new Set(e.rrule.byday.length ? e.rrule.byday.map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d)) : [s.wd]);
    for (let k = 0; k < days; k++) {
      const day = wall(new Date(from.getTime() + k * 864e5)); if (want && !want.has(day.wd)) continue;
      const st = ndDate(day.y, day.m, day.d, s.hh, s.mm);
      if (st < e.dtstart || (e.rrule.until && st > e.rrule.until) || e.exdates.includes(st.getTime())) continue;
      if (e.rrule.interval > 1) { const weeks = Math.round((st - e.dtstart) / (7 * 864e5)); if (weeks % e.rrule.interval) continue; }
      out.push(occ(e, st, dur));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
const occ = (e, start, dur) => ({ id: e.uid + '@' + start.getTime(), title: e.summary, location: e.location, start: start.getTime(), end: start.getTime() + dur, allDay: e.allDay, link: e.link || null });

export async function fetchICS(url) {
  const r = await fetch('/api/ics?url=' + encodeURIComponent(url));
  if (!r.ok) { let m = 'Could not read that calendar link.'; try { m = (await r.json()).error || m; } catch { /* not json */ } throw new Error(m); }
  return parseICS(await r.text());
}
export { wall };
