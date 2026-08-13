/**
 * Price change engine.
 *
 * Two different granularities, deliberately:
 *
 *   STARTING prices sit on 0.5m boundaries. 5.5m and 6.0m are legal, 5.8m is
 *   not. That is what `data/players_full.csv` ships and what `start_cost`
 *   holds.
 *
 *   IN-SEASON prices drift in 0.1m steps, exactly as in FPL. So a player who
 *   starts at 6.0m can be 6.3m by October. `now_cost` is free to sit anywhere.
 *
 * FPL never publishes its exact formula. This is a transparent, tunable
 * approximation: a player's price moves when their net transfer activity, as a
 * share of the active manager base, crosses a threshold.
 */

/** Starting prices only exist on this boundary: 0.5m, in tenths of a million. */
export const START_STEP = 5;

export const PRICING = {
  /** Net transfers in, as a fraction of active managers, to trigger a rise */
  riseThreshold: 0.06,
  /** Net transfers out, as a fraction of active managers, to trigger a fall */
  fallThreshold: 0.06,
  /** Max movement per player per gameweek, in tenths of a million */
  maxRisePerGw: 3,
  maxFallPerGw: 3,
  /** Hard floor and ceiling for an in-season price, in tenths of a million */
  minPrice: 38,
  maxPrice: 150,
  /** No price changes until this many managers have registered */
  minActiveManagers: 50,
};

/** Round to the nearest 0.5m. Use when setting a STARTING price. */
export function snapStartPrice(tenths: number): number {
  return Math.round(tenths / START_STEP) * START_STEP;
}

/** True if a STARTING price sits on a legal 0.5m boundary. */
export function isValidStartPrice(tenths: number): boolean {
  return Number.isInteger(tenths) && tenths % START_STEP === 0;
}

export type PriceInput = {
  player_id: number;
  now_cost: number;
  start_cost: number;
  transfers_in_gw: number;
  transfers_out_gw: number;
};

export type PriceChange = {
  player_id: number;
  from: number;
  to: number;
  delta: number;
};

export function computePriceChanges(
  players: PriceInput[],
  activeManagers: number
): PriceChange[] {
  if (activeManagers < PRICING.minActiveManagers) return [];

  const changes: PriceChange[] = [];

  for (const p of players) {
    const net = p.transfers_in_gw - p.transfers_out_gw;
    const share = net / activeManagers;

    // Movement is in 0.1m increments, so a price can drift off the 0.5m grid
    // once the season is under way. That is intended.
    let delta = 0;
    if (share >= PRICING.riseThreshold) {
      delta = Math.min(PRICING.maxRisePerGw, Math.floor(share / PRICING.riseThreshold));
    } else if (-share >= PRICING.fallThreshold) {
      delta = -Math.min(PRICING.maxFallPerGw, Math.floor(-share / PRICING.fallThreshold));
    }

    if (delta === 0) continue;

    const to = clamp(p.now_cost + delta, PRICING.minPrice, PRICING.maxPrice);
    if (to === p.now_cost) continue;

    changes.push({ player_id: p.player_id, from: p.now_cost, to, delta: to - p.now_cost });
  }

  return changes;
}

/**
 * What a manager gets back when selling.
 *
 * You keep half of any rise, rounded down to the nearest 0.1m. Falls are
 * absorbed in full. Exactly as in FPL.
 */
export function sellingPrice(purchasePrice: number, currentPrice: number): number {
  if (currentPrice <= purchasePrice) return currentPrice;
  const rise = currentPrice - purchasePrice;
  return purchasePrice + Math.floor(rise / 2);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
