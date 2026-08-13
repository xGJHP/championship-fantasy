import csv, collections, itertools

rows = list(csv.DictReader(open("players_full.csv")))
for r in rows:
    r["now_cost"] = int(r["now_cost"])

QUOTA = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
BUDGET, MAXCLUB = 1000, 3

def build(sort_key):
    picked, need, clubs = [], dict(QUOTA), collections.Counter()
    for r in sorted(rows, key=sort_key):
        p = r["position"]
        if need[p] <= 0 or clubs[r["club_code"]] >= MAXCLUB:
            continue
        picked.append(r); need[p] -= 1; clubs[r["club_code"]] += 1
        if sum(need.values()) == 0:
            break
    return picked

most = build(lambda r: -r["now_cost"])
least = build(lambda r: r["now_cost"])
mc = sum(r["now_cost"] for r in most)
lc = sum(r["now_cost"] for r in least)

print("=== BUDGET PRESSURE ===")
print(f"Most expensive legal 15 : {mc/10:6.1f}m  ({'OVER budget by %.1fm - good, choices matter' % ((mc-1000)/10) if mc>1000 else 'UNDER budget - budget is too loose'})")
print(f"Cheapest legal 15       : {lc/10:6.1f}m")
print(f"Headroom for a manager  : {(1000-lc)/10:6.1f}m to spend on upgrades")

print("\n=== MOST EXPENSIVE LEGAL SQUAD (what you cannot quite afford) ===")
for r in sorted(most, key=lambda r: (["GK","DEF","MID","FWD"].index(r["position"]), -r["now_cost"])):
    print(f"  {r['position']:3} {r['web_name']:26} {r['club_code']}  {r['now_cost']/10:4.1f}")

print("\n=== PRICE DISTRIBUTION ===")
for pos in ["GK","DEF","MID","FWD"]:
    ps = sorted(r["now_cost"] for r in rows if r["position"] == pos)
    band = collections.Counter()
    for p in ps:
        band[f"{p//10}.x"] += 1
    print(f"{pos:4} n={len(ps):3d} " + "  ".join(f"{k}:{v}" for k, v in sorted(band.items())))

print("\n=== CHEAP ENABLERS AVAILABLE (need plenty for a 100m squad to work) ===")
for pos in ["GK","DEF","MID","FWD"]:
    n = sum(1 for r in rows if r["position"] == pos and r["now_cost"] <= 45)
    print(f"  {pos}: {n} players at 4.5m or under")

print("\n=== PER CLUB SANITY ===")
bad = []
for club in sorted({r["club_code"] for r in rows}):
    c = collections.Counter(r["position"] for r in rows if r["club_code"] == club)
    if c["GK"] < 2 or c["DEF"] < 5 or c["MID"] < 5 or c["FWD"] < 2:
        bad.append(f"{club} {dict(c)}")
print("  thin squads:", ", ".join(bad) if bad else "none, every club has a full spread")

print("\n=== TOP 15 BY PRICE ===")
for r in sorted(rows, key=lambda r: -r["now_cost"])[:15]:
    print(f"  {r['now_cost']/10:5.1f}  {r['position']:3} {r['web_name']:26} {r['club_code']}")

print("\n=== A REALISTIC TEMPLATE SQUAD ===")
want = ["Jarrod Bowen","Sorba Thomas","Zan Vipotnik","Zian Flemming","Josh Tymon"]
picked = [r for r in rows if r["web_name"] in want]
spent = sum(r["now_cost"] for r in picked)
need = dict(QUOTA); clubs = collections.Counter()
for r in picked: need[r["position"]] -= 1; clubs[r["club_code"]] += 1
for r in sorted(rows, key=lambda r: r["now_cost"]):
    if r in picked: continue
    p = r["position"]
    if need[p] <= 0 or clubs[r["club_code"]] >= MAXCLUB: continue
    picked.append(r); need[p] -= 1; clubs[r["club_code"]] += 1; spent += r["now_cost"]
    if sum(need.values()) == 0: break
print(f"  5 premiums + cheapest legal fill = {spent/10:.1f}m  ({'fits' if spent<=1000 else 'does NOT fit'})")
print(f"  left in the bank: {(1000-spent)/10:.1f}m")
