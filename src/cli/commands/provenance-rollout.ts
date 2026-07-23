import {
  createRestrictedKeyTempDir,
  generateProvenanceKey,
  installProvenanceKeySecret,
  inspectProvenanceRolloutReadiness,
  publicSafeRolloutEvidence,
  readKeyMaterialFromStdinOrFile,
  setProvenanceMode,
  shredRestrictedKeyArtifacts,
  validateGeneratedKey,
  writeRestrictedKeyFile,
} from "../../provenance/rollout.js";
import type { ProvenanceWriterMode } from "../../provenance/mode.js";

async function readStdinIfPiped(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runProvenanceRolloutCommand(options: {
  action: string;
  mode?: string;
  keyFile?: string;
  runnerRepo?: string;
  shadowValidated?: boolean;
  json?: boolean;
}): Promise<number> {
  const action = options.action.trim().toLowerCase();

  try {
    if (action === "readiness" || action === "inspect") {
      const readiness = await inspectProvenanceRolloutReadiness({
        runnerRepository: options.runnerRepo,
      });
      const evidence = publicSafeRolloutEvidence({ readiness });
      if (options.json) {
        console.log(JSON.stringify(evidence, null, 2));
      } else {
        console.log(
          `mode=${evidence.mode} healthy=${evidence.healthy} writer=${evidence.writerVersion} secretConfigured=${evidence.secretConfigured}`,
        );
        for (const check of readiness.checks) {
          console.log(`  [${check.ok ? "ok" : "fail"}] ${check.name}: ${check.detail}`);
        }
      }
      return readiness.failClosedReason && readiness.mode !== "disabled" ? 1 : 0;
    }

    if (action === "generate-key") {
      const prevUmask = process.umask(0o077);
      const dir = createRestrictedKeyTempDir();
      try {
        const key = generateProvenanceKey();
        validateGeneratedKey(key);
        const path = writeRestrictedKeyFile(dir, key);
        if (options.json) {
          console.log(
            JSON.stringify({
              keyId: "provenance-key-v1",
              keyFile: path,
              keyMaterialPrinted: false,
            }),
          );
        } else {
          console.log(`Wrote restricted key file (mode 0600): ${path}`);
          console.log("Install with: provenance install-key --key-file <path>");
          console.log("Key material is not printed.");
        }
        return 0;
      } finally {
        process.umask(prevUmask);
      }
    }

    if (action === "install-key") {
      const stdinData = await readStdinIfPiped();
      const keyMaterial = readKeyMaterialFromStdinOrFile({
        filePath: options.keyFile,
        stdinData,
      });
      const result = await installProvenanceKeySecret({
        keyMaterial,
        runnerRepository: options.runnerRepo,
      });
      if (options.json) {
        console.log(
          JSON.stringify({
            installed: result.installed,
            keyId: result.keyId,
            keyMaterialPrinted: false,
            keyValueReadBack: false,
          }),
        );
      } else {
        console.log(`Installed ${result.keyId} (value never echoed or read back).`);
      }
      return 0;
    }

    if (action === "set-mode") {
      const mode = (options.mode ?? "").trim().toLowerCase() as ProvenanceWriterMode;
      if (mode !== "disabled" && mode !== "shadow" && mode !== "required") {
        console.error("mode must be disabled|shadow|required");
        return 1;
      }
      const result = await setProvenanceMode({
        mode,
        runnerRepository: options.runnerRepo,
        shadowValidated: options.shadowValidated === true,
      });
      if (options.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`mode ${result.previous ?? "(unset)"} -> ${result.next}`);
      }
      return 0;
    }

    if (action === "shred-local-key-dir") {
      if (!options.keyFile) {
        console.error("--key-file parent directory required for shred");
        return 1;
      }
      const dir = options.keyFile.replace(/\/[^/]+$/, "");
      shredRestrictedKeyArtifacts(dir);
      console.log("Local key artifacts shredded.");
      return 0;
    }

    console.error(
      `Unknown action ${action}. Use: readiness|generate-key|install-key|set-mode`,
    );
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(message);
    }
    return 1;
  }
}
