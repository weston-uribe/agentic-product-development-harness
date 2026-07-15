export function DraftModeBanner() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-foreground"
    >
      Draft mode — workflow changes are not applied to the running harness.
    </div>
  );
}
