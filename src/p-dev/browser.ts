import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BrowserOpener {
  open(url: string): Promise<void>;
}

export function createMacOsBrowserOpener(
  execFileImpl: typeof execFileAsync = execFileAsync,
): BrowserOpener {
  return {
    async open(url: string): Promise<void> {
      if (process.platform !== "darwin") {
        throw new Error(
          "p-dev browser launch is macOS-only in this packaging spike. Re-open the printed Configure URL manually.",
        );
      }

      await execFileImpl("open", [url]);
    },
  };
}

export const defaultBrowserOpener = createMacOsBrowserOpener();
