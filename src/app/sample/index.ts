// What `$sample` resolves to under `pnpm dev`: the sample, when the address carries
// `?sample`. `?sample=one` puts a single share on the stage, `?sample=none` none, and
// `?sample=busy` seven.

import SampleScene from "./SampleScene.svelte";
import type { Sample, SampleModule, SampleShare } from "./types.ts";

export { SampleScene };

const DAY = 86_400_000;

const variant = new URLSearchParams(window.location.search).get("sample");

const stage: SampleShare[] = [
  { id: "bia-screen", name: "Bia", kind: "screen", scene: "game" },
  { id: "caio-screen", name: "Caio", kind: "screen", scene: "race" },
  { id: "bia-webcam", name: "Bia", kind: "webcam", scene: "webcam" },
];

const busy: SampleShare[] = [
  ...stage,
  { id: "duda-webcam", name: "Duda", kind: "webcam", scene: "webcam-2" },
  { id: "edu-screen", name: "Edu", kind: "screen", scene: "race" },
  { id: "caio-webcam", name: "Caio", kind: "webcam", scene: "webcam-2" },
  { id: "fe-screen", name: "Fê", kind: "screen", scene: "game" },
];

function build(): Sample {
  const onStage = variant === "one" ? stage.slice(0, 1) : variant === "none" ? [] : variant === "busy" ? busy : stage;
  const watched = (id: string) => onStage.some((share) => share.id === id);
  return {
    room: {
      name: "The den",
      home: true,
      gear: true,
      me: "Marta",
      people: [
        {
          id: "bia",
          name: "Bia",
          followed: variant !== "none",
          screen: { watched: watched("bia-screen") },
          webcam: { watched: watched("bia-webcam") },
        },
        { id: "caio", name: "Caio", followed: false, screen: { watched: watched("caio-screen") }, webcam: null },
        { id: "duda", name: "Duda", followed: false, reconnecting: true, screen: null, webcam: { watched: watched("duda-webcam") } },
      ],
      away: ["Edu", "Fê"],
      mine: [{ kind: "webcam", watchers: ["Bia", "Caio"], scene: "webcam-2" }],
      stage: onStage,
    },
    rooms: [
      { address: "den", name: "The den", present: ["Bia", "Caio", "Duda"], live: 4 },
      { address: "late", name: "Late shift", present: ["Edu"], live: 1 },
      { address: "quiet", name: "Quiet room", present: [], live: 0 },
    ],
    you: {
      name: "Marta",
      owner: true,
      devices: [
        { id: "a", browser: "Chrome", os: "Windows", lastUsed: Date.now(), current: true },
        { id: "b", browser: "Helium", os: "Windows", lastUsed: Date.now() - 2 * DAY, current: false },
        { id: "c", browser: "Firefox", os: "Linux", lastUsed: Date.now() - 21 * DAY, current: false },
      ],
    },
    invite: { name: "Bia" },
    owner: { used: 312, budget: 1000 },
  };
}

export const sample: SampleModule["sample"] = variant === null ? null : build();
