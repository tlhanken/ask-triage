import { useEffect, useRef, useState } from "react";
import {
  type ProjectId, type Ticket, CATEGORIES, ESTIMATES, PRIORITIES, estimateLabel, matchProjects,
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
  /** The controlled list, from the store — it is data now, not a compile-time const. */
  projects: readonly string[];
  onSave: (draft: Omit<Ticket, "id">, id?: number) => void;
  onAddProject: (name: string) => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
}

export default function TicketForm({
  initial, editingId, projects, onSave, onAddProject, onCancel, onDelete,
}: Props) {
  const [d, setD] = useState<Omit<Ticket, "id">>({
    ...initial,
    projects: [...initial.projects],
    stakeholders: [...initial.stakeholders],
  });
  const set = <K extends keyof Omit<Ticket, "id">>(k: K, v: Omit<Ticket, "id">[K]) =>
    setD((cur) => ({ ...cur, [k]: v }));

  // Projects come from a fixed list, so the input FILTERS the list rather than
  // inventing entries: type to narrow, pick from the dropdown. The list is
  // capped and scrolls, and it is the only place suggestions render — chips are
  // for what is already attached.
  const [projectQuery, setProjectQuery] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);          // -1: nothing picked yet
  const comboRef = useRef<HTMLDivElement>(null);

  const { shown, total, available } = matchProjects(projectQuery, d.projects, projects);
  const capped = total > shown.length;
  const at = Math.min(highlight, shown.length - 1);

  useEffect(() => {
    if (!projectsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setProjectsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [projectsOpen]);

  const attachProject = (p: ProjectId) => {
    setD((cur) => (cur.projects.includes(p) ? cur : { ...cur, projects: [...cur.projects, p] }));
    setProjectQuery("");
    setHighlight(-1);
    setProjectsOpen(false);
  };

  const detachProject = (p: ProjectId) =>
    setD((cur) => ({ ...cur, projects: cur.projects.filter((x) => x !== p) }));

  /** Add to the controlled list and attach it here in one move. */
  const createProject = () => {
    const name = projectQuery.trim();
    if (!name) return;
    onAddProject(name);
    attachProject(name);
  };

  const projectKeys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setProjectsOpen(true); setHighlight(Math.min(at + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(Math.max(at - 1, 0)); }
    else if (e.key === "Enter") { if (projectsOpen && shown[at]) { e.preventDefault(); attachProject(shown[at]); } }
    else if (e.key === "Escape") { if (projectsOpen) { e.preventDefault(); setProjectsOpen(false); } else setProjectQuery(""); }
  };

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
            {d.projects.length > 0 && (
              <div className="chips">
                {d.projects.map((p) => (
                  <button key={p} type="button" className="chip on" title="click to remove"
                          onClick={() => detachProject(p)}>{p} ✕</button>
                ))}
              </div>
            )}

            <div className="combo" ref={comboRef}>
              <input className="proj-filter" value={projectQuery}
                     role="combobox" aria-label="Relevant projects"
                     aria-expanded={projectsOpen} aria-controls="project-options"
                     aria-autocomplete="list" autoComplete="off"
                     onChange={(e) => { setProjectQuery(e.target.value); setProjectsOpen(true); setHighlight(-1); }}
                     onFocus={() => setProjectsOpen(true)}
                     onKeyDown={projectKeys}
                     placeholder={d.projects.length ? "Search projects to add…" : "Search projects…"} />

              {projectsOpen && (
                <ul className="combo-list" id="project-options" role="listbox">
                  {shown.map((p, i) => (
                    <li key={p} role="option" aria-selected={i === at}
                        className={i === at ? "on" : undefined}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => attachProject(p)}>
                      {p}
                    </li>
                  ))}
                  {shown.length === 0 && <li className="dim">no match</li>}
                </ul>
              )}
            </div>

            {total === 0 ? (
              <div className="small dim">
                {projectQuery.trim() ? (
                  <>
                    No project matches “{projectQuery.trim()}”.{" "}
                    <button type="button" className="mini" onClick={createProject}>
                      add “{projectQuery.trim()}” to the list
                    </button>
                  </>
                ) : "Every project already attached"}
              </div>
            ) : (
              <div className="small dim">
                {capped
                  ? `showing ${shown.length} of ${total} matches — keep typing to narrow`
                  : `${total} project${total === 1 ? "" : "s"}${projectQuery.trim() ? "" : ` of ${available} available`}`}
              </div>
            )}
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
            <label>Priority
              <select value={d.priority}
                      onChange={(e) => set("priority", e.target.value as Ticket["priority"])}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <label>Type
              <select value={d.type ?? ""}
                      onChange={(e) => set("type", (e.target.value || null) as Ticket["type"])}>
                <option value="">— not known yet —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
