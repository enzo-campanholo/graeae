// The generated webcam for `pnpm real-media --webcam fake` (see member.ts).

import { closeSync, existsSync, openSync, writeSync } from "node:fs";

/**
 * A 640x480 (4:3) webcam picture as a .y4m file Chromium loops: a wall, a lamp, a head
 * and shoulders that sway, and "4:3 CAM" in the corner, which reads backwards in your own
 * mirrored preview and forwards for everyone else.
 */
export function fakeWebcam(file: string): string {
  if (existsSync(file)) return file;
  const width = 640;
  const height = 480;
  const frames = 60;
  const out = openSync(file, "w");
  writeSync(out, `YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  const rgb = new Uint8Array(width * height * 3);
  for (let frame = 0; frame < frames; frame++) {
    const sway = Math.sin((frame / frames) * Math.PI * 2) * 18;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let [r, g, b] = [150 - y / 8, 130 - y / 10, 115 - y / 9];
        // A lamp's glow, upper left.
        const lamp = Math.max(0, 1 - Math.hypot(x - 110, y - 90) / 150);
        r += lamp * 100;
        g += lamp * 90;
        b += lamp * 60;
        // A shelf on the right.
        if (x > 470 && x < 600 && y > 150 && y < 160) [r, g, b] = [90, 60, 40];
        // Shoulders, then a head.
        const cx = 320 + sway;
        if ((x - cx) ** 2 / 190 ** 2 + (y - 520) ** 2 / 160 ** 2 < 1) [r, g, b] = [50, 70, 110];
        if ((x - cx) ** 2 / 78 ** 2 + (y - 250) ** 2 / 100 ** 2 < 1) [r, g, b] = [214, 170, 140];
        if ((x - cx) ** 2 / 82 ** 2 + (y - 185) ** 2 / 50 ** 2 < 1 && y < 200) [r, g, b] = [60, 40, 30];
        const i = (y * width + x) * 3;
        rgb[i] = clamp(r);
        rgb[i + 1] = clamp(g);
        rgb[i + 2] = clamp(b);
      }
    }
    text(rgb, width, "4:3 CAM", 20, 420, 6);
    const planes = yuv420(rgb, width, height);
    writeSync(out, "FRAME\n");
    writeSync(out, planes);
  }
  closeSync(out);
  return file;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** A few 5x7 letters, white, `scale` pixels to a dot. */
function text(rgb: Uint8Array, width: number, line: string, left: number, top: number, scale: number) {
  const font: Record<string, string[]> = {
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  };
  [...line].forEach((char, n) => {
    font[char]?.forEach((row, dy) =>
      [...row].forEach((dot, dx) => {
        if (dot !== "1") return;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const i = ((top + dy * scale + sy) * width + left + (n * 6 + dx) * scale + sx) * 3;
            rgb[i] = rgb[i + 1] = rgb[i + 2] = 250;
          }
      }),
    );
  });
}

/** RGB to the planar 4:2:0 YUV a .y4m frame holds (BT.601, studio range). */
function yuv420(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array((width * height * 3) / 2);
  const u = width * height;
  const v = u + u / 4;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const [r, g, b] = [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!];
      out[y * width + x] = clamp(0.257 * r + 0.504 * g + 0.098 * b + 16);
      if (y % 2 === 0 && x % 2 === 0) {
        const c = (y / 2) * (width / 2) + x / 2;
        out[u + c] = clamp(-0.148 * r - 0.291 * g + 0.439 * b + 128);
        out[v + c] = clamp(0.439 * r - 0.368 * g - 0.071 * b + 128);
      }
    }
  return out;
}
