"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient, hasSupabase } from "@/lib/supabase/client";
import { friendlyAuthError, FriendlyError } from "@/lib/auth-errors";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") ?? "/squad";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(friendlyAuthError(params.get("error")));
  const [notice, setNotice] = useState<string | null>(null);

  const [linkMode, setLinkMode] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState("");

  const done = () => { router.push(next); router.refresh(); };

  const guard = () => {
    if (hasSupabase()) return true;
    setError({ message: "Sign in is not available right now." });
    return false;
  };

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    if (!guard()) return null;
    setBusy(true); setError(null); setNotice(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return false; }
    return true;
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 && mode === "signup") {
      setError({ message: "That password is too short.", hint: "Use at least 8 characters." });
      return;
    }
    const supabase = createClient();

    if (mode === "signin") {
      const ok = await run(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
      if (ok) done();
      return;
    }

    const ok = await run(() =>
      supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
    );
    if (!ok) return;

    // If confirmations are off, Supabase signs you straight in
    const { data } = await supabase.auth.getSession();
    if (data.session) { done(); return; }
    setNotice(
      "Account created. Check your email to confirm it, then come back and sign in."
    );
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const ok = await run(() =>
      supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
    );
    if (ok) setLinkSent(true);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const ok = await run(() =>
      supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
    );
    if (ok) done();
  };

  const field =
    "w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none placeholder:text-mute focus:border-accent";
  const button =
    "w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-ink hover:bg-accent2 disabled:opacity-50";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-2xl font-extrabold tracking-tightest">
        {linkMode ? "Sign in by email" : mode === "signin" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-1 text-sm text-mute">
        {linkMode
          ? "We will email you a link."
          : mode === "signin"
          ? "Welcome back."
          : "You need one to save a team and join a league."}
      </p>

      <div className="mt-5 rounded-xl border border-line bg-panel p-5">
        {!linkMode && (
          <>
            <div className="mb-4 flex gap-1 rounded-lg bg-ink p-1">
              {([["signin", "Sign in"], ["signup", "Create account"]] as [Mode, string][]).map(
                ([m, label]) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); setNotice(null); }}
                    className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                      mode === m ? "bg-accent text-ink" : "text-mute hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            <form onSubmit={submitPassword} className="space-y-3">
              <input
                type="email" required value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className={field}
              />
              <input
                type="password" required value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Choose a password, 8 or more characters" : "Password"}
                className={field}
              />
              <button type="submit" disabled={busy} className={button}>
                {busy ? "One moment" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </>
        )}

        {linkMode && !linkSent && (
          <form onSubmit={sendLink} className="space-y-3">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" className={field}
            />
            <button type="submit" disabled={busy} className={button}>
              {busy ? "Sending" : "Email me a link"}
            </button>
          </form>
        )}

        {linkMode && linkSent && (
          <div className="space-y-4">
            <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
              Sent to {email}. Open the link on this device. If your email also shows a six digit
              code, you can type it below instead.
            </p>
            <form onSubmit={verifyCode} className="space-y-3">
              <input
                inputMode="numeric" value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Six digit code"
                className={`${field} text-center text-lg font-black tracking-[0.3em] placeholder:text-sm placeholder:font-normal placeholder:tracking-normal`}
              />
              <button type="submit" disabled={busy || code.trim().length < 6} className={button}>
                {busy ? "Checking" : "Sign in with code"}
              </button>
            </form>
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
            {notice}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3">
            <p className="text-sm font-bold text-bad">{error.message}</p>
            {error.hint && <p className="mt-1 text-xs leading-relaxed text-mute">{error.hint}</p>}
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4 text-center">
          <button
            onClick={() => {
              setLinkMode(!linkMode); setLinkSent(false); setCode("");
              setError(null); setNotice(null);
            }}
            className="text-xs font-bold text-mute hover:text-accent"
          >
            {linkMode ? "Use a password instead" : "Or sign in with an email link"}
          </button>
        </div>
      </div>
    </div>
  );
}
