// The shape of the made-up data the shells can be filled with under `pnpm dev`, so a
// page can be checked against its design before the real data reaches it.

import type { Component } from "svelte";
import type { MeAnswer } from "../../shared/api.ts";
import type { ShareKind } from "../lib/share.ts";

export type Scene = "game" | "race" | "webcam" | "webcam-2";

export interface SampleShare {
  id: string;
  name: string;
  kind: ShareKind;
  scene: Scene;
}

export interface SamplePerson {
  id: string;
  name: string;
  followed: boolean;
  screen: { watched: boolean } | null;
  webcam: { watched: boolean } | null;
}

export interface SampleRoom {
  name: string;
  home: boolean;
  gear: boolean;
  me: string;
  people: SamplePerson[];
  away: string[];
  mine: { kind: ShareKind; watchers: string[]; scene: Scene }[];
  stage: SampleShare[];
}

export interface Sample {
  room: SampleRoom;
  rooms: { address: string; name: string; present: string[]; live: number }[];
  you: MeAnswer;
  invite: { name: string };
  owner: { used: number; budget: number };
}

export interface SampleModule {
  /** The sample for this page load, or null when the address has no `?sample`. */
  sample: Sample | null;
  SampleScene: Component<{ scene: Scene }>;
}
