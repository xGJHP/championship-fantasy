-- ===========================================================================
-- FCS - Fantasy Championship Sim
-- Run this once in the Supabase SQL editor.
-- ===========================================================================

create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------------------
-- Reference data
-- --------------------------------------------------------------------------

create table if not exists clubs (
  id                serial primary key,
  code              text not null unique,
  name              text not null,
  short_name        text not null,
  primary_colour    text not null default '#334155',
  secondary_colour  text not null default '#FFFFFF',
  text_colour       text not null default '#FFFFFF',
  fd_id             integer unique,          -- football-data.org team id
  strength          integer not null default 3,
  created_at        timestamptz not null default now()
);

create type player_position as enum ('GK','DEF','MID','FWD');
create type player_status   as enum ('a','d','i','s','u');

create table if not exists players (
  id                  serial primary key,
  club_id             integer not null references clubs(id) on delete cascade,
  web_name            text not null,
  first_name          text,
  last_name           text,
  position            player_position not null,
  -- Tenths of a million. Prices only exist on 0.5m boundaries, so these must
  -- always be multiples of 5: 45 means GBP 4.5m, 58 is not a legal price.
  -- Tenths of a million. start_cost is the season's opening price and must sit
  -- on a 0.5m boundary, so a multiple of 5. now_cost drifts in 0.1m steps once
  -- the season starts, so it is deliberately not constrained to the grid.
  now_cost            integer not null check (now_cost >= 38),
  start_cost          integer not null check (start_cost % 5 = 0 and start_cost >= 40),
  status              player_status not null default 'a',
  news                text,
  chance_of_playing   integer,
  total_points        integer not null default 0,
  form                numeric(4,1) not null default 0,
  minutes             integer not null default 0,
  goals_scored        integer not null default 0,
  assists             integer not null default 0,
  clean_sheets        integer not null default 0,
  goals_conceded      integer not null default 0,
  own_goals           integer not null default 0,
  penalties_saved     integer not null default 0,
  penalties_missed    integer not null default 0,
  yellow_cards        integer not null default 0,
  red_cards           integer not null default 0,
  saves               integer not null default 0,
  bonus               integer not null default 0,
  bps                 integer not null default 0,
  transfers_in_gw     integer not null default 0,
  transfers_out_gw    integer not null default 0,
  selected_by_percent numeric(5,2) not null default 0,
  updated_at          timestamptz not null default now()
);

create index if not exists players_club_idx on players(club_id);
create index if not exists players_pos_idx  on players(position);

create table if not exists gameweeks (
  id            integer primary key,          -- 1..46
  name          text not null,
  deadline_time timestamptz not null,
  is_current    boolean not null default false,
  is_next       boolean not null default false,
  finished      boolean not null default false,
  data_checked  boolean not null default false,
  average_score integer not null default 0,
  highest_score integer not null default 0
);

create table if not exists fixtures (
  id            serial primary key,
  gameweek_id   integer references gameweeks(id) on delete set null,
  home_club_id  integer not null references clubs(id),
  away_club_id  integer not null references clubs(id),
  kickoff_time  timestamptz,
  home_score    integer,
  away_score    integer,
  started       boolean not null default false,
  finished      boolean not null default false,
  bonus_added   boolean not null default false,
  fd_id         integer unique,
  created_at    timestamptz not null default now()
);

create index if not exists fixtures_gw_idx on fixtures(gameweek_id);

-- Per-player, per-fixture raw stats. This is the source of truth for scoring.
create table if not exists player_stats (
  id                integer generated always as identity primary key,
  player_id         integer not null references players(id) on delete cascade,
  fixture_id        integer not null references fixtures(id) on delete cascade,
  gameweek_id       integer not null references gameweeks(id) on delete cascade,
  minutes           integer not null default 0,
  goals_scored      integer not null default 0,
  assists           integer not null default 0,
  goals_conceded    integer not null default 0,
  own_goals         integer not null default 0,
  penalties_saved   integer not null default 0,
  penalties_missed  integer not null default 0,
  yellow_cards      integer not null default 0,
  red_cards         integer not null default 0,
  saves             integer not null default 0,
  -- optional richer stats, used for fuller BPS if you ever get the feed
  clearances_blocks_interceptions integer,
  tackles           integer,
  recoveries        integer,
  key_passes        integer,
  big_chances_created integer,
  big_chances_missed  integer,
  errors_leading_to_goal integer,
  penalties_conceded  integer,
  -- computed
  bps               integer not null default 0,
  bonus             integer not null default 0,
  total_points      integer not null default 0,
  unique (player_id, fixture_id)
);

create index if not exists player_stats_gw_idx on player_stats(gameweek_id);

-- --------------------------------------------------------------------------
-- Managers and squads
-- --------------------------------------------------------------------------

create table if not exists entries (
  id                 uuid primary key references auth.users(id) on delete cascade,
  team_name          text not null,
  manager_name       text not null,
  favourite_club_id  integer references clubs(id),
  bank               integer not null default 0,     -- tenths of a million
  squad_value        integer not null default 1000,
  total_points       integer not null default 0,
  gameweek_points    integer not null default 0,
  overall_rank       integer,
  free_transfers     integer not null default 1,
  started_gw         integer not null default 1,
  created_at         timestamptz not null default now()
);

