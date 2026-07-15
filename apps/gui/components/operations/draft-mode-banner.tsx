export function DraftModeBanner() {
  return (
    <p
      role="status"
      className="shrink-0 border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground"
    >
      Draft — Changes are not active.
    </p>
  );
}
