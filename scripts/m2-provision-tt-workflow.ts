import { loadHarnessDotenv } from "../src/config/load-dotenv.js";
import { ensureWorkflowStatesForTeam } from "../src/setup/linear-setup-apply.js";
import {
  createLinearSetupClient,
  listTeamWorkflowStates,
} from "../src/setup/linear-setup-client.js";
import {
  isWorkflowStatusCoverageComplete,
  matchWorkflowStates,
} from "../src/setup/linear-setup-plan.js";

const TT_TEAM_ID = "abe28dd5-59a4-49b6-a867-1301a9ba5185";

async function main(): Promise<void> {
  const cwd = process.env.P_DEV_HOME ?? process.cwd();
  loadHarnessDotenv(cwd);
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) throw new Error("LINEAR_API_KEY missing");

  const client = createLinearSetupClient(apiKey);
  const created: string[] = [];
  const skipped: string[] = [];
  const complete = await ensureWorkflowStatesForTeam({
    client,
    teamId: TT_TEAM_ID,
    created,
    skipped,
  });
  const states = await listTeamWorkflowStates(client, TT_TEAM_ID);
  const names = states.map((s) => s.name).sort();
  console.log(
    JSON.stringify({
      statusCoverageComplete: complete,
      createdCount: created.length,
      stateNames: names,
      matchesHarness: isWorkflowStatusCoverageComplete(
        matchWorkflowStates(states),
      ),
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
