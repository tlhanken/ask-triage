import { useState } from "react";
import {
  type ProjectId, type Ticket, ESTIMATES, estimateLabel, PROJECTS, TICKET_TYPES,
} from "./schema";

/**
 * The browser editor, in three tiers.
 *
 * CORE is asked for, every time. OPTIONAL is one click away and never required.
 * BACKGROUND is set by the app or the triage loop and is shown read-only — the
 * only thing actionable there is recording a carryover, which is a thing that
 * happened, not a field to fill in.
 */

interface Props {
  initial: Omit<Ticket, "id">;
  editingId?: number;
  onSave: (draft: Omit<Ticket, "id">, id?: number) => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
}

export default function TicketForm({ initial, editingId, onSave, onCancel, onDelete }: Props) {
  const [d, setD] = useState<Omit<Ticket, "id">>({
    ...initial,
    projects: [...initial.projects],
    stakeholders: [...initial.stakeholders],
  });
  const set = <K extends keyof Omit<Ticket, "id">>(k: K, v: Omit<Ticket, "id">[K]) =>
    setD((cur) => ({ ...cur, [k]: v }));

  const toggleProject = (p: ProjectId) =>
    setD((cur) => ({
      ...cur,
      projects: cur.projects.includes(p) ? cur.projects.filter((x) => x !== p) : [...cur.projects, p],
    }));

  const submit = () => {
    const draft: Omit<Ticket, "id"> = {
      ...d,
      name: d.name.trim(),
      summary: d.summary.trim(),
      notes: d.notes.trim(),
      stakeholders: d.stakeholders.map((s) => s.trim()).filter(Boolean),
      externalUrl: d.externalUrl?.trim() || null,
      dueDate: d.dueDate || null,
    };
    if (!draft.name) return;
    onSave(draft, editingId);
  };

  return (
    <div className="modal" role="dialog" aria-label={editingId ? "Edit ticket" : "New ticket"}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{editingId ? `Edit TKT-${String(editingId).padStart(2, "0")}` : "New ticket"}</h2>
          <button className="dim" onClick={onCancel}>close ✕</button>
        </div>

        <div className="form">
          <label className="wide">Name
            <input autoFocus value={d.name} onChange={(e) => set("name", e.target.value)}
                   placeholder="Short title, one line" />
          </label>

          <label className="wide">Summary
            <textarea rows={3} value={d.summary} onChange={(e) => set("summary", e.target.value)}
                      placeholder="What it is, and why it exists" />
          </label>

          <div className="wide">
            <div className="flabel">Relevant projects</div>
            <div className="chips">
              {PROJECTS.map((p) => (
                <button key={p} type="button"
                        className={"chip " + (d.projects.includes(p) ? "on" : "")}
                        onClick={() => toggleProject(p)}>{p}</button>
              ))}
            </div>
          </div>

          <label className="wide">External ticket link
            <input value={d.externalUrl ?? ""} onChange={(e) => set("externalUrl", e.target.value)}
                   placeholder="https://partner.atlassian.net/browse/PX-118" />
          </label>

          <label>Due date
            <input type="date" value={d.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
          </label>

          <label>Estimated completion
            <select value={d.estimate}
                    onChange={(e) => set("estimate", Number(e.target.value) as Ticket["estimate"])}>
              {ESTIMATES.map((n) => <option key={n} value={n}>{estimateLabel(n)}</option>)}
            </select>
          </label>
        </div>

        <details className="tier">
          <summary>Optional fields <span className="dim small">type, stakeholders, notes — never required</span></summary>
          <div className="form">
            <label>Type
              <select value={d.type} onChange={(e) => set("type", e.target.value as Ticket["type"])}>
                {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label>Stakeholders (comma separated)
              <input value={d.stakeholders.join(", ")}
                     onChange={(e) => set("stakeholders", e.target.value.split(",").map((s) => s.trim()))}
                     placeholder="Dana R., Sam T." />
            </label>

            <label className="wide">Notes
              <textarea rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)}
                        placeholder="Context you will otherwise forget" />
            </label>
          </div>
        </details>

        <details className="tier">
          <summary>Background metadata <span className="dim small">set by the app and the triage loop</span></summary>
          <dl className="meta">
            <dt>State</dt><dd>{d.state}</dd>
            <dt>Release</dt><dd>{d.sprint ?? "backlog"}</dd>
            <dt>Opened</dt><dd>{d.opened ?? "—"}</dd>
            <dt>Last touched</dt><dd>{d.lastTouched ?? "—"}</dd>
            <dt>Closed</dt><dd>{d.closed ?? "—"}</dd>
            <dt>Carried over</dt>
            <dd>
              {d.carryovers} sprint{d.carryovers === 1 ? "" : "s"}
              <button type="button" className="mini" onClick={() => set("carryovers", d.carryovers + 1)}>
                record a carryover
              </button>
            </dd>
          </dl>
        </details>

        <div className="sheet-foot">
          {editingId && onDelete && (
            <button className="danger" onClick={() => onDelete(editingId)}>Delete ticket</button>
          )}
          <div className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="pick" onClick={submit} disabled={!d.name.trim()}>Save ticket</button>
        </div>
      </div>
    </div>
  );
}
