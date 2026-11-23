// Runs in graeae's page when `member.ts` is given `--fake-h264 <clip.h264>`: every encoded
// frame of a screen share's picture is swapped, after the browser's encoder and before
// it is sent, for the next frame of the clip, so the share goes out as whatever the clip
// was encoded as (H.264 high, say, from a sharer whose own encoder makes only baseline).
// Built for v1-build ticket 54. Unlike page.js, this changes what the page sends.
//
// The clip is Annex B H.264 with an access unit delimiter before each frame, headers
// before each key frame and no B-frames, as `ffmpeg -c:v libx264 -bf 0 -x264-params
// repeat-headers=1 -bsf:v h264_metadata=aud=insert` makes it. It plays on a loop, one
// frame for each frame the encoder makes; a key frame from the encoder (the first, or
// one a viewer asked for) is answered with the clip's next key frame.
/* global window, console, fetch, Blob, URL, Worker, RTCPeerConnection, RTCRtpScriptTransform, MediaStreamTrack */

const { clip: clipAddress } = window.__realMediaFake ?? {};

// The worker: splits the clip into frames, then swaps each encoded frame it is handed.
const WORKER = `
let frames = null;
let next = 0;
let started = false;
let swapped = 0;
let keys = 0;

const isStart = (b, i) => b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1));

/** The clip's frames: each access unit after its delimiter, and whether it holds an IDR slice. */
function split(buffer) {
  const b = new Uint8Array(buffer);
  const units = [];
  for (let i = 0; i + 4 < b.length; i++) {
    if (!isStart(b, i)) continue;
    const at = i;
    const header = b[i + 2] === 1 ? i + 3 : i + 4;
    units.push({ at, header, type: b[header] & 31 });
    i = header;
  }
  const out = [];
  for (let n = 0; n < units.length; n++) {
    if (units[n].type !== 9) continue;
    let end = n + 1;
    while (end < units.length && units[end].type !== 9) end++;
    const from = units[n + 1]?.at ?? b.length;
    const to = units[end]?.at ?? b.length;
    const key = units.slice(n + 1, end).some((unit) => unit.type === 5);
    out.push({ data: b.slice(from, to), key });
  }
  return out;
}

self.onmessage = ({ data }) => {
  frames = split(data);
  self.postMessage(\`clip ready: \${frames.length} frames, \${frames.filter((f) => f.key).length} key\`);
};

self.onrtctransform = ({ transformer }) => {
  transformer.readable
    .pipeThrough(
      new TransformStream({
        transform(frame, controller) {
          // Nothing is sent until the clip is in: a frame of the browser's own would mix in.
          if (!frames || frames.length === 0 || frame.data.byteLength === 0) return;
          if (frame.type === "key" || !started) {
            while (!frames[next].key) next = (next + 1) % frames.length;
            started = true;
            keys++;
          }
          const chosen = frames[next];
          next = (next + 1) % frames.length;
          frame.data = chosen.data.slice().buffer;
          controller.enqueue(frame);
          swapped++;
          if (swapped === 1 || swapped % 1800 === 0) self.postMessage(\`swapped \${swapped} frames, \${keys} answered with a key frame\`);
        },
      }),
    )
    .pipeTo(transformer.writable);
};
`;

if (clipAddress) {
  const worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
  worker.onmessage = ({ data }) => console.info(`[real-media] fake H.264: ${data}`);
  void fetch(clipAddress)
    .then((response) => response.arrayBuffer())
    .then((buffer) => worker.postMessage(buffer, [buffer]))
    .catch((error) => console.error(`[real-media] fake H.264: the clip did not load: ${error}`));

  // A screen share's picture is sent through the worker; a webcam's goes out as it is.
  const addTransceiver = RTCPeerConnection.prototype.addTransceiver;
  RTCPeerConnection.prototype.addTransceiver = function (trackOrKind, ...rest) {
    const transceiver = addTransceiver.call(this, trackOrKind, ...rest);
    if (trackOrKind instanceof MediaStreamTrack && trackOrKind.kind === "video" && trackOrKind.getSettings().displaySurface) {
      transceiver.sender.transform = new RTCRtpScriptTransform(worker, {});
      console.info("[real-media] fake H.264: the screen share's picture goes out as the clip");
    }
    return transceiver;
  };
}
