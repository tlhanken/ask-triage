import { useEffect, useMemo, useRef, useState } from "react";
import { queueHealth } from "../domain/assess";
import { type DecisionAction, type Ticket } from "../domain/schema";
import { applyCloseOut, type CloseOutChoice, editTicket, recordDecision } from "../domain/decisions";
import { planRevert, revertTo, withHistory } from "../domain/history";
import { applyPlan, fillReleaseDates, type Move } from "../domain/optimize";
import { pipeline } from "../domain/pipeline";
import { addProject, addSprint, blankTicket, createTicket, deleteTicket, load, moveTicketToSprint, readStore, removeProject, removeSprint, renameProject, resetToSeed, save, serialize, shiftSprint, type Snapshot, type Store, updateSprint } from "../domain/store";
import {
  currentEtag, fileEndpointAvailable, loadFromEndpoint, loadFromPicker, saveOnExit, saveToFile,
} from "./persist";
import { stamp } from "../domain/exporters";
import { download } from "./download";
import Plan, { type Step } from "./Plan";
import Projects from "./Projects";
import Register from "./Register";
import DecisionLog from "./Decisions";
import History from "./History";
import TicketForm from "./TicketForm";
import SprintForm from "./SprintForm";

const TABS = [
  ["plan", "Plan"], ["projects", "Projects"], ["register", "Register"], ["decisions", "Decisions"],
  ["history", "History"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const [store, setStore] = useState<Store>(() => load());
  const [tab, setTab] = useState<Tab>("plan");
  const [step, setStep] = useState<Step>("fill");
  const [editing, setEditing] = useState<{ ticket: Ticket } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingSprint, setEditingSprint] = useState<string | null>(null);
  /** True once the register file has been read (or found absent): autosave runs only then. */
  const [fileMode, setFileMode] = useState(false);
  const [status, setStatus] = useState("checking for the register file…");
  /** Set when the server refused a write as stale. Autosave stops until it is resolved. */
  const [conflict, setConflict] = useState<string | null>(null);

  // The file's version this tab's copy is based on, and the text last written or
  // read, so an unchanged register is not written again. Refs, because the save
  // queue reads them after earlier saves finish, not when they were scheduled.
  const server = useRef(false);
  const etag = useRef<string | null>(null);
  const lastText = useRef<string | null>(null);
  const conflictRef = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const markConflict = (why: string | null) => { conflictRef.current = why; setConflict(why); };

  /** Every mutation goes through here, so every change is labelled and revertible.
   *  `op` describes the action in a form the board can query later. */
  const act = (label: string, mutate: (s: Store) => Store, op?: Snapshot["op"]) =>
    setStore((cur) => withHistory(cur, label, mutate, new Date(), op));

  useEffect(() => { save(store); }, [store]);
  const p = useMemo(() => pipeline(store), [store]);
  const wait = useMemo(() => queueHealth(store.tickets, store.settings).avgWaitWeeks, [store]);

  /**
   * Write this tab's register to the file, one save at a time.
   *
   * Saves are chained so each one sends the version the previous one produced. Two
   * in flight at once would race, and the second would be refused as stale by the
   * first. `overwrite` bases the write on whatever the file holds now, so it
   * replaces it on purpose: the user chose that, in the face of a conflict.
   */
  const writeFile = (text: string, overwrite = false) => {
    queue.current = queue.current.then(async () => {
      if (conflictRef.current && !overwrite) return;
      let base = etag.current;
      if (overwrite) {
        const now = await currentEtag();
        if (now === undefined) { setStatus("⚠ could not reach the register file"); return; }
        base = now;
      }
      const r = await saveToFile(text, base);
      if (r.where === "file") {
        etag.current = r.etag ?? null;
        lastText.current = text;
        if (overwrite) { markConflict(null); setFileMode(true); }
        setStatus(r.message);
      } else if (r.where === "stale") {
        markConflict(r.message);
        setStatus(`⚠ ${r.message}`);
      } else {
        setStatus(r.where === "refused" ? `⚠ ${r.message}` : r.message);
      }
    });
  };

  /** Replace this tab's register with the file. The file is the source of truth, so
   *  its history comes with it: this tab's copy is not on that history, which is why
   *  the conflict banner offers to download it first. */
  const reloadFromFile = async () => {
    const got = await loadFromEndpoint();
    if (!got) { setStatus(got === null ? "there is no register file yet" : "⚠ could not reach the register file"); return; }
    const loaded = readStore(got.text);
    if (!loaded) { setStatus("that is not a register this version can read"); return; }
    etag.current = got.etag;
    lastText.current = got.text;
    setStore(loaded);
    markConflict(null);
    setFileMode(true);
    setStatus("loaded from the register file");
  };

  // Startup: is there a server? Then read the file, and only then start writing.
  // Switching autosave on before the read lets a fresh browser's seed data reach
  // the file first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await fileEndpointAvailable();
      if (cancelled) return;
      server.current = available;
      if (!available) {
        setStatus("this browser only — no file endpoint, so nothing is written to disk");
        return;
      }
      const got = await loadFromEndpoint();
      if (cancelled) return;
      if (got === undefined) {
        setStatus("⚠ could not read the register file, so nothing is written to it");
        return;
      }
      if (got === null) {                       // no file yet: this browser establishes it
        etag.current = null;
        setFileMode(true);
        setStatus("writing to a new register file");
        return;
      }
      etag.current = got.etag;
      const fromFile = readStore(got.text);
      if (!fromFile) {
        // Never autosave over a file this version cannot read. Saving from History
        // replaces it deliberately, and the server keeps the old one beside it.
        setStatus("⚠ the register file is not one this version can read, so nothing is written to it");
        return;
      }
      // An empty register is never adopted: fresh state always carries the seed,
      // so an empty file can only be an accident. This browser's register replaces it.
      if (fromFile.tickets.length > 0) {
        lastText.current = got.text;
        setStore(fromFile);
        setStatus("loaded from the register file");
      } else {
        setStatus("the register file was empty; writing this browser's register to it");
      }
      setFileMode(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!fileMode || conflict) return;
    const text = serialize(store);
    if (text === lastText.current) return;
    const t = window.setTimeout(() => writeFile(text), 600);
    return () => window.clearTimeout(t);
    // writeFile only reads refs and setters, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, fileMode, conflict]);

  // A change made in the last moments before the tab closes would otherwise wait
  // for a debounce that never fires. On pagehide, send it with keepalive instead.
  useEffect(() => {
    if (!fileMode || conflict) return;
    const onHide = () => {
      const text = serialize(store);
      if (text !== lastText.current) saveOnExit(text, etag.current);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store, fileMode, conflict]);

  /** History's "Save to file". In a conflict, or over a file this version cannot
   *  read, it overwrites — but only once the user says so. */
  const saveNow = () => {
    const text = serialize(store);
    if (!server.current) {
      void saveToFile(text).then((r) => setStatus(r.where === "refused" ? `⚠ ${r.message}` : r.message));
      return;
    }
    if (conflict || !fileMode) {
      if (!window.confirm(
        "Replace the register file with this tab's copy? Whatever the file holds now is lost, " +
        "unless it was in an older format, which is kept beside it.",
      )) return;
      writeFile(text, true);
      return;
    }
    writeFile(text);
  };

  const downloadCopy = () =>
    download(`register-${stamp()}.json`, serialize(store), "application/json");

  const decide = (ticketId: number, action: DecisionAction, reason: string, revisit: string | null) =>
    act(`${action.toLowerCase()} ${ticketId}`, (cur) => recordDecision(cur, ticketId, action, reason, revisit));

  const closeOut = (choices: { id: number; choice: CloseOutChoice }[]) =>
    act(`close out ${choices.length} ticket${choices.length === 1 ? "" : "s"}`, (cur) => applyCloseOut(cur, choices));

  const move = (id: number, sp: string | null) =>
    act(`move ${id} to ${sp ?? "unscheduled"}`, (cur) => moveTicketToSprint(cur, id, sp), {
      kind: "move", ticketId: id, sprint: sp,
    });

  const reset = () => {
    if (window.confirm(
      "Replace every ticket and release with the demo data? This is recorded, so it can be " +
      "reverted from History. The decision log is kept.",
    )) {
      act("reset to demo data", resetToSeed);
    }
  };

  const loadFromFile = async () => {
    if (server.current) { await reloadFromFile(); return; }
    const raw = await loadFromPicker();
    if (!raw) { setStatus("no file loaded"); return; }
    const loaded = readStore(raw);
    if (!loaded) { setStatus("that is not a register this version can read"); return; }
    setStore(loaded);
    setStatus("loaded from file");
  };

  return (
    <>
      <header className="top">
        <h1>Priority tracker</h1>
        <nav className="tabs">
          {TABS.map(([id, name]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{name}</button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="dim small pipeline" aria-label="Pipeline">
          {p.fillOut} to fill out · {p.schedule} to schedule · {p.check} to check
          {p.nudges > 0 && <> · {p.nudges} would still help</>}
          {Number.isFinite(wait) && <> · queued {Math.round(wait)}w</>}
        </div>
        <button className="pick" onClick={() => setCreating(true)}>+ New ticket</button>
      </header>

      {conflict && (
        <div className="conflict" role="alert">
          <b>Another tab or machine changed the register file.</b>{" "}
          This tab has stopped saving to it, so nothing is overwritten. Download this tab's copy
          first if it has changes you want to keep.
          <span className="conflict-actions">
            <button onClick={downloadCopy}>Download my copy</button>
            <button className="pick" onClick={() => { void reloadFromFile(); }}>Reload from file</button>
          </span>
        </div>
      )}

      <main>
        {tab === "plan" && (
          <Plan
            store={store}
            step={step}
            onStep={setStep}
            onEdit={(t) => setEditing({ ticket: t })}
            onFill={(id, patch) => act(`fill out ${id}`, (cur) => editTicket(cur, id, patch))}
            onDecide={decide}
            onCloseOut={closeOut}
            onMove={move}
            onAddSprint={(n) => act(`add release ${n}`, (cur) => addSprint(cur, n))}
            onRemoveSprint={(n) => act(`remove release ${n}`, (cur) => removeSprint(cur, n))}
            onShiftSprint={(n, d) => act(`reorder ${n}`, (cur) => shiftSprint(cur, n, d))}
            onApplyPlan={(moves: Move[]) =>
              act(`auto-optimize (${moves.length} moves)`, (cur) => applyPlan(cur, moves))}
            onEditSprint={setEditingSprint}
            onFillDates={() => act("fill in release dates", fillReleaseDates)}
          />
        )}
        {tab === "projects" && (
          <Projects
            store={store}
            onEdit={(t) => setEditing({ ticket: t })}
            onEditTicket={(id, patch) => act(`due date for ${id}`, (cur) => editTicket(cur, id, patch))}
            onAddProject={(n) => act(`add project ${n}`, (cur) => addProject(cur, n))}
            onRenameProject={(from, to) => act(`rename project ${from} to ${to}`, (cur) => renameProject(cur, from, to))}
            onRemoveProject={(n) => act(`remove project ${n}`, (cur) => removeProject(cur, n))}
          />
        )}
        {tab === "register" && <Register store={store} onEdit={(t) => setEditing({ ticket: t })} />}
        {tab === "decisions" && <DecisionLog store={store} />}
        {tab === "history" && (
          <History
            store={store}
            onRevert={(i) => {
              const plan = planRevert(store, i);
              if (!plan.ok) { setStatus(`⚠ ${plan.reason}`); return; }
              setStore((cur) => revertTo(cur, i));
              setStatus(plan.oldest
                ? `reverted to before "${plan.label}" — the oldest state the history still holds`
                : `reverted to before "${plan.label}"`);
            }}
            onSaveFile={saveNow}
            onLoadFile={loadFromFile}
            onDownload={() => download("register.json", serialize(store), "application/json")}
            onReset={reset}
            fileMode={fileMode}
            status={status}
          />
        )}
      </main>

      {creating && (
        <TicketForm
          initial={blankTicket()}
          projects={store.settings.projects}
          onAddProject={(n) => act(`add project ${n}`, (cur) => addProject(cur, n))}
          onCancel={() => setCreating(false)}
          onSave={(draft) => { act("new ticket", (cur) => createTicket(cur, draft)); setCreating(false); }}
        />
      )}

      {editing && (
        <TicketForm
          key={editing.ticket.id}
          initial={editing.ticket}
          editingId={editing.ticket.id}
          projects={store.settings.projects}
          onAddProject={(n) => act(`add project ${n}`, (cur) => addProject(cur, n))}
          onCancel={() => setEditing(null)}
          onSave={(draft, id) => {
            if (id) act(`edit ${id}`, (cur) => editTicket(cur, id, draft));
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

      {editingSprint && (() => {
        const sp = store.settings.sprints.find((x) => x.name === editingSprint);
        if (!sp) return null;
        return (
          <SprintForm
            key={sp.name}
            sprint={sp}
            onCancel={() => setEditingSprint(null)}
            onSave={(patch) => {
              act(`dates for ${sp.name}`, (cur) => updateSprint(cur, sp.name, patch));
              setEditingSprint(null);
            }}
            onDelete={() => {
              if (window.confirm(`Delete ${sp.name}? Its tickets go back to the backlog — nothing is deleted.`)) {
                act(`remove release ${sp.name}`, (cur) => removeSprint(cur, sp.name));
                setEditingSprint(null);
              }
            }}
          />
        );
      })()}
    </>
  );
}
