import { describe, expect, it } from "vitest";
import { applyCloseOut, lastSetAside, nextRelease, recordDecision, revisitDue } from "./decisions";
import { revertTo, withHistory } from "./history";
import { closeOutQueue, fillOutQueue, scheduleQueue } from "./pipeline";
import { freshStore, moveTicketToSprint, updateTicket } from "./store";
import { decisionsToMarkdown } from "./exporters";
import { NOW, freezeClock, readyStore } from "./test-fixtures";

freezeClock();

describe("decisions", () => {
  it("declining closes the ticket", () => {
    const s1 = recordDecision(freshStore(), 1, "Decline", "not worth it", null, NOW);
    expect(s1.tickets.find((t) => t.id === 1)!.state).toBe("Won't Do");
    expect(s1.tickets.find((t) => t.id === 1)!.closed).toBe("2026-10-18");
  });

  it("deferring and blocking take a ticket off the plan", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = moveTicketToSprint(s, 2, "v0.24", NOW);
    s = recordDecision(s, 1, "Defer", "later", "2026-11-16", NOW);
    s = recordDecision(s, 2, "Block", "waiting on partner", "2026-11-02", NOW);
    expect(s.tickets.find((t) => t.id === 1)).toMatchObject({ state: "Deferred", sprint: null });
    expect(s.tickets.find((t) => t.id === 2)).toMatchObject({ state: "Blocked", sprint: null });
  });

  it("the decision log carries no copy of the ticket for undo: History is the undo", () => {
    const s1 = recordDecision(freshStore(), 1, "Defer", "later", "2027-01-04", NOW);
    expect(s1.decisions[0]).not.toHaveProperty("prev");
    const s0 = freshStore();
    const one = withHistory(s0, "defer 1", (cur) => recordDecision(cur, 1, "Defer", "later", "2027-01-04", NOW), NOW);
    expect(revertTo(one, 0, NOW).tickets.find((t) => t.id === 1)).toEqual(s0.tickets.find((t) => t.id === 1));
  });

  it("defer keeps the reason and revisit date for the digest", () => {
    const s1 = recordDecision(freshStore(), 1, "Defer", "behind SSO", "2027-01-15", NOW);
    const md = decisionsToMarkdown(s1, NOW);
    expect(md).toContain("Priority tracker");
    expect(md).toContain("Deferred (1)");
    expect(md).toContain("behind SSO");
    expect(md).toContain("revisit 2027-01-15");
  });

  it("the digest groups done and carried-over work too", () => {
    const now = new Date(2026, 10, 1);                        // v0.22 shipped 2026-10-18
    let s = moveTicketToSprint(readyStore(), 1, "v0.22", NOW);
    s = moveTicketToSprint(s, 2, "v0.22", NOW);
    s = applyCloseOut(s, [{ id: 1, choice: "Done" }, { id: 2, choice: "Carry over" }], now);
    const md = decisionsToMarkdown(s, now);
    expect(md).toContain("## Done (1)");
    expect(md).toContain("shipped in v0.22");
    expect(md).toContain("## Carried over (1)");
  });
});

