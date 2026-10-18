import { useState, type DragEvent } from "react";
import { type Ticket, backlog, derive, inSprint, isOpen } from "./schema";
import { type Move, type Store, optimizePlan } from "./store";

/** Sprint board: backlog on the left, then sprints newest-release first.
 *  Cards can be dragged between columns; the stored order is the display order. */

interface Props {
  store: Store;
  onEdit: (t: Ticket) => void;
  onMove: (id: number, sprint: string | null) => void;
  onAddSprint: (name: string) => void;
  onRemoveSprint: (name: string) => void;
  onShiftSprint: (name: string, delta: -1 | 1) => void;
  onApplyPlan: (moves: Move[]) => void;
}

export default function Sprints({
  store, onEdit, onMove, onAddSprint, onRemoveSprint, onShiftSprint, onApplyPlan,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [plan, setPlan] = useState<Move[] | null>(null);

  const open = store.tickets.filter(isOpen);
  const backlogTickets = backlog(store.tickets);
  const target = store.settings.commitTargetPerSprint;
  const sprints = store.settings.sprints;

  /** The dragged id comes from component state first, so a drop works even
   *  where dataTransfer is unavailable. */
  const drop = (sprint: string | null) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer?.getData("text/plain") ?? "";
    const id = dragging ?? (raw ? Number(raw) : NaN);
    if (Number.isFinite(id) && id > 0) onMove(id, sprint);
    setDragging(null);
    setOver(null);
  };

  const byScore = (a: Ticket, b: Ticket) =>
    derive(b, store.settings).score - derive(a, store.settings).score;

  return (
    <div>
      <div className="toolbar">
        <span className="dim small">
          {sprints.length} sprints · {open.length} open · {backlogTickets.length} unscheduled ·
          {" "}drag a card between columns · newest left, ◀ ▶ to reorder
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
          <input name="newsprint" placeholder="add sprint (e.g. v0.26)" style={{ width: 170 }} />
        </form>
      </div>

      {plan && (
        <div className="plan">
          <div className="plan-head">
            <b>Proposed releases</b>
            <span className="dim small">
              {plan.length} move{plan.length === 1 ? "" : "s"} · nothing moves until you apply ·
              does not touch work that is already scheduled
            </span>
            <div className="spacer" />
            {plan.length > 0 && (
              <button className="pick" onClick={() => { onApplyPlan(plan); setPlan(null); }}>Apply</button>
            )}
            <button onClick={() => setPlan(null)}>Discard</button>
          </div>
          {plan.length === 0 ? (
            <div className="dim small" style={{ padding: "8px 0" }}>
              Nothing to place — every open ticket already has a release, or the upcoming ones are full.
            </div>
          ) : (
            <ul className="plan-list">
              {plan.map((m) => (
                <li key={m.id}>
                  <b>{m.label}</b> {m.name} → <b>{m.to}</b>{" "}
                  <span className="dim small">{m.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="board">
        <Column
          title="Backlog"
          subtitle={`${backlogTickets.length} unscheduled`}
          tickets={[...backlogTickets].sort(byScore)}
          store={store}
          onEdit={onEdit}
          onMove={onMove}
          onRemove={null}
          onShift={null}
          isOver={over === "Backlog"}
          onDragOverColumn={() => setOver("Backlog")}
          onDragLeaveColumn={() => setOver((c) => (c === "Backlog" ? null : c))}
          onDropColumn={drop(null)}
          draggingId={dragging}
          onCardDragStart={setDragging}
          onCardDragEnd={() => { setDragging(null); setOver(null); }}
        />
        {sprints.map((sp, i) => {
          const ts = inSprint(store.tickets, sp).filter(isOpen);
          const overCapacity = ts.length > target;
          return (
            <Column
              key={sp}
              title={sp}
              subtitle={`${ts.length}${overCapacity ? ` — over ${target}` : `/${target}`}`}
              over={overCapacity}
              tickets={[...ts].sort(byScore)}
              store={store}
              onEdit={onEdit}
              onMove={onMove}
              onRemove={() => onRemoveSprint(sp)}
              onShift={(delta) => onShiftSprint(sp, delta)}
              canLeft={i > 0}
              canRight={i < sprints.length - 1}
              isOver={over === sp}
              onDragOverColumn={() => setOver(sp)}
              onDragLeaveColumn={() => setOver((c) => (c === sp ? null : c))}
              onDropColumn={drop(sp)}
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
  title, subtitle, tickets, store, onEdit, onMove, over, onRemove, onShift, canLeft, canRight,
  isOver, onDragOverColumn, onDragLeaveColumn, onDropColumn, draggingId, onCardDragStart, onCardDragEnd,
}: {
  title: string;
  subtitle: string;
  tickets: Ticket[];
  store: Store;
  onEdit: (t: Ticket) => void;
  onMove: (id: number, sprint: string | null) => void;
  over?: boolean;
  onRemove: (() => void) | null;
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
        <b>{title}</b>
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
          <button className="x rm" title="remove sprint" aria-label={`remove ${title}`} onClick={onRemove}>✕</button>
        )}
      </div>
      <div
        className={"col-body" + (isOver ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); onDragOverColumn(); }}
        onDragLeave={onDragLeaveColumn}
        onDrop={onDropColumn}
      >
        {tickets.map((t) => {
          const d = derive(t, store.settings);
          return (
            <div
              className={"tcard" + (draggingId === t.id ? " dragging" : "")}
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
                <span className={"chip mini " + (d.type === "Critical" ? "crit" : "")}>{d.type}</span>
              </div>
              <div className="small dim">
                {d.dueDate ? `due ${d.dueDate}` : "no date"} · score {d.score}
              </div>
              {d.flags.length > 0 && (
                <div className="chips small">
                  {d.flags.map((f) => <span className="chip mini flag" key={f}>{f}</span>)}
                </div>
              )}
              <select value={t.sprint ?? ""} onChange={(e) => onMove(t.id, e.target.value || null)}
                      aria-label={`release for ${d.name}`}>
                <option value="">backlog</option>
                {store.settings.sprints.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          );
        })}
        {tickets.length === 0 && <div className="dim small empty-mini">empty</div>}
      </div>
    </div>
  );
}
