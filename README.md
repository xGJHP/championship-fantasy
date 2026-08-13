# FCS

A fantasy football game for the second tier of English football, built with
Next.js, Supabase and Tailwind. Same rules as the game you already play:
£100.0m budget, fifteen players, captains, chips, price changes, mini-leagues.

Unofficial. Not affiliated with any league or club. No badges, kits, sponsor
marks or league branding are used anywhere. Club and player names appear as
plain factual text and club colours are generic and approximate.

---

## Run it right now

```bash
npm install
npm run dev
```

Open http://localhost:3000/squad. With no database configured it falls back to
a generated demo player pool so you can click around the squad builder
immediately. The names in demo mode are fictional placeholders.

---

## Full setup

### 1. Supabase

1. Create a free project at supabase.com
2. Open the SQL editor, paste in `supabase/schema.sql`, run it
3. Copy `.env.example` to `.env.local` and fill in your URL, anon key and
   service role key
4. In Authentication → Providers, make sure Email is on
5. In Authentication → URL Configuration, set **Site URL** to
   `http://localhost:3000` and add `http://localhost:3000/**` to **Redirect
   URLs**. Without this the magic link bounces you straight back to the login
   page. Add your Vercel URL here too when you deploy.

**How sign in works**

Two options on the login page.

**Password** is the reliable one, and what you want for admin work. Create the
user yourself in Supabase under Authentication → Users → Add user, tick **Auto
Confirm User**, set a password. No email is sent, so nothing can rate limit you.

**Email link** sends a magic link and a 6 digit code. The link lands on `/auth/callback`,
which exchanges it for a session, then sends you where you were headed.
`middleware.ts` refreshes that session on every request, which is what lets
Server Components see who you are. If sign in ever silently fails, that
middleware is the first thing to check.

**Heads up on emails:** Supabase's built in sender allows only **2 auth emails
per hour** on the free tier. Hit that and you get "email rate limit exceeded",
which is their limit, not a bug in this app. Either use password sign in, or
connect a real SMTP provider (Resend, Postmark, SendGrid) under Project
Settings → Authentication → SMTP, which raises the cap to 30 per hour and is
what you will want before launch anyway.

Admin pages are gated on `ADMIN_EMAILS`. If your address is not on the list the
page tells you which account you are signed in as and which addresses are
allowed, rather than just refusing.

### 2. Check your keys

```bash
npm run check-env
```

This validates `.env.local` line by line, tells you exactly what is wrong with
any value, then tries a real connection to your database. Run it whenever
something is not working.

### 3. Seed the clubs

```bash
npm run seed:clubs
```

### 4. Fixtures

Get a free API token at football-data.org, put it in `.env.local`, then:

```bash
npm run sync:fixtures
```

This pulls all 552 Championship fixtures, creates gameweeks 1 to 46 from the
matchdays, and sets deadlines 90 minutes before the first kickoff of each
gameweek. Re-run it after each round to pull in the scorelines. It is safe to
run repeatedly.

### 5. Players

484 players across all 24 clubs are already built and priced, in
`data/players_full.csv`. Import them with:

```bash
npm run import:players:dry   # preview, writes nothing
npm run import:players       # write
```

Safe to re-run. It updates prices for players already in the table and inserts
anyone new, matching on club plus name.

If you would rather paste straight into the Supabase table editor, use
`data/players.csv`, which has numeric `club_id` and exactly the five columns
the table needs.

**How the prices were built**

Squads came from Transfermarkt for 2026/27. Prices are driven by expected
fantasy output, in this order:

1. Last season's goals and assists, which is the strongest signal
2. Team strength, so clean sheets at a strong defence cost more
3. Depth chart position, so a club's fourth-choice centre-back is 4.0m
4. Market value, as a fallback for players with no recent returns
5. Manual anchors for the names everyone looks up first

Defensive midfielders are discounted, set-piece takers are not. Every defender
at Lincoln, Cardiff and Bolton is 4.0m.

The model lives in `pricing_src/`. Edit `price.py`, run it, and it regenerates
both CSVs:

```bash
cd pricing_src && python3 price.py && python3 verify.py
```

`verify.py` checks that every price is on the 0.5m grid and that the budget
still bites: the most expensive legal 15 comes to 17.0m over the 100m cap, and
the cheapest is 64.0m, so there is real
room to make choices without ever being unable to field a team.

**Adding a player later**

Transfer windows, loan signings, someone you missed. Three ways:

