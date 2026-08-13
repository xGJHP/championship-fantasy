import { KitPattern } from "@/lib/kit";

/**
 * 2026/27 Championship clubs.
 *
 * IP NOTE: no badges, no sponsors, no manufacturer marks and no official league
 * marks are used anywhere in this project. `primary` / `secondary` are
 * approximate, generically-chosen colours, and `pattern` is a generic
 * convention (stripes, hoops, halves) rather than a reproduction of any actual
 * kit. Both exist purely so clubs can be told apart on a small card: the
 * division has four clubs in red and white stripes and four more in plain red.
 * Club names are used as plain factual text.
 *
 * `fdId` = football-data.org team id. Null values are filled in automatically
 * the first time you run `npm run sync:fixtures`, which matches on name.
 */
export type ClubSeed = {
  code: string;
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  text: string;
  /** Generic pattern convention. Defaults to solid. */
  pattern: KitPattern;
  /** Stripe width as a percentage. Broad stripes read very differently to fine
   *  ones, which is what separates the four red and white striped clubs. */
  stripeWidth?: number;
  /** Hem colour, when it should differ from `secondary`. */
  trim?: string;
  fdId: number | null;
};

export const CLUBS: ClubSeed[] = [
  { code: "BIR", name: "Birmingham City", shortName: "Birmingham", primary: "#1B4CC4", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "BLB", name: "Blackburn Rovers", shortName: "Blackburn", primary: "#009EE0", secondary: "#FFFFFF", text: "#0B1220", pattern: "halves", fdId: null },
  { code: "BOL", name: "Bolton Wanderers", shortName: "Bolton", primary: "#FFFFFF", secondary: "#C8102E", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "BRC", name: "Bristol City", shortName: "Bristol City", primary: "#C8102E", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "BUR", name: "Burnley", shortName: "Burnley", primary: "#6C1D45", secondary: "#99D6EA", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "CAR", name: "Cardiff City", shortName: "Cardiff", primary: "#0070B5", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "CHA", name: "Charlton Athletic", shortName: "Charlton", primary: "#E8112D", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "DER", name: "Derby County", shortName: "Derby", primary: "#FFFFFF", secondary: "#1C1C1C", text: "#0B1220", pattern: "sleeves", fdId: null },
  { code: "LIN", name: "Lincoln City", shortName: "Lincoln", primary: "#C8102E", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "stripes", stripeWidth: 9, trim: "#0B0B0B", fdId: null },
  { code: "MID", name: "Middlesbrough", shortName: "Middlesbrough", primary: "#E21C38", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "band", fdId: null },
  { code: "MIL", name: "Millwall", shortName: "Millwall", primary: "#001D5C", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "NOR", name: "Norwich City", shortName: "Norwich", primary: "#FFF200", secondary: "#00A650", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "POR", name: "Portsmouth", shortName: "Portsmouth", primary: "#001489", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
  { code: "PRE", name: "Preston North End", shortName: "Preston", primary: "#FFFFFF", secondary: "#1A2B5C", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "QPR", name: "Queens Park Rangers", shortName: "QPR", primary: "#1D5BA4", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "hoops", stripeWidth: 16, fdId: null },
  { code: "SHU", name: "Sheffield United", shortName: "Sheff Utd", primary: "#EE2737", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "stripes", stripeWidth: 28, trim: "#0B0B0B", fdId: null },
  { code: "SOU", name: "Southampton", shortName: "Southampton", primary: "#D71920", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "stripes", stripeWidth: 18, trim: "#F5C518", fdId: null },
  { code: "STK", name: "Stoke City", shortName: "Stoke", primary: "#E03A3E", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "stripes", stripeWidth: 13, trim: "#1B2A5B", fdId: null },
  { code: "SWA", name: "Swansea City", shortName: "Swansea", primary: "#FFFFFF", secondary: "#000000", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "WAT", name: "Watford", shortName: "Watford", primary: "#FBEE23", secondary: "#000000", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "WBA", name: "West Bromwich Albion", shortName: "West Brom", primary: "#122F67", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "stripes", stripeWidth: 22, fdId: null },
  { code: "WHU", name: "West Ham United", shortName: "West Ham", primary: "#7A263A", secondary: "#1BB1E7", text: "#FFFFFF", pattern: "sleeves", fdId: null },
  { code: "WOL", name: "Wolverhampton Wanderers", shortName: "Wolves", primary: "#FDB913", secondary: "#000000", text: "#0B1220", pattern: "solid", fdId: null },
  { code: "WRX", name: "Wrexham", shortName: "Wrexham", primary: "#FF0000", secondary: "#FFFFFF", text: "#FFFFFF", pattern: "solid", fdId: null },
];
