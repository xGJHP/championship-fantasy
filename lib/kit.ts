/**
 * Kit patterns for player cards.
 *
 * These are generic pattern conventions, stripes, hoops, halves, drawn in CSS
 * from two flat colours. No badge, sponsor, manufacturer mark or reproduction
 * of any actual kit is involved. The point is purely to tell clubs apart: the
 * Championship has four clubs in red and white stripes and four more in plain
 * red, and shade alone does not separate them on a small card.
 */
export type KitPattern = "solid" | "stripes" | "hoops" | "halves" | "sleeves" | "band";

export type KitColours = {
  primary: string;
  secondary: string;
  pattern?: KitPattern;
  /**
   * Width of one stripe as a percentage of the shirt, so clubs that share a
   * pattern and colour can still be told apart. Real kits genuinely differ
   * here: broad stripes read very differently to fine ones. Only used by
   * stripes and hoops. Defaults to 20, which gives five bands.
   */
  stripeWidth?: number;
  /** Trim colour for the hem, when it should differ from `secondary`. */
  trim?: string;
};

/** Background CSS for the shirt block on a player card. */
export function kitStyle(kit?: KitColours): React.CSSProperties {
  if (!kit) return { background: "#334155" };
  const { primary: p, secondary: s, pattern = "solid", stripeWidth = 20 } = kit;
  const w = stripeWidth;

  switch (pattern) {
    case "stripes":
      return {
        background: `repeating-linear-gradient(90deg, ${p} 0 ${w}%, ${s} ${w}% ${w * 2}%)`,
      };
    case "hoops":
      return {
        background: `repeating-linear-gradient(180deg, ${p} 0 ${w}%, ${s} ${w}% ${w * 2}%)`,
      };
    case "halves":
      return { background: `linear-gradient(90deg, ${p} 0 50%, ${s} 50% 100%)` };
    case "sleeves":
      return {
        background: `linear-gradient(90deg, ${s} 0 20%, ${p} 20% 80%, ${s} 80% 100%)`,
      };
    case "band":
      return {
        background: `linear-gradient(180deg, ${p} 0 40%, ${s} 40% 60%, ${p} 60% 100%)`,
      };
    case "solid":
    default:
      return { background: p };
  }
}

/** Hem colour for the bottom border of the shirt block. */
export function kitTrim(kit?: KitColours): string {
  return kit?.trim ?? kit?.secondary ?? "#FFFFFF";
}

/** A small swatch of the same kit, for lists and club grids. */
export function kitSwatchStyle(kit?: KitColours): React.CSSProperties {
  if (!kit) return { background: "#334155" };
  const { primary: p, pattern = "solid" } = kit;
  const s = kit.trim ?? kit.secondary;
  switch (pattern) {
    case "stripes":
    case "halves":
      // Too narrow for vertical bands, so show it as a split down the middle
      return { background: `linear-gradient(90deg, ${p} 0 50%, ${s} 50% 100%)` };
    case "hoops":
    case "band":
      return { background: `linear-gradient(180deg, ${p} 0 40%, ${s} 40% 60%, ${p} 60% 100%)` };
    case "sleeves":
      return { background: `linear-gradient(180deg, ${p} 0 70%, ${s} 70% 100%)` };
    default:
      return { background: p };
  }
}
