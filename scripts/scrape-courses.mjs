// Pulls every section for the given terms from Notre Dame PATH Class Search (public CourseLeaf FOSE API).
import fs from 'node:fs';
const API = 'https://classsearch.nd.edu/api/?page=fose&route=';
const TERMS = (process.env.TERMS || '202610,202620').split(',');
const LABEL = { '202610': 'Fall 2026', '202620': 'Spring 2027', '202600': 'Summer 2026', '202520': 'Spring 2026' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function post(route, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API + route, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'DomerOS course index (student project)' }, body: JSON.stringify(body) });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}
const strip = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const num = (re, s) => { const m = re.exec(s); return m ? +m[1] : null; };
function parseDetail(d) {
  const seats = strip(d.seats);
  const meet = strip(d.meeting_html);
  // meeting_html looks like "TTh 12:30-1:45p in DeBartolo Hall 101"
  const locs = [...meet.matchAll(/ in ([^\n]+)/g)].map(m => m[1].trim());
  const loc = locs[0] || '';
  const lm = /^(.*?)\s+([A-Z]?\d{1,4}[A-Z]?|B\d+|Auditorium|Aud)$/i.exec(loc);
  return {
    credits: strip(d.hours_html).replace(/\s*Hours?/i, '').trim(),
    seats_max: num(/Maximum Enrollment:\s*(\d+)/, seats), seats_avail: num(/Seats Avail:\s*(-?\d+)/, seats),
    waitlist: num(/Waitlist Total:\s*(\d+)/, seats), waitlist_max: num(/Waitlist Total:\s*\d+\s*of\s*(\d+)/, seats),
    status_text: d.section_status || '', campus: d.campus || '', grade_mode: d.grade_mode || '',
    meeting_text: meet, location: loc, building: lm ? lm[1] : loc, room: lm ? lm[2] : '',
    instructors: strip(d.instructordetail_html).split('\n').map(s => s.trim()).filter(Boolean).join('; '),
    description: strip(d.description), notes: strip(d.clssnotes),
    attributes: [...String(d.attribute_description || '').matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1].trim()),
    restrictions: strip(d.registration_restrictions), corequisites: strip(d.corequisites),
        crosslists: [...String(d.xlist || '').matchAll(/>([A-Z]{2,5} \d{5}), section/g)].map(m => m[1]),
    special_approval: strip(d.special_approval),
    cannot_have_taken: [...new Set(strip(d.cannot_have_taken).split('\n').map(x => x.trim()).filter(x => /^[A-Z]{2,5} \d{5}$/.test(x)))],
  };
}
for (const term of TERMS) {
  const s = await post('search', { other: { srcdb: term }, criteria: [] });
  const rows = s.results.filter(r => !r.isCancelled);
  console.log(term, 'sections', rows.length);
  let i = 0, done = 0; const out = new Array(rows.length);
  const worker = async () => {
    while (i < rows.length) {
      const k = i++; const r = rows[k];
      const d = await post('details', { group: 'code:' + r.code, key: 'crn:' + r.crn, srcdb: term, matched: 'crn:' + r.crn });
      let mt = []; try { mt = JSON.parse(r.meetingTimes || '[]').map(m => ({ d: +m.meet_day, s: +m.start_time, e: +m.end_time })); } catch {}
      const [subject, number] = r.code.split(' ');
      out[k] = { term, term_label: LABEL[term] || term, crn: r.crn, code: r.code, subject, number, section: r.no, title: r.title, schedule_type: r.schd, stat: r.stat, meets: r.meets, meeting_times: mt, start_date: r.start_date || null, end_date: r.end_date || null, ...(d && !d.fatal ? parseDetail(d) : {}) };
      if (++done % 500 === 0) console.log(term, done);
      await sleep(60);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  fs.writeFileSync(`sections-${term}.json`, JSON.stringify(out));
  console.log(term, 'written', out.length);
}
