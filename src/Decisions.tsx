import { useMemo, useState } from "react";
import type { Store } from "./store";
import { localStamp } from "./schema";
import {
  copyText, decisionsToMarkdown, download, projectsToMarkdown, registerToCsv, stamp, toJson,
} from "./exporters";

export default function DecisionLog({ store }: { store: Store }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [which, setWhich] = useState<"decisions" | "projects">("decisions");
  const md = useMemo(
    () => (which === "decisions" ? decisionsToMarkdown(store) : projectsToMarkdown(store)),
    [store, which],
  );

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 1800);
  };

  const copy = async () =>
    flash((await copyText(md)) ? "Summary copied — paste it to whoever needs it" : "Copy blocked by the browser; use Download instead");

  const items = [...store.decisions].reverse();

  return (
    <div>
      <div className="toolbar">
        <button className={"chip " + (which === "decisions" ? "on" : "")} onClick={() => setWhich("decisions")}>Decision summary</button>
        <button className={"chip " + (which === "projects" ? "on" : "")} onClick={() => setWhich("projects")}>By project</button>
        <div className="spacer" />
        <button onClick={copy}>Copy summary</button>
        <button onClick={() => download(`triage-${stamp()}.md`, md, "text/markdown")}>Download .md</button>
        <button onClick={() => download(`register-${stamp()}.csv`, registerToCsv(store), "text/csv")}>Download .csv</button>
        <button onClick={() => download(`triage-${stamp()}.json`, toJson(store), "application/json")}>Download .json</button>
        <button onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      {which === "decisions" && (
        <div className="card">
          {items.length === 0 && <div className="empty">No decisions yet — go accept, defer, or decline something.</div>}
          <ul className="log">
            {items.map((d) => (
              <li key={d.id}>
                <span className="when mono small">{localStamp(d.at)}</span>
                <span className="what">
                  <span className={"tag " + d.action} style={{ marginRight: 8 }}>{d.action}</span>
                  <b>{d.ticketLabel}</b> <span className="dim">[{d.projects.join(", ")}]</span>
                  {d.reason && <div className="dim small">{d.reason}{d.revisit ? ` — revisit ${d.revisit}` : ""}</div>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="dim small" style={{ marginBottom: 8 }}>
          {which === "decisions" ? "Summary — this is what “Copy summary” puts on your clipboard"
                                 : "Project view — every open ticket, grouped by project"}
        </div>
        <pre className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{md}</pre>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
