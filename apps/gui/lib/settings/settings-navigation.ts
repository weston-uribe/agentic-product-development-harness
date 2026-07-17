export const SETTINGS_NAV_ITEMS = [
  { href: "/settings", label: "Overview", exact: true },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/linear", label: "Linear" },
  { href: "/settings/repositories", label: "Target repositories" },
  { href: "/settings/deployments", label: "Deployments" },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/automation", label: "Automation" },
  { href: "/settings/data-sharing", label: "Data and privacy" },
  { href: "/settings/diagnostics", label: "Diagnostics" },
  { href: "/settings/advanced", label: "Advanced" },
] as const;
