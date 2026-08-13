import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/admin";
import { isValidStartPrice } from "@/lib/pricing";
import { POSITIONS } from "@/lib/types";

/** Add a player. */
export async function POST(req: Request) {
  const check = await checkAdmin();
  if (!check.ok) return bad("Not authorised.", 403);

  const body = await req.json().catch(() => null);
  const clubId = Number(body?.club_id);
  const name = String(body?.web_name ?? "").trim();
  const position = String(body?.position ?? "");
  const cost = Math.trunc(Number(body?.now_cost));

  if (!Number.isInteger(clubId)) return bad("Pick a club.");
  if (!name) return bad("Enter the player's name.");
  if (name.length > 40) return bad("That name is too long.");
  if (!POSITIONS.includes(position as any)) return bad("Pick a position.");
  if (!isValidStartPrice(cost) || cost < 40) {
    return bad("Price must be a whole 0.5m step of 4.0m or more.");
  }

  const db = createAdminClient();

  const { data: club } = await db.from("clubs").select("id").eq("id", clubId).maybeSingle();
  if (!club) return bad("That club does not exist.");

  const { data: existing } = await db
    .from("players").select("id").eq("club_id", clubId).eq("web_name", name).maybeSingle();
  if (existing) return bad(`${name} is already in that club's squad.`);

  const { data, error } = await db.from("players").insert({
    club_id: clubId, web_name: name, position,
    now_cost: cost, start_cost: cost, status: "a",
  }).select("id, web_name").single();

  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, player: data });
}

/** Change a player's availability. */
export async function PATCH(req: Request) {
  const check = await checkAdmin();
  if (!check.ok) return bad("Not authorised.", 403);

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const status = String(body?.status ?? "");
  const news = String(body?.news ?? "").slice(0, 200);

  if (!Number.isInteger(id)) return bad("Which player?");
  if (!["a", "d", "i", "s", "u"].includes(status)) return bad("Unknown status.");

  const db = createAdminClient();
  const { error } = await db.from("players").update({ status, news: news || null }).eq("id", id);
  if (error) return bad(error.message, 500);

  return NextResponse.json({ ok: true });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
