import { mkdir, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const destination = resolve(root, "dist/unpacked");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of [
  "manifest.json",
  "background.js",
  "capture.js",
  "client.js",
  "panel.html",
  "panel.css",
  "panel.js",
])
  await copyFile(resolve(root, file), resolve(destination, file));
console.log(`Load unpacked: ${destination}`);
