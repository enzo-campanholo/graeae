// Putting text on the clipboard. The browser allows it only close to a press, so text
// that is still on its way (an invite being made) is handed over as a promise at the
// press itself.

/** Copies `text`, or what it resolves to. Whether the browser took it. */
export async function copy(text: string | Promise<string>): Promise<boolean> {
  try {
    if (typeof text !== "string" && typeof ClipboardItem !== "undefined") {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    }
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}
