/**
 * The FCS mark.
 *
 * Two interlocking arms of dots, each growing from small to large as it sweeps
 * round, giving the form momentum in one direction. Drawn from geometry rather
 * than hand-placed paths so the proportions stay exact at any size, and so the
 * dot count can be reduced for small renders where fine dots would turn to mush.
 */

const AMBER = "#E9A23B";
const DEEP = "#8A5A16";

type Arm = { start: number; sweep: number; radius: number; spiral: number };
const ARM: Arm = { start: 200, sweep: 300, radius: 30, spiral: 4 };

function dots(arm: Arm, n: number, rFrom: number, rTo: number, rotate = 0) {
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = ((arm.start + rotate + arm.sweep * t) * Math.PI) / 180;
    const rad = arm.radius + arm.spiral * t;
    out.push({
      x: 50 + rad * Math.cos(a),
      y: 50 + rad * Math.sin(a),
      r: rFrom + (rTo - rFrom) * t,
    });
  }
  return out;
}

export default function Logo({
  size = 28,
  className,
  title = "FCS",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // Below about 20px the finest dots stop resolving, so thin them out
  const n = size < 20 ? 11 : 15;
  const rFrom = size < 20 ? 2.4 : 1.6;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      {dots(ARM, n, rFrom, 7.4).map((d, i) => (
        <circle key={`a${i}`} cx={d.x} cy={d.y} r={d.r} fill={AMBER} />
      ))}
      {dots(ARM, n, rFrom, 7.4, 180).map((d, i) => (
        <circle key={`b${i}`} cx={d.x} cy={d.y} r={d.r} fill={DEEP} />
      ))}
    </svg>
  );
}