1. **`/admin/prices`** has an **Add a player** button. Club, name, position,
   starting price. They appear in the squad builder immediately. This is the
   one you want for a handful.
2. **`data/players_full.csv`** plus `npm run import:players` for a batch. The
   import only inserts players who are not already there, so it never touches
   prices you have tuned by hand.
3. **Supabase table editor** if you prefer. `club_id`, `web_name`, `position`
   and both cost columns are the required fields.

When someone leaves a club, set their status to **Left the club** in the
status column on `/admin/prices` rather than deleting the row. Deleting breaks
the squads and transfer history of anyone who owned them.

**Changing a price later**

Three ways, depending on whether it should stick:

1. **`/admin/prices`** is the one you want. Search, nudge with plus and minus in
   0.5m steps or type a value, save. It rejects anything off the grid. Changes
   go straight to the database and survive a re-import.
2. **Supabase table editor** works for a one-off, but nothing validates the
   0.5m rule except the database constraint, and it is easy to forget
   `start_cost`.
3. **`pricing_src/price.py`** is the source of truth for a bulk rethink. Add or
   change an entry in the `ANCHOR` dict, re-run `python3 price.py`, then
   `npm run import:players:force`. Use this when you are changing many prices
   at once, not for a handful.

Re-running `npm run import:players` is always safe: it only inserts players who
are not in the table yet and leaves everyone else alone, so hand-tuned prices
are never clobbered. `npm run import:players:force` is the opt-in that lets the
CSV overwrite existing prices.

**Known soft spots**

- Raul Jimenez is priced at 9.0m on your instruction. Worth watching: Wolves'
  leading scorer last season managed 3 goals, and he is 35 with a 3m euro
  market value. Easy to change in `ANCHOR` in `price.py`.
- Anyone who moved clubs after the scrape will be wrong. Re-run the scrape or
  fix the row by hand.
- Players with no Championship or Premier League returns last season are priced
  from market value, which is a blunt instrument. Expect to tune 20 or 30 of
  them once you see who is actually starting.

### 6. Weekly routine

1. `npm run sync:fixtures` after the games finish, to pull scorelines
2. Go to `/admin`, pick the gameweek and fixture, enter minutes, goals,
   assists, saves and cards for each player
3. `npm run process:gw 7`

Step 3 derives goals conceded and clean sheets from the scoreline, calculates
BPS, awards 3/2/1 bonus, scores every manager including auto-subs and
captaincy, updates the tables and applies price changes.

Realistically step 2 is about 45 minutes a gameweek across 12 fixtures once
you have a rhythm.

### 7. Deploy

Push to GitHub, import the repo at vercel.com, paste the same environment
variables in, deploy. The free tier handles a few hundred managers without
complaint.

---

## How the code is laid out

| Path | What it does |
|---|---|
| `lib/scoring.ts` | Points per player per match, BPS, 3/2/1 bonus with FPL tie handling |
| `lib/rules.ts` | Squad and XI validation, formations, auto-subs, transfer hits, gameweek scoring |
| `lib/points.ts` | Turns picks plus raw stats into a gameweek breakdown |
| `lib/league-code.ts` | Invite code generation and normalisation |
| `lib/transfers.ts` | Transfer validation: like for like, selling prices, club limits, hits |
| `lib/pricing.ts` | Price rises and falls, and the half-the-profit selling price rule |
| `data/clubs.ts` | The 24 clubs and their generic colours |
| `data/demo-players.ts` | Fictional placeholder pool for demo mode |
| `components/SquadBuilder.tsx` | The pitch, drag and drop, player list, live validation |
| `components/AdminStatEntry.tsx` | Weekly stat entry grid |
| `data/players_full.csv` | 484 players, priced and ready to import |
| `pricing_src/price.py` | The pricing model, re-runnable |
| `app/api/leagues/*` | Create, join and leave a league |
| `app/api/transfers/route.ts` | Applies transfers, revalidating server side |
| `app/api/squad/route.ts` | Saves a squad, revalidating everything server side |
| `scripts/import-players.ts` | Imports the player CSV into Supabase |
| `scripts/check-env.ts` | Validates `.env.local` and tests the database connection |
| `scripts/sync-fixtures.ts` | football-data.org sync |
| `scripts/process-gameweek.ts` | The weekly scoring run |
| `supabase/schema.sql` | Tables, indexes and row level security |
| `tests/scoring.test.ts` | 45 tests covering the scoring and rules engines |

