import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationRubric } from "./types.js";
import { assertValidRubric } from "./validate.js";

function definitionsDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "definitions");
}

export function getRubricDefinitionsDirectory(): string {
  return definitionsDirectory();
}

export async function loadRubricFromFile(
  filePath: string,
): Promise<EvaluationRubric> {
  const raw = await readFile(filePath, "utf8");
  return assertValidRubric(JSON.parse(raw));
}

export async function loadAllRubrics(
  directory = definitionsDirectory(),
): Promise<EvaluationRubric[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    throw new Error(
      `Unable to read rubric definitions at ${directory}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();
  const rubrics: EvaluationRubric[] = [];
  for (const name of jsonFiles) {
    rubrics.push(await loadRubricFromFile(path.join(directory, name)));
  }
  return rubrics;
}

export async function getRubric(
  rubricId: string,
  rubricVersion: string,
): Promise<EvaluationRubric | null> {
  const all = await loadAllRubrics();
  return (
    all.find(
      (r) => r.rubricId === rubricId && r.rubricVersion === rubricVersion,
    ) ?? null
  );
}

export async function listRubricsForSubject(params: {
  subjectType: string;
  phase: string | null;
}): Promise<EvaluationRubric[]> {
  const all = await loadAllRubrics();
  return all.filter((rubric) => {
    if (rubric.deprecated) return false;
    if (!rubric.applicableSubjectTypes.includes(params.subjectType as never)) {
      return false;
    }
    if (rubric.applicablePhases == null) return true;
    if (params.phase == null) return false;
    return rubric.applicablePhases.includes(params.phase as never);
  });
}
