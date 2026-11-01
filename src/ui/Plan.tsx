import { useEffect, useMemo, useState } from "react";
import { ignoreShortcut } from "./keys";
import { derive, missingRequired, nudges, REQUIRED_WHY, riskAlerts } from "../domain/assess";
import { REVISIT_WEEK_CHOICES, REVISIT_WEEKDAY, revisitInWeeks } from "../domain/dates";
import { findSprint } from "../domain/releases";
import { type DecisionAction, estimateLabel, externalLabel, label, priorityLabel, type Ticket } from "../domain/schema";
import { type CloseOutChoice, defaultRevisit } from "../domain/decisions";
import { type Move } from "../domain/optimize";
import { checkReport, closeOutQueue, type FillOutItem, fillOutQueue, pipeline, scheduleQueue } from "../domain/pipeline";
import { type Store } from "../domain/store";
import { DueField, EstimateField, PriorityField, TypeField } from "./fields";
import Schedule from "./Schedule";

/**
 * The Plan page: fill out, schedule, check.
 *
 * Each step is a queue that empties. Stepping through one changes nothing; only an
 * explicit key or button writes. j and k step in every step; the decision keys
 * (x decline, d defer, b block, a take on) work only in Fill out.
 */

export type Step = "fill" | "schedule" | "check";

interface Props {
  store: Store;
  step: Step;
  onStep: (s: Step) => void;
  onEdit: (t: Ticket) => void;
  onFill: (id: number, patch: Partial<Ticket>) => void;
  onDecide: (id: number, action: DecisionAction, reason: string, revisit: string | null) => void;
  onCloseOut: (choices: { id: number; choice: CloseOutChoice }[]) => void;
  onMove: (id: number, sprint: string | null) => void;
  onAddSprint: (name: string) => void;
  onRemoveSprint: (name: string) => void;
  onShiftSprint: (name: string, delta: -1 | 1) => void;
  onApplyPlan: (moves: Move[]) => void;
  onEditSprint: (name: string) => void;
  onFillDates: () => void;
}

