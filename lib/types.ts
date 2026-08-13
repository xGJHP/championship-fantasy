export type Position = "GK" | "DEF" | "MID" | "FWD";

export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

export type Club = {
  id: number;
  code: string;
  name: string;
  short_name: string;
  primary_colour: string;
  secondary_colour: string;
  text_colour: string;
};

export type Player = {
  id: number;
  club_id: number;
  web_name: string;
  first_name: string | null;
  last_name: string | null;
  position: Position;
  now_cost: number;          // tenths of a million, e.g. 55 = GBP 5.5m
  start_cost: number;
  total_points: number;
  form: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  status: PlayerStatus;
  news: string | null;
  chance_of_playing: number | null;
  selected_by_percent: number;
};

/** a = available, d = doubtful, i = injured, s = suspended, u = unavailable */
export type PlayerStatus = "a" | "d" | "i" | "s" | "u";

/** Raw match stats for one player in one fixture. This is what the admin enters. */
export type PlayerMatchStats = {
  minutes: number;
  goals_scored: number;
  assists: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  /** Optional richer stats. Only used if ENABLE_DEFCON / ENABLE_FULL_BPS are on. */
  clearances_blocks_interceptions?: number;
  tackles?: number;
  recoveries?: number;
  key_passes?: number;
  big_chances_created?: number;
  errors_leading_to_goal?: number;
  penalties_conceded?: number;
  big_chances_missed?: number;
};

export const EMPTY_STATS: PlayerMatchStats = {
  minutes: 0,
  goals_scored: 0,
  assists: 0,
  goals_conceded: 0,
  own_goals: 0,
  penalties_saved: 0,
  penalties_missed: 0,
  yellow_cards: 0,
  red_cards: 0,
  saves: 0,
};

export type ChipName = "wildcard" | "freehit" | "bboost" | "3xc";

export type Pick = {
  player_id: number;
  /** 1-11 = starting XI in pitch order, 12-15 = bench in sub order */
  slot: number;
  is_captain: boolean;
  is_vice_captain: boolean;
};
