"use client";

import { useRouter } from "next/navigation";

export default function GameweekPicker({
  gameweeks, current, basePath = "/points",
}: { gameweeks: number[]; current: number; basePath?: string }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`${basePath}?gw=${e.target.value}`)}
      className="rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
      aria-label="Choose a gameweek"
    >
      {gameweeks.map((g) => (
        <option key={g} value={g}>Gameweek {g}</option>
      ))}
    </select>
  );
}
