-- ══════════════════════════════════════════════════════════
--  KONTAKTFORMULAR: Tagesgrenze (2026-11-24)
--  Einmal im Supabase-Dashboard → SQL Editor ausführen.
--  contact_log merkt sich nur, WANN jemand eine Nachricht geschickt hat
--  (kein Text, keine Adresse). Die Datenbank lässt höchstens 5 Einträge
--  pro Person in 24 Stunden zu; app/api/contact.js schickt die Mail nur,
--  wenn der Eintrag geklappt hat. Wird ein Account gelöscht, verschwinden
--  seine Einträge mit.
-- ══════════════════════════════════════════════════════════

create table if not exists public.contact_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists contact_log_user_time on public.contact_log (user_id, created_at);

alter table public.contact_log enable row level security;

-- Zählt die Nachrichten der angemeldeten Person in den letzten 24 Stunden.
-- security definer, weil es absichtlich keine SELECT-Regel gibt (niemand kann die Liste lesen).
create or replace function public.contact_count_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.contact_log
  where user_id = auth.uid() and created_at > now() - interval '24 hours';
$$;
revoke all on function public.contact_count_today() from public, anon;
grant execute on function public.contact_count_today() to authenticated;

drop policy if exists contact_log_insert on public.contact_log;
create policy contact_log_insert on public.contact_log
  for insert to authenticated
  with check (user_id = auth.uid() and public.contact_count_today() < 5);

revoke all on public.contact_log from anon, authenticated;
grant insert on public.contact_log to authenticated;
