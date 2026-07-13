# p-dev

Launch the **Product Development Harness** guided Configure GUI without cloning the source repository.

## Quick start

**Node.js 22+** required. **macOS** is the validated packaged platform.

```bash
npx --yes p-dev@0.3.0
```

Without browser auto-open:

```bash
npx --yes p-dev@0.3.0 --no-open
```

Custom workspace:

```bash
npx --yes p-dev@0.3.0 --workspace ~/.p-dev
```

## What it does

- Starts the seven-step Configure GUI at `/settings/configure`
- Stores durable operator state under `~/.p-dev`, `P_DEV_HOME`, or `--workspace`
- Can provision or reconnect a private `OWNER/p-dev-harness` workspace from the public template `weston-uribe/p-dev-harness-template`
- Guides Linear, Cursor, GitHub, and Vercel setup through confirmation-gated remote writes

## Requirements

- Classic GitHub PAT with **`repo`** + **`workflow`** scopes for packaged workspace provisioning
- Linear, Cursor, and Vercel credentials for full setup
- Public template repo must exist and be marked as a GitHub template

## Limitations

- Cursor-only agent provider; Linear/GitHub/GitHub Actions/Vercel stack
- macOS validated for browser auto-launch; use `--no-open` elsewhere
- Setup completion is validated; a full real issue lifecycle from an isolated npm install is **not** yet validated
- Early-stage operator tool — not production SaaS

## Full guide

See the repository guide: [docs/p-dev.md](https://github.com/weston-uribe/agentic-product-development-harness/blob/main/docs/p-dev.md)

## License

MIT
