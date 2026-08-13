import { NextResponse } from "next/server";
import { createClient, createAdminClient, hasSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!hasSupabase()) return bad("Supabase is not configured on the server.", 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("You are signed out.", 401);

  const body = await req.json().catch(() => null);
  const leagueId = Number(body?.leagueId);
  if (!Number.isInteger(leagueId)) return bad("Which league?");

  const db = createAdminClient();

  const { data: league } = await db
    .from("leagues").select("id, created_by").eq("id", leagueId).maybeSingle();
  if (!league) return bad("That league does not exist.", 404);

  if (league.created_by === user.id) {
    const { count } = await db
      .from("league_members").select("*", { count: "exact", head: true }).eq("league_id", leagueId);
    if ((count ?? 0) > 1) {
      return bad("You created this league, so you cannot leave while others are still in it.");
    }
    await db.from("league_members").delete().eq("league_id", leagueId);
    await db.from("leagues").delete().eq("id", leagueId);
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await db
    .from("league_members").delete().eq("league_id", leagueId).eq("entry_id", user.id);
  if (error) return bad(error.message, 500);

  return NextResponse.json({ ok: true });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