create table if not exists entry_picks (
  id             integer generated always as identity primary key,
  entry_id       uuid not null references entries(id) on delete cascade,
  gameweek_id    integer not null references gameweeks(id) on delete cascade,
  player_id      integer not null references players(id) on delete cascade,
  slot           integer not null check (slot between 1 and 15),
  is_captain     boolean not null default false,
  is_vice_captain boolean not null default false,
  purchase_price integer not null,
  selling_price  integer not null,
  unique (entry_id, gameweek_id, slot),
  unique (entry_id, gameweek_id, player_id)
);

create table if not exists entry_history (
  id                  integer generated always as identity primary key,
  entry_id            uuid not null references entries(id) on delete cascade,
  gameweek_id         integer not null references gameweeks(id) on delete cascade,
  points              integer not null default 0,
  total_points        integer not null default 0,
  rank                integer,
  bank                integer not null default 0,
  squad_value         integer not null default 0,
  transfers_made      integer not null default 0,
  transfer_cost       integer not null default 0,
  points_on_bench     integer not null default 0,
  chip                text,
  unique (entry_id, gameweek_id)
);

create table if not exists transfers (
  id             integer generated always as identity primary key,
  entry_id       uuid not null references entries(id) on delete cascade,
  gameweek_id    integer not null references gameweeks(id) on delete cascade,
  player_in_id   integer not null references players(id),
  player_out_id  integer not null references players(id),
  player_in_cost integer not null,
  player_out_cost integer not null,
  created_at     timestamptz not null default now()
);

create table if not exists chips_played (
  id          integer generated always as identity primary key,
  entry_id    uuid not null references entries(id) on delete cascade,
  gameweek_id integer not null references gameweeks(id) on delete cascade,
  name        text not null check (name in ('wildcard','freehit','bboost','3xc')),
  played_at   timestamptz not null default now(),
  unique (entry_id, name, gameweek_id)
);

-- --------------------------------------------------------------------------
-- Leagues
-- --------------------------------------------------------------------------

create table if not exists leagues (
  id          integer generated always as identity primary key,
  name        text not null,
  code        text not null unique,
  created_by  uuid not null references entries(id) on delete cascade,
  start_gw    integer not null default 1,
  created_at  timestamptz not null default now()
);

create table if not exists league_members (
  league_id  integer not null references leagues(id) on delete cascade,
  entry_id   uuid not null references entries(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (league_id, entry_id)
);

-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------

alter table clubs        enable row level security;
alter table players      enable row level security;
alter table gameweeks    enable row level security;
alter table fixtures     enable row level security;
alter table player_stats enable row level security;
alter table entries      enable row level security;
alter table entry_picks  enable row level security;
alter table entry_history enable row level security;
alter table transfers    enable row level security;
alter table chips_played enable row level security;
alter table leagues      enable row level security;
alter table league_members enable row level security;

-- Reference data is world readable, writable only by the service role
do $$
declare t text;
begin
  foreach t in array array['clubs','players','gameweeks','fixtures','player_stats'] loop
    execute format('drop policy if exists "%s_read" on %I', t, t);
    execute format('create policy "%s_read" on %I for select using (true)', t, t);
  end loop;
end $$;

-- Entries: everyone can read (for league tables), you can only write your own
drop policy if exists entries_read on entries;
create policy entries_read on entries for select using (true);

drop policy if exists entries_insert on entries;
create policy entries_insert on entries for insert with check (auth.uid() = id);

drop policy if exists entries_update on entries;
create policy entries_update on entries for update using (auth.uid() = id);

-- Picks: readable once the gameweek deadline has passed, always readable by owner
drop policy if exists picks_read on entry_picks;
create policy picks_read on entry_picks for select using (
  auth.uid() = entry_id
  or exists (
    select 1 from gameweeks g
    where g.id = entry_picks.gameweek_id and g.deadline_time < now()
  )
);

drop policy if exists picks_write on entry_picks;
create policy picks_write on entry_picks for all
  using (auth.uid() = entry_id) with check (auth.uid() = entry_id);

drop policy if exists history_read on entry_history;
create policy history_read on entry_history for select using (true);

drop policy if exists transfers_own on transfers;
create policy transfers_own on transfers for all
  using (auth.uid() = entry_id) with check (auth.uid() = entry_id);

drop policy if exists chips_read on chips_played;
create policy chips_read on chips_played for select using (true);

drop policy if exists chips_write on chips_played;
create policy chips_write on chips_played for insert with check (auth.uid() = entry_id);

-- Leagues
drop policy if exists leagues_read on leagues;
create policy leagues_read on leagues for select using (true);

drop policy if exists leagues_create on leagues;
create policy leagues_create on leagues for insert with check (auth.uid() = created_by);

drop policy if exists members_read on league_members;
create policy members_read on league_members for select using (true);

drop policy if exists members_join on league_members;
create policy members_join on league_members for insert with check (auth.uid() = entry_id);

drop policy if exists members_leave on league_members;
create policy members_leave on league_members for delete using (auth.uid() = entry_id);

-- --------------------------------------------------------------------------
-- Helper view: current standings
-- --------------------------------------------------------------------------

create or replace view overall_standings as
select
  e.id,
  e.team_name,
  e.manager_name,
  e.total_points,
  e.gameweek_points,
  rank() over (order by e.total_points desc, e.id) as position
from entries e;
