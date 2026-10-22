import { describe, expect, it } from "vitest";
import { displayAuthor } from "../src/services/authorDisplay";

describe("RSS author display", () => {
  it("removes contact addresses from legacy and new author labels", () => {
    expect(displayAuthor("liuhj60@gmail.com (硅谷101)", "硅谷101")).toBe("");
    expect(displayAuthor("主持人 <host@example.com>", "节目")).toBe("主持人");
    expect(displayAuthor("host@example.com", "节目")).toBe("");
  });
});
