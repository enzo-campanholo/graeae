// What `$sample` resolves to under `pnpm dev`: the sample, when the address carries
// `?sample`. `?sample=one` follows Caio, whose one share fills the stage, `?sample=none`
// watches nothing, and `?sample=busy` watches seven shares. Each is a state the room can
// really be in: only members here share, and a followed member's shares are all that is
// watched.

import SampleScene from "./SampleScene.svelte";
import type { Sample, SampleModule, SampleShare } from "./types.ts";

export { SampleScene };

const DAY = 86_400_000;

const variant = new URLSearchParams(window.location.search).get("sample");
const isBusy = variant === "busy";

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
  { id: "duda-screen", name: "Duda", kind: "screen", scene: "game" },
];

function build(): Sample {
  const onStage = variant === "one" ? stage.filter((share) => share.id === "caio-screen") : variant === "none" ? [] : isBusy ? busy : stage;
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
          followed: false,
          screen: { watched: watched("bia-screen") },
          webcam: { watched: watched("bia-webcam") },
        },
        {
          id: "caio",
          name: "Caio",
          followed: variant === "one",
          screen: { watched: watched("caio-screen") },
          webcam: isBusy ? { watched: watched("caio-webcam") } : null,
        },
        {
          id: "duda",
          name: "Duda",
          followed: false,
          reconnecting: true,
          screen: isBusy ? { watched: watched("duda-screen"), reconnecting: true } : null,
          webcam: { watched: watched("duda-webcam"), reconnecting: true },
        },
        ...(isBusy ? [{ id: "edu", name: "Edu", followed: false, screen: { watched: watched("edu-screen") }, webcam: null }] : []),
      ],
      away: isBusy ? ["Fê"] : ["Edu", "Fê"],
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
      home: "/",
    },
    invite: { name: "Bia" },
    owner: { used: 312, budget: 1000 },
  };
}

export const sample: SampleModule["sample"] = variant === null ? null : build();
