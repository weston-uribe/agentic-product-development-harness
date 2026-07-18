import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src/evaluation/rubrics/definitions");
const dest = path.join(root, "dist/evaluation/rubrics/definitions");

await mkdir(path.dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`Copied rubric definitions to ${dest}`);
