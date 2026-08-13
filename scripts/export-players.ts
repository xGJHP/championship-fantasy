/**
 * Pull the live player list out of Supabase and back into the repo.
 *
 *   npm run export:players
 *
 * The database is the source of truth once you have edited prices in
 * /admin/prices. This rewrites data/players_full.csv and data/players.csv to
 * match, and writes pricing_src/live_prices.json so re-running the pricing
 * model reproduces your live prices rather than reverting them.
 *
 * Shows you exactly what changed before writing. Pass --dry to skip writing.
 */
import "./_env";
import { admin } from "./_supabase";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { toFullCsv, toSimpleCsv, sortRows, ExportRow } from "../lib/players-csv";

const DRY = process.argv.includes("--dry");

async function main() {
  const db = admin();

  const { data: clubs, error: cErr } = await db.from("clubs").select("id, code");
  if (cErr) throw cErr;
  const codeOf = new Map<number, string>((clubs ?? []).map((c: any) => [c.id, c.code]));

  const { data: players, error: pErr } = await db
    .from("players")
    .select("id, club_id, web_name, position, now_cost, start_cost, status");
  if (pErr) throw pErr;
  if (!players?.length) {
    console.error("No players in the database. Nothing to export.");
    process.exit(1);
  }

  // Keep the Transfermarkt position from the existing file, since the database
  // does not store it and it is useful context when tuning the model
  const tmPos = new Map<string, string>();
  const fullPath = resolve(process.cwd(), "data/players_full.csv");
  if (existsSync(fullPath)) {
    const lines = readFileSync(fullPath, "utf8").trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      const c = line.split(",");
      if (c.length >= 5) tmPos.set(`${c[0]}::${c[2]}`, c[4]);
    }
  }

  const rows: ExportRow[] = sortRows(
    (players as any[]).map((p) => {
      const club_code = codeOf.get(p.club_id) ?? "???";
      return {
        club_code,
        club_id: p.club_id,
        web_name: p.web_name,
        position: p.position,
        tm_pos: tmPos.get(`${club_code}::${p.web_name}`) ?? "",
        now_cost: p.now_cost,
        start_cost: p.start_cost,
      };
    })
  );

  /* ---------------- what changed ---------------- */
  const before = new Map<string, number>();
  if (existsSync(fullPath)) {
    const lines = readFileSync(fullPath, "utf8").trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      const c = line.split(",");
      if (c.length >= 6) before.set(`${c[0]}::${c[2]}`, Number(c[5]));
    }
  }

  const changed: { name: string; from: number; to: number }[] = [];
  const added: string[] = [];
  for (const r of rows) {
    const key = `${r.club_code}::${r.web_name}`;
    if (!before.has(key)) { added.push(`${r.web_name} (${r.club_code})`); continue; }
    const was = before.get(key)!;
    if (was !== r.now_cost) changed.push({ name: `${r.web_name} (${r.club_code})`, from: was, to: r.now_cost });
  }
  const removed = [...before.keys()].filter(
    (k) => !rows.some((r) => `${r.club_code}::${r.web_name}` === k)
  );

  console.log(`${rows.length} players live in the database\n`);

  if (changed.length) {
    console.log(`${changed.length} price change${changed.length === 1 ? "" : "s"} since the last export:`);
    changed
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
      .forEach((c) =>
        console.log(`  ${c.name.padEnd(34)} ${(c.from / 10).toFixed(1)} -> ${(c.to / 10).toFixed(1)}`)
      );
  } else {
    console.log("No price changes since the last export.");
  }
  if (added.length) console.log(`\n${added.length} new player(s): ${added.join(", ")}`);
  if (removed.length) console.log(`\n${removed.length} no longer in the database: ${removed.join(", ")}`);

  if (DRY) { console.log("\nDry run, nothing written."); return; }

  writeFileSync(fullPath, toFullCsv(rows));
  writeFileSync(resolve(process.cwd(), "data/players.csv"), toSimpleCsv(rows));

  // So the pricing model cannot silently revert a hand-tuned price
  const live: Record<string, number> = {};
  rows.forEach((r) => (live[r.web_name] = r.now_cost));
  writeFileSync(
    resolve(process.cwd(), "pricing_src/live_prices.json"),
    JSON.stringify(live, null, 0) + "\n"
  );

  console.log("\nWritten:");
  console.log("  data/players_full.csv");
  console.log("  data/players.csv");
  console.log("  pricing_src/live_prices.json");
  console.log("\nCommit these so the repo matches what is live.");
}

main().catch((e) => { console.error(e); process.exit(1); });
