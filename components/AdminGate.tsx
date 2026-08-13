import Link from "next/link";
import { AdminCheck } from "@/lib/admin";

/** Explains exactly why admin access was refused, rather than just refusing. */
export default function AdminGate({ check, next }: { check: AdminCheck; next: string }) {
  if (check.ok) return null;

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-panel p-6">
      {check.reason === "no-supabase" && (
        <>
          <h1 className="text-lg font-black">Supabase is not configured</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Add your keys to <code className="text-accent">.env.local</code> and restart the dev
            server. Run <code className="text-accent">npm run check-env</code> to confirm.
          </p>
        </>
      )}

      {check.reason === "signed-out" && (
        <>
          <h1 className="text-lg font-black">You are not signed in</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Admin pages need a signed in account.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink"
          >
            Sign in
          </Link>
        </>
      )}

      {check.reason === "not-listed" && (
        <>
          <h1 className="text-lg font-black">That account is not an admin</h1>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-mute">You are signed in as</dt>
              <dd className="font-mono text-accent">{check.email || "(no email on account)"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-mute">ADMIN_EMAILS allows</dt>
              <dd className="font-mono text-white">
                {check.allowed.length ? check.allowed.join(", ") : "(empty, so nobody)"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-mute">
            Add this address to <code className="text-accent">ADMIN_EMAILS</code> in{" "}
            <code className="text-accent">.env.local</code>, then stop and restart the dev server.
            Environment changes only load at startup.
          </p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-mute hover:border-bad hover:text-bad">
              Sign out and try another account
            </button>
          </form>
        </>
      )}
    </div>
  );
}
