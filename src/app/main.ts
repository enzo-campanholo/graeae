import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { tabLog } from "./lib/log.ts";

// First, so the page's log has its opening, and any error from here on.
tabLog.start();

const target = document.getElementById("app");
if (!target) throw new Error("index.html has no #app element");

mount(App, { target });
