# Observability and privacy

This document is the canonical contract for optional, consent-gated observability in the published `p-dev-harness` npm package.

## Purpose

Packaged observability helps the maintainer understand onboarding reliability and Configure funnel outcomes without collecting source code, credentials, prompts, or account identity.

Telemetry is **evidence, not authoritative**. Never trigger releases, security actions, or Linear issues solely from Sentry or PostHog data.

## Consent model

Two independent categories:

1. **Anonymous product analytics** (PostHog)
2. **Automated sanitized error reports** (Sentry)

Defaults:

- No network transmission until the user chooses for each category.
- Consent changes are local preferences only and do **not** emit analytics events.
- Environment kill switches override persisted preferences without mutating them:
  - `DO_NOT_TRACK=1`
  - `P_DEV_OBSERVABILITY_DISABLED=1`
  - `P_DEV_ANALYTICS_DISABLED=1`
  - `P_DEV_SENTRY_DISABLED=1`

Local state path: `.harness/observability.local.json` under the resolved `P_DEV_HOME`.

## Identity

| Field | PostHog | Sentry |
|-------|---------|--------|
| Session ID (ephemeral) | yes | yes |
| Installation ID (stable per `P_DEV_HOME`) | yes (`distinct_id`) | **no** |
| Package version / release SHA | yes | yes (release/tags) |

The installation ID is generated only when analytics is first enabled.

## Runtime boundary

Observability runs only in packaged `p-dev` runtime (`P_DEV_RUNTIME_MODE=packaged`). It is disabled in source development, tests, CI, package preparation, snapshot generation, and other non-packaged contexts unless tests inject fake transports.

## Public vendor configuration

Tracked source file: `config/observability.public.json`

Package copy: `observability.public.json`

Contains only:

- Sentry public DSN
- PostHog project token
- PostHog ingestion host
- Observability schema version

Maintainer-only overrides (not required for end users):

- `P_DEV_SENTRY_DSN`
- `P_DEV_POSTHOG_PROJECT_TOKEN`
- `P_DEV_POSTHOG_HOST`
- `P_DEV_SENTRY_ENVIRONMENT`

Never ship Sentry auth tokens, PostHog personal API keys (`phx_`), or organization-management credentials.

## PostHog event contract (schema version 1)

Allowed events:

- `p_dev_session_started`
- `p_dev_configure_step_viewed`
- `p_dev_configure_step_completed`
- `p_dev_workspace_provision_started`
- `p_dev_workspace_provision_completed`
- `p_dev_workspace_provision_failed`
- `p_dev_setup_completed`

Consent preference events are intentionally excluded.

All analytics events set `$process_person_profile: false`.

## Sentry context contract (schema version 1)

Allowed tags/context include package/release metadata, ephemeral session ID, lifecycle phase, structured product error codes, bounded buckets, and sanitized exception data.

Sentry fingerprints use structured product error code and lifecycle phase only (not package version).

## Dashboard: p-dev Packaged Onboarding Health

Manual PostHog dashboard specification:

- Packaged sessions launched (`p_dev_session_started`) by `package_version` and `os_family`
- Configure funnel through step completions to `p_dev_setup_completed`
- Provisioning started/completed/failed trends
- Failure category breakdown for `p_dev_workspace_provision_failed`
- Duration and retry/rate-limit buckets
- Release comparison filters on `package_version` and `release_sha`

Do not build consent-rate metrics; affirmative consent makes non-consenting installs intentionally invisible.

## Sentry alerts (minimal)

- New unhandled error in latest package
- Regression of resolved issue
- High-frequency provisioning error
- Launch / Configure API crash
- Error rate increase by release version

## Reset

Delete `.harness/observability.local.json` or use Configure **Reset local telemetry identity**.

## Release validation

Before an observability-enabled npm release:

- Verify no pre-consent telemetry in packaged smoke tests
- Verify tarball includes public config and excludes local observability state
- Verify sandbox Sentry/PostHog payloads match allowlists
- Compare funnel/error metrics by `package_version` after fixes

Do not claim legal compliance in this document.
