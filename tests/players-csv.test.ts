import { describe, it, expect } from "vitest";
import { csvField, toFullCsv, toSimpleCsv, sortRows, ExportRow } from "../lib/players-csv";

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  club_code: "WHU", club_id: 22, web_name: "Jarrod Bowen", position: "MID",
  tm_pos: "RW", now_cost: 150, start_cost: 150, ...over,
});

describe("csv fields", () => {
  it("leaves ordinary values alone", () => {
    expect(csvField("Bowen")).toBe("Bowen");
    expect(csvField(150)).toBe("150");
  });

  it("quotes anything containing a comma", () => {
    expect(csvField("Smith, John")).toBe('"Smith, John"');
  });

  it("escapes embedded quotes", () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("handles apostrophes without quoting, since they are safe", () => {
    expect(csvField("Callum O'Hare")).toBe("Callum O'Hare");
  });
});

describe("full csv", () => {
  it("writes the header the importer expects", () => {
    expect(toFullCsv([]).trim()).toBe("club_code,club_id,web_name,position,tm_pos,now_cost,start_cost");
  });

  it("round trips a row", () => {
    const out = toFullCsv([row()]).trim().split("\n");
    expect(out[1]).toBe("WHU,22,Jarrod Bowen,MID,RW,150,150");
  });

  it("copes with a missing transfermarkt position", () => {
    expect(toFullCsv([row({ tm_pos: null })]).trim().split("\n")[1])
      .toBe("WHU,22,Jarrod Bowen,MID,,150,150");
  });

  it("ends with a newline, so git does not complain", () => {
    expect(toFullCsv([row()]).endsWith("\n")).toBe(true);
  });
});

describe("simple csv", () => {
  it("has only the five columns the table needs", () => {
    expect(toSimpleCsv([]).trim()).toBe("club_id,web_name,position,now_cost,start_cost");
    expect(toSimpleCsv([row()]).trim().split("\n")[1]).toBe("22,Jarrod Bowen,MID,150,150");
  });
});

describe("sorting", () => {
  it("groups by club, then position order, then price descending", () => {
    const rows = [
      row({ club_code: "SWA", web_name: "Cheap Keeper", position: "GK", now_cost: 40 }),
      row({ club_code: "BIR", web_name: "A Forward", position: "FWD", now_cost: 60 }),
      row({ club_code: "BIR", web_name: "Big Defender", position: "DEF", now_cost: 70 }),
      row({ club_code: "BIR", web_name: "Small Defender", position: "DEF", now_cost: 40 }),
    ];
    const out = sortRows(rows).map((r) => `${r.club_code}-${r.position}-${r.now_cost}`);
    expect(out).toEqual(["BIR-DEF-70", "BIR-DEF-40", "BIR-FWD-60", "SWA-GK-40"]);
  });

  it("is stable, so exporting twice produces an identical file", () => {
    const rows = [row({ web_name: "B" }), row({ web_name: "A" }), row({ web_name: "C" })];
    expect(toFullCsv(sortRows(rows))).toBe(toFullCsv(sortRows(sortRows(rows))));
  });

  it("does not mutate the input", () => {
    const rows = [row({ web_name: "Z" }), row({ web_name: "A" })];
    const copy = [...rows];
    sortRows(rows);
    expect(rows).toEqual(copy);
  });
});
