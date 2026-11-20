import fs from 'node:fs';
const URL_ = 'https://gcrqhvfdqhtjowfhiebu.supabase.co/rest/v1/'; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!KEY) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard > Settings > API) to load courses');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' };
const LABEL = { '202610': 'Fall 2026', '202620': 'Spring 2027' };
const post = async (t, rows) => { const r = await fetch(URL_ + t, { method: 'POST', headers: H, body: JSON.stringify(rows) }); if (!r.ok) throw new Error(t + ' ' + r.status + ' ' + (await r.text()).slice(0, 400)); };
const cols = ['term','crn','code','subject','number','section','title','credits','schedule_type','stat','meets','meeting_times','start_date','end_date','seats_max','seats_avail','waitlist','waitlist_max','status_text','campus','grade_mode','meeting_text','location','building','room','instructors','description','notes','attributes','restrictions','corequisites','special_approval','crosslists','cannot_have_taken'];
for (const term of ['202610', '202620']) {
  const all = JSON.parse(fs.readFileSync(`sections-${term}.json`, 'utf8')).filter(Boolean);
  const seen = new Set(); const rows = [];
  for (const s of all) { if (seen.has(s.crn)) continue; seen.add(s.crn); const o = {}; for (const c of cols) o[c] = s[c] ?? (['attributes','crosslists','cannot_have_taken'].includes(c) ? [] : c === 'meeting_times' ? [] : null); for (const c of ['credits','title','description']) if (o[c] === '') o[c] = c === 'title' ? s.code : null; rows.push(o); }
  const starts = rows.map(r => r.start_date).filter(Boolean).sort(), ends = rows.map(r => r.end_date).filter(Boolean).sort();
  await post('nd_terms', [{ code: term, label: LABEL[term], starts: starts[0], ends: ends[ends.length - 1], sections: rows.length }]);
  for (let i = 0; i < rows.length; i += 400) await post('nd_sections', rows.slice(i, i + 400));
  const det = rows.filter(r => r.seats_max != null).length, loc = rows.filter(r => r.location).length, ins = rows.filter(r => r.instructors).length;
  console.log(term, 'loaded', rows.length, 'withSeats', det, 'withLoc', loc, 'withInstr', ins, 'subjects', new Set(rows.map(r => r.subject)).size, 'courses', new Set(rows.map(r => r.code)).size);
}
