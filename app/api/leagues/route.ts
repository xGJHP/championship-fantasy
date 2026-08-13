import { NextResponse } from "next/server";
import { createClient, createAdminClient, hasSupabase } from "@/lib/supabase/server";
import { generateCode } from "@/lib/league-code";
import { upcomingGameweek } from "@/lib/gameweek";

export async function POST(req: Request) {
  if (!hasSupabase()) return bad("Supabase is not configured on the server.", 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("You are signed out. Sign in and try again.", 401);

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return bad("Give your league a name.");
  if (name.length > 60) return bad("That name is a bit long, keep it under 60 characters.");

  const db = createAdminClient();

  const { data: entry } = await db.from("entries").select("id").eq("id", user.id).maybeSingle();
  if (!entry) return bad("Pick a squad before creating a league.", 409);

  const { data: gws } = await db.from("gameweeks").select("id, deadline_time, is_next").order("id");
  const startGw = upcomingGameweek(gws as any)?.id ?? 1;

  // Retry on the very unlikely code collision
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode();
    const { data, error } = await db
      .from("leagues")
      .insert({ name, code, created_by: user.id, start_gw: startGw })
      .select("id, name, code")
      .single();

    if (error) {
      if (error.code === "23505") continue; // duplicate code, try again
      return bad(error.message, 500);
    }

    const { error: mErr } = await db
      .from("league_members").insert({ league_id: data.id, entry_id: user.id });
    if (mErr) return bad(mErr.message, 500);

    return NextResponse.json({ ok: true, league: data });
  }

  return bad("Could not generate a unique code. Try again.", 500);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
