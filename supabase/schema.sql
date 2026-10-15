-- ══════════════════════════════════════════════════════════
--  Spendly – Supabase-Schema
--  Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.
--  Kann gefahrlos erneut ausgeführt werden.
-- ══════════════════════════════════════════════════════════

-- ── Tabelle: ein Datensatz pro Benutzer ─────────────────────
create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid()
             references auth.users (id) on delete cascade,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security: jeder sieht nur seine eigenen Daten ─
alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own" on public.user_data
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_data from anon;
grant select, insert, update on public.user_data to authenticated;

-- ── RPC: Teil-Speichern (nur geänderte Bereiche) ────────────
-- Übernimmt nur die bekannten Schlüssel aus "patch" und führt sie mit
-- dem bestehenden payload zusammen. Läuft mit den Rechten des
-- Aufrufers (security invoker), RLS gilt also auch hier.
create or replace function public.save_user_data(patch jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  filtered jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into filtered
    from jsonb_each(patch)
   where key = any (array[
     'balance', 'budget', 'entries', 'accounts',
     'recurringIncome', 'recurringExpense', 'recurringTransfers',
     'appliedRecurringMonths', 'customExpenseCats', 'customIncomeCats'
   ]);

  insert into public.user_data as u (user_id, payload, updated_at)
  values (auth.uid(), filtered, now())
  on conflict (user_id) do update
    set payload    = u.payload || excluded.payload,
        updated_at = now();
end;
$$;

revoke all on function public.save_user_data(jsonb) from public, anon;
grant execute on function public.save_user_data(jsonb) to authenticated;
