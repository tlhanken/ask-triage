import { useState } from "react";
import type { Sprint } from "./schema";

/** Release settings: when it freezes and when it ships. */

interface Props {
  sprint: Sprint;
  onSave: (patch: { freeze: string | null; release: string | null }) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function SprintForm({ sprint, onSave, onDelete, onCancel }: Props) {
  const [freeze, setFreeze] = useState(sprint.freeze ?? "");
  const [release, setRelease] = useState(sprint.release ?? "");

  const clash = !!freeze && !!release && freeze > release;

  return (
    <div className="modal" role="dialog" aria-label={`Edit ${sprint.name}`}>
      <div className="sheet" style={{ width: "min(560px, 100%)" }}>
        <div className="sheet-head">
          <h2>{sprint.name}</h2>
          <button className="dim" onClick={onCancel}>close ✕</button>
        </div>

        <div className="form">
          <label>Feature freeze
            <input type="date" value={freeze} onChange={(e) => setFreeze(e.target.value)} />
          </label>
          <label>Release date
            <input type="date" value={release} onChange={(e) => setRelease(e.target.value)} />
          </label>
          <div className="wide small dim">
            {clash
              ? "Freeze is after the release date — freeze should come first."
              : "After the freeze date, adding work here is allowed but reported as scope after freeze."}
          </div>
        </div>

        <div className="sheet-foot">
          <button className="danger" onClick={onDelete}>Delete release</button>
          <div className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="pick" disabled={clash}
                  onClick={() => onSave({ freeze: freeze || null, release: release || null })}>
            Save dates
          </button>
        </div>
      </div>
    </div>
  );
}
