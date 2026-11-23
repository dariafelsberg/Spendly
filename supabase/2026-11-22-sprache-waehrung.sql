-- ══════════════════════════════════════════════════════════
--  Spendly – Sprache und Hauptwährung speichern (22.11.2026)
--  Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.
--  Ergänzt die Whitelist von save_user_data um 'currency' und 'lang'.
--  Ohne diesen Schritt werden Sprache und Währung nur auf dem Gerät
--  gespeichert, nicht im Account. Kann gefahrlos erneut ausgeführt werden.
-- ══════════════════════════════════════════════════════════

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
     'appliedRecurringMonths', 'customExpenseCats', 'customIncomeCats',
     'goals', 'debts', 'currency', 'lang'
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
