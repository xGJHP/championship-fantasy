"""
FCS pricing model.

Prices are driven by expected FANTASY output, not squad value:
  1. Last season's goals and assists where known (the strongest signal)
  2. Transfermarkt market value as a fallback quality proxy
  3. Position role: defensive mids are discounted, wingers and set-piece
     takers are not
  4. Manual anchors for the handful of players everyone will look for first

Costs are tenths of a million: 55 == GBP 5.5m
"""
import csv, math, collections, json, os

CLUB_ORDER = ["BIR","BLB","BOL","BRC","BUR","CAR","CHA","DER","LIN","MID","MIL","NOR",
              "POR","PRE","QPR","SHU","SOU","STK","SWA","WAT","WBA","WHU","WOL","WRX"]
CLUB_ID = {c: i + 1 for i, c in enumerate(CLUB_ORDER)}
PROMOTED = {"LIN", "CAR", "BOL"}

# Transfermarkt position -> FPL position. Wingers are midfielders, as in FPL.
POS = {
    "GK": "GK",
    "CB": "DEF", "LB": "DEF", "RB": "DEF",
    "DM": "MID", "CM": "MID", "AM": "MID", "LM": "MID", "RM": "MID", "LW": "MID", "RW": "MID",
    "CF": "FWD", "SS": "FWD",
}

# 2025/26 league output: name -> (goals, assists). Championship unless noted.
STATS = {
    "Zan Vipotnik": (23, 3), "Josh Windass": (16, 2), "Morgan Whittaker": (14, 4),
    "Tommy Conway": (13, 2), "Carlton Morris": (12, 3), "Patrick Bamford": (12, 2),
    "Adam Armstrong": (11, 4), "Adrian Segecic": (11, 3), "Femi Azeez": (11, 2),
    "Finn Azaz": (11, 8), "Kieffer Moore": (11, 1), "Scott Twine": (11, 6),
    "Will Lankshear": (11, 1), "Jay Stansfield": (10, 4), "Jovon Makama": (10, 2),
    "Lewis Dobbin": (10, 8), "Marvin Ducksch": (10, 4), "Patrick Agyemang": (10, 2),
    "Richard Kone": (10, 2), "Rumarn Burrell": (10, 1), "Sorba Thomas": (10, 11),
    "Yuki Ohashi": (10, 2), "Divin Mubama": (8, 2), "Mohamed Toure": (8, 2),
    "Leo Scienza": (5, 10), "Josh Tymon": (2, 9), "Imran Louza": (6, 9),
    "Mikey Johnston": (5, 9), "Ryoya Morishita": (4, 9), "Joe Ward": (3, 8),
    # Premier League 2025/26, relegated clubs
    "Jarrod Bowen": (9, 11), "Zian Flemming": (11, 2), "Taty Castellanos": (8, 4),
    "Niclas Fullkrug": (5, 1), "Hee-chan Hwang": (3, 2), "Rodrigo Gomes": (3, 3),
    "Santiago Bueno": (3, 0), "Raul Jimenez": (4, 3), "Lyle Foster": (5, 2),
    "Marcus Edwards": (3, 4), "Hannibal": (3, 3), "Armando Broja": (3, 1),
}

