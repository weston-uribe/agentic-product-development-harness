# Settings console

The post-setup Settings console lives under `apps/gui/app/settings/(console)/`. The route group keeps the setup wizard (`/settings/configure`) outside the permanent sidebar layout.

## Current scope (v0.4)

Commit A delivers a read-mostly console:

- **Overview** at `/settings` — cached summaries from local control-plane state and setup loaders
- **Models** — same save queue and rollback behavior as `/workflow`
- **Diagnostics** — cached doctor checks on load; expensive checks only after **Run checks**
- **Data and privacy** — existing preferences UI inside the console shell

Mutation editors for credentials, Linear, Vercel, target repositories, and automation are implemented under `apps/gui/components/settings/editors/`. They call the same setup APIs as the wizard but use the settings mutation flow documented in `apps/gui/lib/settings/settings-mutation.ts`.

Local config-only edits (repositories, automation) use `src/setup/settings-config-patch.ts` with fingerprint CAS via `/api/settings/preview-config-patch` and `/api/settings/apply-config-patch`.

## Future multi-connection model

Today the harness supports a **single active Linear connection** and **single active Vercel connection**. Future versions may introduce explicit connection collections without changing current URLs:

```ts
linearConnections: LinearConnection[];
vercelConnections: VercelConnection[];
targetRepos: {
  linearConnectionId?: string;
  vercelConnectionId?: string;
  // ...
}[];
```

Commit A/B types remain limited to the single-connection model actually implemented. There is no "Add another workspace/account" UI in v0.4.

## Routing rules

| Concern | Rule |
|---------|------|
| Ordinary routing | Read only durable `initialSetup.status` |
| Incomplete setup | `/settings` redirects to `/settings/configure` |
| Complete setup | `/settings/configure` redirects to `/settings` |
| Packaged default `/` | Incomplete → `/settings/configure`; complete → `/workflow` |

Health drift after completion does not reopen the wizard or change route selection.
