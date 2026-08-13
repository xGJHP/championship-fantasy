-- Run this in the Supabase SQL editor AFTER schema.sql.
--
-- Safe to run whether or not you already created the tables. schema.sql uses
-- "create table if not exists", which means if you built the players table
-- before the 0.5m price rule existed, the new constraints were skipped. This
-- adds them either way.

do $$
begin
  -- start_cost must sit on a 0.5m boundary: 55 or 60, never 58
  if not exists (
    select 1 from pg_constraint where conname = 'players_start_cost_grid'
  ) then
    alter table players
      add constraint players_start_cost_grid
      check (start_cost % 5 = 0 and start_cost >= 40);
  end if;

  -- now_cost drifts in 0.1m steps during the season, so only a floor applies
  if not exists (
    select 1 from pg_constraint where conname = 'players_now_cost_floor'
  ) then
    alter table players
      add constraint players_now_cost_floor
      check (now_cost >= 38);
  end if;
end $$;

-- Confirm it worked
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'players'::regclass and contype = 'c'
order by conname;
