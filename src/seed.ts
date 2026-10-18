import type { Ticket } from "./schema";

/** Seed tickets: a realistic mix so the loop is worth running in ~2 minutes.
 *  Replace with your real rows once the loop feels right. */

const DAY = 86_400_000;
const now = new Date();
const isoish = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ago = (d: number) => isoish(new Date(now.getTime() - d * DAY));
const ahead = (d: number) => isoish(new Date(now.getTime() + d * DAY));

export const SEED_TICKETS: Ticket[] = [
  {
    id: 1, name: "SSO for the partner portal",
    summary: "Partner needs single sign-on before they can roll out to their enterprise customers. It gates their whole launch.",
    projects: ["Atlas", "Platform"],
    externalUrl: "https://partnerco.atlassian.net/browse/PX-118", dueDate: ahead(14),
    ownerType: "Partner", owner: "PartnerCo", stakeholders: ["Dana R."],
    type: "Critical", size: "M", state: "Accepted-Backlog", opened: ago(40),
    sprint: null, carryovers: 0, lastTouched: ago(3),
    closed: null, nextAction: "Partner to size; follow up Friday",
  },
  {
    id: 2, name: "Export reports to CSV",
    summary: "Kills a four-hour-a-week manual copy-paste the ops team does by hand.",
    projects: ["Borealis"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "J. Alvarez", stakeholders: ["Sam T."],
    type: "Should", size: "S", state: "New", opened: ago(120),
    sprint: null, carryovers: 0, lastTouched: ago(120), closed: null, nextAction: "",
  },
  {
    id: 3, name: "Bulk edit for the asset list",
    summary: "Ops does roughly 300 individual clicks a week; this collapses it to one screen.",
    projects: ["Borealis", "Platform"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "M. Osei", stakeholders: ["Priya N.", "Sam T."],
    type: "Should", size: "M", state: "Accepted-Backlog", opened: ago(95),
    sprint: null, carryovers: 0, lastTouched: ago(30), closed: null, nextAction: "",
  },
  {
    id: 4, name: "Webhook retries + dead-letter queue",
    summary: "Delivery failures are silent today; partner-side events vanish with no trace and no alert.",
    projects: ["Cinder"],
    externalUrl: "https://partnerco.atlassian.net/browse/PX-204", dueDate: ahead(9),
    ownerType: "Partner", owner: "PartnerCo", stakeholders: ["Dana R."],
    type: "Critical", size: "L", state: "New", opened: ago(18),
    sprint: null, carryovers: 0, lastTouched: ago(18), closed: null, nextAction: "",
  },
  {
    id: 5, name: "Audit log for permission changes",
    summary: "Compliance evidence gap — we cannot currently show who changed what access, or when.",
    projects: ["Atlas", "Platform"], externalUrl: null, dueDate: ahead(45),
    ownerType: "Team", owner: "R. Silva", stakeholders: ["Compliance"],
    type: "Critical", size: "M", state: "Accepted-Backlog", opened: ago(60),
    sprint: null, carryovers: 0, lastTouched: ago(60), closed: null, nextAction: "",
  },
  {
    id: 6, name: "Dark mode for the admin console",
    summary: "Polish request from the admins who live in the console all day.",
    projects: ["Borealis"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "J. Alvarez", stakeholders: ["Priya N."],
    type: "Nice-to-have", size: "S", state: "New", opened: ago(200),
    sprint: null, carryovers: 0, lastTouched: ago(200), closed: null, nextAction: "",
  },
  {
    id: 7, name: "Partner sandbox environment",
    summary: "Partner has no safe place to test, so they exercise against production.",
    projects: ["Cinder", "Platform"],
    externalUrl: "https://partnerco.atlassian.net/browse/PX-190", dueDate: null,
    ownerType: "Partner", owner: "PartnerCo", stakeholders: ["Dana R.", "Eng"],
    type: "Should", size: "L", state: "New", opened: ago(75),
    sprint: null, carryovers: 0, lastTouched: ago(75), closed: null, nextAction: "",
  },
  {
    id: 8, name: "Rate limit the public API",
    summary: "One tenant can currently starve every other tenant with a runaway client.",
    projects: ["Atlas", "Platform"], externalUrl: null, dueDate: ahead(60),
    ownerType: "Team", owner: "R. Silva", stakeholders: ["Sam T."],
    type: "Should", size: "M", state: "New", opened: ago(25),
    sprint: null, carryovers: 0, lastTouched: ago(25), closed: null, nextAction: "",
  },
  {
    id: 9, name: "Timezone bug in scheduled jobs",
    summary: "Jobs fire eight hours early twice a year around DST. Ops notices every single time.",
    projects: ["Cinder"], externalUrl: null, dueDate: ahead(21),
    ownerType: "Team", owner: "M. Osei", stakeholders: ["Ops"],
    type: "Critical", size: "S", state: "Accepted-Backlog", opened: ago(33),
    sprint: null, carryovers: 0, lastTouched: ago(2), closed: null, nextAction: "",
  },
  {
    id: 10, name: "Self-serve password reset",
    summary: "Support handles roughly 40 reset tickets a week that users could do themselves.",
    projects: ["Borealis", "Platform"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "J. Alvarez", stakeholders: ["Support"],
    type: "Should", size: "M", state: "New", opened: ago(50),
    sprint: null, carryovers: 0, lastTouched: ago(50), closed: null, nextAction: "",
  },
  {
    id: 11, name: "Partner-facing status page",
    summary: "Partner asks 'is it down?' roughly weekly; a page answers that for them.",
    projects: ["Cinder", "Delta"], externalUrl: null, dueDate: null,
    ownerType: "Partner", owner: "PartnerCo", stakeholders: ["Dana R."],
    type: "Nice-to-have", size: "S", state: "New", opened: ago(110),
    sprint: null, carryovers: 0, lastTouched: ago(110), closed: null, nextAction: "",
  },
  {
    id: 12, name: "Migrate legacy photos to object storage",
    summary: "Blocks the cost-reduction project; local disk is the last big line item.",
    projects: ["Atlas", "Delta"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "R. Silva", stakeholders: ["Eng"],
    type: "Should", size: "L", state: "Accepted-Backlog", opened: ago(140),
    sprint: null, carryovers: 0, lastTouched: ago(140), closed: null, nextAction: "",
  },
  {
    id: 13, name: "SSO for the partner mobile app",
    summary: "Follow-on to portal SSO; the partner will ask for it the moment the portal ships.",
    projects: ["Atlas", "Delta"],
    externalUrl: "https://partnerco.atlassian.net/browse/PX-231", dueDate: null,
    ownerType: "Partner", owner: "PartnerCo", stakeholders: ["Dana R."],
    type: "Should", size: "M", state: "New", opened: ago(10),
    sprint: null, carryovers: 0, lastTouched: ago(10), closed: null, nextAction: "",
  },
  {
    id: 14, name: "Clean up deprecated endpoints",
    summary: "Tech debt that nobody will ask for, but it gates the v2 API work.",
    projects: ["Delta", "Platform"], externalUrl: null, dueDate: null,
    ownerType: "Team", owner: "M. Osei", stakeholders: ["Eng"],
    type: "Nice-to-have", size: "M", state: "New", opened: ago(160),
    sprint: null, carryovers: 0, lastTouched: ago(160), closed: null, nextAction: "",
  },
];
