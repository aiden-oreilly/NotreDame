import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

// Local-first state. When signed in, everything mirrors to Supabase (RLS: each row is private to its owner).
export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

const LS = 'domer.v2.';
const lget = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const store = {
  user: null, session: null,
  courses: lget('courses', []), cards: lget('cards', []), prefs: lget('prefs', { home: null, quality: null }),
  events: lget('events', []), // upcoming calendar occurrences (cached)
  listeners: new Set(),
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(what) { for (const fn of this.listeners) fn(what); },
};

const toDbCourse = (c, user) => ({ id: c.id, user_id: user.id, code: c.code || null, title: c.title, building_id: c.building || null, room: c.room || null, days: c.days, start_time: c.start, end_time: c.end, color: c.color || 'gold', source: c.source || 'manual', source_uid: c.source_uid || null });
const fromDbCourse = r => ({ id: r.id, code: r.code, title: r.title, building: r.building_id, room: r.room, days: r.days, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), color: r.color, source: r.source, source_uid: r.source_uid });
const toDbCard = (c, user) => ({ id: c.id, user_id: user.id, title: c.title, owner: c.owner, status: c.status, done_when: c.done_when || null, check_in: c.check_in || null, building_id: c.building_id || null, closed_at: c.closed_at || null });

export async function initStore() {
  const { data } = await supabase.auth.getSession();
  await setSession(data.session);
  supabase.auth.onAuthStateChange((_e, session) => { setSession(session); });
}
let channel = null;
async function setSession(session) {
  const prev = store.user?.id; store.session = session; store.user = session?.user || null;
  store.emit('auth');
  if (!store.user || prev === store.user.id) return;
  try {
    const [c, k, p] = await Promise.all([
      supabase.from('courses').select('*').order('start_time'),
      supabase.from('dispatch_cards').select('*').order('created_at'),
      supabase.from('profiles').select('*').eq('id', store.user.id).maybeSingle(),
    ]);
    // first sign-in on this device: lift local work into the account
    if (!c.error && c.data.length === 0 && store.courses.length) await supabase.from('courses').upsert(store.courses.map(x => toDbCourse(x, store.user)));
    else if (!c.error) store.courses = c.data.map(fromDbCourse);
    if (!k.error && k.data.length === 0 && store.cards.length) await supabase.from('dispatch_cards').upsert(store.cards.map(x => toDbCard(x, store.user)));
    else if (!k.error) store.cards = k.data;
    if (p.data?.prefs) store.prefs = { ...store.prefs, ...p.data.prefs };
    if (p.data?.ics_url) store.prefs.icsUrl = p.data.ics_url;
    persist(); store.emit('courses'); store.emit('cards');
    if (channel) supabase.removeChannel(channel);
    channel = supabase.channel('me-' + store.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_cards', filter: `user_id=eq.${store.user.id}` }, async () => { const r = await supabase.from('dispatch_cards').select('*').order('created_at'); if (!r.error) { store.cards = r.data; persist(); store.emit('cards'); } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${store.user.id}` }, async () => { const r = await supabase.from('courses').select('*').order('start_time'); if (!r.error) { store.courses = r.data.map(fromDbCourse); persist(); store.emit('courses'); } })
      .subscribe();
  } catch (e) { console.warn('sync failed', e); }
}
function persist() { lset('courses', store.courses); lset('cards', store.cards); lset('prefs', store.prefs); lset('events', store.events); }

export async function saveCourse(c) {
  c.id = c.id || uid();
  const i = store.courses.findIndex(x => x.id === c.id); if (i >= 0) store.courses[i] = c; else store.courses.push(c);
  persist(); store.emit('courses');
  if (store.user) { const r = await supabase.from('courses').upsert(toDbCourse(c, store.user)); if (r.error) throw r.error; }
}
export async function importCourses(list) {
  for (const c of list) {
    c.id = c.id || uid();
    const dupe = store.courses.find(x => (x.source_uid && x.source_uid === c.source_uid) || (x.title === c.title && x.days === c.days && x.start === c.start));
    if (dupe) Object.assign(dupe, c, { id: dupe.id }); else store.courses.push(c);
  }
  persist(); store.emit('courses');
  if (store.user) { const r = await supabase.from('courses').upsert(store.courses.map(x => toDbCourse(x, store.user))); if (r.error) throw r.error; }
}
export async function deleteCourse(id) {
  store.courses = store.courses.filter(c => c.id !== id); persist(); store.emit('courses');
  if (store.user) await supabase.from('courses').delete().eq('id', id);
}
export async function saveCard(card) {
  card.id = card.id || uid(); card.updated_at = new Date().toISOString(); card.created_at = card.created_at || card.updated_at;
  const i = store.cards.findIndex(x => x.id === card.id); if (i >= 0) store.cards[i] = card; else store.cards.push(card);
  persist(); store.emit('cards');
  if (store.user) { const r = await supabase.from('dispatch_cards').upsert(toDbCard(card, store.user)); if (r.error) throw r.error; }
}
export async function deleteCard(id) { store.cards = store.cards.filter(c => c.id !== id); persist(); store.emit('cards'); if (store.user) await supabase.from('dispatch_cards').delete().eq('id', id); }
export async function logDecision(cardId, decision, wouldChange) {
  if (!store.user || !decision) return;
  await supabase.from('decisions').insert({ user_id: store.user.id, card_id: cardId, decision, would_change_if: wouldChange || null, review_on: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) });
}
export function setEvents(ev) { store.events = ev; persist(); store.emit('events'); }
export async function setPref(k, v) {
  store.prefs[k] = v; persist(); store.emit('prefs');
  if (store.user) { const row = { id: store.user.id, prefs: Object.fromEntries(Object.entries(store.prefs).filter(([key]) => key !== 'icsUrl')) }; if (k === 'icsUrl') row.ics_url = v; await supabase.from('profiles').upsert(row); }
}
export async function signInEmail(email) { return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }); }
export async function signInGoogle(calendar = true) {
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + '#calendar', scopes: calendar ? 'https://www.googleapis.com/auth/calendar.readonly' : undefined, queryParams: calendar ? { access_type: 'offline', prompt: 'consent' } : undefined } });
}
export async function signOut() { await supabase.auth.signOut(); store.user = null; store.emit('auth'); }
export const newId = uid;
