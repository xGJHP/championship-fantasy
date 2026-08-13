"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/squad", label: "My Team" },
  { href: "/transfers", label: "Transfers" },
  { href: "/points", label: "Points" },
  { href: "/leagues", label: "Leagues" },
];

export default function SiteNav({ email, isAdmin }: { email: string | null; isAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="FCS home">
          <Logo size={28} className="transition group-hover:rotate-[24deg]" />
          <span className="font-display text-base font-extrabold tracking-tightest">FCS</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`press relative rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive(n.href) ? "text-white" : "text-mute hover:text-white"
              }`}
            >
              {n.label}
              {isActive(n.href) && (
                <span className="absolute inset-x-3 -bottom-[14px] h-px bg-accent" />
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className={`press hidden rounded-md px-3 py-1.5 text-sm font-medium sm:block ${
                pathname.startsWith("/admin") ? "text-white" : "text-mute hover:text-white"
              }`}
            >
              Admin
            </Link>
          )}
          {email ? (
            <>
              <span className="hidden max-w-[160px] truncate text-xs text-mute lg:block">
                {email}
              </span>
              <form action="/auth/signout" method="post">
                <button className="press rounded-md border border-line px-3 py-1.5 text-sm font-medium text-mute hover:border-bad/60 hover:text-bad">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="press rounded-md bg-accent px-3.5 py-1.5 text-sm font-bold text-ink hover:bg-accent2"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <nav className="flex gap-0.5 overflow-x-auto border-t border-line px-3 py-2 md:hidden" aria-label="Main">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? "page" : undefined}
            className={`press whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
              isActive(n.href)
                ? "bg-panel2 text-white"
                : "text-mute hover:bg-panel hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