export default function Plan(props: Props) {
  const { store, step, onStep } = props;
  const p = useMemo(() => pipeline(store), [store]);
  const fill = useMemo(() => fillOutQueue(store), [store]);
  const ready = useMemo(() => scheduleQueue(store), [store]);
  const check = useMemo(() => checkReport(store), [store]);
  const closeOut = useMemo(() => closeOutQueue(store), [store]);

  // One cursor per step, as a position in that step's queue.
  const [at, setAt] = useState<Record<Step, number>>({ fill: 0, schedule: 0, check: 0 });
  const checkIds = useMemo(
    () => [...closeOut.flatMap((c) => c.tickets.map((t) => t.id)), ...check.flatMap((r) => r.rows.map((x) => x.ticket.id))],
    [closeOut, check],
  );
  const ids: Record<Step, number[]> = {
    fill: fill.map((x) => x.ticket.id),
    schedule: ready.map((t) => t.id),
    check: checkIds,
  };
  const len = ids[step].length;
  const cur = Math.max(0, Math.min(at[step], len - 1));
  const focusId = ids[step][cur] ?? null;
  const go = (delta: number) => setAt((a) => ({ ...a, [step]: Math.max(0, Math.min(cur + delta, len - 1)) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      const k = e.key.toLowerCase();
      if (k === "j") { go(1); e.preventDefault(); }
      else if (k === "k") { go(-1); e.preventDefault(); }
      else if (k === "enter" && focusId !== null && step !== "fill") {
        const t = store.tickets.find((x) => x.id === focusId);
        if (t) { props.onEdit(t); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tab = (id: Step, name: string, n: number) => (
    <button className={step === id ? "on" : ""} onClick={() => onStep(id)} aria-pressed={step === id}>
      {name} <span className="count">{n}</span>
    </button>
  );

  return (
    <div>
      <nav className="steps" aria-label="Plan steps">
        {tab("fill", "1 · Fill out", p.fillOut)}
        {tab("schedule", "2 · Schedule", p.schedule)}
        {tab("check", "3 · Check", p.check)}
        <div className="spacer" />
        <span className="dim small">j / k step{step === "fill" ? " · x d b a decide" : " · enter to edit"}</span>
      </nav>

      {step === "fill" && (
        <FillOut store={store} queue={fill} at={cur} onStepTo={(i) => setAt((a) => ({ ...a, fill: i }))}
                 onEdit={props.onEdit} onFill={props.onFill} onDecide={props.onDecide} />
      )}
      {step === "schedule" && (
        <Schedule store={store} focusId={focusId} onEdit={props.onEdit} onMove={props.onMove}
                  onAddSprint={props.onAddSprint} onRemoveSprint={props.onRemoveSprint}
                  onShiftSprint={props.onShiftSprint} onApplyPlan={props.onApplyPlan}
                  onEditSprint={props.onEditSprint} onFillDates={props.onFillDates} />
      )}
      {step === "check" && (
        <Check store={store} report={check} closeOut={closeOut} focusId={focusId}
               onEdit={props.onEdit} onCloseOut={props.onCloseOut} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Fill out

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
};

type Pending = "Decline" | "Defer" | "Block";
const KEYS: Record<string, Pending | "Accept"> = { x: "Decline", d: "Defer", b: "Block", a: "Accept" };

function FillOut({ store, queue, at, onStepTo, onEdit, onFill, onDecide }: {
  store: Store;
  queue: FillOutItem[];
  at: number;
  onStepTo: (i: number) => void;
  onEdit: (t: Ticket) => void;
  onFill: (id: number, patch: Partial<Ticket>) => void;
  onDecide: (id: number, action: DecisionAction, reason: string, revisit: string | null) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [revisit, setRevisit] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const item = queue[at] ?? null;
  const t = item?.ticket ?? null;

  const reset = () => { setPending(null); setReason(""); setRevisit(""); };

  const commit = (action: DecisionAction) => {
    if (!t) return;
    const needsRevisit = action === "Defer" || action === "Block";
    onDecide(t.id, action, reason.trim(), needsRevisit ? (revisit || defaultRevisit()) : null);
    setToast(`Recorded ${action.toLowerCase()} · ${label(t.id)}`);
    reset();
  };

  const start = (action: Pending | "Accept") => {
    if (!t) return;
    if (action === "Accept") {
      if (!item?.returned) return;                       // only returned work is taken on by key
      commit("Accept");
      return;
    }
    setPending(action);
    setReason("");
    setRevisit(action === "Decline" ? "" : defaultRevisit());
  };

  /** One field from the card. If it was the last one missing, the ticket moves on. */
  const fillField = (patch: Partial<Ticket>) => {
    if (!t) return;
    const left = missingRequired({ ...t, ...patch });
    onFill(t.id, patch);
    if (left.length === 0 && !item?.returned) setToast(`${label(t.id)} is ready — moved to Schedule`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      const k = e.key.toLowerCase();
      if (pending) {
        if (k === "enter") { commit(pending); e.preventDefault(); }
        else if (k === "escape") reset();
        return;
      }
      if (k === "escape") { reset(); return; }
      if (k === "]") {
        const next = queue.findIndex((x, i) => i > at && riskAlerts(x.ticket, store.settings).length > 0);
        if (next !== -1) { onStepTo(next); e.preventDefault(); }
        return;
      }
      if (k === "e" && t) { onEdit(t); e.preventDefault(); return; }
      const found = KEYS[k];
      if (found) { start(found); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!toast) return;
    const h = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(h);
  }, [toast]);

  if (!t || !item) {
    return (
      <div className="card empty">
        Nothing to fill out. Every open ticket has a priority, a type, an estimate and a due date
        (or no hard date), and no deferred or blocked work is back yet.
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  const d = derive(t, store.settings);
  const missing = missingRequired(t);
  const help = nudges(t);
  const risks = riskAlerts(t, store.settings);

  return (
    <div>
      <div className="small dim" style={{ marginBottom: 8 }}>
        {at + 1} of {queue.length}
        {queue.filter((x) => x.returned).length > 0 && ` · ${queue.filter((x) => x.returned).length} back from a revisit`}
      </div>

      {item.returned && (
        <div className="small dim returned" style={{ marginBottom: 8 }}>
          <span className="badge flag">back for revisit</span>{" "}
          {t.state === "Blocked" ? "Blocked" : "Deferred"}, and it came back on {item.returned.revisit}.
          {item.returned.reason && <> {t.state === "Blocked" ? "Waiting on" : "Reason"}: <b>{item.returned.reason}</b>.</>}
          {" "}Take it on, or set it aside again.
        </div>
      )}

      <div className="card" key={t.id}>
        <h2>{label(t.id)} · {t.name}</h2>
        <div className="badges">
          {t.projects.map((p) => <span className="badge" key={p}>{p}</span>)}
          <span className={"badge " + (t.priority === "Critical" ? "critical" : "")}>{priorityLabel(t.priority)}</span>
          {t.type && <span className="badge">{t.type}</span>}
          <span className="badge">{estimateLabel(t.estimate)}</span>
          <span className="badge">{t.sprint ? `ships in ${t.sprint}` : "not scheduled"}</span>
          {d.flags.map((f) => <span className="badge flag" key={f}>{f}</span>)}
        </div>

        {missing.length > 0 && (
          <div className="fill-required">
            <div className="flabel">Needed before it can be scheduled</div>
            <div className="form">
              {missing.map((f) => (
                <div key={f} className="fill-field">
                  {f === "priority" && <PriorityField value={t.priority} onChange={(v) => fillField({ priority: v })} />}
                  {f === "type" && <TypeField value={t.type} onChange={(v) => fillField({ type: v })} />}
                  {f === "estimate" && <EstimateField value={t.estimate} onChange={(v) => fillField({ estimate: v })} />}
                  {f === "dueDate" && (
                    <DueField dueDate={t.dueDate} noHardDate={t.noHardDate} onChange={(v) => fillField(v)} />
                  )}
                  <span className="small dim">{REQUIRED_WHY[f].why}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <dl className="grid">
          <dt>Summary</dt><dd>{t.summary || "—"}</dd>
          <dt>Who's waiting</dt><dd>{t.stakeholders.join(", ") || "—"}</dd>
          <dt>Due</dt><dd>{t.dueDate ?? (t.noHardDate ? "no hard date" : "not answered yet")}</dd>
          <dt>Waited</dt><dd>{d.waitedLabel}</dd>
          <dt>Draft score</dt><dd className="mono">{d.score}</dd>
          <dt>External ticket</dt>
          <dd>{t.externalUrl ? <a href={t.externalUrl} target="_blank" rel="noreferrer">{externalLabel(t.externalUrl)}</a> : "—"}</dd>
        </dl>

        {help.length > 0 && (
          <div className="nudges">
            <div className="flabel">Would still help</div>
            <ul className="alerts">
              {help.map((a) => (
                <li key={a.kind}><span className="badge">{a.what}</span><span className="small">{a.why}</span></li>
              ))}
            </ul>
          </div>
        )}

        {risks.length > 0 && (
          <ul className="alerts">
            {risks.map((a) => (
              <li key={a.kind}><span className="badge flag">{a.what}</span><span className="small">{a.why}</span></li>
            ))}
          </ul>
        )}
        {t.notes && <p className="dim small" style={{ marginTop: 12 }}>{t.notes}</p>}
      </div>

      {pending && (
        <div className="prompt">
          <div className="small dim">
            {pending === "Defer" && "Why later, and when to look again?"}
            {pending === "Decline" && "Why won't this happen? (this is the honest bit — say it plainly)"}
            {pending === "Block" && "What is it waiting on, from whom, and when to look again?"}
          </div>
          <label htmlFor="decision-reason">Reason</label>
          <input id="decision-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder={pending === "Block" ? "waiting on the partner's sizing" : "one line"} />
          {pending !== "Decline" && (
            <>
              <label>Come back to it on</label>
              <div className="keys">
                {REVISIT_WEEK_CHOICES.map((n) => (
                  <button key={n} className={revisit === revisitInWeeks(n) ? "pick" : ""}
                          onClick={() => setRevisit(revisitInWeeks(n))}>
                    {n === 1 ? "next week" : `${n} weeks`} — {dayLabel(revisitInWeeks(n))}
                  </button>
                ))}
              </div>
              <div className="small dim">
                Revisits only ever land on {WEEKDAYS[REVISIT_WEEKDAY]}, so set-aside work comes back in
                one batch instead of trickling in every day.
              </div>
            </>
          )}
          <div className="keys">
            <button className="pick" onClick={() => commit(pending)}><b>↵</b> record {pending.toLowerCase()}</button>
            <button onClick={reset}><b>esc</b> cancel</button>
          </div>
        </div>
      )}

      {!pending && (
        <div className="keys">
          {item.returned && (
            <button className="pick" onClick={() => start("Accept")}><b>a</b> take it on</button>
          )}
          <button onClick={() => start("Defer")}><b>d</b> defer</button>
          <button onClick={() => start("Decline")}><b>x</b> decline — won't do</button>
          <button onClick={() => start("Block")}><b>b</b> blocked / hand back</button>
          <button onClick={() => onEdit(t)}><b>e</b> edit everything</button>
          <div className="spacer" />
          <button onClick={() => onStepTo(Math.max(0, at - 1))} disabled={at === 0}><b>k</b> previous</button>
          <button onClick={() => onStepTo(Math.min(queue.length - 1, at + 1))} disabled={at >= queue.length - 1}>
            <b>j</b> next
          </button>
        </div>
      )}

      <div className="small dim" style={{ marginTop: 8 }}>
        To undo a decision, revert it from History.
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Check

function Check({ store, report, closeOut, focusId, onEdit, onCloseOut }: {
  store: Store;
  report: ReturnType<typeof checkReport>;
  closeOut: ReturnType<typeof closeOutQueue>;
  focusId: number | null;
  onEdit: (t: Ticket) => void;
  onCloseOut: (choices: { id: number; choice: CloseOutChoice }[]) => void;
}) {
  // Nothing is pre-selected: every close-out choice is made on purpose.
  const [choices, setChoices] = useState<Record<number, CloseOutChoice>>({});
  const chosen = Object.entries(choices).map(([id, choice]) => ({ id: Number(id), choice }));

  if (report.length === 0 && closeOut.length === 0) {
    return <div className="card empty">Nothing to check. No release is over capacity, and no scheduled work is late or at risk.</div>;
  }

  return (
    <div>
      {closeOut.length > 0 && (
        <section className="card closeout" aria-label="Release close-out">
          <div className="review-row">
            <b>Release close-out</b>
            <span className="dim small">
              These shipped with work still open. Choose for each one; anything left undecided stays here.
            </span>
            <div className="spacer" />
            <button className="pick" disabled={chosen.length === 0}
                    onClick={() => { onCloseOut(chosen); setChoices({}); }}>
              Apply {chosen.length} choice{chosen.length === 1 ? "" : "s"}
            </button>
          </div>
          {closeOut.map((c) => (
            <div key={c.release} className="closeout-release">
              <div className="small"><b>{c.release}</b> <span className="dim">shipped {c.shipped}</span></div>
              {c.tickets.map((t) => (
                <fieldset key={t.id} className={"closeout-row" + (focusId === t.id ? " focus" : "")}>
                  <legend>
                    <button className="tname" onClick={() => onEdit(t)}>{label(t.id)} · {t.name}</button>
                  </legend>
                  {(["Done", "Carry over", "Unschedule"] as const).map((ch) => {
                    const disabled = ch === "Carry over" && !c.next;
                    const text = ch === "Done" ? "Done"
                      : ch === "Carry over" ? (c.next ? `Carry over to ${c.next}` : "Carry over")
                        : "Back to backlog";
                    return (
                      <label key={ch} className={"radio" + (disabled ? " dim" : "")}>
                        <input type="radio" name={`closeout-${t.id}`} checked={choices[t.id] === ch} disabled={disabled}
                               onChange={() => setChoices((x) => ({ ...x, [t.id]: ch }))} />
                        {text}
                      </label>
                    );
                  })}
                  {!c.next && <span className="small dim">No later release to carry over into — add one on Schedule.</span>}
                </fieldset>
              ))}
            </div>
          ))}
        </section>
      )}

      {report.map((r) => {
        const sp = findSprint(store.settings, r.release);
        return (
          <section key={r.release ?? "none"} className="card check-release">
            <div className="review-row">
              <b>{r.release ?? "Not scheduled"}</b>
              {sp && (
                <span className="dim small">
                  {sp.release ? `ships ${sp.release}` : "no release date"} · {r.load}/{r.capacity} units
                </span>
              )}
            </div>
            {r.alerts.length > 0 && (
              <ul className="alerts">
                {r.alerts.map((a) => (
                  <li key={a.kind}><span className="badge flag">{a.what}</span><span className="small">{a.why}</span></li>
                ))}
              </ul>
            )}
            {r.rows.map((row) => (
              <div key={row.ticket.id} className={"check-row" + (focusId === row.ticket.id ? " focus" : "")}>
                <button className="tname" onClick={() => onEdit(row.ticket)}>
                  {label(row.ticket.id)} · {row.ticket.name}
                </button>
                <ul className="alerts">
                  {row.alerts.map((a) => (
                    <li key={a.kind}><span className="badge flag">{a.what}</span><span className="small">{a.why}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
