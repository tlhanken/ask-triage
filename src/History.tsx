import type { Store } from "./store";
import { HISTORY_CAP } from "./store";
import { localStamp } from "./schema";

/** Data & history: the version layer.
 *
 *  Nothing here is committed, so the History tab is the only way back, and it
 *  does both jobs: restore the state before one change ("undo that"), or jump to
 *  any earlier state in the window ("go back to last Tuesday"). The snapshots
 *  ride inside the store, so they travel with it wherever it is saved. */

interface Props {
  store: Store;
  onRevert: (index: number) => void;
  onSaveFile: () => void;
  onLoadFile: () => void;
  onDownload: () => void;
  onReset: () => void;
  fileMode: boolean;
  status: string;
}

export default function History({
  store, onRevert, onSaveFile, onLoadFile, onDownload, onReset, fileMode, status,
}: Props) {
  const items = store.history.map((s, i) => ({ ...s, index: i })).reverse();

  return (
    <div>
      <div className="toolbar">
        <button onClick={onSaveFile}>Save to file</button>
        <button onClick={onLoadFile}>Load from file</button>
        <button onClick={onDownload}>Download JSON</button>
        <div className="spacer" />
        <span className="dim small">{status}</span>
        <button className="dim" onClick={onReset} title="Replace the register with the demo data — revertible">
          Reset to demo data
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="dim small">
          {fileMode
            ? "A local file endpoint is available, so this data is also written to the register file (data/register.json unless ASK_TRIAGE_DATA_FILE says otherwise). That file is untracked, so it is the only copy: download a JSON copy to keep a backup."
            : "No file endpoint here (static build), so this data lives in this browser and in whatever you download or save yourself."}
        </div>
      </div>

      <h2 style={{ margin: "4px 0 12px" }}>
        History <span className="dim small">
          last {Math.min(store.history.length, HISTORY_CAP)} of {HISTORY_CAP} · newest first
        </span>
      </h2>

      <div className="card">
        {items.length === 0 && (
          <div className="empty">
            Nothing recorded yet. Every change records the state it is about to replace,
            so the first one you make shows up here.
          </div>
        )}
        <ul className="log">
          {items.map((s) => (
            <li key={s.index}>
              <span className="when mono small">{localStamp(s.at)}</span>
              <span className="what">
                <b>{s.label}</b>
              </span>
              <button onClick={() => onRevert(s.index)} title="Restore the state from before this change">
                Revert to here
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="dim small" style={{ marginTop: 12 }}>
        Reverting restores tickets and settings. It does not rewrite the decision log — that
        stays an append-only record of what was decided at the time. A revert is itself
        recorded, so it can be undone too.
      </div>
    </div>
  );
}
