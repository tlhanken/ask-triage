import { useMemo, useState } from "react";
import { riskAlerts } from "../domain/assess";
import { estimateLabel, isOpen, label, matchProjects, priorityLabel, type Ticket } from "../domain/schema";
import { projectTickets, projectUsage, type Store } from "../domain/store";
import { DueField } from "./fields";

/**
 * Projects: the list on the left, the selected project on the right.
 *
 * A project is a name only. The detail is the project's tickets by due date, with
 * the date editable in the row and a fit warning in the same words Check uses.
 */

interface Props {
  store: Store;
  onEdit: (t: Ticket) => void;
  onEditTicket: (id: number, patch: Partial<Ticket>) => void;
  onAddProject: (name: string) => void;
  onRenameProject: (from: string, to: string) => void;
  onRemoveProject: (name: string) => void;
}

/** The risks that are about dates, shown in the table's fit column. */
const FIT_KINDS = ["PAST-DUE", "WONT-FIT", "STARTS-LATE"];

export default function Projects({ store, onEdit, onEditTicket, onAddProject, onRenameProject, onRemoveProject }: Props) {
  const list = store.settings.projects;
  const [chosen, setChosen] = useState(list[0] ?? "");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // The chosen project may have just been removed or renamed; fall back rather than
  // showing an empty view for something that no longer exists.
  const selected = list.includes(chosen) ? chosen : (list[0] ?? "");

  // One pass over the tickets, not one pass per project. At a few hundred
  // projects the per-project scan is hundreds of full scans on every render.
  const counts = useMemo(() => {
    const tally = new Map<string, { open: number; critical: number }>(list.map((p) => [p, { open: 0, critical: 0 }]));
    for (const t of store.tickets) {
      if (!isOpen(t)) continue;
      for (const p of t.projects) {
        const c = tally.get(p);
        if (!c) continue;                     // a project no longer on the list
        c.open += 1;
        if (t.priority === "Critical") c.critical += 1;
      }
    }
    return tally;
  }, [store.tickets, list]);

  const found = matchProjects(query, [], list);
  const rows = projectTickets(store, selected, showClosed);
  const closedCount = store.tickets.filter((t) => t.projects.includes(selected) && !isOpen(t)).length;

  const create = () => {
    const name = newName.trim();
    if (!name || list.includes(name)) return;
    onAddProject(name);
    setChosen(name);
    setNewName("");
  };

  const tryRemove = (name: string) => {
    const used = projectUsage(store, name);
    const msg = used === 0
      ? `Remove the project “${name}”? No ticket uses it.`
      : `Remove the project “${name}”? ${used} ticket${used === 1 ? "" : "s"} will be detached from it. ` +
        "This is recorded, so it can be reverted from History.";
    if (window.confirm(msg)) onRemoveProject(name);
  };

  const c = counts.get(selected) ?? { open: 0, critical: 0 };

  return (
    <div className="projects">
      <aside className="plist" aria-label="Project list">
        <form className="plist-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New project name"
                 aria-label="New project name" />
          <button type="submit" className="pick" disabled={!newName.trim() || list.includes(newName.trim())}>
            + New project
          </button>
        </form>
        {newName.trim() && list.includes(newName.trim()) && (
          <div className="small dim">“{newName.trim()}” is already in the list.</div>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…"
               aria-label="Search projects" />
        <ul>
          {found.shown.map((p) => {
            const n = counts.get(p) ?? { open: 0, critical: 0 };
            return (
              <li key={p}>
                <button className={p === selected ? "on" : ""} aria-current={p === selected || undefined}
                        onClick={() => { setChosen(p); setRenaming(null); }}>
                  <span>{p}</span>
                  <span className="dim small">{n.open}{n.critical > 0 ? ` · ${n.critical} crit` : ""}</span>
                </button>
              </li>
            );
          })}
          {found.shown.length === 0 && <li className="dim small">No project matches.</li>}
        </ul>
        <div className="dim small">
          {found.total > found.shown.length
            ? `showing ${found.shown.length} of ${found.total} — search to narrow`
            : `${list.length} project${list.length === 1 ? "" : "s"}`}
        </div>
      </aside>

      <section className="pdetail" aria-label="Project detail">
        {!selected && <div className="empty">No projects yet. Create one on the left.</div>}

        {selected && (
          <>
            <div className="pdetail-head">
              {renaming === null ? (
                <>
                  <h2>{selected}</h2>
                  <button onClick={() => setRenaming(selected)}>Rename</button>
                  <button className="danger" onClick={() => tryRemove(selected)}>Remove</button>
                </>
              ) : (
                <Rename from={selected} taken={list} onCancel={() => setRenaming(null)}
                        onSave={(to) => { onRenameProject(selected, to); setChosen(to); setRenaming(null); }} />
              )}
              <div className="spacer" />
              <span className="dim small">{c.open} open{c.critical > 0 ? ` · ${c.critical} critical` : ""}</span>
            </div>

            {rows.length === 0 ? (
              <div className="empty">Nothing open on {selected} right now.</div>
            ) : (
              <table className="pdates">
                <thead>
                  <tr><th>Ticket</th><th>Priority</th><th>Ships in</th><th>Due</th><th>Estimate</th><th>Fit</th></tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const fit = riskAlerts(t, store.settings).filter((a) => FIT_KINDS.includes(a.kind));
                    return (
                      <tr key={t.id} className={isOpen(t) ? "" : "dim"}>
                        <td>
                          <button className="tname" onClick={() => onEdit(t)}>
                            <span className="mono dim">{label(t.id)}</span> {t.name}
                          </button>
                        </td>
                        <td className={t.priority === "Critical" ? "tag Decline" : ""}>{priorityLabel(t.priority)}</td>
                        <td>{t.sprint ?? <span className="dim">not scheduled</span>}</td>
                        <td>
                          {isOpen(t)
                            ? <DueField dueDate={t.dueDate} noHardDate={t.noHardDate} onChange={(v) => onEditTicket(t.id, v)} />
                            : (t.dueDate ?? "—")}
                        </td>
                        <td>{estimateLabel(t.estimate)}</td>
                        <td>
                          {fit.length === 0 ? <span className="dim">—</span> : fit.map((a) => (
                            <div key={a.kind} title={a.why}>
                              <span className="chip mini flag">{a.what}</span> <span className="small">{a.why}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {closedCount > 0 && (
              <label className="small dim" style={{ display: "block", marginTop: 12 }}>
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />{" "}
                show {closedCount} closed
              </label>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Rename in place. A name already in the list is refused before it is sent. */
function Rename({ from, taken, onSave, onCancel }: {
  from: string; taken: readonly string[]; onSave: (to: string) => void; onCancel: () => void;
}) {
  const [to, setTo] = useState(from);
  const clean = to.trim();
  const problem = !clean ? "A name is needed." : clean !== from && taken.includes(clean) ? `“${clean}” is already a project.` : null;
  return (
    <form className="rename" onSubmit={(e) => { e.preventDefault(); if (!problem && clean !== from) onSave(clean); }}>
      <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} aria-label="New name"
             onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} />
      <button type="submit" className="pick" disabled={!!problem || clean === from}>Save name</button>
      <button type="button" onClick={onCancel}>Cancel</button>
      {problem && <span className="small tag Decline">{problem}</span>}
    </form>
  );
}
