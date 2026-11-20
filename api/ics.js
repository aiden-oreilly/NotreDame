// Fetches a private iCalendar feed (e.g. Google Calendar's "Secret address in iCal format") on the user's behalf.
// The URL is passed through, never stored or logged here.
const ALLOWED = [/^calendar\.google\.com$/, /^outlook\.office365\.com$/, /^outlook\.live\.com$/, /(^|\.)icloud\.com$/, /(^|\.)nd\.edu$/, /^calendar\.yahoo\.com$/];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const raw = String(req.query.url || '').trim().replace(/^webcal:\/\//i, 'https://');
  let u;
  try { u = new URL(raw); } catch { return res.status(400).json({ error: 'That does not look like a calendar link.' }); }
  if (u.protocol !== 'https:' || !ALLOWED.some(r => r.test(u.hostname))) return res.status(400).json({ error: 'Use the secret iCal address from Google Calendar (calendar.google.com), Outlook or iCloud.' });
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(u.toString(), { headers: { 'user-agent': 'DomerOS/1.0 (+calendar import)' }, signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!r.ok) return res.status(502).json({ error: `The calendar server answered ${r.status}. Check that the link is the secret iCal address.` });
    const text = await r.text();
    if (!text.includes('BEGIN:VCALENDAR')) return res.status(422).json({ error: 'That link did not return a calendar.' });
    if (text.length > 8_000_000) return res.status(413).json({ error: 'Calendar is too large.' });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(504).json({ error: 'Timed out reaching the calendar server.' });
  }
}
