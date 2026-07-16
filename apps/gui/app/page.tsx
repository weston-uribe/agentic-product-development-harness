import { redirect } from "next/navigation";
import { resolvePackagedDefaultRoute } from "@harness/setup/packaged-default-route";
import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cwd = resolveHarnessRepoRoot();
  const { route } = await resolvePackagedDefaultRoute(cwd);
  redirect(route);
}
