import { describe, expect, it } from "vitest";
import { derive } from "./assess";
import { BACKGROUND_FIELDS, CORE_FIELDS, DEFAULT_PROJECTS, matchProjects, OPTIONAL_FIELDS, PROJECT_SUGGESTION_CAP } from "./schema";
import { blankTicket, freshStore } from "./store";
import { freezeClock, isoFromNow, mk } from "./test-fixtures";

freezeClock();

describe("field discipline", () => {
  it("stores exactly the core, optional and background fields — nothing more", () => {
    const expected = [...CORE_FIELDS, ...OPTIONAL_FIELDS, ...BACKGROUND_FIELDS].sort();
    expect(Object.keys(blankTicket()).sort()).toEqual(expected);
  });

  it("the three tiers do not overlap", () => {
    const seen = new Set<string>();
    for (const f of [...CORE_FIELDS, ...OPTIONAL_FIELDS, ...BACKGROUND_FIELDS]) {
      expect(seen.has(f)).toBe(false);
      seen.add(f);
    }
  });

  it("carries nothing that was cut", () => {
    const keys = Object.keys(blankTicket());
    for (const gone of ["owner", "ownerType", "size", "nextAction", "externalKey", "expectedDurations"]) {
      expect(keys).not.toContain(gone);
    }
  });

  it("flags a ticket whose ship release ships after its due date", () => {
    const settings = freshStore().settings;                          // v0.23 ships in 14 days
    const late = mk({ sprint: "v0.23", dueDate: isoFromNow(10) });
    expect(derive(late, settings).shipsLate).toBe(true);
    const fine = mk({ sprint: "v0.23", dueDate: isoFromNow(60) });
    expect(derive(fine, settings).shipsLate).toBe(false);
    expect(derive(mk({ dueDate: isoFromNow(10) }), settings).shipsLate).toBe(false);   // not scheduled
  });
});

describe("project picker", () => {
  const many = Array.from({ length: 500 }, (_, i) => `Project ${String(i).padStart(3, "0")}`);

  it("caps what it renders, and counts what it left out", () => {
    const m = matchProjects("", [], many);
    expect(m.shown).toHaveLength(PROJECT_SUGGESTION_CAP);
    expect(m.total).toBe(500);
    expect(m.available).toBe(500);
  });

  it("stays capped however many match", () => {
    const m = matchProjects("project", [], many);
    expect(m.shown).toHaveLength(PROJECT_SUGGESTION_CAP);
    expect(m.total).toBe(500);
  });

  it("narrows by substring", () => {
    const m = matchProjects("Project 01", [], many);
    expect(m.total).toBe(10);                                  // 010 through 019
    expect(m.shown).toHaveLength(10);
  });

  it("puts prefix matches first, so a short query finds the obvious one", () => {
    const list = ["WebPlatform", "Platform", "Platform Tools"];
    expect(matchProjects("plat", [], list).shown).toEqual(["Platform", "Platform Tools", "WebPlatform"]);
  });

  it("never offers what is already attached", () => {
    const m = matchProjects("", ["Atlas"], DEFAULT_PROJECTS);
    expect(m.shown).not.toContain("Atlas");
    expect(m.available).toBe(DEFAULT_PROJECTS.length - 1);
  });

  it("honours a custom cap", () => {
    expect(matchProjects("", [], many, 5).shown).toHaveLength(5);
  });
});