# Hard anchors, in tenths of a million. These win over everything else.
ANCHOR = {
    "Jarrod Bowen": 115,      # Joey's anchor: 11-12m
    "Zan Vipotnik": 95,       # Golden Boot, 23 goals
    "Raul Jimenez": 90,       # Joey's anchor: 9-10m
    "Taty Castellanos": 90,
    "Sorba Thomas": 90,       # 10 goals AND 11 assists
    "Finn Azaz": 85,
    "Morgan Whittaker": 85,
    "Zian Flemming": 80,
    "Scott Twine": 80,        # set pieces
    "Josh Windass": 80,
    "Tommy Conway": 80,
    "Jay Stansfield": 75,
    "Lewis Dobbin": 75,
    "Leo Scienza": 75,
    "Carlton Morris": 75,
    "Patrick Agyemang": 70,
    "Imran Louza": 70,        # set pieces
    "Femi Azeez": 70,
    "Adrian Segecic": 70,
    "Richard Kone": 70,
    "Patrick Bamford": 70,
    "Adam Armstrong": 70,
    "Josh Tymon": 60,         # 9 assists from left-back, premium defender
    "Marvin Ducksch": 70,
    "Will Lankshear": 65,
    "Mikey Johnston": 65,
    "Jovon Makama": 65,
    "Rumarn Burrell": 65,
    "Yuki Ohashi": 65,
    "Kieffer Moore": 60,
    "Ryoya Morishita": 60,
    "Mohamed Toure": 60,
    "Divin Mubama": 60,
    "Joe Ward": 55,
    # Set-piece takers and primary creators. Dead balls are worth real fantasy
    # points and none of this shows up in a market value.
    "James Ward-Prowse": 60,
    "Sammie Szmodics": 60,
    "Nathan Broadhead": 60,
    "Ilias Chair": 55,
    "Kieran Trippier": 55,
    "Harrison Burrows": 55,
    "Alfie Doughty": 50,
    "Callum O'Hare": 55,
    "Patrick Roberts": 55,
    "Demarai Gray": 55,
    "Todd Cantwell": 50,
    "John Swift": 50,
    "Alex Mowatt": 50,
    "Jed Wallace": 50,
    "Josh Murphy": 50,
    # Established Championship starters the depth ranking pushed too low
    "Kyle Walker-Peters": 50,
    "Maximilian Kilman": 50,
    "Aaron Wan-Bissaka": 50,
    "Conor Coady": 45,
    "Jake Cooper": 45,
    "Josh Coburn": 60,
    "Mihailo Ivanovic": 60,
    "Emil Riis": 60,
    "Cameron Archer": 60,
    "Lyle Foster": 60,
}

# Total squad market value in EUR millions, from the Transfermarkt league page.
# Used as a proxy for team strength, which drives clean sheet pricing.
TEAM_MV = {
    "WHU":282.2,"WOL":264.9,"SOU":187.9,"MID":139.0,"BUR":115.3,"NOR":106.9,
    "SHU":98.6,"BIR":93.1,"SWA":90.8,"WAT":88.5,"MIL":85.4,"WRX":84.1,
    "STK":78.7,"QPR":74.0,"BRC":65.9,"DER":56.2,"WBA":53.6,"PRE":45.5,
    "BLB":36.3,"POR":34.9,"CHA":31.4,"CAR":29.2,"BOL":17.4,"LIN":12.0,
}
_lo, _hi = min(TEAM_MV.values()), max(TEAM_MV.values())
def tier(club):
    """0.0 for the weakest squad, 1.0 for the strongest, on a log scale."""
    import math
    return (math.log(TEAM_MV[club]) - math.log(_lo)) / (math.log(_hi) - math.log(_lo))

# Upper bounds are deliberately generous headroom, not targets. The model rarely
# reaches them; ANCHOR is what actually sets the top-end prices. Raise these if
# you ever anchor someone above the ceiling.
# GK, DEF and FWD ceilings are real design decisions and they bind: the top
# keeper is meant to be 5.5m. Only MID has loose headroom, because ANCHOR sets
# the premium prices and Bowen may go higher. Raise a ceiling only if you
# actually intend that position to get more expensive.
CAP = {"GK": (40, 55), "DEF": (40, 70), "MID": (45, 150), "FWD": (45, 100)}
MV_DIV = {"GK": 1300, "DEF": 1400, "MID": 1500, "FWD": 1400}
MV_CAP = {"GK": 12, "DEF": 16, "MID": 18, "FWD": 16}
# Attacking return weights, per position
G_W = {"GK": 0, "DEF": 3.0, "MID": 2.2, "FWD": 2.0}
A_W = {"GK": 0, "DEF": 3.0, "MID": 2.2, "FWD": 1.8}


STEP = 5  # 0.5m, in tenths of a million

def snap(tenths):
    """Round to the nearest 0.5m. Prices only ever exist on these boundaries."""
    return int(round(tenths / STEP) * STEP)