```bash
npm test
```

---

## Rules as implemented

**Squad** — 15 players, 2 GK / 5 DEF / 5 MID / 3 FWD, £100.0m, max 3 per club.
Saving requires an account. The server never trusts the browser: it re-reads
every price and position from the database and revalidates the whole squad
before writing. Slot order is enforced too, because auto-subs read slot 12 as
the reserve keeper.

**XI** — 1 GK, 3 to 5 DEF, 2 to 5 MID, 1 to 3 FWD, which gives eight legal
shapes: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-2-3, 5-3-2 and 5-4-1. They are
derived from the min and max rules in `lib/rules.ts` rather than hardcoded, so
changing those numbers updates the picker automatically.

Pick a shape from the row above the pitch and the eleven rebuilds around it,
keeping players who were already starting where it can. Dragging between the
pitch and the bench still works for finer control.

**Points**

| | GK | DEF | MID | FWD |
|---|---|---|---|---|
| Played under 60 min | 1 | 1 | 1 | 1 |
| Played 60 min or more | 2 | 2 | 2 | 2 |
| Goal | 6 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet | 4 | 4 | 1 | 0 |
| Per 3 saves | 1 | | | |
| Penalty save | 5 | | | |
| Per 2 conceded | -1 | -1 | | |
| Penalty miss | -2 | -2 | -2 | -2 |
| Yellow / red | -1 / -3 | -1 / -3 | -1 / -3 | -1 / -3 |
| Own goal | -2 | -2 | -2 | -2 |

Bonus is 3, 2 and 1 to the top BPS scorers in each match. Ties are handled the
FPL way: two tied on top both get 3 and third gets 1; two tied for second both
get 2 and nobody gets 1.

**Points** — The Points page recomputes every score from the raw match stats
rather than trusting a stored total, so the per-player breakdown always adds up
to the number on screen. Tap any player to see exactly where their points came
from. Auto-subs are marked ON and OFF, the captain multiplier is shown as
working, and double gameweeks are summed and flagged.

**Leagues** — Create one and you get a six character invite code, shown as
`FCS-K7M2QX`. The alphabet has no 0, O, 1, I or L, and no vowels, so codes are
hard to misread over a phone screen and cannot accidentally spell anything.

Sharing gives you both a code and a link. The link is `/leagues?join=CODE`,
which prefills the join box, and survives a trip through the login page if the
person is not signed in yet.

Pasted codes are cleaned up, but never guessed at. If someone types an O, which
is not a valid character, the code is rejected rather than quietly resolving to
a different league.

Whoever creates a league can only delete it once everyone else has left.

**Chips** — Wildcard, Free Hit, Bench Boost, Triple Captain.

**Transfers** — 1 free per gameweek, rolls over, capped at 5. Extras cost 4
points. Wildcard and Free Hit make transfers free.

Swaps are like for like, because the 2/5/5/3 squad shape is fixed: a defender
can only be replaced by a defender. You sell at your **selling price**, which
is not the same as the player's current price if they have risen. The club
limit is checked against the squad as it ends up, so swapping one of your three
Swansea players for another Swansea player is fine.

If you sell your captain the armband passes to your vice automatically.

**Prices** — Two granularities, on purpose:

*Starting prices* sit on 0.5m boundaries, so 5.5m and 6.0m are legal and 5.8m
is not. Enforced in three places: the pricing model snaps to the grid, the
importer rejects off-grid rows, and `start_cost` has a check constraint.

*In-season prices* drift in 0.1m steps, exactly as in FPL, so a player who
starts at 6.0m can be 6.3m by October. `now_cost` is deliberately unconstrained.
Movement is capped at 0.3m per gameweek, driven by net transfer volume as a
share of the active manager base, and frozen until 50 managers have signed up.
When you sell you keep half of any rise, rounded down to 0.1m.

---

## The one gap worth knowing about

FPL's Defensive Contribution points need Opta-grade event data: clearances,
blocks, interceptions, tackles and recoveries per player per match. That is
enterprise licensing, four to five figures a year. The code supports it, the
database has the columns, and there is a switch in `lib/scoring.ts`:

```ts
defensiveContribution: { enabled: false, ... }
```

Flip it on if you ever license the data. Until then the game runs without it,
which is how FPL itself worked until 2025/26.

BPS falls back to the stats you can enter by hand, so bonus points still work,
they are just a simpler calculation than the real thing.
