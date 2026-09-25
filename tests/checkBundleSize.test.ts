import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBundleSize } from "../scripts/checkBundleSize";

const fixtureDirectories: string[] = [];

afterEach(() => {
  fixtureDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe("bundle size checker", () => {
  it("rejects a JavaScript bundle over either budget", () => {
    const assetsDirectory = mkdtempSync(path.join(tmpdir(), "wreader-bundle-check-"));
    fixtureDirectories.push(assetsDirectory);
    writeFileSync(path.join(assetsDirectory, "oversized.js"), "x".repeat(32));

    expect(() => checkBundleSize(assetsDirectory, 16, 16)).toThrow("exceeds its regression budget");
  });
});
