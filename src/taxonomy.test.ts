import { describe, expect, it } from "vitest";
import { CATEGORIES, DEFAULT_PRIORITY, PRIORITIES } from "./schema";
import { blankTicket, freshStore, migrateStore } from "./store";

/** A store whose tickets are exactly what we hand it, so migration is the only variable. */
const withTickets = (...tickets: unknown[]) =>
  ({ ...freshStore(), tickets }) as unknown;

describe("taxonomy: priority is not type", () => {
  it("defaults a new ask to unclassified with no type", () => {
    const t = blankTicket();
    expect(t.priority).toBe(DEFAULT_PRIORITY);
    expect(t.priority).toBe("Unclassified");
    expect(t.type).toBeNull();
  });

  it("offers three things to pick, plus the absence of a pick", () => {
    expect(PRIORITIES).toHaveLength(4);
    expect(PRIORITIES[0]).toBe("Unclassified");
  });

  it("keeps the two axes apart — no category is a priority", () => {
    expect(CATEGORIES).toEqual(["Front-end", "Back-end", "Driver", "Server"]);
    for (const c of CATEGORIES) expect(PRIORITIES as readonly string[]).not.toContain(c);
  });
});

describe("migration off the old single axis", () => {
  it("moves a legacy `type` into priority and leaves the category unset", () => {
    const out = migrateStore(withTickets({ ...blankTicket(), id: 7, type: "Critical" }));
    expect(out.tickets[0].priority).toBe("Critical");
    // not invented as a category: that would be a judgement nobody made
    expect(out.tickets[0].type).toBeNull();
  });

  it("leaves an already-migrated ticket exactly as it was", () => {
    const out = migrateStore(withTickets({
      ...blankTicket(), id: 7, priority: "Should", type: "Back-end",
    }));
    expect(out.tickets[0].priority).toBe("Should");
    expect(out.tickets[0].type).toBe("Back-end");
  });

  it("falls back to unclassified rather than carrying a value it cannot read", () => {
    const out = migrateStore(withTickets({
      ...blankTicket(), id: 7, priority: "Urgent-ish", type: "purple",
    }));
    expect(out.tickets[0].priority).toBe("Unclassified");
    expect(out.tickets[0].type).toBeNull();
  });

  it("reads a ticket with neither field as unclassified", () => {
    const bare = { ...blankTicket(), id: 8 } as unknown as Record<string, unknown>;
    delete bare.priority;
    delete bare.type;
    const out = migrateStore(withTickets(bare));
    expect(out.tickets[0].priority).toBe("Unclassified");
    expect(out.tickets[0].type).toBeNull();
  });
});
