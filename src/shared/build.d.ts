// Which build of graeae is running: the commit it was built from (`git describe --always
// --dirty`), or "unknown" outside a git checkout. Stamped in when the code is built, so a
// log line can be matched to the code that wrote it (ticket 48).

declare const __GRAEAE_BUILD__: string;
