import { useMemo, useState } from "react";
import { type Ticket, STATES, derive, isOpen, matchProjects } from "./schema";
import { type Store, projectUsage } from "./store";

/** Project view: pick a project, see every ticket on it, grouped by state. */

interface Props {
  store: Store;
  onEdit: (t: Ticket) => void;
  onAddProject: (name: string) => void;
  onRemoveProject: (name: string) => void;
}

export default function Projects({ store, onEdit, onAddProject, onRemoveProject }: Props) {
  const list = store.settings.projects;
  const [chosen, setChosen] = useState(list[0] ?? "");
  const [showClosed, setShowClosed] = useState(false);
  const [newName, setNewName] = useState("");
  const [manageQuery, setManageQuery] = useState("");

  // The chosen project may have just been removed; fall back rather than showing
  // an empty view for something that no longer exists.
  const selected = list.includes(chosen) ? chosen : (list[0] ?? "");

  const all = store.tickets.filter((t) => t.projects.includes(selected));
  const shown = (showClosed ? all : all.filter(isOpen))
    .sort((a, b) => derive(b, store.settings).score - derive(a, store.settings).score);

  // One pass over the tickets, not one pass per project. At a few hundred
  // projects the per-project scan is hundreds of full scans on every render.
  const counts = useMemo(() => {
    const tally = new Map<string, { open: number; total: number; critical: number }>(
      list.map((p) => [p, { open: 0, total: 0, critical: 0 }]),
    );
    for (const t of store.tickets) {
      const live = isOpen(t);
      const critical = live && t.priority === "Critical";
      for (const p of t.projects) {
        const c = tally.get(p);
        if (!c) continue;                     // a project no longer on the list
        c.total += 1;
        if (live) c.open += 1;
        if (critical) c.critical += 1;
      }
    }
    return list.map((p) => ({ p, ...tally.get(p)! }));
  }, [store.tickets, list]);

  const manage = matchProjects(manageQuery, [], list);

  const tryRemove = (name: string) => {
    const used = projectUsage(store, name);
    const msg = used === 0
      ? `Remove the project “${name}”? No ticket uses it.`
      : `Remove the project “${name}”? ${used} ticket${used === 1 ? "" : "s"} will be detached from it. ` +
        "This is recorded, so it can be reverted from History.";
    if (window.confirm(msg)) onRemoveProject(name);
  };

  const grouped = STATES
    .map((state) => ({ state, tickets: shown.filter((t) => t.state === state) }))
    .filter((g) => g.tickets.length > 0);

  return (
    <div>
      <div className="toolbar">
        <span className="dim small">Project</span>
        {counts.map(({ p, open, critical }) => (
          <button key={p} className={"chip " + (p === selected ? "on" : "")} onClick={() => setChosen(p)}>
            {p} <span className="dim">{open}{critical > 0 ? ` · ${critical} crit` : ""}</span>
          </button>
        ))}
        <div className="spacer" />
        <label className="small dim">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          {" "}show closed
        </label>
      </div>

      <details className="tier">
        <summary>
          Manage projects{" "}
          <span className="dim small">
            {list.length} in the list — removing one detaches it from every ticket
          </span>
        </summary>

        <div className="toolbar">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
                 placeholder="New project name"
                 onKeyDown={(e) => {
                   if (e.key === "Enter" && newName.trim()) {
                    e.preventDefault(); onAddProject(newName); setNewName("");
                   }
                 }} />
          <button onClick={() => { onAddProject(newName); setNewName(""); }} disabled={!newName.trim()}>
            add project
          </button>
          <div className="spacer" />
          <input value={manageQuery} onChange={(e) => setManageQuery(e.target.value)}
                 placeholder="Filter projects…" />
        </div>

        <ul className="alerts">
          {manage.shown.map((p) => {
            const used = projectUsage(store, p);
            return (
              <li key={p}>
                <b>{p}</b>
                <span className="dim small">{used} ticket{used === 1 ? "" : "s"}</span>
                <div className="spacer" />
                <button className="mini" onClick={() => tryRemove(p)}>remove</button>
              </li>
            );
          })}
          {manage.shown.length === 0 && <li className="dim">No project matches that filter.</li>}
        </ul>
        {manage.total > manage.shown.length && (
          <div className="dim small">
            showing {manage.shown.length} of {manage.total} — filter to narrow
          </div>
        )}
      </details>

      <h2 style={{ margin: "4px 0 12px" }}>{selected || "no project"} — {shown.length} {showClosed ? "tickets" : "open"}</h2>

      {shown.length === 0 && <div className="empty">Nothing on {selected} right now.</div>}

      {grouped.map(({ state, tickets }) => (
        <div className="group" key={state}>
          <div className="group-head">{state} <span className="dim">({tickets.length})</span></div>
          <table>
            <thead>
              <tr><th>TKT</th><th>Name</th><th>Projects</th><th>Type</th><th>Due</th><th>Sprint</th><th>Score</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const d = derive(t, store.settings);
                return (
                  <tr key={t.id} className="clickable" onClick={() => onEdit(t)}>
                    <td className="mono">{String(d.id).padStart(2, "0")}</td>
                    <td>{d.name}</td>
                    <td>{d.projects.map((p) => <span className="chip mini" key={p}>{p}</span>)}</td>
                    <td className={d.priority === "Critical" ? "tag Decline" : ""}>{d.priority}</td>
                    <td className="dim">{d.type ?? "—"}</td>
                    <td>{d.dueDate ?? "—"}</td>
                    <td>{d.sprint ?? "—"}</td>
                    <td className="mono">{d.score}</td>
                    <td>{d.flags.map((f) => <span className="chip mini flag" key={f}>{f}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {!showClosed && all.some((t) => !isOpen(t)) && (
        <div className="dim small" style={{ marginTop: 12 }}>
          {all.filter((t) => !isOpen(t)).length} closed ticket(s) hidden — tick “show closed”.
        </div>
      )}
    </div>
  );
}
