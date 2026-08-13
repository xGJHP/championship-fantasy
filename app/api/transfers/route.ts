import { NextResponse } from "next/server";
import { createClient, createAdminClient, hasSupabase } from "@/lib/supabase/server";
import { validateTransfers, SquadSlot, MarketPlayer, ProposedTransfer } from "@/lib/transfers";
import { rolloverFreeTransfers, RULES } from "@/lib/rules";
import { upcomingGameweek, deadlinePassed } from "@/lib/gameweek";
import { ChipName, Position } from "@/lib/types";

const CHIPS: ChipName[] = ["wildcard", "freehit", "bboost", "3xc"];

export async function POST(req: Request) {
  if (!hasSupabase()) return bad("Supabase is not configured on the server.", 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("You are signed out. Sign in and try again.", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Could not read the request.");

  const transfers: ProposedTransfer[] = Array.isArray(body.transfers) ? body.transfers : [];
  const chip: ChipName | null = CHIPS.includes(body.chip) ? body.chip : null;

  if (transfers.length === 0 && !chip) return bad("No transfers to make.");
  if (transfers.length > RULES.squadSize) return bad("That is more transfers than you have players.");

  const db = createAdminClient();

  const { data: gws } = await db
    .from("gameweeks").select("id, deadline_time, is_next, finished").order("id");
  const target = upcomingGameweek(gws as any);
  if (!target) return bad("No gameweeks exist yet. Run `npm run sync:fixtures` first.", 409);
  if (deadlinePassed(target)) {
    return bad("The deadline for this gameweek has passed.", 409);
  }

  const { data: entry } = await db
    .from("entries").select("*").eq("id", user.id).maybeSingle();
  if (!entry) return bad("Pick your first squad before making transfers.", 409);

  // Chips can only be played once each
  if (chip) {
    const { data: played } = await db
      .from("chips_played").select("name").eq("entry_id", user.id).eq("name", chip);
    if (played?.length) return bad(`You have already used your ${chipLabel(chip)}.`);
  }

  // Make sure this gameweek has a squad, carrying the last one forward if not
  let { data: picks } = await db
    .from("entry_picks").select("*").eq("entry_id", user.id).eq("gameweek_id", target.id).order("slot");

  if (!picks?.length) {
    const { data: prev } = await db
      .from("entry_picks").select("*")
      .eq("entry_id", user.id).lt("gameweek_id", target.id)
      .order("gameweek_id", { ascending: false }).order("slot");
    if (!prev?.length) return bad("Pick your first squad before making transfers.", 409);

    const lastGw = prev[0].gameweek_id;
    const carry = prev.filter((p: any) => p.gameweek_id === lastGw).map((p: any) => ({
      entry_id: user.id, gameweek_id: target.id, player_id: p.player_id, slot: p.slot,
      is_captain: p.is_captain, is_vice_captain: p.is_vice_captain,
      purchase_price: p.purchase_price, selling_price: p.selling_price,
    }));
    const { error } = await db.from("entry_picks").insert(carry);
    if (error) return bad(error.message, 500);
    picks = carry as any;
  }

  // Re-read prices and positions from the database, never from the browser
  const squadIds = picks!.map((p: any) => p.player_id);
  const incomingIds = transfers.map((t) => t.in_id);
  const { data: players } = await db
    .from("players").select("id, club_id, position, now_cost")
    .in("id", [...new Set([...squadIds, ...incomingIds])]);
  if (!players?.length) return bad("Could not read the player list.", 500);

  type DbPlayer = { id: number; club_id: number; position: Position; now_cost: number };
  const byId = new Map<number, DbPlayer>((players as DbPlayer[]).map((p) => [p.id, p]));

  const squad: SquadSlot[] = picks!.map((p: any) => {
    const pl = byId.get(p.player_id)!;
    return {
      player_id: p.player_id, position: pl.position, club_id: pl.club_id,
      purchase_price: p.purchase_price, selling_price: p.selling_price, slot: p.slot,
    };
  });

  const market = new Map<number, MarketPlayer>();
  for (const p of players as DbPlayer[]) {
    market.set(p.id, { id: p.id, position: p.position, club_id: p.club_id, now_cost: p.now_cost });
  }

  const result = validateTransfers({
    squad, transfers, market,
    bank: entry.bank,
    freeTransfers: entry.free_transfers,
    chip,
  });

  if (!result.ok) return bad(result.errors.join(" "));

  // Write the transfer log
  if (transfers.length) {
    const rows = transfers.map((t) => ({
      entry_id: user.id, gameweek_id: target.id,
      player_in_id: t.in_id, player_out_id: t.out_id,
      player_in_cost: byId.get(t.in_id)!.now_cost,
      player_out_cost: squad.find((s) => s.player_id === t.out_id)!.selling_price,
    }));
    const { error } = await db.from("transfers").insert(rows);
    if (error) return bad(error.message, 500);

    // Swap the players into their existing slots
    for (const t of transfers) {
      const slot = squad.find((s) => s.player_id === t.out_id)!.slot;
      const cost = byId.get(t.in_id)!.now_cost;
      const { error: uErr } = await db.from("entry_picks")
        .update({ player_id: t.in_id, purchase_price: cost, selling_price: cost,
                  is_captain: false, is_vice_captain: false })
        .eq("entry_id", user.id).eq("gameweek_id", target.id).eq("slot", slot);
      if (uErr) return bad(uErr.message, 500);
    }

    // Track popularity, which is what drives price changes at the end of the
    // gameweek. Read then write is fine at this scale.
    const counted = [...new Set(transfers.flatMap((t) => [t.in_id, t.out_id]))];
    const { data: counts } = await db
      .from("players").select("id, transfers_in_gw, transfers_out_gw").in("id", counted);
    for (const row of counts ?? []) {
      const inc = transfers.filter((t) => t.in_id === row.id).length;
      const dec = transfers.filter((t) => t.out_id === row.id).length;
      await db.from("players").update({
        transfers_in_gw: (row.transfers_in_gw ?? 0) + inc,
        transfers_out_gw: (row.transfers_out_gw ?? 0) + dec,
      }).eq("id", row.id);
    }
  }

  if (chip) {
    const { error } = await db.from("chips_played")
      .insert({ entry_id: user.id, gameweek_id: target.id, name: chip });
    if (error) return bad(error.message, 500);
  }

  const squadValue = result.resultingSquad.reduce((t, s) => t + (byId.get(s.player_id)?.now_cost ?? 0), 0);

  const { error: eErr } = await db.from("entries").update({
    bank: result.bankAfter,
    squad_value: squadValue,
    free_transfers: rolloverFreeTransfers(entry.free_transfers, result.transfersMade, chip),
  }).eq("id", user.id);
  if (eErr) return bad(eErr.message, 500);

  // If the captain was sold, hand the armband to the vice
  const { data: after } = await db
    .from("entry_picks").select("slot, player_id, is_captain, is_vice_captain")
    .eq("entry_id", user.id).eq("gameweek_id", target.id).order("slot");
  const hasCaptain = after?.some((p: any) => p.is_captain);
  const vice = after?.find((p: any) => p.is_vice_captain);
  if (!hasCaptain && vice) {
    await db.from("entry_picks").update({ is_captain: true, is_vice_captain: false })
      .eq("entry_id", user.id).eq("gameweek_id", target.id).eq("slot", vice.slot);
  }

  return NextResponse.json({
    ok: true,
    gameweek: target.id,
    transfersMade: result.transfersMade,
    pointsCost: result.pointsCost,
    bank: result.bankAfter,
    captainNeedsSetting: !hasCaptain && !vice,
  });
}

function chipLabel(c: ChipName) {
  return { wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain" }[c];
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
