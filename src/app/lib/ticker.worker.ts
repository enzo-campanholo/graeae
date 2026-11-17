// The ticker's clock, in a worker of its own. Chromium slows a hidden tab's timers to
// one wake-up a minute after five minutes, which would starve the heartbeat and end the
// member's presence; timers in a dedicated worker are left alone.

let timer: ReturnType<typeof setInterval> | undefined;

self.addEventListener("message", (event: MessageEvent<number>) => {
  clearInterval(timer);
  timer = setInterval(() => self.postMessage(null), event.data);
});
