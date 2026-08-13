import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/admin";
import { isValidStartPrice } from "@/lib/pricing";

export async function POST(req: Request) {
  const check = await checkAdmin();
  if (!check.ok) {
    return new NextResponse(
      check.reason === "signed-out" ? "You are signed out. Sign in again." : "Not authorised.",
      { status: 403 }
    );
  }

  const { rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return new NextResponse("Nothing to save", { status: 400 });
  }

  const clean = rows.map((r: any) => ({ id: Number(r.id), now_cost: Math.trunc(Number(r.now_cost)) }));

  const bad = clean.filter((r) => !Number.isInteger(r.id) || !isValidStartPrice(r.now_cost) || r.now_cost < 40);
  if (bad.length) {
    return new NextResponse(
      `${bad.length} price(s) invalid. Must be a whole 0.5m step of 4.0m or more.`,
      { status: 400 }
    );
  }

  const db = createAdminClient();
  for (const r of clean) {
    // Keep start_cost aligned so the season's opening list stays on the grid
    const { error } = await db
      .from("players")
      .update({ now_cost: r.now_cost, start_cost: r.now_cost })
      .eq("id", r.id);
    if (error) return new NextResponse(error.message, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: clean.length });
}
