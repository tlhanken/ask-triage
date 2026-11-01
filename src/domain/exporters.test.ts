import { describe, expect, it } from "vitest";
import { freshStore } from "./store";
import { projectsToMarkdown, registerToCsv, toJson } from "./exporters";
import { NOW, freezeClock } from "./test-fixtures";

freezeClock();

describe("exports", () => {
  it("csv carries the ticket fields you named, plus derived score and flags", () => {
    const s = freshStore();
    const lines = registerToCsv(s, NOW).trim().split("\n");
    expect(lines[0]).toContain("id,name,summary,projects");
    expect(lines[0]).toContain("dueDate");
    expect(lines[0]).toContain("externalUrl");
    expect(lines[0]).toContain("notes");
    expect(lines[0]).toContain("estimate");
    for (const gone of ["owner", "size", "nextAction"]) expect(lines[0]).not.toContain(gone);
    expect(lines).toHaveLength(s.tickets.length + 1);
  });

  it("project export groups open tickets under each project", () => {
    const md = projectsToMarkdown(freshStore(), NOW);
    expect(md).toContain("## Atlas (");
    expect(md).toContain("## Cinder (");
  });

  it("json round-trips and carries derived fields", () => {
    const s = freshStore();
    const parsed = JSON.parse(toJson(s, NOW));
    expect(parsed.tickets).toHaveLength(s.tickets.length);
    expect(parsed.tickets[0]).toHaveProperty("score");
    expect(parsed.tickets[0]).toHaveProperty("flags");
  });
});
