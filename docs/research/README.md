# Research docs

One question per file, `docs/research/<topic>.md`, written for the agent who next needs the answer.

## Shape

- Title, then one line: when it was researched, against what (docs, a source tree at a branch and
  SHA, the installed version of a package), and from which graeae commit.
- The answer first: a summary or table a reader can act on without reading on.
- Then the evidence, each claim with its source link, and marked as observed (run, measured, read in
  source at a pinned revision) or inferred.
- A claim about a browser names the build it holds for (Chromium milestone or version). Read source
  at that build's branch, not `main`.

`free-plan-durable-object-limits.md` is an example.

## Sources that answer

- Chromium and WebRTC source: `https://chromium.googlesource.com/<repo>/+/refs/branch-heads/<n>/<path>?format=TEXT`,
  base64-encoded (`| base64 -d`). Gitiles log pages and their JSON ask for sign-in.
- A file's history: `gh api 'repos/chromium/chromium/commits?path=<path>'`, then `commits/<sha>` for one message.
- A Chromium issue by number: `https://issues.chromium.org/action/issues/<id>`, JSON after a `)]}'` prefix.
  Search does not answer.
- A Mozilla bug: `https://bugzilla.mozilla.org/rest/bug/<id>` and `/rest/bug/<id>/comment`.
- A whole GitHub repo at a tag: `https://codeload.github.com/<owner>/<repo>/tar.gz/refs/tags/<tag>`.
- A page of docs: its `.md` form or `llms.txt` where the site has one, then grep it instead of reading it whole.
