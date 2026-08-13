import Link from "next/link";
import { CLUBS } from "@/data/clubs";
import { kitSwatchStyle } from "@/lib/kit";

const SCORING = [
  { k: "Appearance", v: "1", n: "2 points once past the hour" },
  { k: "Goal", v: "4-6", n: "6 at the back, 5 in midfield, 4 up front" },
  { k: "Assist", v: "3", n: "Same for everyone" },
  { k: "Clean sheet", v: "4", n: "1 for a midfielder, nothing up front" },
  { k: "Bonus", v: "3-1", n: "To the best performers in each match" },
  { k: "Yellow card", v: "-1", n: "A red is -3" },
];

export default function Home() {
  return (
    <div className="space-y-24">
      <section className="rise">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] font-medium tracking-wide text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Second tier fantasy football
        </p>

        <h1 className="max-w-[16ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tightest sm:text-6xl md:text-7xl">
          The fantasy game the Championship actually deserves.
        </h1>

        <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-mute">
          A hundred million pounds, fifteen players, three from any one club. Captains,
          chips, price rises and a mini-league to lord it over your mates in. The rules you
          already know, the twenty-four clubs you actually watch.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/squad"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-ink hover:bg-accent2"
          >
            Pick your squad
          </Link>
          <Link
            href="/leagues"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-bold text-mute hover:border-mute hover:text-white"
          >
            Join a mini-league
          </Link>
        </div>
      </section>

      {/* Asymmetric split rather than a row of equal cards */}
      <section className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tightest">
            How it scores
          </h2>
          <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-mute">
            Identical to the game you already play every August, so there is nothing new to
            learn. Bonus points are ranked by a behind-the-scenes score, same as always.
          </p>
        </div>

        <dl className="divide-y divide-line border-y border-line">
          {SCORING.map((s) => (
            <div key={s.k} className="flex items-baseline gap-4 py-3.5">
              <dt className="w-32 shrink-0 text-sm font-medium text-white">{s.k}</dt>
              <dd className="tabular w-14 shrink-0 font-display text-lg font-bold text-accent">
                {s.v}
              </dd>
              <dd className="text-sm text-mute">{s.n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold tracking-tightest">
            {CLUBS.length} clubs
          </h2>
          <span className="text-xs text-mute">2026/27</span>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3 lg:grid-cols-4">
          {CLUBS.map((c) => (
            <li
              key={c.code}
              className="flex items-center gap-2.5 border-b border-line py-2.5 text-sm"
            >
              <span
                className="h-4 w-[3px] shrink-0 rounded-full"
                style={kitSwatchStyle(c)}
                aria-hidden="true"
              />
              <span className="truncate text-mute">{c.shortName}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 max-w-[60ch] text-xs leading-relaxed text-mute">
          Colour bars are generic and approximate. No badges, kits or sponsor marks are used
          anywhere in this game.
        </p>
      </section>
    </div>
  );
}
