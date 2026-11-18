// After `pnpm capture`: an `index.html` beside the shots, grouped by surface, with an
// earlier set beside each shot when `GRAEAE_CAPTURE_AGAINST` names one.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LABEL, ROOT } from "./shoot.ts";

export default function contactSheet() {
  const dir = join(ROOT, LABEL);
  if (!existsSync(dir)) return;
  const against = process.env.GRAEAE_CAPTURE_AGAINST;
  const before = against && existsSync(join(ROOT, against)) ? new Set(readdirSync(join(ROOT, against))) : null;
  const shots = readdirSync(dir)
    .filter((file) => file.endsWith(".png"))
    .sort();

  const surfaces = new Map<string, string[]>();
  for (const shot of shots) {
    const surface = shot.split("--")[0] ?? shot;
    surfaces.set(surface, [...(surfaces.get(surface) ?? []), shot]);
  }

  const figure = (src: string, caption: string) =>
    `<figure><a href="${src}"><img src="${src}" loading="lazy" alt=""></a><figcaption>${caption}</figcaption></figure>`;
  const sections = [...surfaces]
    .map(([surface, files]) => {
      const rows = files
        .map((file) => {
          const now = figure(file, before ? `${LABEL}: ${file}` : file);
          if (!before) return now;
          const then = before.has(file) ? figure(`../${against}/${file}`, `${against}: ${file}`) : `<p>Not in ${against}</p>`;
          return `<div class="pair">${then}${now}</div>`;
        })
        .join("\n");
      return `<section><h2>${surface}</h2><div class="${before ? "pairs" : "grid"}">${rows}</div></section>`;
    })
    .join("\n");

  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>graeae captures: ${LABEL}</title>
<style>
  body { margin: 0; padding: 24px; background: #0b0b0c; color: #b9b9bf; font: 13px/1.45 system-ui, sans-serif; }
  h1 { font-size: 20px; font-weight: 500; color: #ececee; }
  h2 { font-size: 15px; font-weight: 500; color: #ececee; margin: 40px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
  .pairs { display: grid; gap: 24px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  figure { margin: 0; }
  img { width: 100%; display: block; border-radius: 6px; }
  figcaption { margin-top: 6px; color: #8e8e95; font-size: 12px; word-break: break-all; }
</style>
<h1>graeae captures: ${LABEL}${before ? ` against ${against}` : ""}</h1>
<p>${shots.length} shots, taken by <code>pnpm capture</code> on the fakes.</p>
${sections}
`,
  );
}