describe("deferred work comes back", () => {
  const deferOn = new Date(2026, 9, 21);                     // Wed 21 Oct 2026

  it("returns to the queue on its revisit day, and not before", () => {
    const s = freshStore();
    const id = s.tickets[0].id;
    const deferred = recordDecision(s, id, "Defer", "not yet", "2026-11-02", deferOn);
    expect(deferred.tickets.find((t) => t.id === id)!.state).toBe("Deferred");
    expect(revisitDue(deferred, new Date(2026, 9, 26))).toEqual([]);      // still parked
    const due = revisitDue(deferred, new Date(2026, 10, 2));
    expect(due.map((x) => x.ticket.id)).toEqual([id]);
    expect(due[0].revisit).toBe("2026-11-02");
  });

  it("stops coming back once it is decided again", () => {
    const later = new Date(2026, 10, 2);
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "not yet", "2026-11-02", deferOn);
    expect(revisitDue(s, later)).toHaveLength(1);
    s = recordDecision(s, id, "Accept", "", null, later);
    expect(s.tickets.find((t) => t.id === id)!.state).toBe("New");
    expect(lastSetAside(s, id)?.revisit).toBe("2026-11-02");              // the old defer is still on record
    expect(revisitDue(s, later)).toEqual([]);                  // but it is no longer deferred
  });

  it("leads Fill out with work that has come back", () => {
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "later", "2026-11-02", deferOn);
    // before its day it is not in the queue at all
    expect(fillOutQueue(s, new Date(2026, 9, 26)).map((x) => x.ticket.id)).not.toContain(id);
    // on its day it leads, ahead of the incomplete
    const on = fillOutQueue(s, new Date(2026, 10, 2));
    expect(on[0].ticket.id).toBe(id);
    expect(on[0].returned!.reason).toBe("later");
    expect(on.length).toBeGreaterThan(1);
  });

  it("brings blocked work back too, with its block reason", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = recordDecision(s, 1, "Block", "waiting on partner sizing", "2026-11-02", deferOn);
    expect(fillOutQueue(s, new Date(2026, 9, 26)).map((x) => x.ticket.id)).not.toContain(1);
    const back = fillOutQueue(s, new Date(2026, 10, 2));
    expect(back[0]).toMatchObject({ ticket: { id: 1, state: "Blocked" }, returned: { reason: "waiting on partner sizing" } });
    // taking it on clears it: it is ready, so it moves to Schedule
    s = recordDecision(s, 1, "Accept", "", null, new Date(2026, 10, 2));
    expect(fillOutQueue(s, new Date(2026, 10, 2)).map((x) => x.ticket.id)).not.toContain(1);
    expect(scheduleQueue(s, new Date(2026, 10, 2)).map((t) => t.id)).toContain(1);
  });

  it("reports the most recent defer, so deferring again pushes the date out", () => {
    let s = freshStore();
    const id = s.tickets[0].id;
    s = recordDecision(s, id, "Defer", "first", "2026-10-26", deferOn);
    s = recordDecision(s, id, "Defer", "again", "2026-11-23", new Date(2026, 9, 26));
    expect(lastSetAside(s, id)?.revisit).toBe("2026-11-23");
    expect(revisitDue(s, new Date(2026, 10, 2))).toEqual([]);   // pushed out, so not due
  });
});

describe("release close-out", () => {
  const after = new Date(2026, 10, 2);                             // v0.23 shipped 2026-11-01

  const placed = () => {
    let s = readyStore();
    s = moveTicketToSprint(s, 1, "v0.23", NOW);
    s = moveTicketToSprint(s, 2, "v0.23", NOW);
    s = moveTicketToSprint(s, 3, "v0.23", NOW);
    s = moveTicketToSprint(s, 4, "v0.24", NOW);
    return updateTicket(s, 4, { estimate: 2 }, NOW);              // v0.24 spans v0.23
  };

  it("lists the open work that ships in a shipped release, and only that", () => {
    const q = closeOutQueue(placed(), after);
    expect(q.map((c) => c.release)).toEqual(["v0.23"]);
    expect(q[0].tickets.map((t) => t.id)).toEqual([1, 2, 3]);    // 4 only continues through v0.23
    expect(q[0].next).toBe("v0.24");
    expect(closeOutQueue(placed(), NOW)).toEqual([]);            // not shipped yet
  });

  it("applies each choice, and leaves the undecided where they are", () => {
    const s = applyCloseOut(placed(), [{ id: 1, choice: "Done" }, { id: 2, choice: "Carry over" }], after);
    expect(s.tickets.find((t) => t.id === 1)).toMatchObject({ state: "Done", closed: "2026-11-02" });
    expect(s.tickets.find((t) => t.id === 2)).toMatchObject({ state: "Committed", sprint: "v0.24", carryovers: 1 });
    expect(closeOutQueue(s, after)[0].tickets.map((t) => t.id)).toEqual([3]);
    const back = applyCloseOut(s, [{ id: 3, choice: "Unschedule" }], after);
    expect(back.tickets.find((t) => t.id === 3)).toMatchObject({ state: "New", sprint: null, planned: null });
    expect(closeOutQueue(back, after)).toEqual([]);
  });

  it("is one revertible action", () => {
    const s0 = placed();
    const s1 = withHistory(s0, "close out", (cur) => applyCloseOut(cur, [{ id: 1, choice: "Done" }, { id: 2, choice: "Done" }], after), after);
    expect(s1.history).toHaveLength(1);
    expect(revertTo(s1, 0, after).tickets).toEqual(s0.tickets);
  });

  it("cannot carry over when there is no later release", () => {
    let s = readyStore();
    s = moveTicketToSprint(s, 1, "v0.25", NOW);
    const later = new Date(2027, 0, 1);                            // everything has shipped
    expect(nextRelease(s.settings, "v0.25", later)).toBeNull();
    expect(closeOutQueue(s, later)[0].next).toBeNull();
    expect(applyCloseOut(s, [{ id: 1, choice: "Carry over" }], later)).toBe(s);
  });
});
