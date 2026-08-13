import { Position, ChipName } from "./types";
import { RULES, transferCost, fmtMoney } from "./rules";

/** A player currently in the manager's squad. */
export type SquadSlot = {
  player_id: number;
  position: Position;
  club_id: number;
  purchase_price: number;
  /** What the manager gets back if they sell, already adjusted for price rises */
  selling_price: number;
  slot: number;
};

/** A player available to buy. */
export type MarketPlayer = {
  id: number;
  position: Position;
  club_id: number;
  now_cost: number;
};

export type ProposedTransfer = { out_id: number; in_id: number };

export type TransferResult = {
  ok: boolean;
  errors: string[];
  bankAfter: number;
  transfersMade: number;
  freeUsed: number;
  pointsCost: number;
  resultingSquad: SquadSlot[];
};

export type ValidateInput = {
  squad: SquadSlot[];
  transfers: ProposedTransfer[];
  market: Map<number, MarketPlayer>;
  bank: number;
  freeTransfers: number;
  chip?: ChipName | null;
};

/**
 * Validate a set of transfers.
 *
 * Transfers are like for like: a defender can only be replaced by a defender,
 * because the 2/5/5/3 squad shape is fixed. Money comes from the SELLING price
 * of the player leaving, which is not always what they now cost.
 */
export function validateTransfers({
  squad, transfers, market, bank, freeTransfers, chip,
}: ValidateInput): TransferResult {
  const errors: string[] = [];
  const bySquadId = new Map(squad.map((s) => [s.player_id, s]));

  const outIds = transfers.map((t) => t.out_id);
  const inIds = transfers.map((t) => t.in_id);

  if (new Set(outIds).size !== outIds.length) {
    errors.push("You cannot sell the same player twice.");
  }
  if (new Set(inIds).size !== inIds.length) {
    errors.push("You cannot buy the same player twice.");
  }

  let money = bank;
  const resulting = [...squad];

  for (const t of transfers) {
    const out = bySquadId.get(t.out_id);
    const incoming = market.get(t.in_id);

    if (!out) { errors.push("One of the players you are selling is not in your squad."); continue; }
    if (!incoming) { errors.push("One of the players you are buying does not exist."); continue; }

    if (bySquadId.has(t.in_id)) {
      errors.push("You already own one of the players you are trying to buy.");
      continue;
    }
    if (out.position !== incoming.position) {
      errors.push(`You can only swap like for like. ${out.position} out means ${out.position} in.`);
      continue;
    }

    money += out.selling_price - incoming.now_cost;

    const idx = resulting.findIndex((s) => s.player_id === t.out_id);
    if (idx >= 0) {
      resulting[idx] = {
        ...resulting[idx],
        player_id: incoming.id,
        club_id: incoming.club_id,
        purchase_price: incoming.now_cost,
        selling_price: incoming.now_cost,
      };
    }
  }

  if (money < 0) errors.push(`You are ${fmtMoney(-money)} short.`);

  // The club limit applies to the squad as it ends up, not to each swap
  const byClub = new Map<number, number>();
  for (const s of resulting) byClub.set(s.club_id, (byClub.get(s.club_id) ?? 0) + 1);
  for (const [, n] of byClub) {
    if (n > RULES.maxPerClub) {
      errors.push(`That would leave you with more than ${RULES.maxPerClub} players from one club.`);
      break;
    }
  }

  if (new Set(resulting.map((s) => s.player_id)).size !== resulting.length) {
    errors.push("That would leave you with the same player twice.");
  }

  const transfersMade = transfers.length;
  const pointsCost = transferCost({ transfersMade, freeTransfers, chip });
  const freeUsed =
    chip === "wildcard" || chip === "freehit" ? 0 : Math.min(freeTransfers, transfersMade);

  return {
    ok: errors.length === 0,
    errors,
    bankAfter: money,
    transfersMade,
    freeUsed,
    pointsCost,
    resultingSquad: resulting,
  };
}

/**
 * Why this player cannot be bought right now, or null if they can.
 * Drives the greyed out rows in the transfer list.
 */
export function blockedReason(
  target: MarketPlayer,
  out: SquadSlot | null,
  squad: SquadSlot[],
  bank: number
): string | null {
  if (squad.some((s) => s.player_id === target.id)) return "Already in your squad";
  if (!out) return "Pick someone to sell first";
  if (out.position !== target.position) return `You need a ${out.position}`;

  const clubCount = squad.filter(
    (s) => s.club_id === target.club_id && s.player_id !== out.player_id
  ).length;
  if (clubCount >= RULES.maxPerClub) return `Max ${RULES.maxPerClub} from that club`;

  const affordable = bank + out.selling_price;
  if (target.now_cost > affordable) return `You can afford ${fmtMoney(affordable)}`;

  return null;
}
