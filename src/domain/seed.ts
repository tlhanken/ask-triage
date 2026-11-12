import { addDays, iso } from "./dates";
import { type Ticket } from "./schema";

/** Seed tickets: a realistic mix so the plan is worth running in ~2 minutes.
 *  Replace with your real rows once the workflow feels right.
 *
 *  None has an estimate: nobody has chosen one, and a default would stand in for
 *  that decision. So every seed ticket starts in Fill out. Two (12 and 14) also
 *  have no type, and some have no priority. */

/** Built on demand, dated relative to `now`. A module-level `new Date()` would fix
 *  the dates at import time, before a test can set its clock. */
export function seedTickets(now = new Date()): Ticket[] {
  const ago = (d: number) => iso(addDays(now, -d));
  const ahead = (d: number) => iso(addDays(now, d));

  return [
    {
      id: 1, name: "SSO for the partner portal",
      summary: "Partner needs single sign-on before they can roll out to their enterprise customers. It gates their whole launch.",
      projects: ["Atlas", "Platform"],
      externalUrl: "https://partnerco.atlassian.net/browse/PX-118", dueDate: ahead(14), noHardDate: false, estimate: null,
      priority: "Critical", type: "Server", stakeholders: ["Dana R."],
      notes: "Partner's security review is the long pole; their team raises the JIRA ticket, we implement.",
      state: "New", opened: ago(40), sprint: null, planned: null, carryovers: 0,
      lastTouched: ago(3), closed: null,
    },
    {
      id: 2, name: "Export reports to CSV",
      summary: "Kills a four-hour-a-week manual copy-paste the ops team does by hand.",
      projects: ["Borealis"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: "Back-end", stakeholders: ["Sam T."], notes: "",
      state: "New", opened: ago(120), sprint: null, planned: null, carryovers: 0, lastTouched: ago(120), closed: null,
    },
    {
      id: 3, name: "Bulk edit for the asset list",
      summary: "Ops does roughly 300 individual clicks a week; this collapses it to one screen.",
      projects: ["Borealis", "Platform"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: "Front-end", stakeholders: ["Priya N.", "Sam T."], notes: "",
      state: "New", opened: ago(95), sprint: null, planned: null, carryovers: 0,
      lastTouched: ago(30), closed: null,
    },
    {
      id: 4, name: "Webhook retries + dead-letter queue",
      summary: "Delivery failures are silent today; partner-side events vanish with no trace and no alert.",
      projects: ["Cinder"],
      externalUrl: "https://partnerco.atlassian.net/browse/PX-204", dueDate: ahead(9), noHardDate: false, estimate: null,
      priority: "Critical", type: "Back-end", stakeholders: ["Dana R."], notes: "",
      state: "New", opened: ago(18), sprint: null, planned: null, carryovers: 0, lastTouched: ago(18), closed: null,
    },
    {
      id: 5, name: "Audit log for permission changes",
      summary: "Compliance evidence gap — we cannot currently show who changed what access, or when.",
      projects: ["Atlas", "Platform"], externalUrl: null, dueDate: ahead(45), noHardDate: false, estimate: null,
      priority: "Critical", type: "Back-end", stakeholders: ["Compliance"], notes: "Auditor asked for this in the last review.",
      state: "New", opened: ago(60), sprint: null, planned: null, carryovers: 0,
      lastTouched: ago(60), closed: null,
    },
    {
      id: 6, name: "Dark mode for the admin console",
      summary: "Polish request from the admins who live in the console all day.",
      projects: ["Borealis"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Nice-to-have", type: "Front-end", stakeholders: ["Priya N."], notes: "",
      state: "New", opened: ago(200), sprint: null, planned: null, carryovers: 0, lastTouched: ago(200), closed: null,
    },
    {
      id: 7, name: "Partner sandbox environment",
      summary: "Partner has no safe place to test, so they exercise against production.",
      projects: ["Cinder", "Platform"],
      externalUrl: "https://partnerco.atlassian.net/browse/PX-190", dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: "Server", stakeholders: ["Dana R.", "Eng"], notes: "",
      state: "New", opened: ago(75), sprint: null, planned: null, carryovers: 0, lastTouched: ago(75), closed: null,
    },
    {
      id: 8, name: "Rate limit the public API",
      summary: "One tenant can currently starve every other tenant with a runaway client.",
      projects: ["Atlas", "Platform"], externalUrl: null, dueDate: ahead(60), noHardDate: false, estimate: null,
      priority: "Should", type: "Server", stakeholders: ["Sam T."], notes: "",
      state: "New", opened: ago(25), sprint: null, planned: null, carryovers: 0, lastTouched: ago(25), closed: null,
    },
    {
      id: 9, name: "Timezone bug in scheduled jobs",
      summary: "Jobs fire eight hours early twice a year around DST. Ops notices every single time.",
      projects: ["Cinder"], externalUrl: null, dueDate: ahead(21), noHardDate: false, estimate: null,
      priority: "Critical", type: "Driver", stakeholders: ["Ops"], notes: "",
      state: "New", opened: ago(33), sprint: null, planned: null, carryovers: 0,
      lastTouched: ago(2), closed: null,
    },
    {
      id: 10, name: "Self-serve password reset",
      summary: "Support handles roughly 40 reset tickets a week that users could do themselves.",
      projects: ["Borealis", "Platform"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: "Front-end", stakeholders: ["Support"], notes: "",
      state: "New", opened: ago(50), sprint: null, planned: null, carryovers: 0, lastTouched: ago(50), closed: null,
    },
    {
      id: 11, name: "Partner-facing status page",
      summary: "Partner asks 'is it down?' roughly weekly; a page answers that for them.",
      projects: ["Cinder", "Delta"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Nice-to-have", type: "Front-end", stakeholders: ["Dana R."], notes: "",
      state: "New", opened: ago(110), sprint: null, planned: null, carryovers: 0, lastTouched: ago(110), closed: null,
    },
    {
      id: 12, name: "Migrate legacy photos to object storage",
      summary: "Blocks the cost-reduction project; local disk is the last big line item.",
      projects: ["Atlas", "Delta"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: null, stakeholders: ["Eng"], notes: "",
      state: "New", opened: ago(140), sprint: null, planned: null, carryovers: 0,
      lastTouched: ago(140), closed: null,
    },
    {
      id: 13, name: "SSO for the partner mobile app",
      summary: "Follow-on to portal SSO; the partner will ask for it the moment the portal ships.",
      projects: ["Atlas", "Delta"],
      externalUrl: "https://partnerco.atlassian.net/browse/PX-231", dueDate: null, noHardDate: false, estimate: null,
      priority: "Should", type: "Server", stakeholders: ["Dana R."], notes: "",
      state: "New", opened: ago(10), sprint: null, planned: null, carryovers: 0, lastTouched: ago(10), closed: null,
    },
    {
      id: 14, name: "Clean up deprecated endpoints",
      summary: "Tech debt that nobody will ask for, but it gates the v2 API work.",
      projects: ["Delta", "Platform"], externalUrl: null, dueDate: null, noHardDate: false, estimate: null,
      priority: "Nice-to-have", type: null, stakeholders: ["Eng"], notes: "",
      state: "New", opened: ago(160), sprint: null, planned: null, carryovers: 0, lastTouched: ago(160), closed: null,
    },
  ];
}
