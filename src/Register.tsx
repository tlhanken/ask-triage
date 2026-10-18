import { useMemo, useState } from "react";
import { type DerivedTicket, type Ticket, derive, externalLabel } from "./schema";
import type { Store } from "./store";

type SortKey = "score" | "id" | "name" | "state" | "type" | "ageDays" | "daysToDue" | "sprint";

export default function Register({ store, onEdit }: { store: Store; onEdit: (t: Ticket) => void }) {
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    const list: DerivedTicket[] = store.tickets
      .map((t) => derive(t, store.settings))
      .filter((t) => (stateFilter ? t.state === stateFilter : true))
      .filter((t) =>
        !needle ||
        [t.name, t.summary, t.projects.join(" "), t.notes, t.stakeholders.join(" "), externalLabel(t.externalUrl)]
          .join(" ").toLowerCase().includes(needle));
    const dir = sort === "score" ? -1 : 1;
    return list.sort((a, b) => {
      const x = (a[sort] ?? 0) as number | string;
      const y = (b[sort] ?? 0) as number | string;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [store, q, stateFilter, sort]);

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort(key)} className={sort === key ? "" : "dim"}>{label}</th>
  );

  return (
    <div>
      <div className="toolbar">
        <input placeholder="filter name, summary, project, owner, stakeholder, ticket…" value={q}
               onChange={(e) => setQ(e.target.value)} style={{ minWidth: 320 }} />
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">all states</option>
          {["New", "Accepted-Backlog", "Committed", "In Progress", "Blocked", "Deferred", "Won't Do", "Done"]
            .map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="dim small">{rows.length} of {store.tickets.length} · click a row to edit</span>
      </div>
      <table>
        <thead>
          <tr>
            {th("id", "TKT")}
            {th("name", "Name")}
            <th>Projects</th>
            {th("type", "Type")}
            {th("state", "State")}
            {th("sprint", "Sprint")}
            {th("daysToDue", "Due")}
            {th("ageDays", "Waited")}
            {th("score", "Score")}
            <th>Flags</th>
            <th>Ticket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="clickable" onClick={() => onEdit(t)}>
              <td className="mono">{String(t.id).padStart(2, "0")}</td>
              <td>{t.name}</td>
              <td>{t.projects.map((p) => <span className="chip mini" key={p}>{p}</span>)}</td>
              <td className={t.type === "Critical" ? "tag Decline" : ""}>{t.type}</td>
              <td>{t.state}</td>
              <td>{t.sprint ?? "—"}</td>
              <td>{t.dueDate ? `${t.dueDate} (${t.daysToDue! < 0 ? `${-t.daysToDue!}d late` : `${t.daysToDue}d`})` : "—"}</td>
              <td>{t.waitedLabel}</td>
              <td className="mono">{t.score}</td>
              <td>{t.flags.map((f) => <span className="chip mini flag" key={f}>{f}</span>)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {t.externalUrl
                  ? <a href={t.externalUrl} target="_blank" rel="noreferrer">{externalLabel(t.externalUrl)}</a>
                  : <span className="dim">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
