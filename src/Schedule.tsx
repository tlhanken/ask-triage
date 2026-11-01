import { useState, type DragEvent, type ReactNode } from "react";
import {
  type Ticket, beingWorkedOn, daysSince, daysToRelease, derive, estimateLabel, fillState, findSprint,
  hasShipped, isFrozen, isOpen, isReady, priorityLabel, spanOf, startsTooLate,
} from "./schema";
import {
  type Move, type OptimizeResult, type Store, explainPlan, optimizePlan, scheduleQueue, slippedIn, spanLabel,
} from "./store";

/** Schedule: ready work on the left, then the releases in the owner's display order.
 *  A card sits where its ticket ships; earlier releases it spans show a slim row.
 *  Cards drag between columns; the stored order is the display order. */

interface Props {
  store: Store;
  /** Highlighted by j/k in the ready column. */
  focusId: number | null;
  onEdit: (t: Ticket) => void;
  onMove: (id: number, sprint: string | null) => void;
  onAddSprint: (name: string) => void;
  onRemoveSprint: (name: string) => void;
  onShiftSprint: (name: string, delta: -1 | 1) => void;
  onApplyPlan: (moves: Move[]) => void;
  onEditSprint: (name: string) => void;
  onFillDates: () => void;
}

export default function Schedule({
  store, focusId, onEdit, onMove, onAddSprint, onRemoveSprint, onShiftSprint, onApplyPlan, onEditSprint,
  onFillDates,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [plan, setPlan] = useState<OptimizeResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const why = plan ? explainPlan(plan) : "";

  const open = store.tickets.filter(isOpen);
  const ready = scheduleQueue(store);
  const target = store.settings.commitTargetPerSprint;
  const releases = store.settings.sprints;

  /** Adding to a frozen release is allowed, and reported rather than blocked. */
  const move = (id: number, sprint: string | null) => {
    const sp = findSprint(store.settings, sprint);
    if (sp && isFrozen(sp)) {
      const after = sp.freeze ? (daysSince(sp.freeze) ?? 0) : 0;
      setNotice(
        `${sp.name} froze on ${sp.freeze}` +
        (after > 0 ? `, ${after} day${after === 1 ? "" : "s"} ago` : ", today") +
        ". This is scope after freeze.",
      );
    }
    onMove(id, sprint);
  };

  const drop = (sprint: string | null) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer?.getData("text/plain") ?? "";
    const id = dragging ?? (raw ? Number(raw) : NaN);
    if (Number.isFinite(id) && id > 0) move(id, sprint);
    setDragging(null);
    setOver(null);
  };

  const byScore = (a: Ticket, b: Ticket) =>
    derive(b, store.settings).score - derive(a, store.settings).score;

  return (
    <div>
      <div className="toolbar">
        <span className="dim small">
          {releases.length} releases · {open.length} open · {ready.length} ready to schedule ·
          {" "}drag a card between columns · click a release name for its dates
        </span>
        <div className="spacer" />
        <button onClick={() => setPlan(optimizePlan(store))} title="Propose releases for unscheduled work">
          Auto-optimize
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem("newsprint") as HTMLInputElement | null;
            if (input?.value) { onAddSprint(input.value); input.value = ""; }
          }}
        >
          <input name="newsprint" placeholder="add release (e.g. v0.26)" style={{ width: 170 }} />
        </form>
      </div>

      {notice && (
        <div className="notice" role="status">
          <span><b>Scope after freeze.</b> {notice}</span>
          <div className="spacer" />
          <button onClick={() => setNotice(null)}>dismiss</button>
        </div>
      )}

      {plan && (
        <div className="plan">
          <div className="plan-head">
            <b>Proposed releases</b>
            <span className="dim small">
              {plan.moves.length} move{plan.moves.length === 1 ? "" : "s"} · nothing moves until you
              apply · places only ready work, never into a shipped or frozen release
            </span>
            <div className="spacer" />
            {plan.moves.length > 0 && (
              <button className="pick" onClick={() => { onApplyPlan(plan.moves); setPlan(null); }}>Apply</button>
            )}
            <button onClick={() => setPlan(null)}>Discard</button>
          </div>

          {plan.moves.length > 0 ? (
            <ul className="plan-list">
              {plan.moves.map((m) => (
                <li key={m.id}>
                  <b>{m.label}</b> {m.name} → <b>{m.to}</b>{" "}
                  <span className="dim small">{m.reason}</span>
                  {m.warning && <span className="chip mini flag" style={{ marginLeft: 6 }}>{m.warning}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="dim small" style={{ padding: "8px 0" }}>{why}</div>
          )}

          {plan.moves.length > 0 && why && (
            <div className="dim small" style={{ paddingTop: 8 }}>{why}</div>
          )}

          {plan.undated.length > 0 && (
            <div className="plan-head" style={{ marginTop: 10 }}>
              <span className="dim small">
                {plan.undated.join(", ")} {plan.undated.length === 1 ? "has" : "have"} no release date,
                so {plan.undated.length === 1 ? "it" : "they"} cannot be checked against a due date.
              </span>
              <div className="spacer" />
              <button onClick={() => { onFillDates(); setPlan(null); }}>
                Give them a two-week cadence
              </button>
            </div>
          )}
        </div>
      )}

      <div className="board">
        <Column
          title="Ready to schedule"
          subtitle={`${ready.length} ready, by priority`}
          dates={null}
          tickets={ready}
          continuing={[]}
          focusId={focusId}
          store={store}
          onEdit={onEdit}
          onMove={move}
          onRemove={null}
          onShift={null}
          isOver={over === "Ready"}
          onDragOverColumn={() => setOver("Ready")}
          onDragLeaveColumn={() => setOver((c) => (c === "Ready" ? null : c))}
          onDropColumn={drop(null)}
          draggingId={dragging}
          onCardDragStart={setDragging}
          onCardDragEnd={() => { setDragging(null); setOver(null); }}
        />
        {releases.map((sp, i) => {
          const ts = open.filter((t) => t.sprint === sp.name);
          const continuing = open.filter((t) => t.sprint !== sp.name && spanOf(t, store.settings).releases.includes(sp.name));
          const { load, room, state } = fillState(store.tickets, sp.name, store.settings);
          const frozen = isFrozen(sp);
          const shipped = hasShipped(sp);
          const toRelease = daysToRelease(sp);
          const slips = slippedIn(store, sp.name);
          return (
            <Column
              key={sp.name}
              title={sp.name}
              subtitle={`${load}/${target} units — ${state === "over" ? `over by ${-room}` : state === "full" ? "FULL" : `${room} left`}`}
              dates={
                <>
                  {sp.freeze ? `freeze ${sp.freeze}` : "no freeze"}
                  {" · "}
                  {sp.release ? `ships ${sp.release}` : "no release date"}
                  {toRelease !== null && !shipped && (
                    <span className={"chip mini " + (toRelease <= 7 ? "flag" : "")} style={{ marginLeft: 6 }}>
                      {toRelease < 0 ? `${-toRelease}d late` : `${toRelease}d`}
                    </span>
                  )}
                  {frozen && <span className="chip mini flag" style={{ marginLeft: 6 }}>frozen</span>}
                  {shipped && <span className="chip mini" style={{ marginLeft: 6 }}>shipped</span>}
                  {slips.length > 0 && (
                    <span className="chip mini flag" style={{ marginLeft: 6 }}>
                      {slips.length} after freeze
                    </span>
                  )}
                </>
              }
              over={state !== "room"}
              tickets={[...ts].sort(byScore)}
              continuing={continuing}
              focusId={null}
              store={store}
              onEdit={onEdit}
              onMove={move}
              onEditSprint={() => onEditSprint(sp.name)}
              onRemove={() => onRemoveSprint(sp.name)}
              onShift={(delta) => onShiftSprint(sp.name, delta)}
              canLeft={i > 0}
              canRight={i < releases.length - 1}
              isOver={over === sp.name}
              onDragOverColumn={() => setOver(sp.name)}
              onDragLeaveColumn={() => setOver((c) => (c === sp.name ? null : c))}
              onDropColumn={drop(sp.name)}
              draggingId={dragging}
              onCardDragStart={setDragging}
              onCardDragEnd={() => { setDragging(null); setOver(null); }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Column({
  title, subtitle, dates, tickets, continuing, focusId, store, onEdit, onMove, over, onRemove, onEditSprint,
  onShift, canLeft, canRight, isOver, onDragOverColumn, onDragLeaveColumn, onDropColumn, draggingId,
  onCardDragStart, onCardDragEnd,
}: {
  title: string;
  subtitle: string;
  dates: ReactNode;
  tickets: Ticket[];
  /** Tickets that span this release but ship later: shown as slim rows. */
  continuing: Ticket[];
  focusId: number | null;
  store: Store;
  onEdit: (t: Ticket) => void;
  onMove: (id: number, sprint: string | null) => void;
  over?: boolean;
  onRemove: (() => void) | null;
  onEditSprint?: () => void;
  onShift: ((delta: -1 | 1) => void) | null;
  canLeft?: boolean;
  canRight?: boolean;
  isOver: boolean;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDropColumn: (e: DragEvent<HTMLDivElement>) => void;
  draggingId: number | null;
  onCardDragStart: (id: number) => void;
  onCardDragEnd: () => void;
}) {
  return (
    <div className="col">
      <div className="col-head">
        {onEditSprint
          ? <button className="col-name" onClick={onEditSprint} title="edit freeze and release dates">{title}</button>
          : <b>{title}</b>}
        <span className={"small " + (over ? "tag Decline" : "dim")}>{subtitle}</span>
        {onShift && (
          <div className="col-ctl">
            <button className="x" title="move left" disabled={!canLeft}
                    aria-label={`move ${title} left`} onClick={() => onShift(-1)}>◀</button>
            <button className="x" title="move right" disabled={!canRight}
                    aria-label={`move ${title} right`} onClick={() => onShift(1)}>▶</button>
          </div>
        )}
        {onRemove && (
          <button className="x rm" title="remove release" aria-label={`remove ${title}`} onClick={onRemove}>✕</button>
        )}
      </div>
      {dates && <div className="col-dates small dim">{dates}</div>}
      <div
        className={"col-body" + (isOver ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); onDragOverColumn(); }}
        onDragLeave={onDragLeaveColumn}
        onDrop={onDropColumn}
      >
        {continuing.map((t) => (
          <button key={`c${t.id}`} className="tcont small" onClick={() => onEdit(t)}
                  title={`${t.name} — spans ${spanLabel(t, store.settings)}`}>
            {t.name} <span className="dim">continuing → {t.sprint}</span>
          </button>
        ))}
        {tickets.map((t) => {
          const d = derive(t, store.settings);
          const span = spanLabel(t, store.settings);
          return (
            <div
              className={"tcard" + (draggingId === t.id ? " dragging" : "") + (focusId === t.id ? " focus" : "")}
              key={t.id}
              draggable
              onDragStart={(e) => {
                onCardDragStart(t.id);
                e.dataTransfer?.setData("text/plain", String(t.id));
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={onCardDragEnd}
            >
              <button className="tname" onClick={() => onEdit(t)}>{d.name}</button>
              <div className="chips small">
                {d.projects.map((p) => <span className="chip mini" key={p}>{p}</span>)}
                <span className={"chip mini " + (d.priority === "Critical" ? "crit" : "")}>{priorityLabel(d.priority)}</span>
                {d.type && <span className="chip mini">{d.type}</span>}
                <span className="chip mini">{estimateLabel(d.estimate)}</span>
                {!isReady(t) && <span className="chip mini flag">not filled out</span>}
              </div>
              <div className="small dim">
                {d.dueDate ? `due ${d.dueDate}` : d.noHardDate ? "no hard date" : "no date yet"} · score {d.score}
                {t.sprint && span.includes("–") && <> · spans {span}</>}
              </div>
              {t.sprint && (beingWorkedOn(t, store.settings) || startsTooLate(t, store.settings) || d.shipsLate) && (
                <div className="chips small">
                  {beingWorkedOn(t, store.settings) && <span className="chip mini">being worked on</span>}
                  {startsTooLate(t, store.settings) && <span className="chip mini flag">starts too late</span>}
                  {d.shipsLate && <span className="chip mini flag">ships after due</span>}
                </div>
              )}
              {d.flags.length > 0 && (
                <div className="chips small">
                  {d.flags.map((f) => <span className="chip mini flag" key={f}>{f}</span>)}
                </div>
              )}
              <select value={t.sprint ?? ""} onChange={(e) => onMove(t.id, e.target.value || null)}
                      aria-label={`release for ${d.name}`}>
                <option value="">not scheduled</option>
                {store.settings.sprints.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          );
        })}
        {tickets.length === 0 && <div className="dim small empty-mini">empty</div>}
      </div>
    </div>
  );
}
