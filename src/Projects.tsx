import { useState } from "react";
import { type ProjectId, type Ticket, PROJECTS, STATES, derive, isOpen } from "./schema";
import type { Store } from "./store";

/** Project view: pick a project, see every ticket on it, grouped by state. */

interface Props {
  store: Store;
  onEdit: (t: Ticket) => void;
}

export default function Projects({ store, onEdit }: Props) {
  const [selected, setSelected] = useState<ProjectId>(PROJECTS[0]);
  const [showClosed, setShowClosed] = useState(false);

  const all = store.tickets.filter((t) => t.projects.includes(selected));
  const shown = (showClosed ? all : all.filter(isOpen))
    .sort((a, b) => derive(b, store.settings).score - derive(a, store.settings).score);

  const counts = PROJECTS.map((p) => {
    const ts = store.tickets.filter((t) => t.projects.includes(p));
    return { p, open: ts.filter(isOpen).length, total: ts.length, critical: ts.filter((t) => t.type === "Critical" && isOpen(t)).length };
  });

  const grouped = STATES
    .map((state) => ({ state, tickets: shown.filter((t) => t.state === state) }))
    .filter((g) => g.tickets.length > 0);

  return (
    <div>
      <div className="toolbar">
        <span className="dim small">Project</span>
        {counts.map(({ p, open, critical }) => (
          <button key={p} className={"chip " + (p === selected ? "on" : "")} onClick={() => setSelected(p)}>
            {p} <span className="dim">{open}{critical > 0 ? ` · ${critical} crit` : ""}</span>
          </button>
        ))}
        <div className="spacer" />
        <label className="small dim">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          {" "}show closed
        </label>
      </div>

      <h2 style={{ margin: "4px 0 12px" }}>{selected} — {shown.length} {showClosed ? "tickets" : "open"}</h2>

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
                    <td className={d.type === "Critical" ? "tag Decline" : ""}>{d.type}</td>
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
