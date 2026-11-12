import { describe, expect, it } from "vitest";
import { addDays, iso, localStamp, parseDate, REVISIT_WEEK_CHOICES, REVISIT_WEEKDAY, revisitInWeeks, revisitIsDue } from "./dates";
import { defaultSprints } from "./releases";
import { defaultRevisit } from "./decisions";
import { freshStore } from "./store";
import { decisionsToMarkdown, projectsToMarkdown, stamp } from "./exporters";
import { freezeClock } from "./test-fixtures";

freezeClock();

describe("weekly revisits", () => {
  it("lands every revisit on the weekly day, whatever day you defer from", () => {
    const wed = new Date(2026, 9, 21);                       // Wed 21 Oct 2026
    expect(REVISIT_WEEKDAY).toBe(1);                          // Monday
    expect(revisitInWeeks(1, wed)).toBe("2026-10-26");        // the next Monday, not +7 days
    expect(revisitInWeeks(2, wed)).toBe("2026-11-02");
    for (const n of REVISIT_WEEK_CHOICES) {
      expect(parseDate(revisitInWeeks(n, wed))!.getDay()).toBe(REVISIT_WEEKDAY);
    }
  });

  it("gives a full week when today is already the revisit day", () => {
    const mon = new Date(2026, 9, 19);                       // Mon 19 Oct 2026
    expect(revisitInWeeks(1, mon)).toBe("2026-10-26");
    expect(revisitInWeeks(4, mon)).toBe("2026-11-16");
  });

  it("is due once the day arrives, and not before", () => {
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 25))).toBe(false);
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 26))).toBe(true);
    expect(revisitIsDue("2026-10-26", new Date(2026, 9, 30))).toBe(true);
    expect(revisitIsDue(null)).toBe(false);
    expect(revisitIsDue("")).toBe(false);
  });

  it("defaults to the weekly day rather than a date n days out", () => {
    expect(parseDate(defaultRevisit(new Date(2026, 9, 21)))!.getDay()).toBe(REVISIT_WEEKDAY);
  });
});

describe("timestamps are shown in local time", () => {
  const evening = new Date(2026, 9, 20, 23, 30);       // already the 21st in UTC

  it("adds calendar days, not 24-hour blocks, so a DST change cannot skip a date", () => {
    // US clocks spring forward on 2027-03-14: 23:30 on the 13th + 24h is 00:30 on the 15th.
    const lateNight = new Date(2027, 2, 14 - 1, 23, 30);
    expect(iso(addDays(lateNight, 1))).toBe("2027-03-14");
    expect(iso(addDays(lateNight, -1))).toBe("2027-03-12");
    expect(defaultSprints(lateNight).find((sp) => sp.name === "v0.23")!.release).toBe("2027-03-27");
  });

  it("formats a stored timestamp as the local date and time", () => {
    expect(localStamp(evening.toISOString())).toBe("2026-10-20 23:30");
  });

  it("dates exports and their filenames by the local day", () => {
    expect(stamp(evening)).toBe("2026-10-20");
    expect(decisionsToMarkdown(freshStore(), evening)).toContain("— 2026-10-20 (");
    expect(projectsToMarkdown(freshStore(), evening)).toContain("— 2026-10-20");
  });
});
