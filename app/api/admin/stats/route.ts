import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/admin";

export async function POST(req: Request) {
  const check = await checkAdmin();
  if (!check.ok) {
    return new NextResponse(
      check.reason === "signed-out" ? "You are signed out. Sign in again." : "Not authorised.",
      { status: 403 }
    );
  }

  const { fixture_id, gameweek_id, rows } = await req.json();
  if (!fixture_id || !gameweek_id || !Array.isArray(rows)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const clean = rows.map((r: any) => ({
    player_id: r.player_id,
    fixture_id,
    gameweek_id,
    minutes: n(r.minutes, 0, 120),
    goals_scored: n(r.goals_scored),
    assists: n(r.assists),
    own_goals: n(r.own_goals),
    penalties_saved: n(r.penalties_saved),
    penalties_missed: n(r.penalties_missed),
    yellow_cards: n(r.yellow_cards, 0, 2),
    red_cards: n(r.red_cards, 0, 1),
    saves: n(r.saves, 0, 30),
  }));

  const db = createAdminClient();
  const { error } = await db.from("player_stats").upsert(clean, { onConflict: "player_id,fixture_id" });
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true, saved: clean.length });
}

function n(v: any, min = 0, max = 20) {
  const x = Math.trunc(Number(v) || 0);
  return Math.max(min, Math.min(max, x));
}
