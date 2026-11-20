// Notre Dame course catalog: every section ND publishes in PATH Class Search, mirrored to Supabase (nd_sections).
// Public data: course number, CRN, section, credits, meeting days and times, dates, seats, waitlist, Core
// attributes, restrictions. Rooms and instructors sit behind ND NetID login, so they arrive later through Okta.
import { supabase } from './store.js';

export const CORE = [
  ['WKAL', 'Art & Literature'], ['WKCD', 'Catholicism & the Disciplines'], ['WKDT', 'Developmental Theology'],
  ['WKFP', 'First Philosophy'], ['WKFT', 'Foundational Theology'], ['WKHI', 'History'], ['WKIN', 'Integration'],
  ['WKLC', 'Advanced Language & Culture'], ['WKQR', 'Quantitative Reasoning'], ['WKSP', 'Second Philosophy'],
  ['WKSS', 'Social Science'], ['WKST', 'Science & Technology'],
];
const DAY = 'MTWRFSU'; // ND meet_day 0 = Monday

let termsCache = null;
export async function terms() {
  if (termsCache) return termsCache;
  const { data, error } = await supabase.from('nd_terms').select('*').order('code', { ascending: false });
  if (error) throw error;
  return (termsCache = data);
}
// The term a student is planning for right now: next term once its sections are published, else the current one.
export function defaultTerm(list) {
  const today = new Date().toISOString().slice(0, 10);
  const current = list.find(t => t.starts <= today && t.ends >= today);
  const next = list.filter(t => t.starts > today).sort((a, b) => a.starts.localeCompare(b.starts))[0];
  return (next || current || list[0])?.code;
}

export async function search(q, term, { core = null, open = false } = {}) {
  const { data, error } = await supabase.rpc('search_sections', { q: q || '', p_term: term, p_attr: core, p_open: open, lim: 120 });
  if (error) throw error;
  return data;
}

// Group sections under their course so the list reads like the catalog: one course, its sections beneath.
export function group(sections) {
  const m = new Map();
  for (const s of sections) {
    let g = m.get(s.code);
    if (!g) m.set(s.code, g = { code: s.code, title: s.title, credits: s.credits, description: s.description, attributes: s.attributes, restrictions: s.restrictions, corequisites: s.corequisites, crosslists: s.crosslists, cannot: s.cannot_have_taken, sections: [] });
    g.sections.push(s);
  }
  return [...m.values()];
}

const hhmm = n => `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
// Turn one section into the course entries the schedule uses. A section that meets at different times on
// different days (e.g. lecture MW, lab F) becomes one entry per time block.
export function toCourses(s, building) {
  const blocks = new Map();
  for (const m of s.meeting_times || []) { const k = `${m.s}-${m.e}`; (blocks.get(k) || blocks.set(k, { s: m.s, e: m.e, days: '' }).get(k)).days += DAY[m.d] ?? ''; }
  return [...blocks.values()].filter(b => b.days && b.s && b.e).map((b, i) => ({
    title: `${s.code} ${s.title}`, code: s.code, crn: s.crn, section: s.section, credits: s.credits, term: s.term,
    days: [...new Set(b.days)].sort((x, y) => DAY.indexOf(x) - DAY.indexOf(y)).join(''), start: hhmm(b.s), end: hhmm(b.e),
    building: building || null, room: '', source: 'catalog', source_uid: `${s.term}:${s.crn}:${i}`,
  }));
}

export const coreOf = attrs => (attrs || []).map(a => /^(WK[A-Z]{2})/.exec(a)?.[1]).filter(Boolean);
export const seatState = s => {
  if (s.seats_max == null) return { label: 'Seats not posted', cls: '' };
  if ((s.seats_avail ?? 0) > 0) return { label: `${s.seats_avail} of ${s.seats_max} open`, cls: 'ok', pct: 1 - s.seats_avail / Math.max(1, s.seats_max) };
  return { label: s.waitlist ? `Full · waitlist ${s.waitlist}${s.waitlist_max ? '/' + s.waitlist_max : ''}` : 'Full', cls: 'full', pct: 1 };
};
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function conflicts(list) {
  const out = new Set();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]; if (a.crn && a.crn === b.crn) continue;
    if (![...a.days].some(d => b.days.includes(d))) continue;
    if (mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end)) { out.add(a.id); out.add(b.id); }
  }
  return out;
}

// Where a department usually teaches. Only a starting suggestion: the student confirms the building, because
// ND shows rooms only after NetID sign-in. Okta sign-in will replace this with the real room.
const HOME = [
  [/^(ACCT|FIN|MGT|MARK|ITAO|BA[A-Z]*|MBA|BAMG|BALW|BUS)$/, 'Mendoza College of Business'],
  [/^(CSE|EE|AME|CBE|CE|EG|CEEES)$/, 'Fitzpatrick Hall'],
  [/^(ARCH)$/, 'Walsh Family Hall'],
  [/^(MATH|ACMS)$/, 'Hayes-Healy'],
  [/^(CHEM|BIOS|PHYS|ESS|SC)$/, 'Jordan Hall of Science'],
  [/^(LAW)$/, 'Eck Hall of Law'],
  [/^(FTT)$/, 'DeBartolo Performing Arts Center'],
  [/^(MUS|SMT)$/, "O'Neill Hall"],
  [/^(ART|ARHI|DESN)$/, 'Riley Hall'],
  [/^(NSCI|MSCI|AS|ARMY|NAVY)$/, 'Pasquerilla Center'],
];
export function suggestBuilding(subject, findBuilding) {
  for (const [re, name] of HOME) if (re.test(subject)) { const r = findBuilding(name); if (r) return r; }
  return findBuilding('DeBartolo Hall'); // ND's largest general classroom building
}
