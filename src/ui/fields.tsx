import { useState } from "react";
import { CATEGORIES, type Category, isEstimate, PRIORITIES, type Priority } from "../domain/schema";

/**
 * The four fields that decide whether a ticket is ready to schedule, as controls
 * shared by the ticket editor and the Fill out card. Each starts blank: an unset
 * field shows as unset, never as a default someone might mistake for a choice.
 */

export function PriorityField({ value, onChange, label = "Priority" }: {
  value: Priority | null; onChange: (v: Priority | null) => void; label?: string;
}) {
  return (
    <label>{label}
      <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Priority | null)}>
        <option value="">— not chosen —</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
  );
}

export function TypeField({ value, onChange, label = "Type" }: {
  value: Category | null; onChange: (v: Category | null) => void; label?: string;
}) {
  return (
    <label>{label}
      <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Category | null)}>
        <option value="">— not known yet —</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

/**
 * A whole number of sprints, or blank. `live` writes on every valid keystroke (the
 * editor, which saves as a whole); otherwise it writes on Enter or on leaving the
 * field, so the Fill out card records one change rather than one per keystroke.
 */
export function EstimateField({ value, onChange, live = false, label = "Estimate (sprints)" }: {
  value: number | null; onChange: (v: number | null) => void; live?: boolean; label?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const parse = (t: string): number | null | undefined => {
    if (t.trim() === "") return null;
    const n = Number(t);
    return isEstimate(n) ? n : undefined;              // undefined: not a valid estimate
  };
  const commit = () => {
    const n = parse(text);
    if (n === undefined) { setText(value === null ? "" : String(value)); return; }
    if (n !== value) onChange(n);
  };
  const bad = parse(text) === undefined;
  return (
    <label>{label}
      <input type="number" min={1} step={1} inputMode="numeric" value={text} placeholder="—"
             aria-invalid={bad || undefined}
             onChange={(e) => {
               setText(e.target.value);
               const n = parse(e.target.value);
               if (live && n !== undefined) onChange(n);
             }}
             onBlur={live ? undefined : commit}
             onKeyDown={(e) => { if (!live && e.key === "Enter") { e.preventDefault(); commit(); } }} />
      {bad && <span className="small tag Decline">a whole number of sprints, 1 or more</span>}
    </label>
  );
}

/**
 * A due date, or an explicit "no hard date". Neither is the same as not answered,
 * which is what an empty date with the box unticked means.
 */
export function DueField({ dueDate, noHardDate, onChange }: {
  dueDate: string | null; noHardDate: boolean;
  onChange: (v: { dueDate: string | null; noHardDate: boolean }) => void;
}) {
  return (
    <div className="due-field">
      <label>Due date
        <input type="date" value={dueDate ?? ""} disabled={noHardDate}
               onChange={(e) => onChange({ dueDate: e.target.value || null, noHardDate: false })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={noHardDate}
               onChange={(e) => onChange({ dueDate: e.target.checked ? null : dueDate, noHardDate: e.target.checked })} />
        no hard date
      </label>
    </div>
  );
}
