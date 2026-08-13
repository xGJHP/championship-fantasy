import { NextResponse } from "next/server";
import { createClient, createAdminClient, hasSupabase } from "@/lib/supabase/server";
import { validateSquad, validateXI, RULES } from "@/lib/rules";
import { Position } from "@/lib/types";
import { upcomingGameweek, deadlinePassed } from "@/lib/gameweek";

type IncomingPick = {
  player_id: number;
  slot: number;
  is_captain: boolean;
  is_vice_captain: boolean;
};

export async function POST(req: Request) {
  if (!hasSupabase()) return bad("Supabase is not configured on the server.", 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("You are signed out. Sign in and try again.", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Could not read the request.");

  const picks: IncomingPick[] = Array.isArray(body.picks) ? body.picks : [];
  const teamName = String(body.teamName ?? "").trim();
  const managerName = String(body.managerName ?? "").trim();

  if (picks.length !== RULES.squadSize) {
    return bad(`Expected ${RULES.squadSize} players, got ${picks.length}.`);
  }
  if (!teamName) return bad("Give your team a name.");

  const slots = picks.map((p) => p.slot).sort((a, b) => a - b);
  const expected = Array.from({ length: RULES.squadSize }, (_, i) => i + 1);
  if (slots.join() !== expected.join()) return bad("Squad slots are not 1 to 15.");

  if (picks.filter((p) => p.is_captain).length !== 1) return bad("Pick exactly one captain.");
  if (picks.filter((p) => p.is_vice_captain).length !== 1) return bad("Pick exactly one vice captain.");
  if (picks.some((p) => p.is_captain && p.is_vice_captain)) {
    return bad("Captain and vice captain must be different players.");
  }

  const db = createAdminClient();

  // Never trust prices or positions from the browser. Re-read them.
  const ids = picks.map((p) => p.player_id);
  const { data: players, error: pErr } = await db
    .from("players").select("id, club_id, position, now_cost").in("id", ids);
  if (pErr) return bad(pErr.message, 500);
  if (!players || players.length !== RULES.squadSize) {
    return bad("Some of those players no longer exist. Refresh and try again.");
  }

  type DbPlayer = { id: number; club_id: number; position: Position; now_cost: number };
  const byId = new Map<number, DbPlayer>(
    (players as DbPlayer[]).map((p) => [p.id, p])
  );
  const squad = picks.map((p) => {
    const pl = byId.get(p.player_id)!;
    return { id: pl.id, position: pl.position as Position, club_id: pl.club_id, cost: pl.now_cost };
  });

  const squadErrors = validateSquad(squad);
  if (squadErrors.length) return bad(squadErrors.map((e) => e.message).join(" "));

  const xi = picks.filter((p) => p.slot <= 11).map((p) => {
    const pl = byId.get(p.player_id)!;
    return { id: pl.id, position: pl.position as Position, club_id: pl.club_id, cost: pl.now_cost };
  });
  const xiErrors = validateXI(xi);
  if (xiErrors.length) return bad(xiErrors.map((e) => e.message).join(" "));

  // Slot 12 must be the reserve keeper, or auto-subs will bring an outfielder
  // on for a keeper. Enforce it here rather than trusting the client.
  const gkSlots = picks.filter((p) => byId.get(p.player_id)!.position === "GK").map((p) => p.slot).sort((a, b) => a - b);
  if (gkSlots.length !== 2) return bad("You need exactly two goalkeepers.");
  if (gkSlots[0] > 11) return bad("One goalkeeper must start.");
  if (gkSlots[1] !== 12) return bad("Your reserve goalkeeper must be the first player on the bench.");

  const captain = picks.find((p) => p.is_captain)!;
  const vice = picks.find((p) => p.is_vice_captain)!;
  if (captain.slot > 11 || vice.slot > 11) {
    return bad("Your captain and vice captain must both be in the starting eleven.");
  }

  // Which gameweek are we picking for?
  const { data: gws } = await db
    .from("gameweeks").select("id, deadline_time, is_next, finished").order("id");
  if (!gws?.length) {
    return bad("No gameweeks exist yet. Run `npm run sync:fixtures` first.", 409);
  }
  const target = upcomingGameweek(gws as any);
  if (!target) return bad("No gameweeks exist yet.", 409);

  // Once the deadline passes the squad is locked, full stop. Checking
  // `finished` instead would leave a window between the first kickoff and the
  // gameweek being scored where someone could change their team having already
  // watched a match.
  if (deadlinePassed(target)) {
    return bad("The deadline for this gameweek has passed. Your team is locked.", 409);
  }

  const spend = squad.reduce((t, p) => t + p.cost, 0);
  const bank = RULES.budget - spend;

  // Create the manager on first save, update the name after that
  const { error: eErr } = await db.from("entries").upsert({
    id: user.id,
    team_name: teamName.slice(0, 40),
    manager_name: (managerName || user.email?.split("@")[0] || "Manager").slice(0, 40),
    bank,
    squad_value: spend,
    started_gw: target.id,
  }, { onConflict: "id" });
  if (eErr) return bad(eErr.message, 500);

  // Replace this gameweek's picks wholesale
  const { error: dErr } = await db
    .from("entry_picks").delete().eq("entry_id", user.id).eq("gameweek_id", target.id);
  if (dErr) return bad(dErr.message, 500);

  const rows = picks.map((p) => {
    const cost = byId.get(p.player_id)!.now_cost;
    return {
      entry_id: user.id,
      gameweek_id: target.id,
      player_id: p.player_id,
      slot: p.slot,
      is_captain: p.is_captain,
      is_vice_captain: p.is_vice_captain,
      purchase_price: cost,
      selling_price: cost,
    };
  });

  const { error: iErr } = await db.from("entry_picks").insert(rows);
  if (iErr) return bad(iErr.message, 500);

  return NextResponse.json({
    ok: true,
    gameweek: target.id,
    squad_value: spend,
    bank,
  });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
