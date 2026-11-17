/**
 * Whether a key press may trigger a page shortcut such as "[": not while typing in a
 * field, and not with Ctrl or Cmd held. AltGr arrives as Ctrl+Alt, and on many
 * layouts it is how "[" is typed, so that combination still counts.
 */
export function isShortcut(event: KeyboardEvent): boolean {
  const altGr = event.ctrlKey && event.altKey;
  if (event.metaKey || (event.ctrlKey && !altGr)) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return true;
  return !(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}
