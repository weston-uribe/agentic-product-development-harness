import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("gui design-system boundaries", () => {
  it("keeps shadcn primitives under components/ui", async () => {
    const uiDir = path.join(process.cwd(), "apps/gui/components/ui");
    const button = await readFile(path.join(uiDir, "button.tsx"), "utf8");
    const card = await readFile(path.join(uiDir, "card.tsx"), "utf8");

    expect(button).toContain("buttonVariants");
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

    expect(envForm).toContain("EnvironmentConfigForm");
    expect(confirmation).toContain("LocalWriteConfirmation");
    expect(stepper).toContain("FirstRunStepper");
  });
});
