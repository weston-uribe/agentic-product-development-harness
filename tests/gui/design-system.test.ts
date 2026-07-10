import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("gui design-system boundaries", () => {
  it("keeps shadcn primitives under components/ui", async () => {
    const uiDir = path.join(process.cwd(), "apps/gui/components/ui");
    const button = await readFile(path.join(uiDir, "button.tsx"), "utf8");
    const card = await readFile(path.join(uiDir, "card.tsx"), "utf8");

    expect(button).toContain("buttonVariants");
    expect(button).toContain("cursor-pointer");
    expect(card).toContain("CardHeader");
  });

  it("exports static Tailwind token strings", async () => {
    const constantsDir = path.join(process.cwd(), "apps/gui/lib/constants");
    const layout = await readFile(path.join(constantsDir, "layout.ts"), "utf8");
    const spacing = await readFile(path.join(constantsDir, "spacing.ts"), "utf8");
    const responsive = await readFile(
      path.join(constantsDir, "breakpoints.ts"),
      "utf8",
    );
    const form = await readFile(path.join(constantsDir, "form.ts"), "utf8");

    expect(layout).toContain('page: "mx-auto w-full max-w-5xl"');
    expect(spacing).toContain('section: "space-y-6"');
    expect(responsive).toContain("md:text-3xl");
    expect(form).toContain("fieldGrid");
  });

  it("keeps harness form components under components/custom", async () => {
    const customDir = path.join(process.cwd(), "apps/gui/components/custom");
    const envForm = await readFile(
      path.join(customDir, "environment-config-form.tsx"),
      "utf8",
    );
    const confirmation = await readFile(
      path.join(customDir, "local-write-confirmation.tsx"),
      "utf8",
    );
    const stepper = await readFile(
      path.join(customDir, "first-run-stepper.tsx"),
      "utf8",
    );
    const serviceIcons = await readFile(
      path.join(customDir, "service-icons.tsx"),
      "utf8",
    );

    expect(envForm).toContain("EnvironmentConfigForm");
    expect(confirmation).toContain("LocalWriteConfirmation");
    expect(stepper).toContain("FirstRunStepper");
    expect(stepper).toContain("cursor-pointer");
    expect(serviceIcons).toContain("SiLinear");
    expect(serviceIcons).toContain("SiGithub");
    expect(serviceIcons).toContain("SiCursor");
  });

  it("uses minimal next-themes provider and top-nav theme toggle", async () => {
    const layout = await readFile(
      path.join(process.cwd(), "apps/gui/app/layout.tsx"),
      "utf8",
    );
    const themeProvider = await readFile(
      path.join(process.cwd(), "apps/gui/components/custom/theme-provider.tsx"),
      "utf8",
    );
    const themeToggle = await readFile(
      path.join(process.cwd(), "apps/gui/components/custom/theme-toggle.tsx"),
      "utf8",
    );
    const globals = await readFile(
      path.join(process.cwd(), "apps/gui/styles/globals.css"),
      "utf8",
    );

    expect(layout).toContain("ThemeProvider");
    expect(layout).toContain("suppressHydrationWarning");
    expect(themeProvider).toContain('from "next-themes"');
    expect(themeProvider).toContain('attribute="class"');
    expect(themeToggle).toContain('from "next-themes"');
    expect(themeToggle).toContain("Button");
    expect(globals).toContain(".dark");
  });
});
