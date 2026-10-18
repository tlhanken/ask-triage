import { useEffect, useMemo, useState } from "react";
import type { DecisionAction, Ticket } from "./schema";
import {
  type Move, type Store, addSprint, applyPlan, blankTicket, createTicket, deleteTicket, freshStore,
  load, moveTicketToSprint, recordDecision, removeSprint, revertTo, save, clear, shiftSprint, stats,
  undoLast, updateTicket, withHistory,
} from "./store";
import {
  downloadJson, fileEndpointAvailable, loadFromEndpoint, loadFromPicker, saveToFile,
} from "./persist";
import Triage from "./Triage";
import Sprints from "./Sprints";
import Projects from "./Projects";
import Register from "./Register";
import DecisionLog from "./Decisions";
import History from "./History";
import TicketForm from "./TicketForm";

type Tab = "triage" | "sprints" | "projects" | "register" | "decisions" | "history";

export default function App() {
  const [store, setStore] = useState<Store>(() => load());
  const [tab, setTab] = useState<Tab>("triage");
  const [editing, setEditing] = useState<{ ticket: Ticket } | null>(null);
  const [creating, setCreating] = useState(false);
  const [fileMode, setFileMode] = useState(false);
  const [status, setStatus] = useState("saved in this browser");

  /** Every mutation goes through here, so every change is labelled and revertible. */
  const act = (label: string, mutate: (s: Store) => Store) =>
    setStore((cur) => withHistory(cur, label, mutate));

  useEffect(() => { save(store); }, [store]);
  const s = useMemo(() => stats(store), [store]);

  // Is there a file endpoint (dev / preview server)? And if this browser has no
  // state of its own yet, adopt whatever the file holds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await fileEndpointAvailable();
      if (cancelled) return;
      setFileMode(available);
      if (!available) return;
      const raw = await loadFromEndpoint();
      if (cancelled || !raw) return;
      try {
        const parsed = JSON.parse(raw) as Store;
        if (!Array.isArray(parsed?.tickets) || parsed.tickets.length === 0) return;
        setStore((cur) =>
          cur.history.length === 0 && cur.decisions.length === 0
            ? { ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [] }
            : cur,
        );
        setStatus("loaded from data/register.json");
      } catch {
        /* keep whatever we have */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Autosave to the file, debounced, so a burst of drags is one write.
  useEffect(() => {
    if (!fileMode) return;
    const t = window.setTimeout(() => {
      saveToFile(JSON.stringify(store)).then((r) => setStatus(r.message));
    }, 600);
    return () => window.clearTimeout(t);
  }, [store, fileMode]);

  const decide = (ticketId: number, action: DecisionAction, reason: string, revisit: string | null) =>
    act(`${action.toLowerCase()} ${ticketId}`, (cur) => recordDecision(cur, ticketId, action, reason, revisit));

  const reset = () => {
    if (window.confirm("Reset to seed data? This discards every ticket edit and decision.")) {
      act("reset to seed data", () => freshStore());
      clear();
    }
  };

  const loadFromFile = async () => {
    const raw = (await loadFromEndpoint()) ?? (await loadFromPicker());
    if (!raw) { setStatus("no file loaded"); return; }
    try {
      const parsed = JSON.parse(raw) as Store;
      if (!Array.isArray(parsed?.tickets)) { setStatus("that file is not a Revel register"); return; }
      act("load from file", () => ({ ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [] }));
      setStatus("loaded from file");
    } catch {
      setStatus("could not read that file");
    }
  };

  return (
    <>
      <header className="top">
        <h1>Revel priority tracker</h1>
        <nav className="tabs">
          <button className={tab === "triage" ? "on" : ""} onClick={() => setTab("triage")}>Triage</button>
          <button className={tab === "sprints" ? "on" : ""} onClick={() => setTab("sprints")}>Sprints</button>
          <button className={tab === "projects" ? "on" : ""} onClick={() => setTab("projects")}>Projects</button>
          <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>Register</button>
          <button className={tab === "decisions" ? "on" : ""} onClick={() => setTab("decisions")}>Decisions</button>
          <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button>
        </nav>
        <div className="spacer" />
        <div className="dim small">
          {s.open} open · {s.total} tickets · queued {Math.round(s.avgWaitWeeks)}w · {s.accepted}/{s.target} this sprint
        </div>
        <button className="pick" onClick={() => setCreating(true)}>+ New ticket</button>
        <button className="dim" onClick={reset} title="Reset to seed data">reset</button>
      </header>

      <main>
        {tab === "triage" && <Triage store={store} onDecide={decide} onUndo={() => act("undo decision", undoLast)} />}
        {tab === "sprints" && (
          <Sprints
            store={store}
            onEdit={(t) => setEditing({ ticket: t })}
            onMove={(id, sp) => act(`move ${id} to ${sp ?? "backlog"}`, (cur) => moveTicketToSprint(cur, id, sp))}
            onAddSprint={(n) => act(`add sprint ${n}`, (cur) => addSprint(cur, n))}
            onRemoveSprint={(n) => act(`remove sprint ${n}`, (cur) => removeSprint(cur, n))}
            onShiftSprint={(n, d) => act(`reorder ${n}`, (cur) => shiftSprint(cur, n, d))}
            onApplyPlan={(moves: Move[]) => act(`auto-optimize (${moves.length} moves)`, (cur) => applyPlan(cur, moves))}
          />
        )}
        {tab === "projects" && <Projects store={store} onEdit={(t) => setEditing({ ticket: t })} />}
        {tab === "register" && <Register store={store} onEdit={(t) => setEditing({ ticket: t })} />}
        {tab === "decisions" && <DecisionLog store={store} />}
        {tab === "history" && (
          <History
            store={store}
            onRevert={(i) => act("revert", (cur) => revertTo(cur, i))}
            onSaveFile={() => { saveToFile(JSON.stringify(store)).then((r) => setStatus(r.message)); }}
            onLoadFile={loadFromFile}
            onDownload={() => downloadJson("register.json", JSON.stringify(store, null, 2))}
            fileMode={fileMode}
            status={status}
          />
        )}
      </main>

      {creating && (
        <TicketForm
          initial={blankTicket()}
          sprints={store.settings.sprints}
          onCancel={() => setCreating(false)}
          onSave={(draft) => { act("new ticket", (cur) => createTicket(cur, draft)); setCreating(false); }}
        />
      )}

      {editing && (
        <TicketForm
          key={editing.ticket.id}
          initial={editing.ticket}
          editingId={editing.ticket.id}
          sprints={store.settings.sprints}
          onCancel={() => setEditing(null)}
          onSave={(draft, id) => {
            if (id) act(`edit ${id}`, (cur) => updateTicket(cur, id, draft));
            setEditing(null);
          }}
          onDelete={(id) => {
            if (window.confirm("Delete this ticket? This can be undone from History.")) {
              act(`delete ${id}`, (cur) => deleteTicket(cur, id));
              setEditing(null);
            }
          }}
        />
      )}
    </>
  );
}
