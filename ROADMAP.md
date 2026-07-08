# Roadmap

This roadmap is intentionally high-level. It describes likely future product directions, not committed delivery dates.

For shipped history, see [CHANGELOG.md](CHANGELOG.md).

## Now

- Harden the v0.2.0 public source release
- Keep documentation honest and target-repo examples generic
- Continue validating the Linear → GitHub → Cursor workflow on real but private target repos

## Next

- Make target-repo onboarding easier with a clearer sample config and setup checklist
- Improve validation/reporting so review readiness is easier to assess
- Add stronger CI/security defaults for target repos
- Reduce setup friction for solo operators

## Later

- Add additional agent providers after proving a second adapter end to end
- Explore npm package distribution if the API stabilizes
- Add automated eval/check runners where manual rubrics are currently used
- Support more preview/deployment providers
- Improve multi-repo and team workflows

## Not planned for v0.x

- Autonomous shipping without human-controlled status gates
- Generic auto-merge for arbitrary public PRs
- Provider-agnostic claims before multiple providers work end to end
- Production-grade SaaS/control-plane claims
