/** The two kinds of share (GLOSSARY.md): a screen share or a webcam share. */
export type { ShareKind } from "../../shared/socket/shares.ts";

/**
 * Where this tab's own shares stand, as the share buttons show it: a kind is starting
 * once pressed (the picker may be open), then live while this tab sends it.
 */
export interface Sharing {
  screenLive: boolean;
  screenStarting: boolean;
  webcamLive: boolean;
  webcamStarting: boolean;
}

/**
 * What the share buttons say, in the bar and on the empty stage alike, and whether Share
 * screen is keyed: S shares a screen while there is none of this tab's to start.
 */
export function shareLabels(sharing: Sharing) {
  return {
    screen: sharing.screenStarting ? "Starting" : sharing.screenLive ? "Screen live" : "Share screen",
    webcam: sharing.webcamStarting ? "Starting" : sharing.webcamLive ? "Webcam live" : "Share webcam",
    keyed: !sharing.screenLive && !sharing.screenStarting,
  };
}
