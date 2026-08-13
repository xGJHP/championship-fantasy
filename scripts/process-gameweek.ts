/**
 * Score a finished gameweek.
 *   npx tsx scripts/process-gameweek.ts 7
 *
 * 1. Derives goals conceded and clean sheets from the fixture scorelines
 * 2. Calculates BPS and awards 3/2/1 bonus per fixture
 * 3. Writes total_points onto every player_stats row
 * 4. Rolls up season totals onto players
 * 5. Scores every manager's entry, applying auto subs, captaincy and chips
 * 6. Applies price changes
 */
import "./_env";
import { admin } from "./_supabase";
import {
  scoreFixtures, rollupSeason, scoreEntries, rankEntries, summarise, applyPricing,
} from "../lib/process";
import { Position, ChipName } from "../lib/types";

const gwId = Number(process.argv[2]);
if (!Number.isInteger(gwId)) {
  console.error("Usage: npx tsx scripts/process-gameweek.ts <gameweek>");
  process.exit(1);
}

async function main() {
  const db = admin();

  const { data: fixtures } = await db
    .from("fixtures").select("*").eq("gameweek_id", gwId).eq("finished", true);
  if (!fixtures?.length) { console.log(`No finished fixtures in GW${gwId}.`); return; }

  const { data: players } = await db.from("players").select("id, club_id, position, now_cost, start_cost");
  const posOf = new Map<number, Position>(players!.map((p: any) => [p.id, p.position]));
  const clubOf = new Map<number, number>(players!.map((p: any) => [p.id, p.club_id]));

  const { data: stats } = await db.from("player_stats").select("*").eq("gameweek_id", gwId);
  if (!stats?.length) { console.log("No player stats entered for this gameweek yet."); return; }

  /* 1 + 2 + 3: derive conceded, compute bps, award bonus, score */
  const scored = scoreFixtures(fixtures as any, stats as any, posOf, clubOf);
  const updates = scored.map((s) => ({
    id: s.id,
    goals_conceded: s.goals_conceded,
    bps: s.bps,
    bonus: s.bonus,
    total_points: s.total_points,
  }));

  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await db.from("player_stats").upsert(updates.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Scored ${updates.length} player performances.`);

  /* 4: roll season totals up onto players */
  const { data: allStats } = await db.from("player_stats").select("*");
  const agg = rollupSeason((allStats ?? []) as any);
  const playerRows = [...agg.entries()].map(([id, a]) => ({ id, ...a }));
  for (let i = 0; i < playerRows.length; i += 500) {
    await db.from("players").upsert(playerRows.slice(i, i + 500));
  }
  console.log(`Rolled up ${playerRows.length} season totals.`);

  /* 5: score every entry */
  const { data: entries } = await db.from("entries").select("*");
  const { data: picks } = await db.from("entry_picks").select("*").eq("gameweek_id", gwId);
  const { data: chips } = await db.from("chips_played").select("*").eq("gameweek_id", gwId);
  const { data: gwTransfers } = await db.from("transfers").select("entry_id").eq("gameweek_id", gwId);

  const transfersBy = new Map<string, number>();
  for (const t of gwTransfers ?? [])
    transfersBy.set(t.entry_id, (transfersBy.get(t.entry_id) ?? 0) + 1);

  const entryInputs = (entries ?? [])
    .filter((e: any) => (picks ?? []).some((p: any) => p.entry_id === e.id))
    .map((e: any) => ({
      id: e.id,
      total_points: e.total_points,
      free_transfers: e.free_transfers,
      transfersMade: transfersBy.get(e.id) ?? 0,
      chip: ((chips ?? []).find((c: any) => c.entry_id === e.id)?.name ?? null) as ChipName | null,
      picks: (picks ?? [])
        .filter((p: any) => p.entry_id === e.id)
        .map((p: any) => ({
          player_id: p.player_id, slot: p.slot,
          is_captain: p.is_captain, is_vice_captain: p.is_vice_captain,
        })),
    }));

  const results = scoreEntries(entryInputs, scored, posOf);

  const history = results.map((r) => {
    const e = entryInputs.find((x) => x.id === r.id)!;
    return {
      entry_id: r.id, gameweek_id: gwId,
      points: r.points, total_points: r.total_points,
      bank: (entries ?? []).find((x: any) => x.id === r.id)?.bank ?? 0,
      squad_value: (entries ?? []).find((x: any) => x.id === r.id)?.squad_value ?? 0,
      transfers_made: e.transfersMade, transfer_cost: r.transfer_cost,
      points_on_bench: r.points_on_bench, chip: r.chip,
    };
  });

  const entryUpdates = results.map((r) => ({
    id: r.id,
    gameweek_points: r.points,
    total_points: r.total_points,
    free_transfers: r.free_transfers_next,
  }));

  if (history.length) {
    await db.from("entry_history").upsert(history, { onConflict: "entry_id,gameweek_id" });
    await db.from("entries").upsert(entryUpdates);
  }
  console.log(`Scored ${history.length} managers.`);

  // Overall ranks
  const ranks = rankEntries(results);
  await Promise.all(
    [...ranks.entries()].map(([id, rank]) =>
      db.from("entries").update({ overall_rank: rank }).eq("id", id)
    )
  );

  // Gameweek summary
  if (results.length) {
    await db.from("gameweeks").update({
      finished: true, data_checked: true,
      ...summarise(results),
    }).eq("id", gwId);
  }

  /* 6: price changes */
  const { data: pricePlayers } = await db
    .from("players").select("id, now_cost, start_cost, transfers_in_gw, transfers_out_gw");
  const { data: nextPicks } = await db.from("entry_picks").select("*").eq("gameweek_id", gwId + 1);

  const { changes, sellingUpdates } = applyPricing(
    (pricePlayers ?? []).map((p: any) => ({
      player_id: p.id, now_cost: p.now_cost, start_cost: p.start_cost,
      transfers_in_gw: p.transfers_in_gw, transfers_out_gw: p.transfers_out_gw,
    })),
    entries?.length ?? 0,
    (nextPicks ?? []).map((p: any) => ({
      id: p.id, player_id: p.player_id,
      purchase_price: p.purchase_price, selling_price: p.selling_price,
    }))
  );

  for (const c of changes) {
    await db.from("players").update({ now_cost: c.to }).eq("id", c.player_id);
  }
  await db.from("players").update({ transfers_in_gw: 0, transfers_out_gw: 0 }).neq("id", -1);
  console.log(`Applied ${changes.length} price changes.`);

  for (const u of sellingUpdates) {
    await db.from("entry_picks").update({ selling_price: u.selling_price }).eq("id", u.id);
  }

  console.log("\nGameweek " + gwId + " processed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
