-- Notre Dame course catalog mirror (public PATH Class Search data). Applied to project gcrqhvfdqhtjowfhiebu on 2026-11-20.
create extension if not exists pg_trgm;
create table if not exists public.nd_terms (code text primary key, label text not null, starts date, ends date, sections int default 0, refreshed_at timestamptz default now());
create table if not exists public.nd_sections (
  term text not null references public.nd_terms(code) on delete cascade, crn text not null, code text not null, subject text not null, number text not null,
  section text, title text not null, credits text, schedule_type text, stat text, meets text, meeting_times jsonb default '[]', start_date date, end_date date,
  seats_max int, seats_avail int, waitlist int, waitlist_max int, status_text text, campus text, grade_mode text, meeting_text text, location text, building text,
  room text, instructors text, description text, notes text, attributes text[] default '{}', restrictions text, corequisites text, special_approval text,
  crosslists text[] default '{}', cannot_have_taken text[] default '{}', updated_at timestamptz default now(), primary key (term, crn));
create index if not exists nd_sections_code on public.nd_sections (term, code);
create index if not exists nd_sections_subject on public.nd_sections (term, subject);
create index if not exists nd_sections_title_trgm on public.nd_sections using gin (title gin_trgm_ops);
create index if not exists nd_sections_code_trgm on public.nd_sections using gin (code gin_trgm_ops);
create index if not exists nd_sections_attrs on public.nd_sections using gin (attributes);
alter table public.nd_terms enable row level security; alter table public.nd_sections enable row level security;
create policy "catalog public read terms" on public.nd_terms for select using (true);
create policy "catalog public read sections" on public.nd_sections for select using (true);
-- Writes happen only with the service role (scripts/load-courses.mjs with SUPABASE_SERVICE_ROLE_KEY).

alter table public.courses add column if not exists crn text, add column if not exists section text, add column if not exists credits text;
alter table public.courses drop constraint if exists courses_source_check;
alter table public.courses add constraint courses_source_check check (source = any (array['manual','gcal','ics','import','catalog','sso']));

create or replace function public.search_sections(q text, p_term text, p_attr text default null, p_open boolean default false, lim int default 80)
returns setof public.nd_sections language sql stable security invoker set search_path = public as $$
  with n as (select upper(trim(coalesce(q,''))) as u, trim(coalesce(q,'')) as t)
  select s.* from public.nd_sections s, n
  where s.term = p_term
    and (p_attr is null or exists (select 1 from unnest(s.attributes) a where a like p_attr || ' %'))
    and (not p_open or coalesce(s.seats_avail,0) > 0)
    and (n.t = '' and p_attr is not null
      or n.t <> '' and (s.crn = n.t or replace(s.code,' ','') like replace(n.u,' ','') || '%' or s.subject = n.u
        or s.title ilike '%' || n.t || '%' or (length(n.t) > 3 and similarity(s.title, n.t) > 0.35)))
  order by (s.crn = n.t) desc, (replace(s.code,' ','') like replace(n.u,' ','') || '%') desc, s.code, s.section
  limit lim;
$$;
grant execute on function public.search_sections(text, text, text, boolean, int) to anon, authenticated;
