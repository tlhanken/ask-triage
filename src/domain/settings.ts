/**
 * The planning settings a person can edit: capacity, sprint length, throughput,
 * flag thresholds and draft-score weights. One list, SETTING_FIELDS, says what
 * each one is, what it drives and what values it takes; the settings dialog is
 * rendered from it and validateSettings checks against it.
 *
 * The releases and the project list also live in Settings, but they have their
 * own editors and are never touched here.
 */
import { DEFAULT_SETTINGS, type Settings } from "./schema";
import { type Store } from "./store";

export type SettingGroup = "Planning" | "Flags" | "Draft score";
export const SETTING_GROUPS: SettingGroup[] = ["Planning", "Flags", "Draft score"];

type Weights = Settings["weights"];
export type SettingKey =
  | "commitTargetPerSprint" | "sprintLengthDays" | "throughputPerWeek" | `weights.${keyof Weights}`;

export interface SettingField {
  key: SettingKey;
  group: SettingGroup;
  label: string;
  unit: string;
  /** What changing it changes. Every setting must drive something. */
  drives: string;
  /** "count": a whole number of at least 1. "amount": any number of at least 0. */
  rule: "count" | "amount";
}

/** Adding a setting: one entry here, plus its default in schema.ts. */
export const SETTING_FIELDS: SettingField[] = [
  { key: "commitTargetPerSprint", group: "Planning", label: "Capacity per release", unit: "units", rule: "count",
    drives: "How much work a release can hold; each ticket costs one unit in every release it spans." },
  { key: "sprintLengthDays", group: "Planning", label: "Sprint length", unit: "days", rule: "count",
    drives: "The spacing of dates when releases with no dates are given a cadence." },
  { key: "throughputPerWeek", group: "Planning", label: "Throughput", unit: "tickets a week", rule: "amount",
    drives: "The \"queued\" wait in the header: open tickets divided by this." },

  { key: "weights.dueRiskDays", group: "Flags", label: "Date risk within", unit: "days", rule: "count",
    drives: "Open work due within this many days is flagged DATE-RISK." },
  { key: "weights.staleDays", group: "Flags", label: "Stale after", unit: "days", rule: "count",
    drives: "Open work untouched for longer than this is flagged STALE." },
  { key: "weights.noDateOldDays", group: "Flags", label: "Old with no date after", unit: "days", rule: "count",
    drives: "Open work this old with no date and no \"no hard date\" is flagged NO-DATE-OLD." },
  { key: "weights.slippageThreshold", group: "Flags", label: "Slipped after", unit: "carry-overs", rule: "count",
    drives: "Work carried over this many times is flagged SLIPPED." },

  { key: "weights.critical", group: "Draft score", label: "Critical", unit: "points", rule: "amount",
    drives: "Added to the draft score of a Critical ticket." },
  { key: "weights.should", group: "Draft score", label: "Should", unit: "points", rule: "amount",
    drives: "Added to the draft score of a Should ticket." },
  { key: "weights.urgencyHorizonDays", group: "Draft score", label: "Urgency horizon", unit: "days", rule: "count",
    drives: "A due date this close starts adding urgency points." },
  { key: "weights.urgencyPerDay", group: "Draft score", label: "Urgency", unit: "points a day", rule: "amount",
    drives: "Points for each day a due date is inside the urgency horizon." },
  { key: "weights.agePer30Days", group: "Draft score", label: "Waiting", unit: "points per 30 days", rule: "amount",
    drives: "Points for how long a ticket has waited, up to a year." },
  { key: "weights.perCarryover", group: "Draft score", label: "Carry-over", unit: "points each", rule: "amount",
    drives: "Points for each time the ticket was carried over." },
  { key: "weights.smallBonus", group: "Draft score", label: "Small work", unit: "points", rule: "amount",
    drives: "Bonus for a one-sprint ticket; half of it for a two-sprint ticket." },
];

/** The editable settings as a flat map, keyed as in SETTING_FIELDS. */
export type SettingValues = Record<SettingKey, number>;

const read = (s: Settings, key: SettingKey): number =>
  key.startsWith("weights.") ? s.weights[key.slice(8) as keyof Weights] : s[key as Exclude<SettingKey, `weights.${string}`>];

/** The current values of every editable setting. */
export function settingValues(s: Settings): SettingValues {
  return Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, read(s, f.key)])) as SettingValues;
}

/** The defaults, for "Restore defaults". */
export const defaultSettingValues = (): SettingValues => settingValues(DEFAULT_SETTINGS);

/** Why a value is not allowed, or null when it is. */
export function settingProblem(field: SettingField, value: number): string | null {
  if (!Number.isFinite(value)) return "Needs a number.";
  if (field.rule === "count") return Number.isInteger(value) && value >= 1 ? null : "A whole number, 1 or more.";
  return value >= 0 ? null : "0 or more.";
}

/** Every problem, keyed by setting. Empty when all values are allowed. */
export function validateSettings(values: SettingValues): Partial<Record<SettingKey, string>> {
  const out: Partial<Record<SettingKey, string>> = {};
  for (const f of SETTING_FIELDS) {
    const p = settingProblem(f, values[f.key]);
    if (p) out[f.key] = p;
  }
  return out;
}

/**
 * Apply edited settings. Returns the store unchanged when any value is not allowed
 * or nothing changed, so History records nothing for either.
 */
export function updateSettings(s: Store, values: SettingValues): Store {
  if (Object.keys(validateSettings(values)).length > 0) return s;
  const current = settingValues(s.settings);
  if (SETTING_FIELDS.every((f) => current[f.key] === values[f.key])) return s;

  const weights = { ...s.settings.weights };
  const top: Partial<Settings> = {};
  for (const f of SETTING_FIELDS) {
    if (f.key.startsWith("weights.")) weights[f.key.slice(8) as keyof Weights] = values[f.key];
    else (top as Record<string, number>)[f.key] = values[f.key];
  }
  return { ...s, settings: { ...s.settings, ...top, weights } };
}
