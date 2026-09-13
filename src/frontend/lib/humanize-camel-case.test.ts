import { describe, expect, it } from "vitest";

import { humanizeCamelCase } from "@/lib/humanize-camel-case";

describe("humanizeCamelCase", () => {
  it("turns colorTheme into Color Theme", () => {
    expect(humanizeCamelCase("colorTheme")).toBe("Color Theme");
  });

  it("capitalizes a single lowercase word", () => {
    expect(humanizeCamelCase("label")).toBe("Label");
  });

  it("splits sourceId and fontSize", () => {
    expect(humanizeCamelCase("sourceId")).toBe("Source Id");
    expect(humanizeCamelCase("fontSize")).toBe("Font Size");
  });
});
