// Bina viralcool-lite.html: satu fail, prompt ditanam di dalam.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(HERE, "..");
const tpl = fs.readFileSync(path.join(HERE, "index.template.html"), "utf8");
const base = fs.readFileSync(path.join(root, "prompts", "base-prompt.md"), "utf8");
const threads = fs.readFileSync(path.join(root, "prompts", "platforms", "threads.md"), "utf8");

const out = tpl
  .replace("__BASE_PROMPT__", JSON.stringify(base))
  .replace("__THREADS_PLAYBOOK__", JSON.stringify(threads));

if (out.includes("__BASE_PROMPT__") || out.includes("__THREADS_PLAYBOOK__")) {
  throw new Error("Placeholder tak diganti.");
}
const dest = path.join(root, "viralcool-lite.html");
fs.writeFileSync(dest, out);
console.log(`viralcool-lite.html siap — ${(out.length / 1024).toFixed(0)} KB (base ${base.length}, playbook ${threads.length} aksara)`);
