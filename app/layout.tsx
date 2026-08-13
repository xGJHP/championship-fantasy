import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import "./globals.css";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import SiteNav from "@/components/SiteNav";

const display = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://championshipfantasy.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "FCS", template: "%s · FCS" },
  description:
    "A fantasy football game for the second tier of English football. Twenty-four clubs, one hundred million pounds, fifteen players. Unofficial and not affiliated with any league or club.",
  openGraph: {
    title: "FCS",
    description:
      "Twenty-four clubs, one hundred million pounds, fifteen players. The rules you already know, for the league you actually watch.",
    url: SITE_URL,
    siteName: "FCS",
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FCS",
    description:
      "Fantasy football for the second tier of English football.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
};

async function getUser() {
  if (!hasSupabase()) return null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = !!user && (admins.length === 0 || admins.includes(user.email ?? ""));

  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-[100dvh] bg-ink font-sans text-slate-50">
        <div className="grain" aria-hidden="true" />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-ink"
        >
          Skip to content
        </a>

        <SiteNav email={user?.email ?? null} isAdmin={isAdmin} />

        <main id="main" className="relative z-[2] mx-auto max-w-6xl px-4 py-8 md:py-10">
          {children}
        </main>

        <footer className="relative z-[2] mt-24 border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <p className="max-w-[60ch] text-xs leading-relaxed text-mute">
              FCS is an independent fantasy game. It is not affiliated with, endorsed by, or
              connected to the English Football League, any of its competitions, or any football
              club. No club badges, kits, sponsor marks or league branding are used. Player and
              club names appear as plain factual text, and club colours are generic and
              approximate.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
