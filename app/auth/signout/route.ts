import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (hasSupabase()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
