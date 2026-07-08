import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { EXIT_CONFIG, EXIT_SUCCESS } from "../exit-codes.js";

const ENV_EXAMPLE = ".env.example";
const ENV_LOCAL = ".env.local";
const HARNESS_DIR = ".harness";
const CONFIG_EXAMPLE = path.join(HARNESS_DIR, "config.example.json");
const CONFIG_LOCAL = path.join(HARNESS_DIR, "config.local.json");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function scaffoldFile(options: {
  source: string;
  destination: string;
  force: boolean;
  label: string;
}): Promise<"created" | "skipped"> {
  const { source, destination, force, label } = options;
  const destExists = await fileExists(destination);

  if (destExists && !force) {
    console.log(`skipped ${label} (already exists)`);
    return "skipped";
  }

  if (!(await fileExists(source))) {
    throw new Error(`Missing source file: ${source}`);
  }

  await copyFile(source, destination);
  console.log(`${destExists ? "overwrote" : "created"} ${label}`);
  return "created";
}

function printNextSteps(): void {
  console.log("");
  console.log("Next steps:");
  console.log("  1. Edit .harness/config.local.json with your real target repo mapping");
  console.log(
    "  2. Keep HARNESS_CONFIG_PATH=.harness/config.local.json in .env.local",
  );
  console.log("  3. Run npm run harness:doctor");
  console.log(
    "  4. Base64 encode config.local.json and set HARNESS_CONFIG_JSON_B64 in harness repo GitHub Actions secrets for cloud runs",
  );
}

export async function runOperatorInit(options?: {
  force?: boolean;
  cwd?: string;
}): Promise<number> {
  const cwd = options?.cwd ?? process.cwd();
  const force = options?.force ?? false;

  try {
    await mkdir(path.join(cwd, HARNESS_DIR), { recursive: true });

    await scaffoldFile({
      source: path.join(cwd, ENV_EXAMPLE),
      destination: path.join(cwd, ENV_LOCAL),
      force,
      label: ENV_LOCAL,
    });

    await scaffoldFile({
      source: path.join(cwd, CONFIG_EXAMPLE),
      destination: path.join(cwd, CONFIG_LOCAL),
      force,
      label: CONFIG_LOCAL,
    });

    printNextSteps();
    return EXIT_SUCCESS;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`operator init failed: ${message}`);
    return EXIT_CONFIG;
  }
}
