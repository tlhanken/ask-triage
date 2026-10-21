import { useEffect, useMemo, useState } from "react";
import { ignoreShortcut } from "./keys";
import { type Ticket, audit, derive, estimateLabel, externalLabel, label } from "./schema";
import { type Store } from "./store";

/**
 * The review sweep.
 *
 * Triage DECIDES: it shows the undecided few and asks accept / defer / decline.
 * This AUDITS: it walks every ticket, in whatever state, and says what is
 * missing or going quietly wrong. Two different jobs — the decision loop is
 * deliberately narrow, so completeness needs its own screen rather than being
 * bolted onto it.
 *
 * Worst first, so working from the top shrinks the list instead of shuffling it.
 */

interface Props {
  store: Store;
  onEdit: (t: Ticket) => void;
}

export default function Review({ store, onEdit }: Props) {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [i, setI] = useState(0);

  const result = useMemo(
    () => audit(store.tickets, store.settings, { includeClosed }),
    [store, includeClosed],
  );
  const rows = result.rows;
  const at = Math.max(0, Math.min(i, rows.length - 1));
  const row = rows[at] ?? null;

  const move = (delta: number) => setI(Math.max(0, Math.min(at + delta, rows.length - 1)));

  /** Jump to the next ticket with something to look at, wrapping once. */
  const nextFlagged = () => {
    const after = rows.findIndex((r, idx) => idx > at && r.alerts.length > 0);
    if (after !== -1) return setI(after);
    const first = rows.findIndex((r) => r.alerts.length > 0);
    if (first !== -1) setI(first);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "j") { move(1); e.preventDefault(); }
      else if (k === "arrowleft" || k === "k") { move(-1); e.preventDefault(); }
      else if (k === "f") { nextFlagged(); e.preventDefault(); }
      else if (k === "enter" && row) { onEdit(row.ticket); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <div className="review-head">
        <b>Review</b>
        <span className="dim small">
          {result.tickets} ticket{result.tickets === 1 ? "" : "s"} ·{" "}
          {result.withAlerts} with something to look at ·{" "}
          {result.gaps} missing data · {result.risks} going wrong
        </span>
        <div className="spacer" />
        <label className="small dim">
          <input type="checkbox" checked={includeClosed}
                 onChange={(e) => { setIncludeClosed(e.target.checked); setI(0); }} />{" "}
          include closed
        </label>
      </div>

      {rows.length === 0 && <div className="card empty">No tickets to review.</div>}

      {row && (
        <>
          <div className="card">
            <div className="review-row">
              <span className="mono dim">{label(row.ticket.id)}</span>
              <b>{row.ticket.name}</b>
              <div className="spacer" />
              <span className="dim small">{at + 1} of {rows.length}</span>
            </div>
            <div className="badges">
              {row.ticket.projects.map((p) => <span className="badge" key={p}>{p}</span>)}
              <span className="badge">{row.ticket.state}</span>
              <span className="badge">{row.ticket.sprint ?? "backlog"}</span>
              <span className="badge">{estimateLabel(row.ticket.estimate)}</span>
              {row.ticket.dueDate && <span className="badge">due {row.ticket.dueDate}</span>}
              <span className="badge">score {derive(row.ticket, store.settings).score}</span>
            </div>

            {row.ticket.summary
              ? <p className="review-sum">{row.ticket.summary}</p>
              : <p className="review-sum dim">No summary written.</p>}

            {row.ticket.externalUrl && (
              <p className="small dim">
                partner ticket:{" "}
                <a href={row.ticket.externalUrl} target="_blank" rel="noreferrer">
                  {externalLabel(row.ticket.externalUrl)}
                </a>
              </p>
            )}

            {row.alerts.length === 0 ? (
              <p className="dim small" style={{ marginTop: 12 }}>Nothing flagged. Clean.</p>
            ) : (
              <ul className="alerts">
                {row.alerts.map((a) => (
                  <li key={a.kind}>
                    <span className={"badge " + (a.severity === "risk" ? "flag" : "")}>{a.what}</span>
                    <span className="small">{a.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="review-controls">
            <button onClick={() => move(-1)} disabled={at === 0}>← previous</button>
            <button onClick={() => move(1)} disabled={at >= rows.length - 1}>next →</button>
            <button className="pick" onClick={nextFlagged}>next flagged</button>
            <div className="spacer" />
            <span className="dim small">j / k step · f next flagged · enter to edit</span>
            <button onClick={() => onEdit(row.ticket)}>Edit ticket</button>
          </div>
        </>
      )}
    </div>
  );
}
