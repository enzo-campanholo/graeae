# 17: Encoding rules and two qualities

**What to build:** A Chromium screen share goes out in hardware H.264 at 1080p60 and at 720p60, so a viewer on a weak link drops to 720p alone. Each viewer can choose "Auto", "1080p" or "720p" per watched screen share, and a share received at the lower quality carries a "720p" mark. Firefox sends one quality in VP9.

The rules are fixed numbers with no settings. Sources for what works: `prototype/quality-proof` and `docs/research/capture-rate-and-hardware-encode.md` on the branch `research/capture-rate`. Neither branch is merged; read them with `git show <branch>:<path>`.

Spec: [Encoding and quality](../spec.md#encoding-and-quality).

UI: build with the impeccable skill, following `DESIGN.md`.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] Chromium screen share: 1080p at 60 fps limited to 12 Mbps, and 720p at 60 fps limited to 4 Mbps; a larger monitor is scaled down to 1080p
- [ ] Codec order: H.264 high profile, then main, then one software codec last so a share always starts; never constrained baseline first, never HEVC
- [ ] Capture is asked for 120 fps and the sender is limited to 60
- [ ] Firefox screen share: one quality, VP9 at 1080p, limited to 30 fps and 6 Mbps
- [ ] Webcam share follows the same codec rule as a Chromium screen share
- [ ] One codec per share, with no per-viewer codec choice
- [ ] The media layer seam gains "change a viewer's quality", in the fake and in the Cloudflare implementation
- [ ] The encoding plan (codec order, qualities, bitrate and frame-rate limits, scale) is one pure rule, taking the browser family and the kind of share as inputs, and tests assert on its result for every row of the spec's table
- [ ] The fake media client can report which quality a watched share is being received at, so the "720p" mark under Auto is testable
- [ ] Each watched screen share has a choice of "Auto", "1080p" or "720p", defaulting to Auto; the choice goes through the backend, which sets the preferred quality on the media server mid-watch
- [ ] A share received at the lower quality carries a small "720p" mark
- [ ] A single-quality share (Firefox screen, webcam) shows no quality choice
- [ ] Two qualities can be switched off in one place, leaving one 1080p60 quality at 12 Mbps with no choice and no mark, in case the owner's hardware-encoder check fails
- [ ] The backend records each share's maximum bitrate (12, 6 or 1.5 Mbps) for the usage count
- [ ] Seam 1 tests for the quality choice and its checks; Seam 2 for the control and the mark
