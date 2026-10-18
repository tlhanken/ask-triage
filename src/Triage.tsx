import { useEffect, useMemo, useState } from "react";
import { type DecisionAction, type Ticket, derive, externalLabel, label } from "./schema";
import { type Store, defaultRevisitDays, undecided, acceptedThisSprint } from "./store";

/** The decision loop. One ticket at a time, context pre-loaded, one keystroke
 *  per decision, capacity visible at the moment of choosing. */

interface Props {
  store: Store;
  onDecide: (ticketId: number, action: DecisionAction, reason: string, revisit: string | null) => void;
  onUndo: () => void;
}

const HORIZON: Record<DecisionAction, string> = {
  Accept: "a",
  Defer: "f",
  Decline: "x",
  Block: "b",
};

export default function Triage({ store, onDecide, onUndo }: Props) {
  const [skipped, setSkipped] = useState<number[]>([]);
  const [pending, setPending] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [revisit, setRevisit] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const queue = useMemo(
    () => undecided(store).filter((t) => !skipped.includes(t.id)),
    [store, skipped],
  );
  const current = queue[0] ?? null;
  const target = store.settings.commitTargetPerSprint;
  const accepted = acceptedThisSprint(store);
  const pct = Math.min(100, (accepted / target) * 100);
  const over = accepted > target;

  const reset = () => { setPending(null); setReason(""); setRevisit(""); };

  const commit = (action: DecisionAction) => {
    if (!current) return;
    onDecide(current.id, action, reason.trim(), revisit || null);
    setToast(`Recorded ${action.toLowerCase()} · ${label(current.id)}`);
    reset();
  };

  const act = (action: DecisionAction) => {
    if (!current) return;
    if (action === "Accept") commit(action);   // no reason needed to say yes
    else { setPending(action); setReason(""); if (action === "Defer") setRevisit(defaultRevisit()); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (pending) {
        if (k === "enter") { commit(pending); e.preventDefault(); }
        else if (k === "escape") reset();
        return;
      }
      if (k === "escape") { reset(); return; }
      if (k === "u") { onUndo(); setToast("Undid last decision"); return; }
      if (k === "s") { if (current) setSkipped((x) => [...x, current.id]); return; }
      const found = (Object.keys(HORIZON) as DecisionAction[]).find((a) => HORIZON[a] === k);
      if (found) { act(found); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!toast) return;
    const h = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(h);
  }, [toast]);

  return (
    <div>
      <div className="capacity">
        <div className="row small">
          <span className="dim">Committed this sprint — {accepted} of {target}</span>
          <span className={over ? "tag Decline" : "dim"}>
            {over ? `over capacity by ${accepted - target} — something has to come off` : `${target - accepted} slots left`}
          </span>
        </div>
        <div className="bar"><i className={over ? "over" : ""} style={{ width: `${pct}%` }} /></div>
      </div>

      {!current && (
        <div className="card empty">
          Queue clear. {skipped.length > 0 ? `${skipped.length} skipped — reload to revisit.` : "Nice."}
        </div>
      )}

      {current && <Card ticket={current} settings={store.settings} />}

      {current && pending && (
        <div className="prompt">
          <div className="small dim">
            {pending === "Defer" && "Why later, and when to look again?"}
            {pending === "Decline" && "Why won't this happen? (this is the honest bit — say it plainly)"}
            {pending === "Block" && "What is it waiting on, and from whom?"}
          </div>
          <label>Reason</label>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder={pending === "Block" ? "waiting on the partner's sizing" : "one line"} />
          {pending === "Defer" && (
            <>
              <label>Revisit on</label>
              <input type="date" value={revisit} onChange={(e) => setRevisit(e.target.value)} />
            </>
          )}
          <div className="keys">
            <button className="pick" onClick={() => commit(pending)}><b>↵</b> record {pending.toLowerCase()}</button>
            <button onClick={reset}><b>esc</b> cancel</button>
          </div>
        </div>
      )}

      {current && !pending && (
        <div className="keys">
          <button onClick={() => act("Accept")}><b>a</b> accept into {store.settings.currentSprint}</button>
          <button onClick={() => act("Defer")}><b>f</b> defer</button>
          <button onClick={() => act("Decline")}><b>x</b> decline — won't do</button>
          <button onClick={() => act("Block")}><b>b</b> blocked / hand back</button>
          <button onClick={() => setSkipped((x) => [...x, current.id])}><b>s</b> skip</button>
          <button onClick={onUndo} disabled={store.decisions.length === 0}><b>u</b> undo</button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function defaultRevisit(): string {
  const d = new Date(Date.now() + defaultRevisitDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Card({ ticket, settings }: { ticket: Ticket; settings: Store["settings"] }) {
  const d = derive(ticket, settings);
  const due = d.daysToDue;
  return (
    <div className="card">
      <h2>{d.id ? `${label(d.id)} · ` : ""}{d.name}</h2>
      <div className="badges">
        {d.projects.map((p) => <span className="badge" key={p}>{p}</span>)}
        <span className={"badge " + (d.type === "Critical" ? "critical" : "")}>{d.type}</span>
        <span className="badge">{d.size}</span>
        <span className="badge">{d.ownerType}: {d.owner || "—"}</span>
        {d.state !== "New" && <span className="badge">{d.state}</span>}
        {d.flags.map((f) => <span className="badge flag" key={f}>{f}</span>)}
      </div>
      <dl className="grid">
        <dt>Summary</dt><dd>{d.summary || "—"}</dd>
        <dt>Who's waiting</dt><dd>{d.stakeholders.join(", ") || "—"}</dd>
        <dt>Waited</dt><dd>{d.waitedLabel}</dd>
        <dt>Due</dt>
        <dd>
          {d.dueDate ?? "no hard date"}
          {due !== null && (
            <span className={"badge " + (due <= 21 ? "flag" : "")} style={{ marginLeft: 8 }}>
              {due < 0 ? `${-due}d overdue` : `${due}d left`}
            </span>
          )}
        </dd>
        <dt>Carried over</dt><dd>{d.carryovers} sprint{d.carryovers === 1 ? "" : "s"}</dd>
        <dt>Draft score</dt><dd className="mono">{d.score}</dd>
        <dt>External ticket</dt>
        <dd>{d.externalUrl ? <a href={d.externalUrl} target="_blank" rel="noreferrer">{externalLabel(d.externalUrl)}</a> : "—"}</dd>
        <dt>Next action</dt><dd>{d.nextAction || "—"}</dd>
      </dl>
    </div>
  );
}
