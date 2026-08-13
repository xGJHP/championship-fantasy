import { CLUBS } from "./clubs";
import { Player, Position } from "@/lib/types";

/**
 * Deterministic demo squad pool so the UI is clickable before you have a
 * database or a real player list. Names here are FICTIONAL placeholders.
 * Replace by importing a real squad list via the admin panel.
 */
const FIRST = [
  "Callum","Reece","Josh","Tyler","Kian","Marcus","Elliot","Nathan","Owen","Dominic",
  "Rhys","Jaden","Louie","Freddie","Kaide","Samir","Theo","Ollie","Zak","Isaac",
  "Malachi","Corey","Finn","Brandon","Leo","Aaron","Jude","Cole","Ronan","Milan",
];
const LAST = [
  "Whitmore","Ashcroft","Beddoe","Cranston","Dunmore","Ellery","Fairhurst","Garrity",
  "Hollins","Ingleby","Jarvis","Kilbane","Lowther","Mowbray","Naylor","Ottley",
  "Pennington","Quigley","Radcliffe","Stainton","Thurlow","Umbers","Vance","Wardle",
  "Yeardley","Ziegler","Fenwick","Bramall","Coley","Dearden",
];

/** 2 GK, 7 DEF, 7 MID, 4 FWD per club = 20 x 24 = 480 players */
const SHAPE: [Position, number][] = [["GK", 2], ["DEF", 7], ["MID", 7], ["FWD", 4]];

const PRICE_BANDS: Record<Position, number[]> = {
  GK:  [45, 45, 44, 43, 42, 40],
  DEF: [55, 50, 48, 45, 43, 42, 40],
  MID: [75, 68, 62, 58, 54, 50, 45],
  FWD: [80, 72, 65, 58, 52, 48],
};

// Tiny deterministic PRNG so the demo pool is identical on every render
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildDemoPlayers(): Player[] {
  const out: Player[] = [];
  let id = 1;

  CLUBS.forEach((club, ci) => {
    const r = rng(1000 + ci * 97);
    SHAPE.forEach(([pos, count]) => {
      const band = PRICE_BANDS[pos];
      for (let i = 0; i < count; i++) {
        const base = band[Math.min(i, band.length - 1)];
        const jitter = Math.round((r() - 0.5) * 6);
        const cost = Math.max(38, Math.min(120, base + jitter));

        const fn = FIRST[(id * 7 + ci) % FIRST.length];
        const ln = LAST[(id * 11 + ci * 3) % LAST.length];
        const mins = Math.round(r() * 2400);
        const pts = Math.round((cost - 35) * (0.6 + r() * 1.1));

        out.push({
          id: id++,
          club_id: ci + 1,
          web_name: ln,
          first_name: fn,
          last_name: ln,
          position: pos,
          now_cost: cost,
          start_cost: cost,
          total_points: pts,
          form: Math.round(r() * 60) / 10,
          minutes: mins,
          goals_scored: pos === "FWD" ? Math.round(r() * 14) : Math.round(r() * 5),
          assists: Math.round(r() * 8),
          clean_sheets: pos === "GK" || pos === "DEF" ? Math.round(r() * 12) : 0,
          goals_conceded: pos === "GK" || pos === "DEF" ? Math.round(r() * 40) : 0,
          own_goals: 0,
          penalties_saved: 0,
          penalties_missed: 0,
          yellow_cards: Math.round(r() * 8),
          red_cards: r() > 0.94 ? 1 : 0,
          saves: pos === "GK" ? Math.round(r() * 110) : 0,
          bonus: Math.round(r() * 14),
          bps: Math.round(r() * 500),
          status: r() > 0.93 ? "i" : r() > 0.88 ? "d" : "a",
          news: null,
          chance_of_playing: null,
          selected_by_percent: Math.round(r() * 350) / 10,
        });
      }
    });
  });

  return out;
}

export const DEMO_PLAYERS = buildDemoPlayers();
