// The switch that selects the fake media server and the fake media client, for tests.
// It is fixed when the code is built, never read from a request or a setting: `vitest`
// (Seam 1) and `vite build --mode fake-media` (Seam 2) set it to true, and every other
// build, the deploy's included, to false, which leaves the fakes out of the build entirely.

declare const __GRAEAE_FAKE_MEDIA__: boolean;
