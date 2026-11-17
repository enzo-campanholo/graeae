// Seam 2: the whole app, built and running locally on an empty instance held in memory,
// driven by a real Chromium. These are the secrets that instance is started with.

export const SETUP_SECRET = "seam-2-setup-secret-0123456789abcdefghij";

export const SECRETS = {
  SETUP_SECRET,
  SFU_APP_ID: "seam-2-sfu-app-id",
  SFU_APP_SECRET: "seam-2-sfu-app-secret",
  TURN_KEY_ID: "seam-2-turn-key-id",
  TURN_KEY_TOKEN: "seam-2-turn-key-token",
};
