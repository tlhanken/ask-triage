import { type DerivedTicket, type ProjectId, derive, externalLabel, isOpen } from "./schema";
import type { Decision, Store } from "./store";

/** Export paths: a markdown summary for updating people, plus CSV/JSON. */

const fmtDate = (isoTs: string): string => isoTs.slice(0, 10);

export function decisionsToMarkdown(s: Store, now = new Date()): string {
  const d: Decision[] = s.decisions;
  const by = (a: string) => d.filter((x) => x.action === a);
  const L: string[] = [];
  L.push(`# Revel priority tracker — ${fmtDate(now.toISOString())} (${s.settings.currentSprint})`);
  L.push("");
  L.push(`${d.length} decisions · ${by("Accept").length} accepted · ${by("Defer").length} deferred · ` +
         `${by("Decline").length} declined · ${by("Block").length} blocked`);
  L.push("");

  const section = (title: string, action: string, detail: (x: Decision) => string) => {
    const items = by(action);
    if (items.length === 0) return;
    L.push(`## ${title} (${items.length})`);
    for (const x of items) L.push(`- **${x.ticketLabel}** [${x.projects.join(", ")}] — ${detail(x)}`);
    L.push("");
  };

  section("Accepted this sprint", "Accept", (x) => `in ${x.sprint}.`);
  section("Deferred", "Defer", (x) => `${x.reason}${x.revisit ? ` (revisit ${x.revisit})` : ""}`);
  section("Declined — won't do", "Decline", (x) => x.reason || "declined");
  section("Blocked / handed back", "Block", (x) => x.reason || "needs input");

  if (d.length === 0) L.push("_No decisions recorded yet._");
  return L.join("\n");
}

/** The project view, as text — one section per project, open tickets only. */
export function projectsToMarkdown(s: Store, now = new Date()): string {
  const projects = [...new Set(s.tickets.flatMap((t) => t.projects))].sort() as ProjectId[];
  const L: string[] = [`# Tickets by project — ${fmtDate(now.toISOString())}`, ""];
  for (const p of projects) {
    const rows = s.tickets
      .filter((t) => t.projects.includes(p) && isOpen(t))
      .sort((a, b) => derive(b, s.settings, now).score - derive(a, s.settings, now).score);
    L.push(`## ${p} (${rows.length} open)`);
    for (const t of rows) {
      const d = derive(t, s.settings, now);
      const ext = externalLabel(d.externalUrl);
      L.push(`- **${d.name}** — ${d.state}${d.dueDate ? `, due ${d.dueDate}` : ""}` +
             `${d.sprint ? `, ${d.sprint}` : ""}${ext ? ` (${ext})` : ""}`);
    }
    L.push("");
  }
  return L.join("\n");
}

export function registerToCsv(s: Store, now = new Date()): string {
  const cols = ["id", "name", "summary", "projects", "ownerType", "owner", "stakeholders", "type", "size",
    "state", "opened", "dueDate", "sprint", "carryovers", "lastTouched", "closed", "score", "flags",
    "externalUrl", "nextAction"];
  const q = (v: unknown): string => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = s.tickets.map((t) => {
    const d: DerivedTicket = derive(t, s.settings, now);
    return [d.id, d.name, d.summary, d.projects.join("; "), d.ownerType, d.owner, d.stakeholders.join("; "),
      d.type, d.size, d.state, d.opened, d.dueDate, d.sprint, d.carryovers, d.lastTouched, d.closed,
      d.score, d.flags.join("|"), d.externalUrl, d.nextAction]
      .map(q).join(",");
  });
  return [cols.join(","), ...rows].join("\n");
}

export function toJson(s: Store, now = new Date()): string {
  return JSON.stringify(
    {
      exportedAt: now.toISOString(),
      settings: s.settings,
      tickets: s.tickets.map((t) => derive(t, s.settings, now)),
      decisions: s.decisions,
      stats: {
        total: s.tickets.length,
        open: s.tickets.filter(isOpen).length,
        decisions: s.decisions.length,
      },
    },
    null,
    2,
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const stamp = (now = new Date()): string => now.toISOString().slice(0, 10);
