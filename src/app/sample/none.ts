// What `$sample` resolves to in a production build: no sample, and nothing of it shipped.

import type { SampleModule } from "./types.ts";

export const sample: SampleModule["sample"] = null;
export const SampleScene: SampleModule["SampleScene"] = () => ({});
