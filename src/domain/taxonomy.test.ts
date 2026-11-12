import { describe, expect, it } from "vitest";
import { CATEGORIES, PRIORITIES, priorityLabel, priorityRank } from "./schema";
import { blankTicket } from "./store";

describe("taxonomy: priority is not type", () => {
  it("starts a new ask with no priority and no type: nobody has chosen yet", () => {
    const t = blankTicket();
    expect(t.priority).toBeNull();
    expect(t.type).toBeNull();
    expect(priorityLabel(t.priority)).toBe("Unclassified");
  });

  it("offers three things to pick; unset is not one of them", () => {
    expect(PRIORITIES).toEqual(["Critical", "Should", "Nice-to-have"]);
    expect(priorityRank("Critical")).toBeLessThan(priorityRank("Nice-to-have"));
    expect(priorityRank(null)).toBeGreaterThan(priorityRank("Nice-to-have"));
  });

  it("keeps the two axes apart — no category is a priority", () => {
    expect(CATEGORIES).toEqual(["Front-end", "Back-end", "Driver", "Server"]);
    for (const c of CATEGORIES) expect(PRIORITIES as readonly string[]).not.toContain(c);
  });
});
