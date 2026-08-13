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
import { scorePlayerMatch, calculateBps, awardBonus } from "../lib/scoring";
import { scoreEntryGameweek, rolloverFreeTransfers } from "../lib/rules";
import { computePriceChanges, sellingPrice } from "../lib/pricing";
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

  /* 1 + 2 + 3: per fixture, derive conceded, compute bps, award bonus, score */
  const updates: any[] = [];
  for (const fx of fixtures) {
    const rows = stats.filter((s: any) => s.fixture_id === fx.id);
    if (!rows.length) continue;

    for (const r of rows) {
      const isHome = clubOf.get(r.player_id) === fx.home_club_id;
      r.goals_conceded = isHome ? (fx.away_score ?? 0) : (fx.home_score ?? 0);
      r.bps = calculateBps(posOf.get(r.player_id)!, r);
    }

    const bonus = awardBonus(rows.map((r: any) => ({ player_id: r.player_id, bps: r.bps })));

    for (const r of rows) {
      const b = bonus.get(r.player_id) ?? 0;
      const score = scorePlayerMatch(posOf.get(r.player_id)!, r, b);
      updates.push({
        id: r.id,
        goals_conceded: r.goals_conceded,
        bps: r.bps,
        bonus: b,
        total_points: score.total,
      });
      r.bonus = b;
      r.total_points = score.total;
    }
  }

  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await db.from("player_stats").upsert(updates.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Scored ${updates.length} player performances.`);

  /* 4: roll season totals up onto players */
  const { data: allStats } = await db.from("player_stats").select("*");
  const agg = new Map<number, any>();
  for (const s of allStats ?? []) {
    const a = agg.get(s.player_id) ?? {
      total_points: 0, minutes: 0, goals_scored: 0, assists: 0, clean_sheets: 0,
      goals_conceded: 0, own_goals: 0, penalties_saved: 0, penalties_missed: 0,
      yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0,
    };
    a.total_points += s.total_points; a.minutes += s.minutes;
    a.goals_scored += s.goals_scored; a.assists += s.assists;
    a.clean_sheets += s.minutes >= 60 && s.goals_conceded === 0 ? 1 : 0;
    a.goals_conceded += s.goals_conceded; a.own_goals += s.own_goals;
    a.penalties_saved += s.penalties_saved; a.penalties_missed += s.penalties_missed;
    a.yellow_cards += s.yellow_cards; a.red_cards += s.red_cards;
    a.saves += s.saves; a.bonus += s.bonus; a.bps += s.bps;
    agg.set(s.player_id, a);
  }
  const playerRows = [...agg.entries()].map(([id, a]) => ({ id, ...a }));
  for (let i = 0; i < playerRows.length; i += 500) {
    await db.from("players").upsert(playerRows.slice(i, i + 500));
  }
  console.log(`Rolled up ${playerRows.length} season totals.`);

  /* 5: score every entry */
  const pointsMap = new Map<number, number>();
  const minutesMap = new Map<number, number>();
  for (const s of stats) {
    pointsMap.set(s.player_id, (pointsMap.get(s.player_id) ?? 0) + s.total_points);
    minutesMap.set(s.player_id, (minutesMap.get(s.player_id) ?? 0) + s.minutes);
  }

  const { data: entries } = await db.from("entries").select("*");
  const { data: picks } = await db.from("entry_picks").select("*").eq("gameweek_id", gwId);
  const { data: chips } = await db.from("chips_played").select("*").eq("gameweek_id", gwId);
  const { data: gwTransfers } = await db.from("transfers").select("entry_id").eq("gameweek_id", gwId);

  const transfersBy = new Map<string, number>();
  for (const t of gwTransfers ?? [])
    transfersBy.set(t.entry_id, (transfersBy.get(t.entry_id) ?? 0) + 1);

  const history: any[] = [];
  const entryUpdates: any[] = [];

  for (const e of entries ?? []) {
    const mine = (picks ?? []).filter((p: any) => p.entry_id === e.id);
    if (!mine.length) continue;
    const chip = (chips ?? []).find((c: any) => c.entry_id === e.id)?.name as ChipName | undefined;
    const made = transfersBy.get(e.id) ?? 0;

    const res = scoreEntryGameweek({
      picks: mine.map((p: any) => ({
        player_id: p.player_id, slot: p.slot,
        is_captain: p.is_captain, is_vice_captain: p.is_vice_captain,
      })),
      position: posOf,
      minutes: minutesMap,
      points: pointsMap,
      chip: chip ?? null,
      transfersMade: made,
      freeTransfers: e.free_transfers,
    });

    history.push({
      entry_id: e.id, gameweek_id: gwId,
      points: res.total, total_points: e.total_points + res.total,
      bank: e.bank, squad_value: e.squad_value,
      transfers_made: made, transfer_cost: res.transferHit,
      points_on_bench: res.benchPoints, chip: chip ?? null,
    });

    entryUpdates.push({
      id: e.id,
      gameweek_points: res.total,
      total_points: e.total_points + res.total,
      free_transfers: rolloverFreeTransfers(e.free_transfers, made, chip ?? null),
    });
  }

  if (history.length) {
    await db.from("entry_history").upsert(history, { onConflict: "entry_id,gameweek_id" });
    await db.from("entries").upsert(entryUpdates);
  }
  console.log(`Scored ${history.length} managers.`);

  // Overall ranks
  const sorted = [...entryUpdates].sort((a, b) => b.total_points - a.total_points);
  await Promise.all(
    sorted.map((e, i) => db.from("entries").update({ overall_rank: i + 1 }).eq("id", e.id))
  );

  // Gameweek summary
  if (history.length) {
    const scores = history.map((h) => h.points);
    await db.from("gameweeks").update({
      finished: true, data_checked: true,
      average_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      highest_score: Math.max(...scores),
    }).eq("id", gwId);
  }

  /* 6: price changes */
  const { data: pricePlayers } = await db
    .from("players").select("id, now_cost, start_cost, transfers_in_gw, transfers_out_gw");
  const changes = computePriceChanges(
    (pricePlayers ?? []).map((p: any) => ({
      player_id: p.id, now_cost: p.now_cost, start_cost: p.start_cost,
      transfers_in_gw: p.transfers_in_gw, transfers_out_gw: p.transfers_out_gw,
    })),
    entries?.length ?? 0
  );
  for (const c of changes) {
    await db.from("players").update({ now_cost: c.to }).eq("id", c.player_id);
  }
  await db.from("players").update({ transfers_in_gw: 0, transfers_out_gw: 0 }).neq("id", -1);
  console.log(`Applied ${changes.length} price changes.`);

  // Refresh selling prices on the next gameweek's picks
  const { data: nextPicks } = await db.from("entry_picks").select("*").eq("gameweek_id", gwId + 1);
  const costNow = new Map<number, number>((pricePlayers ?? []).map((p: any) => [p.id, p.now_cost]));
  for (const c of changes) costNow.set(c.player_id, c.to);
  for (const p of nextPicks ?? []) {
    const sp = sellingPrice(p.purchase_price, costNow.get(p.player_id) ?? p.purchase_price);
    if (sp !== p.selling_price) await db.from("entry_picks").update({ selling_price: sp }).eq("id", p.id);
  }

  console.log("\nGameweek " + gwId + " processed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
