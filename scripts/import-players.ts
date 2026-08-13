/**
 * Import the player list into Supabase.
 *   npm run import:players
 *
 * Reads data/players_full.csv and resolves club_id from club_code, so it does
 * not care what order your clubs table ended up in. Safe to re-run: it updates
 * prices for players already there and inserts anyone new.
 *
 * Pass --dry to preview without writing.
 */
import "./_env";
import { admin } from "./_supabase";
import { isValidStartPrice } from "../lib/pricing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force-prices");

type Row = { club_code: string; web_name: string; position: string; now_cost: number; start_cost: number };

function parseCsv(text: string): Row[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.filter(Boolean).map((line) => {
    // Handles quoted fields containing commas
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const o: any = {};
    cols.forEach((c, i) => (o[c] = cells[i]?.trim()));
    return {
      club_code: o.club_code,
      web_name: o.web_name,
      position: o.position,
      now_cost: Number(o.now_cost),
      start_cost: Number(o.start_cost),
    };
  });
}

async function main() {
  const db = admin();

  const { data: clubs, error: clubErr } = await db.from("clubs").select("id, code");
  if (clubErr) throw clubErr;
  if (!clubs?.length) {
    console.error("No clubs found. Run `npm run seed:clubs` first.");
    process.exit(1);
  }
  const clubId = new Map<string, number>(clubs.map((c: any) => [c.code, c.id]));

  const csv = readFileSync(resolve(process.cwd(), "data/players_full.csv"), "utf8");
  const rows = parseCsv(csv);

  const bad = rows.filter((r) => !clubId.has(r.club_code));
  if (bad.length) {
    console.error("Unknown club codes:", [...new Set(bad.map((b) => b.club_code))].join(", "));
    process.exit(1);
  }

  const valid = new Set(["GK", "DEF", "MID", "FWD"]);
  const badPos = rows.filter((r) => !valid.has(r.position));
  if (badPos.length) {
    console.error("Bad positions:", badPos.slice(0, 5).map((b) => `${b.web_name}=${b.position}`).join(", "));
    process.exit(1);
  }

  // Starting prices must sit on the 0.5m grid. In-season prices are free to
  // drift in 0.1m steps, but this file is the season's opening price list.
  const offGrid = rows.filter((r) => !isValidStartPrice(r.start_cost));
  if (offGrid.length) {
    console.error(`${offGrid.length} players have a starting price off the 0.5m grid:`);
    offGrid.slice(0, 10).forEach((r) => console.error(`  ${r.web_name} ${r.start_cost / 10}m`));
    console.error("Starting prices must be whole 0.5m steps, so 5.5 or 6.0, never 5.8.");
    process.exit(1);
  }

  const payload = rows.map((r) => ({
    club_id: clubId.get(r.club_code)!,
    web_name: r.web_name,
    position: r.position,
    now_cost: r.now_cost,
    start_cost: r.start_cost,
    status: "a",
  }));

  console.log(`Parsed ${payload.length} players across ${new Set(rows.map(r => r.club_code)).size} clubs.`);
  const byPos = payload.reduce((m: any, p) => ((m[p.position] = (m[p.position] ?? 0) + 1), m), {});
  console.log("  " + Object.entries(byPos).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log(`  price range ${Math.min(...payload.map(p => p.now_cost)) / 10}m to ${Math.max(...payload.map(p => p.now_cost)) / 10}m`);

  if (DRY) {
    console.log(FORCE
      ? "\nDry run with --force-prices: existing players WOULD have prices overwritten."
      : "\nDry run: existing players would be left untouched, only new ones added.");
    return;
  }

  // Match on club plus name to decide what is new
  const { data: inDb } = await db.from("players").select("id, club_id, web_name");
  const key = (c: number, n: string) => `${c}::${n}`;
  const have = new Map<string, number>((inDb ?? []).map((p: any) => [key(p.club_id, p.web_name), p.id]));

  const inserts = payload.filter((p) => !have.has(key(p.club_id, p.web_name)));
  const alreadyThere = payload.filter((p) => have.has(key(p.club_id, p.web_name)));

  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await db.from("players").insert(inserts.slice(i, i + 200));
    if (error) throw error;
  }

  let updated = 0;
  if (FORCE) {
    const updates = alreadyThere.map((p) => ({ ...p, id: have.get(key(p.club_id, p.web_name))! }));
    for (let i = 0; i < updates.length; i += 200) {
      const { error } = await db.from("players").upsert(updates.slice(i, i + 200));
      if (error) throw error;
    }
    updated = updates.length;
  }

  console.log(`\nInserted ${inserts.length} new player(s).`);
  if (FORCE) {
    console.log(`Overwrote prices for ${updated} existing player(s), because --force-prices was set.`);
  } else {
    console.log(`Left ${alreadyThere.length} existing player(s) untouched, so hand-tuned prices are safe.`);
    console.log(`Pass --force-prices if you want the CSV to win.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
