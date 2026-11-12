import { derive, type DerivedTicket } from "./assess";
import { iso } from "./dates";
import { currentRelease } from "./releases";
import { externalLabel, isOpen, type ProjectId } from "./schema";
import { type Decision, type Store } from "./store";

/** Export paths: a markdown summary for updating people, plus CSV/JSON. */

export function decisionsToMarkdown(s: Store, now = new Date()): string {
  const d: Decision[] = s.decisions;
  const by = (a: string) => d.filter((x) => x.action === a);
  const L: string[] = [];
  const cur = currentRelease(s.settings, now);
  L.push(`# Priority tracker — ${iso(now)}${cur ? ` (current release ${cur.name})` : ""}`);
  L.push("");
  L.push(`${d.length} decisions · ${by("Accept").length} accepted · ${by("Defer").length} deferred · ` +
         `${by("Decline").length} declined · ${by("Block").length} blocked · ` +
         `${by("Done").length} done · ${by("Carry over").length} carried over`);
  L.push("");

  const section = (title: string, action: string, detail: (x: Decision) => string) => {
    const items = by(action);
    if (items.length === 0) return;
    L.push(`## ${title} (${items.length})`);
    for (const x of items) L.push(`- **${x.ticketLabel}** [${x.projects.join(", ")}] — ${detail(x)}`);
    L.push("");
  };

  const revisit = (x: Decision) => (x.revisit ? ` (revisit ${x.revisit})` : "");
  section("Accepted", "Accept", (x) => (x.sprint ? `ships in ${x.sprint}.` : "ready to schedule."));
  section("Done", "Done", (x) => (x.sprint ? `shipped in ${x.sprint}.` : "done."));
  section("Carried over", "Carry over", (x) => `now ships in ${x.sprint}.`);
  section("Deferred", "Defer", (x) => `${x.reason}${revisit(x)}`);
  section("Declined — won't do", "Decline", (x) => x.reason || "declined");
  section("Blocked / handed back", "Block", (x) => `${x.reason || "needs input"}${revisit(x)}`);

  if (d.length === 0) L.push("_No decisions recorded yet._");
  return L.join("\n");
}

/** The project view, as text — one section per project, open tickets only. */
export function projectsToMarkdown(s: Store, now = new Date()): string {
  const projects = [...new Set(s.tickets.flatMap((t) => t.projects))].sort() as ProjectId[];
  const L: string[] = [`# Tickets by project — ${iso(now)}`, ""];
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
  const cols = ["id", "name", "summary", "projects", "priority", "type", "stakeholders", "notes", "estimate",
    "state", "opened", "dueDate", "noHardDate", "sprint", "planned", "carryovers", "lastTouched", "closed",
    "score", "flags", "externalUrl"];
  const q = (v: unknown): string => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = s.tickets.map((t) => {
    const d: DerivedTicket = derive(t, s.settings, now);
    return [d.id, d.name, d.summary, d.projects.join("; "), d.priority ?? "", d.type ?? "", d.stakeholders.join("; "), d.notes,
      d.estimate ?? "", d.state, d.opened, d.dueDate, d.noHardDate ? "yes" : "", d.sprint, d.planned, d.carryovers,
      d.lastTouched, d.closed, d.score, d.flags.join("|"), d.externalUrl]
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

/** The local day, for filenames — an evening export is dated today, not tomorrow. */
export const stamp = (now = new Date()): string => iso(now);
