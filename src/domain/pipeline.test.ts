import { describe, expect, it } from "vitest";
import { riskAlerts } from "./assess";
import { shipsLate } from "./releases";
import { recordDecision } from "./decisions";
import { checkReport, pipeline } from "./pipeline";
import { freshStore, moveTicketToSprint, updateTicket } from "./store";
import { NOW, freezeClock, isoFromNow, mk, readyStore } from "./test-fixtures";

freezeClock();

describe("Check", () => {
  it("reports work that ships after its due date, with why", () => {
    let s = readyStore();
    s = updateTicket(s, 1, { dueDate: isoFromNow(20), noHardDate: false }, NOW);
    s = moveTicketToSprint(s, 1, "v0.24", NOW);                    // ships in 42 days
    const rel = checkReport(s, NOW).find((r) => r.release === "v0.24")!;
    const alert = rel.rows[0].alerts.find((a) => a.kind === "WONT-FIT")!;
    expect(alert.why).toMatch(/after its due date/);
    expect(shipsLate(s.tickets.find((t) => t.id === 1)!, s.settings)).toBe(true);
  });

  it("reports a release over capacity, and closed tickets raise nothing", () => {
    let s = readyStore();
    s = { ...s, settings: { ...s.settings, commitTargetPerSprint: 1 } };
    s = moveTicketToSprint(s, 1, "v0.24", NOW);
    s = moveTicketToSprint(s, 2, "v0.24", NOW);
    const rel = checkReport(s, NOW).find((r) => r.release === "v0.24")!;
    expect(rel.alerts.map((a) => a.kind)).toContain("OVER-CAPACITY");
    s = recordDecision(s, 2, "Decline", "no", null, NOW);
    expect(checkReport(s, NOW).find((r) => r.release === "v0.24")?.alerts ?? []).toEqual([]);
  });

  it("catches a due date that has already passed", () => {
    const t = mk({ dueDate: isoFromNow(-5), state: "New" });
    expect(riskAlerts(t, freshStore().settings, NOW).map((a) => a.kind)).toContain("PAST-DUE");
    expect(riskAlerts({ ...t, state: "Done" }, freshStore().settings, NOW)).toEqual([]);
  });

  it("does not check work still in Fill out: its card already shows its risks", () => {
    const s = freshStore();                                            // nothing is ready
    expect(checkReport(s, NOW)).toEqual([]);
    expect(pipeline(s, NOW).check).toBe(0);
  });

  it("the header counts each step", () => {
    const s = readyStore();
    const p = pipeline(s, NOW);
    expect(p.fillOut).toBe(0);
    expect(p.schedule).toBe(s.tickets.length);
    expect(pipeline(freshStore(), NOW).fillOut).toBe(freshStore().tickets.length);
  });
});
