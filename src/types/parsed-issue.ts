export interface ParsedIssue {
  targetRepoRaw?: string;
  task: string;
  acceptanceCriteria: string[];
  outOfScope: string[];
  validationExpectations?: string;
  parseErrors: string[];
}
