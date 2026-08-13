/**
 * One-off: push the 24 clubs into Supabase.
 *   npx tsx scripts/seed-clubs.ts
 */
import { CLUBS } from "../data/clubs";
import { admin } from "./_supabase";

async function main() {
  const db = admin();
  const rows = CLUBS.map((c) => ({
    code: c.code,
    name: c.name,
    short_name: c.shortName,
    primary_colour: c.primary,
    secondary_colour: c.secondary,
    text_colour: c.text,
    fd_id: c.fdId,
  }));

  const { error } = await db.from("clubs").upsert(rows, { onConflict: "code" });
  if (error) throw error;
  console.log(`Seeded ${rows.length} clubs.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
