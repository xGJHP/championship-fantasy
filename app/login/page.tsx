"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient, hasSupabase } from "@/lib/supabase/client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "password" | "link";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") ?? "/squad";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));

  const guard = () => {
    if (!hasSupabase()) {
      setError("Supabase is not configured. Add your keys to .env.local and restart the dev server.");
      return false;
    }
    return true;
  };

  const done = () => { router.push(next); router.refresh(); };

  const signInPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guard()) return;
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(), password,
    });
    setBusy(false);
    if (error) setError(error.message); else done();
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guard()) return;
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) setError(error.message); else done();
  };

  const rateLimited = /rate limit/i.test(error ?? "");

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-line bg-panel p-6">
      <h1 className="text-xl font-black tracking-tight">Sign in</h1>

      <div className="mt-4 flex gap-1 rounded-lg bg-ink p-1">
        {(["password", "link"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setSent(false); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
              mode === m ? "bg-accent text-ink" : "text-mute hover:text-white"
            }`}
          >
            {m === "password" ? "Password" : "Email link"}
          </button>
        ))}
      </div>

      {mode === "password" && (
        <form onSubmit={signInPassword} className="mt-4 space-y-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="username"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
          />
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoComplete="current-password"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
          />
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-black text-ink disabled:opacity-50">
            {busy ? "Signing in" : "Sign in"}
          </button>
          <p className="text-[11px] leading-relaxed text-mute">
            No password yet? In Supabase go to Authentication, Users, Add user, tick
            Auto Confirm User, and set one. No email gets sent, so this always works.
          </p>
        </form>
      )}

      {mode === "link" && !sent && (
        <form onSubmit={sendLink} className="mt-4 space-y-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
          />
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-black text-ink disabled:opacity-50">
            {busy ? "Sending" : "Email me a link"}
          </button>
        </form>
      )}

      {mode === "link" && sent && (
        <div className="mt-4 space-y-4">
          <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
            Sent to {email}. Click the link, or paste the code below.
          </p>
          <form onSubmit={verifyCode} className="space-y-3">
            <input
              inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="6 digit code"
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-center text-lg font-black tracking-[0.3em] outline-none placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-mute focus:border-accent"
            />
            <button type="submit" disabled={busy || code.trim().length < 6}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-black text-ink disabled:opacity-50">
              {busy ? "Checking" : "Sign in with code"}
            </button>
          </form>
          <button onClick={() => { setSent(false); setCode(""); setError(null); }}
            className="w-full text-xs text-mute underline">Use a different email</button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs leading-relaxed">
          <p className="font-bold text-bad">{error}</p>
          {rateLimited ? (
            <div className="mt-2 space-y-1.5 text-mute">
              <p>
                This is Supabase's built in email sender, which allows only a couple of
                messages per hour on the free tier. It is not your setup.
              </p>
              <p className="font-bold text-white">
                Switch to the Password tab. Create yourself a user in Supabase under
                Authentication, Users, Add user, with Auto Confirm ticked. No email is sent
                and the limit does not apply.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-mute">
              If the link bounced you back here, check Supabase, Authentication, URL
              Configuration, and make sure{" "}
              <code className="text-accent">http://localhost:3000/**</code> is in the redirect
              allow list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
