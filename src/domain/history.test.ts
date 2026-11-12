import { describe, expect, it } from "vitest";
import { recordDecision } from "./decisions";
import { HISTORY_CAP, planRevert, revertTo, withHistory } from "./history";
import { addSprint, blankTicket, createTicket, deleteTicket, freshStore, moveTicketToSprint, readStore, resetToSeed, serialize, STORE_VERSION, updateTicket } from "./store";
import { NOW, freezeClock } from "./test-fixtures";

freezeClock();

describe("history and revert", () => {
  it("records the state before a change, under a label", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1 to v0.24", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(s1.history).toHaveLength(1);
    expect(s1.history[0].label).toBe("move 1 to v0.24");
    expect(s1.tickets.find((t) => t.id === 1)!.sprint).toBe("v0.24");
  });

  it("a mutation that changes nothing leaves no snapshot behind", () => {
    const s = freshStore();
    expect(withHistory(s, "no-op", (cur) => cur, NOW).history).toHaveLength(0);
  });

  it("reverts tickets and settings to before a change", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(revertTo(s1, 0, NOW).tickets.find((t) => t.id === 1)!.sprint).toBeNull();
  });

  it("a revert is itself recorded, so it can be undone", () => {
    const s = freshStore();
    const s1 = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    const s2 = revertTo(s1, 0, NOW);
    expect(s2.history).toHaveLength(2);
    expect(s2.history[1].label).toContain("revert");
    expect(revertTo(s2, 1, NOW).tickets.find((t) => t.id === 1)!.sprint).toBe("v0.24");
  });

  it("keeps the history bounded", () => {
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
    }
    expect(s.history).toHaveLength(HISTORY_CAP);
    expect(s.history[s.history.length - 1].label).toBe(`change ${HISTORY_CAP + 4}`);
  });

  it("reverting a delete restores the ticket without reusing its id", () => {
    const s = freshStore();
    const nextId = s.nextTicketId;
    const s1 = withHistory(s, "delete 1", (cur) => deleteTicket(cur, 1), NOW);
    const s2 = revertTo(s1, 0, NOW);
    expect(s2.tickets.some((t) => t.id === 1)).toBe(true);
    expect(s2.nextTicketId).toBe(nextId);
  });

  it("a reset to demo data is recorded, and reverting it brings the register back", () => {
    const s = createTicket(freshStore(), { ...blankTicket(), name: "real work" });
    const s1 = withHistory(s, "reset to demo data", resetToSeed, NOW);
    expect(s1.history).toHaveLength(1);
    expect(s1.tickets.some((t) => t.name === "real work")).toBe(false);
    expect(revertTo(s1, 0, NOW).tickets.some((t) => t.name === "real work")).toBe(true);
  });

  // ------------------------------------------------- change records, not states

  it("records only the tickets a change touched", () => {
    const s1 = withHistory(freshStore(), "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    expect(Object.keys(s1.history[0].tickets)).toEqual(["1"]);
    expect(s1.history[0].tickets["1"]!.sprint).toBeNull();           // the before-state
    expect(s1.history[0].settings).toBeUndefined();                   // settings untouched
    expect(s1.history[0].order).toBeUndefined();                      // nothing added or removed
  });

  it("records settings only when a change alters them", () => {
    const s1 = withHistory(freshStore(), "add release", (cur) => addSprint(cur, "v0.30"), NOW);
    expect(s1.history[0].tickets).toEqual({});
    expect(s1.history[0].settings!.sprints.some((x) => x.name === "v0.30")).toBe(false);
  });

  it("history does not grow with the number of tickets", () => {
    const fill = (extra: number) => {
      let s = freshStore();
      for (let i = 0; i < extra; i++) s = createTicket(s, { ...blankTicket(), name: `filler ${i}` });
      for (let i = 0; i < HISTORY_CAP; i++) {
        s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
      }
      return JSON.stringify(s.history).length;
    };
    const small = fill(0);
    const large = fill(200);
    expect(large).toBe(small);
    // and no entry is a copy of the register
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, 1, { carryovers: i }, NOW), NOW);
    }
    for (const h of s.history) expect(Object.keys(h.tickets).length).toBe(1);
  });

  it("reverts across several changes by stepping back from the current state", () => {
    let s = freshStore();
    const original = structuredClone(s.tickets);
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    s = withHistory(s, "new", (cur) => createTicket(cur, { ...blankTicket(), name: "added" }), NOW);
    s = withHistory(s, "delete 3", (cur) => deleteTicket(cur, 3), NOW);
    s = withHistory(s, "rename 2", (cur) => updateTicket(cur, 2, { name: "renamed" }, NOW), NOW);
    const back = revertTo(s, 0, NOW);
    expect(back.tickets).toEqual(original);                          // same tickets, same order

    const mid = revertTo(s, 2, NOW);                                  // before "delete 3"
    expect(mid.tickets.map((t) => t.id)).toEqual([...original.map((t) => t.id), s.nextTicketId - 1]);
    expect(mid.tickets.find((t) => t.id === 2)!.name).toBe(original.find((t) => t.id === 2)!.name);
  });

  it("puts a restored ticket back where it was", () => {
    const s = freshStore();
    const ids = s.tickets.map((t) => t.id);
    const s1 = withHistory(s, "delete", (cur) => deleteTicket(cur, ids[2]), NOW);
    expect(revertTo(s1, 0, NOW).tickets.map((t) => t.id)).toEqual(ids);
  });

  it("refuses a revert through a damaged entry, and changes nothing", () => {
    let s = freshStore();
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    s = withHistory(s, "move 2", (cur) => moveTicketToSprint(cur, 2, "v0.24", NOW), NOW);
    const damaged = { ...s, history: [s.history[0], { ...s.history[1], tickets: { 2: { id: 99 } } } as never] };
    const plan = planRevert(damaged, 0);
    expect(plan.ok).toBe(false);
    expect(revertTo(damaged, 0, NOW)).toBe(damaged);
  });

  it("says when a revert reaches the oldest state the history holds", () => {
    let s = freshStore();
    s = withHistory(s, "a", (cur) => updateTicket(cur, 1, { carryovers: 1 }, NOW), NOW);
    s = withHistory(s, "b", (cur) => updateTicket(cur, 1, { carryovers: 2 }, NOW), NOW);
    expect(planRevert(s, 0)).toMatchObject({ ok: true, oldest: true });
    expect(planRevert(s, 1)).toMatchObject({ ok: true, oldest: false });
    expect(planRevert(s, 5).ok).toBe(false);
  });

  it("dropping the oldest entries at the cap keeps every later revert exact", () => {
    let s = freshStore();
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      s = withHistory(s, `change ${i}`, (cur) => updateTicket(cur, (i % 3) + 1, { carryovers: i }, NOW), NOW);
    }
    // index 0 now holds "change 5"; reverting to it gives the state after "change 4"
    const back = revertTo(s, 0, NOW);
    expect(back.tickets.find((t) => t.id === 2)!.carryovers).toBe(4);
    expect(back.tickets.find((t) => t.id === 3)!.carryovers).toBe(2);
    expect(back.tickets.find((t) => t.id === 1)!.carryovers).toBe(3);
  });

  it("writes history as structured records, not escaped strings, in one file", () => {
    let s = freshStore();
    s = withHistory(s, "move 1", (cur) => moveTicketToSprint(cur, 1, "v0.24", NOW), NOW);
    const text = serialize(s);
    expect(text).not.toContain('\\"tickets\\"');                   // no JSON-in-a-string
    const again = readStore(text)!;
    expect(again.history).toEqual(s.history);                         // tickets, decisions and history together
    expect(revertTo(again, 0, NOW).tickets.find((t) => t.id === 1)!.sprint).toBeNull();
  });

  it("refuses a save in the full-copy history format whole", () => {
    const old = { ...freshStore(), version: 3 };
    expect(STORE_VERSION).toBe(5);
    expect(readStore(JSON.stringify(old))).toBeNull();
  });

  it("a reset never reuses an id and keeps the decision log", () => {
    let s = freshStore();
    s = recordDecision(s, 1, "Defer", "later", "2026-11-02", NOW);
    const before = s.nextTicketId;
    const s1 = resetToSeed(s);
    expect(Math.min(...s1.tickets.map((t) => t.id))).toBe(before);
    expect(s1.nextTicketId).toBe(before + s1.tickets.length);
    expect(s1.decisions).toEqual(s.decisions);
  });
});
