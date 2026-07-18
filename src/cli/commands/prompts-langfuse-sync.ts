import { prepareLangfusePromptSync } from "../../prompts/langfuse-sync.js";

export async function runPromptsLangfuseSync(options: {
  dryRun?: boolean;
  label?: string;
  publish?: boolean;
}): Promise<number> {
  try {
    const plan = await prepareLangfusePromptSync({
      dryRun: options.dryRun !== false,
      label: options.label,
      publish: options.publish === true,
    });
    console.log(JSON.stringify(plan, null, 2));
    if (options.publish) {
      console.error(
        "Publish is not authorized in this chunk; dry-run changeset only.",
      );
    }
    return 0;
  } catch (err) {
    console.error(
      `prompts:langfuse:sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
