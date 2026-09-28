import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buttonStyles = readFileSync(
  new URL("../src/styles/button-system.css", import.meta.url),
  "utf8",
);

const mainEntry = readFileSync(
  new URL("../src/main.tsx", import.meta.url),
  "utf8",
);

describe("button style system", () => {
  it("loads after the prototype styles so shared states can normalize existing controls", () => {
    const playerStyles = mainEntry.indexOf("./styles/prototype-player.css");
    const buttonSystem = mainEntry.indexOf("./styles/button-system.css");

    expect(playerStyles).toBeGreaterThan(-1);
    expect(buttonSystem).toBeGreaterThan(playerStyles);
  });

  it("defines one shared interaction contract for native buttons", () => {
    expect(buttonStyles).toContain("button:focus-visible");
    expect(buttonStyles).toContain("button:disabled");
    expect(buttonStyles).toContain("--wreader-btn-focus");
    expect(buttonStyles).toContain("--wreader-btn-disabled-opacity");
  });

  it("exposes the common semantic action variants", () => {
    for (const className of [
      ".wreader-btn-primary",
      ".wreader-btn-secondary",
      ".wreader-btn-ghost",
      ".wreader-btn-danger",
      ".wreader-btn-link",
      ".wreader-btn-icon",
    ]) {
      expect(buttonStyles).toContain(className);
    }
  });

  it("maps legacy settings actions onto the shared button tokens", () => {
    expect(buttonStyles).toContain(".wreader-settings-actions button");
    expect(buttonStyles).toContain(".wreader-feed-edit-card footer button");
    expect(buttonStyles).toContain(".wreader-model-modal-card footer button");
    expect(buttonStyles).toContain("var(--wreader-btn-primary)");
    expect(buttonStyles).toContain("var(--wreader-btn-secondary)");
  });
});
