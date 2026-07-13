# Roadmap

This roadmap is intentionally high-level. It describes likely future product directions, not committed delivery dates.

For shipped history, see [CHANGELOG.md](CHANGELOG.md).

## Now

- Harden post-v0.3.0 operator experience from real `p-dev` installs
- Validate a full issue lifecycle from an isolated npm-installed workspace
- Improve cross-platform packaged launch policy beyond macOS browser auto-open
- Continue validating the Linear → GitHub → Cursor workflow on real but private target repos

## Next

- Skill registry/package manager and manifests
- Runner-skill prompt integration (`src/prompts/*.md` remain runner implementation details today)
- `performance-cost-audit` skill
- Automated eval/check runners where manual rubrics are currently used
- Stronger CI/security defaults for target repos

## Later

- Add additional agent providers after proving a second adapter end to end
- Support more preview/deployment providers
- Improve multi-repo and team workflows
- Automatic upgrade/synchronization of already-created private harness workspaces

## Shipped in v0.3.0

- Seven-step guided Configure GUI with confirmation-gated local and remote setup
- Codespaces-compatible source development path
- Six canonical harness skills under `.agents/skills/`
- Public `p-dev-harness@0.3.0` npm package with durable operator workspace
- Public template provisioning via `weston-uribe/p-dev-harness-template`
- Automated Vercel bridge configuration and signed webhook verification
- Guarded Step 7 workflow install PR finalization for system-owned setup PRs

## Not planned for v0.x

- Autonomous shipping without human-controlled status gates
- Generic auto-merge for arbitrary public PRs
- Provider-agnostic claims before multiple providers work end to end
- Production-grade SaaS/control-plane claims
