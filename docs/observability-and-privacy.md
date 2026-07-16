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

## Sentry outbound privacy boundary

The Sentry adapter builds allowlisted error events and sends them through an isolated `NodeClient` using `sendEvent()`, bypassing default SDK scope merge and tracing integrations.

### Client envelope guarantees

Automated envelope tests prove the structured outbound payload omits:

- `user`, `request`, `breadcrumbs`, `transaction`, `server_name`, `contexts`
- `ip_address`, `trace_id`, `span_id`, `parent_span_id`, installation ID
- tracing/profiling client options (rates are omitted entirely, not set to `0`)
- envelope-header `trace` metadata

Allowed content is limited to approved product error messages, sanitized exception metadata, allowlisted tags, package/release metadata, ephemeral session ID, and fingerprints based on product error code plus lifecycle phase.

Production enforcement is best-effort: if a final outbound event or envelope cannot be scrubbed into compliance, the adapter **drops** it and continues harness execution. Automated tests **throw** on the same violations.

### Vendor-derived metadata (not client fields)

Sentry may derive metadata during HTTP ingestion that does not appear in the client-built event JSON:

- **Geography** under User in the Sentry UI is commonly derived from the ingestion request IP, not from a `user` field sent by this harness.
- **Trace Details / Trace Preview** in the Sentry UI may appear even when the client envelope contains no trace context. Inspect the raw stored event JSON; do not treat UI chrome alone as proof of client transmission.

Official Sentry server-side scrubbing documents that geographic information can be extracted from IP even when "Prevent storing IP addresses" is enabled. Removing stored geo requires an Advanced Data Scrubbing rule.

### Mandatory Sentry project settings (release gate)

Before enabling a public DSN in `config/observability.public.json`, verify the target Sentry project (`kinterra/p-dev-harness`, US ingestion region) has all of the following settings and that live sandbox raw-event evidence matches them.

**Required privacy settings**

- Data Scrubber: enabled
- Default Scrubbers: enabled
- Prevent Storing IP Addresses: enabled
- Advanced Data Scrubbing: `[Remove] [Anything] from [$user.geo.**]`
- Advanced Data Scrubbing: `[Remove] [Anything] from [contexts.trace]`

**Required disabled capabilities**

Keep these disabled unless repository evidence explicitly requires otherwise:

- tracing / performance monitoring
- profiling
- replay
- logs
- metrics
- AI monitoring
- automatic HTTP instrumentation
- automatic console instrumentation
- source-map uploading
- JavaScript source fetching
- SCM source context

**Other expected settings**

- TLS verification enabled
- Spike Protection enabled
- Auto Resolve disabled
- no user-identifying integrations enabled

**Packaged credential boundary**

- The public DSN is packaged in `config/observability.public.json` and copied into the npm tarball.
- Sentry auth tokens, organization-management tokens, and source-map upload credentials must never be packaged.
- Sentry capture starts only after affirmative error-reporting consent; consent withdrawal must stop subsequent capture.

**Vendor UI vs stored fields**

- Sentry may show trace-related issue UI even when stored `contexts.trace` has been scrubbed.
- Raw stored event JSON and authoritative Discover fields are the release gate; do not treat UI chrome alone as proof of client transmission.

Release remains blocked until:

- automated envelope tests pass in CI
- sandbox raw event JSON shows no `user`, `user.geo`, `ip_address`, or `contexts.trace`
- the project settings above are verified on the target Sentry project
- source maps, JavaScript source fetching, and SCM source context remain disabled

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
- Verify automated Sentry envelope privacy tests pass
- Verify sandbox raw event JSON and mandatory Sentry project privacy settings before authorizing a public DSN

Do not claim legal compliance in this document.
