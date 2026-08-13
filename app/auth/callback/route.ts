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

  /**
   * Redirect with a short code, never the provider's raw message. Those
   * messages name the SDK and mention other frameworks, and anything put in
   * the URL ends up in the page source.
   */
  const fail = (code: string) => NextResponse.redirect(`${origin}/login?error=${code}`);

  const codeFor = (msg: string) => {
    if (/expired/i.test(msg)) return "link_expired";
    if (/pkce|verifier/i.test(msg)) return "link_wrong_device";
    if (/rate limit/i.test(msg)) return "rate_limited";
    return "link_failed";
  };

  if (!hasSupabase()) return fail("unavailable");

  const linkError = searchParams.get("error_description") ?? searchParams.get("error");
  if (linkError) return fail(codeFor(linkError));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(codeFor(error.message));
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery",
      token_hash: tokenHash,
    });
    if (error) return fail(codeFor(error.message));
    return NextResponse.redirect(`${origin}${next}`);
  }

  return fail("link_failed");
}
