/**
 * True when a keypress belongs to whatever the user is typing into, so a
 * screen's single-key shortcuts must leave it alone. Modifier chords are
 * the browser's, and are left alone for the same reason.
 */
export function ignoreShortcut(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  return typing || e.metaKey || e.ctrlKey || e.altKey;
}
