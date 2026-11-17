// Dark or light, chosen on the "You" page and kept on this device. index.html applies
// the stored choice before the first paint; this keeps it applied afterwards.

import { readStored, writeStored } from "./stored.ts";

export type Theme = "dark" | "light" | "system";

const KEY = "graeae:theme";
const systemLight = matchMedia("(prefers-color-scheme: light)");

function stored(): Theme {
  const value = readStored(KEY);
  return value === "light" || value === "system" ? value : "dark";
}

class ThemeChoice {
  current = $state<Theme>(stored());

  set(theme: Theme) {
    this.current = theme;
    writeStored(KEY, theme);
    apply();
  }
}

export const theme = new ThemeChoice();

function apply() {
  const light = theme.current === "light" || (theme.current === "system" && systemLight.matches);
  document.documentElement.classList.toggle("dark", !light);
}

systemLight.addEventListener("change", apply);
