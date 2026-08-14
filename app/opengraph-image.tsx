import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "FCS, fantasy football for the second tier of English football";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AMBER = "#E9A23B";
// Lighter than the site's second arm. On a 1200x630 dark canvas the original
// #8A5A16 sinks into the background and the mark reads as a broken ring.
const DEEP = "#B87D2C";

/**
 * The same mark as the site, rebuilt from geometry.
 *
 * Satori, which renders this image, does not run SVG the way a browser does,
 * so the dots are plain absolutely positioned divs with a border radius. The
 * maths matches components/Logo.tsx, so the two cannot drift apart visually.
 */
function logoDots(box: number) {
  const dots: { x: number; y: number; r: number; fill: string }[] = [];
  const n = 15;
  for (const [rotate, fill] of [[0, AMBER], [180, DEEP]] as [number, string][]) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = ((200 + rotate + 300 * t) * Math.PI) / 180;
      const rad = 30 + 4 * t;
      const r = 1.6 + (7.4 - 1.6) * t;
      dots.push({
        x: (50 + rad * Math.cos(a)) * (box / 100),
        y: (50 + rad * Math.sin(a)) * (box / 100),
        r: r * (box / 100),
        fill,
      });
    }
  }
  return dots;
}

/**
 * Satori only has one weight unless you hand it a real font file, so
 * fontWeight is silently ignored and everything renders regular. Fetching
 * Outfit fixes that and keeps the card on brand. Wrapped so a network blip
 * at build time degrades to the default font rather than failing the build.
 */
async function outfit(weight: 400 | 700) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const box = 168;

  const [regular, bold] = await Promise.all([outfit(400), outfit(700)]);
  const fonts = [
    regular && { name: "Outfit", data: regular, weight: 400 as const, style: "normal" as const },
    bold && { name: "Outfit", data: bold, weight: 700 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0A0A0B",
          backgroundImage:
            "radial-gradient(900px 500px at 78% -10%, rgba(233,162,59,0.16), rgba(10,10,11,0) 70%)",
          padding: "60px 72px",
          fontFamily: fonts.length ? "Outfit" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ position: "relative", width: box, height: box, display: "flex" }}>
            {logoDots(box).map((d, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: d.r * 2,
                  background: d.fill,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 84, fontWeight: 700, color: "#FAFAFA", letterSpacing: -3 }}>
              FCS
            </div>
            <div style={{ fontSize: 24, color: "#8B8B93", marginTop: -4 }}>
              championshipfantasy.com
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#FAFAFA",
              letterSpacing: -2.5,
              lineHeight: 1.02,
              maxWidth: 980,
            }}
          >
            The fantasy game the Championship actually deserves.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30 }}>
            {["24 clubs", "£100m", "15 players"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: "#0A0A0B",
                  background: AMBER,
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontWeight: 700,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
