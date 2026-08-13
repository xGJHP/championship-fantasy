import { NextResponse } from "next/server";
import { createClient, createAdminClient, hasSupabase } from "@/lib/supabase/server";
import { normaliseCode, isValidCode, CODE_LENGTH } from "@/lib/league-code";

export async function POST(req: Request) {
  if (!hasSupabase()) return bad("Supabase is not configured on the server.", 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("You are signed out. Sign in and try again.", 401);

  const body = await req.json().catch(() => null);
  const raw = String(body?.code ?? "");
  const code = normaliseCode(raw);

  if (!code) return bad("Enter an invite code.");
  if (!isValidCode(code)) {
    return bad(`Invite codes are ${CODE_LENGTH} characters. Check it and try again.`);
  }

  const db = createAdminClient();

  const { data: entry } = await db.from("entries").select("id").eq("id", user.id).maybeSingle();
  if (!entry) return bad("Pick a squad before joining a league.", 409);

  const { data: league } = await db
    .from("leagues").select("id, name, code").eq("code", code).maybeSingle();
  if (!league) return bad("No league with that code. Check it with whoever invited you.", 404);

  const { data: already } = await db
    .from("league_members").select("league_id")
    .eq("league_id", league.id).eq("entry_id", user.id).maybeSingle();
  if (already) return NextResponse.json({ ok: true, league, alreadyIn: true });

  const { error } = await db
    .from("league_members").insert({ league_id: league.id, entry_id: user.id });
  if (error) return bad(error.message, 500);

  return NextResponse.json({ ok: true, league });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
