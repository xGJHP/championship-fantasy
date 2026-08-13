import { hasSupabase, createClient } from "./supabase/server";

export type AdminCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "no-supabase" | "signed-out" | "not-listed"; email?: string; allowed: string[] };

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function checkAdmin(): Promise<AdminCheck> {
  const allowed = adminEmails();
  if (!hasSupabase()) return { ok: false, reason: "no-supabase", allowed };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out", allowed };

  const email = (user.email ?? "").trim();
  // An empty ADMIN_EMAILS means anyone signed in can administer
  if (allowed.length > 0 && !allowed.some((a) => a.toLowerCase() === email.toLowerCase())) {
    return { ok: false, reason: "not-listed", email, allowed };
  }
  return { ok: true, email };
}
