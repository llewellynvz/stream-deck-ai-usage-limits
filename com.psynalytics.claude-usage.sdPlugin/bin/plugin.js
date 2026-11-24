import streamDeck from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { readCredential } from "./credentials.js";
import { fetchUsage } from "./usage-client.js";
import { createPoller } from "./poller.js";
import { createHistory } from "./history.js";
import { createDeck } from "./deck.js";
import { quietLog } from "./quiet-log.js";

const log = quietLog((line) => streamDeck.logger.info(line));
const readFile = (path) => readFileSync(path, "utf8");

const poller = createPoller({
  readCredential: () => readCredential({ env: process.env, homedir, readFile, now: Date.now }),
  fetchUsage: (token) => fetchUsage(token, fetch),
  now: Date.now,
  log,
});

const history = createHistory((stored) => streamDeck.settings.setGlobalSettings(stored));
const openUrl = (url) => streamDeck.system.openUrl(url);
streamDeck.actions.registerAction(createDeck({ poller, history, openUrl, log, now: Date.now }));
await streamDeck.connect();
streamDeck.settings.getGlobalSettings().then(history.load);
log("ready");
