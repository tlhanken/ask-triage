import { describe, expect, it } from "vitest";
import { withHistory, revertTo } from "./history";
import { fillState } from "./releases";
import { DEFAULT_SETTINGS } from "./schema";
import {
  SETTING_FIELDS, defaultSettingValues, settingProblem, settingValues, updateSettings, validateSettings,
} from "./settings";
import { freshStore, moveTicketToSprint } from "./store";
import { NOW, freezeClock, readyStore } from "./test-fixtures";

freezeClock();

describe("planning settings", () => {
  it("covers every capacity, flag and score setting, each saying what it drives", () => {
    const keys = SETTING_FIELDS.map((f) => f.key);
    for (const w of Object.keys(DEFAULT_SETTINGS.weights)) expect(keys).toContain(`weights.${w}`);
    expect(keys).toEqual(expect.arrayContaining(["commitTargetPerSprint", "sprintLengthDays", "throughputPerWeek"]));
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of SETTING_FIELDS) expect(f.drives.length).toBeGreaterThan(10);
  });

  it("never edits the releases or the project list", () => {
    expect(SETTING_FIELDS.map((f) => f.key)).not.toContain("sprints");
    expect(SETTING_FIELDS.map((f) => f.key)).not.toContain("projects");
  });

  it("reads the current values, and the defaults", () => {
    const v = settingValues(freshStore().settings);
    expect(v.commitTargetPerSprint).toBe(8);
    expect(v["weights.slippageThreshold"]).toBe(2);
    expect(defaultSettingValues()).toEqual(v);
  });

  it("refuses values that are not allowed, and says why", () => {
    const count = SETTING_FIELDS.find((f) => f.key === "commitTargetPerSprint")!;
    const amount = SETTING_FIELDS.find((f) => f.key === "weights.critical")!;
    expect(settingProblem(count, 0)).toMatch(/whole number, 1 or more/);
    expect(settingProblem(count, 2.5)).toMatch(/whole number/);
    expect(settingProblem(count, 3)).toBeNull();
    expect(settingProblem(amount, -1)).toMatch(/0 or more/);
    expect(settingProblem(amount, 0)).toBeNull();
    expect(settingProblem(amount, Number.NaN)).toMatch(/number/);
    const bad = { ...defaultSettingValues(), commitTargetPerSprint: 0, "weights.critical": -5 };
    expect(Object.keys(validateSettings(bad)).sort()).toEqual(["commitTargetPerSprint", "weights.critical"]);
  });

  it("applies capacity to every release's load", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = moveTicketToSprint(s, 2, "v0.24", NOW);
    s = updateSettings(s, { ...settingValues(s.settings), commitTargetPerSprint: 1 });
    expect(fillState(s.tickets, "v0.24", s.settings)).toEqual({ load: 2, room: -1, state: "over" });
  });

  it("is one revertible change, and records nothing when nothing changed or a value is refused", () => {
    const s = freshStore();
    const values = settingValues(s.settings);
    expect(withHistory(s, "settings", (cur) => updateSettings(cur, values), NOW)).toBe(s);
    expect(withHistory(s, "settings", (cur) => updateSettings(cur, { ...values, sprintLengthDays: 0 }), NOW)).toBe(s);

    const changed = withHistory(s, "settings", (cur) => updateSettings(cur, { ...values, "weights.critical": 50 }), NOW);
    expect(changed.settings.weights.critical).toBe(50);
    expect(changed.settings.sprints).toEqual(s.settings.sprints);         // releases untouched
    expect(changed.history).toHaveLength(1);
    expect(revertTo(changed, 0, NOW).settings).toEqual(s.settings);
  });
});