def price(club, name, tmpos, mv, depth):
    """depth = rank within club and position by market value, 0 = first choice."""
    pos = POS[tmpos]
    lo, hi = CAP[pos]

    if name in ANCHOR:
        return pos, ANCHOR[name]

    # Joey's rule: every defender at a promoted club starts at 4.0m
    if pos == "DEF" and club in PROMOTED:
        return pos, 40

    p = lo
    p += min(MV_CAP[pos], mv / MV_DIV[pos])

    # Clean sheet value: strong defences cost more, but only the players who
    # will actually start. Fades fast down the depth chart.
    if pos in ("GK", "DEF"):
        share = {0: 1.0, 1: 0.85, 2: 0.7, 3: 0.5, 4: 0.25}.get(depth, 0.0)
        if pos == "GK":
            share = 1.0 if depth == 0 else 0.0
        p += tier(club) * (13 if pos == "GK" else 15) * share
    else:
        # Attackers at strong teams see more of the ball
        p += tier(club) * 4

    g, a = STATS.get(name, (0, 0))
    p += g * G_W[pos] + a * A_W[pos]

    # Holding midfielders rarely return. Discount them unless they produced.
    if tmpos == "DM" and (g + a) < 4:
        p -= 5
    # Squad depth with no track record is bench fodder. FPL needs a lot of it,
    # otherwise a 100m budget cannot stretch to 15 players.
    # Clubs carry only 3-4 forwards, so the depth threshold has to be tighter
    # for them than for defenders and midfielders.
    floor_depth = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 2}[pos]
    if (g + a) == 0:
        if depth >= floor_depth or mv < 600:
            p = lo
        elif depth == 4:
            p = min(p, lo + 3)
        elif depth == 3:
            p = min(p, lo + 6)

    return pos, snap(max(lo, min(hi, p)))


raw = []
for line in open("roster.txt"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    club, name, tmpos, mv = line.split("|")
    raw.append((club, name, tmpos, int(mv)))

# Depth chart: rank within club and FPL position by market value
depth_of = {}
buckets = collections.defaultdict(list)
for club, name, tmpos, mv in raw:
    buckets[(club, POS[tmpos])].append((mv, name))
for key, lst in buckets.items():
    for i, (mv, name) in enumerate(sorted(lst, reverse=True)):
        depth_of[(key[0], name)] = i

# Prices you have edited live in /admin/prices, pulled down by
# `npm run export:players`. These win over everything, including ANCHOR, so
# re-running this model can never quietly undo a change you made on the site.
LIVE = {}
_live_path = os.path.join(os.path.dirname(__file__), "live_prices.json")
if os.path.exists(_live_path):
    LIVE = json.load(open(_live_path))
    print(f"Loaded {len(LIVE)} live prices, these override the model.\n")

rows = []
for club, name, tmpos, mv in raw:
    pos, cost = price(club, name, tmpos, mv, depth_of[(club, name)])
    if name in LIVE:
        cost = int(LIVE[name])
    rows.append({
        "club_code": club, "club_id": CLUB_ID[club], "web_name": name,
        "position": pos, "now_cost": cost, "start_cost": cost, "tm_pos": tmpos,
    })

# Second keeper at every club is cheap fodder, as in FPL
by_club_gk = collections.defaultdict(list)
for r in rows:
    if r["position"] == "GK":
        by_club_gk[r["club_code"]].append(r)
for club, gks in by_club_gk.items():
    gks.sort(key=lambda r: -r["now_cost"])
    for r in gks[1:]:
        r["now_cost"] = r["start_cost"] = min(r["now_cost"], 40)

with open("players.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["club_id", "web_name", "position", "now_cost", "start_cost"])
    w.writeheader()
    for r in sorted(rows, key=lambda r: (r["club_id"], r["position"], -r["now_cost"])):
        w.writerow({k: r[k] for k in w.fieldnames})

with open("players_full.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["club_code", "club_id", "web_name", "position", "tm_pos", "now_cost", "start_cost"])
    w.writeheader()
    for r in sorted(rows, key=lambda r: (r["club_code"], r["position"], -r["now_cost"])):
        w.writerow(r)

off = [r for r in rows if r["now_cost"] % 5 != 0]
assert not off, f"prices off the 0.5m grid: {off[:5]}"

print(f"{len(rows)} players written, all on 0.5m boundaries\n")
for pos in ["GK", "DEF", "MID", "FWD"]:
    ps = [r["now_cost"] for r in rows if r["position"] == pos]
    print(f"{pos}: n={len(ps):3d}  min={min(ps)/10:.1f}  max={max(ps)/10:.1f}  mean={sum(ps)/len(ps)/10:.2f}")
