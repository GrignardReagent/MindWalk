// Writes the phone page into www/ for the Android app (Capacitor's webDir).
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICON, MANIFEST, renderPage } from "../server.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
await mkdir(www, { recursive: true });
await writeFile(path.join(www, "index.html"), await renderPage());
await copyFile(path.join(root, "app", "organize.js"), path.join(www, "organize.js"));
await writeFile(path.join(www, "manifest.webmanifest"), MANIFEST);
await writeFile(path.join(www, "icon.svg"), ICON);
console.log("Built www/");
