#!/usr/bin/env node
import { launchPDev } from "./launch.js";

await launchPDev({
  moduleUrl: import.meta.url,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`p-dev failed: ${message}`);
  process.exit(1);
});
