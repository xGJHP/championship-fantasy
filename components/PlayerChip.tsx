"use client";
import { Player, Position } from "@/lib/types";
import { ClubSeed } from "@/data/clubs";
import { fmtMoney } from "@/lib/rules";
import { kitStyle, kitTrim } from "@/lib/kit";

type Props = {
  player: Player | null;
  club?: ClubSeed;
  position: Position;
  isCaptain?: boolean;
  isVice?: boolean;
  subtitle?: string;
  /** Short label for the card. Defaults to the full name when not supplied. */
  displayName?: string;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  dropping?: boolean;
  compact?: boolean;
};

export default function PlayerChip({
  player, club, position, isCaptain, isVice, subtitle, displayName,
  onClick, onDragStart, onDragOver, onDrop, dropping, compact,
}: Props) {
  if (!player) {
    return (
      <button
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`flex ${compact ? "h-[62px] w-[64px]" : "h-[74px] w-[76px]"} flex-col items-center justify-center rounded-lg border border-dashed border-white/25 bg-white/5 text-[10px] font-semibold text-white/60 transition hover:border-accent hover:text-accent ${dropping ? "slot-drop" : ""}`}
      >
        <span className="text-lg leading-none">+</span>
        <span className="mt-1">{position}</span>
      </button>
    );
  }

  const fg = club?.text ?? "#FFFFFF";
  const hem = kitTrim(club);
  const flagged = player.status !== "a";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      className={`group relative cursor-grab select-none active:cursor-grabbing ${dropping ? "slot-drop rounded-lg" : ""}`}
      title={`${player.first_name} ${player.last_name} - ${club?.shortName ?? ""}`}
    >
      <div
        className={`flex ${compact ? "h-[42px] w-[64px]" : "h-[50px] w-[76px]"} items-end justify-center rounded-t-lg border-b-[3px] shadow-sm transition group-hover:brightness-110`}
        style={{ ...kitStyle(club), borderColor: hem }}
      >
        <div className="mb-1 flex items-center gap-0.5">
          {isCaptain && (
            <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-black text-ink">C</span>
          )}
          {isVice && (
            <span className="grid h-4 w-4 place-items-center rounded-full bg-white/85 text-[9px] font-black text-ink">V</span>
          )}
          {flagged && (
            <span
              className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-ink ${player.status === "d" ? "bg-warn" : "bg-bad"}`}
            >
              !
            </span>
          )}
        </div>
        <span className="sr-only" style={{ color: fg }}>{club?.shortName}</span>
      </div>

      <div className={`${compact ? "w-[64px]" : "w-[76px]"} truncate rounded-b-lg bg-panel2 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-white`}>
        {displayName ?? player.web_name}
      </div>
      <div className={`${compact ? "w-[64px]" : "w-[76px]"} rounded-b-lg bg-panel px-1 py-0.5 text-center text-[10px] font-semibold leading-tight text-mute`}>
        {subtitle ?? fmtMoney(player.now_cost)}
      </div>
    </div>
  );
}
