import { useState } from "react";
import {
  type ProjectId, type Ticket, OWNER_TYPES, PROJECTS, SIZES, STATES, TICKET_TYPES,
} from "./schema";

/**
 * The browser editor.
 *
 * FIELD DISCIPLINE: this asks only for what a person decides. Opened,
 * Last-touched and Closed are stamped by the app; Sprint and State are
 * set by the triage loop and the sprint board. They appear here only so
 * a correction is possible, and they sit at the bottom on purpose.
 */

interface Props {
  initial: Omit<Ticket, "id">;
  editingId?: number;
  sprints: string[];
  onSave: (draft: Omit<Ticket, "id">, id?: number) => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
}

export default function TicketForm({ initial, editingId, sprints, onSave, onCancel, onDelete }: Props) {
  const [d, setD] = useState<Omit<Ticket, "id">>({ ...initial, projects: [...initial.projects] });
  const [stakeholderText, setStakeholderText] = useState(initial.stakeholders.join(", "));
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
      owner: d.owner.trim(),
      stakeholders: stakeholderText.split(",").map((s) => s.trim()).filter(Boolean),
      externalUrl: d.externalUrl?.trim() || null,
      dueDate: d.dueDate || null,
      sprint: d.sprint || null,
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

          <label>Type
            <select value={d.type} onChange={(e) => set("type", e.target.value as Ticket["type"])}>
              {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>Size
            <select value={d.size} onChange={(e) => set("size", e.target.value as Ticket["size"])}>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>Owner type
            <select value={d.ownerType} onChange={(e) => set("ownerType", e.target.value as Ticket["ownerType"])}>
              {OWNER_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <label>Owner
            <input value={d.owner} onChange={(e) => set("owner", e.target.value)} placeholder="PartnerCo / J. Alvarez" />
          </label>

          <label className="wide">Stakeholders (comma separated)
            <input value={stakeholderText} onChange={(e) => setStakeholderText(e.target.value)}
                   placeholder="Dana R., Sam T." />
          </label>

          <label className="wide">Next action
            <input value={d.nextAction} onChange={(e) => set("nextAction", e.target.value)}
                   placeholder="What happens next, and who owns it" />
          </label>

          <div className="wide stamped">
            <div className="flabel">Set by the loop — edit only to correct</div>
          </div>

          <label>Sprint
            <select value={d.sprint ?? ""} onChange={(e) => set("sprint", e.target.value)}>
              <option value="">— backlog —</option>
              {sprints.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>State
            <select value={d.state} onChange={(e) => set("state", e.target.value as Ticket["state"])}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>Carryovers
            <input type="number" min={0} value={d.carryovers}
                   onChange={(e) => set("carryovers", Math.max(0, Number(e.target.value) || 0))} />
          </label>

          <label>Opened
            <input type="date" value={d.opened ?? ""} onChange={(e) => set("opened", e.target.value)} />
          </label>
        </div>

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
