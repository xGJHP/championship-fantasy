import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";

/**
 * Where the magic link lands. Supabase sends either a PKCE `code` or an older
 * `token_hash`, depending on your email template, so handle both.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/squad";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  if (!hasSupabase()) return fail("Supabase is not configured on the server.");

  const linkError = searchParams.get("error_description") ?? searchParams.get("error");
  if (linkError) return fail(linkError);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery",
      token_hash: tokenHash,
    });
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  return fail("That link did not carry a login code. Try the 6 digit code instead.");
}
