/**
 * Pull Championship fixtures and results from football-data.org (free tier)
 * and upsert them into Supabase. Matches clubs on name the first time and
 * stores the provider id so later runs are exact.
 *
 *   npx tsx scripts/sync-fixtures.ts
 *
 * Free tier gives fixtures, scores and standings. It does NOT give per-player
 * stats, so goals, assists, minutes and cards are entered in /admin.
 * Clean sheets and goals conceded are derived from the scoreline automatically.
 */
import "./_env";
import { admin } from "./_supabase";

const COMP = "ELC"; // English League Championship
const BASE = "https://api.football-data.org/v4";

type FdMatch = {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

async function fd(path: string) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("Set FOOTBALL_DATA_TOKEN in .env.local");
  const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": token } });
  if (!res.ok) throw new Error(`football-data ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Loose name match: strip punctuation, FC/AFC suffixes and case. */
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(fc|afc|association|football|club)\b/g, "").trim();

async function main() {
  const db = admin();

  const { data: clubs, error: clubErr } = await db.from("clubs").select("id, name, short_name, code, fd_id");
  if (clubErr) throw clubErr;
  if (!clubs?.length) throw new Error("No clubs in the database. Run scripts/seed-clubs.ts first.");

  const data = await fd(`/competitions/${COMP}/matches`);
  const matches: FdMatch[] = data.matches ?? [];
  console.log(`Fetched ${matches.length} matches.`);

  // Resolve provider ids onto our clubs
  const byFd = new Map<number, number>();
  const unresolved = new Set<string>();
  for (const c of clubs) if (c.fd_id) byFd.set(c.fd_id, c.id);

  const resolve = (t: FdMatch["homeTeam"]): number | null => {
    if (byFd.has(t.id)) return byFd.get(t.id)!;
    const hit = clubs.find(
      (c) => norm(c.name) === norm(t.name) || norm(c.short_name) === norm(t.shortName) || c.code === t.tla
    );
    if (!hit) { unresolved.add(`${t.name} (${t.tla}, id ${t.id})`); return null; }
    byFd.set(t.id, hit.id);
    return hit.id;
  };

  // Gameweeks from matchdays
  const gwRows = new Map<number, { id: number; name: string; deadline_time: string }>();
  for (const m of matches) {
    if (!m.matchday) continue;
    const existing = gwRows.get(m.matchday);
    // Deadline is 90 minutes before the earliest kickoff of that matchday
    const deadline = new Date(new Date(m.utcDate).getTime() - 90 * 60 * 1000).toISOString();
    if (!existing || deadline < existing.deadline_time) {
      gwRows.set(m.matchday, {
        id: m.matchday,
        name: `Gameweek ${m.matchday}`,
        deadline_time: deadline,
      });
    }
  }
  if (gwRows.size) {
    const { error } = await db.from("gameweeks").upsert([...gwRows.values()], { onConflict: "id" });
    if (error) throw error;
    console.log(`Upserted ${gwRows.size} gameweeks.`);
  }

  // Fixtures
  const fixtures = [];
  for (const m of matches) {
    const home = resolve(m.homeTeam);
    const away = resolve(m.awayTeam);
    if (!home || !away) continue;
    fixtures.push({
      fd_id: m.id,
      gameweek_id: m.matchday ?? null,
      home_club_id: home,
      away_club_id: away,
      kickoff_time: m.utcDate,
      home_score: m.score.fullTime.home,
      away_score: m.score.fullTime.away,
      started: m.status !== "SCHEDULED" && m.status !== "TIMED",
      finished: m.status === "FINISHED",
    });
  }

  const { error: fxErr } = await db.from("fixtures").upsert(fixtures, { onConflict: "fd_id" });
  if (fxErr) throw fxErr;
  console.log(`Upserted ${fixtures.length} fixtures.`);

  // Persist any newly resolved provider ids
  for (const [fdId, clubId] of byFd) {
    await db.from("clubs").update({ fd_id: fdId }).eq("id", clubId).is("fd_id", null);
  }

  // Mark the current and next gameweeks
  const now = new Date().toISOString();
  const upcoming = [...gwRows.values()].filter((g) => g.deadline_time > now).sort((a, b) =>
    a.deadline_time < b.deadline_time ? -1 : 1
  );
  if (upcoming.length) {
    await db.from("gameweeks").update({ is_next: false, is_current: false }).neq("id", -1);
    await db.from("gameweeks").update({ is_next: true }).eq("id", upcoming[0].id);
    const current = [...gwRows.values()]
      .filter((g) => g.deadline_time <= now)
      .sort((a, b) => (a.deadline_time > b.deadline_time ? -1 : 1))[0];
    if (current) await db.from("gameweeks").update({ is_current: true }).eq("id", current.id);
  }

  if (unresolved.size) {
    console.warn("\nCould not match these provider teams to a club row:");
    unresolved.forEach((u) => console.warn("  - " + u));
    console.warn("Fix the name in data/clubs.ts or set fd_id manually, then re-run.");
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
