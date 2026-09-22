import { describe, expect, it } from "vitest";
import {
  createBlockLink,
  isBlockLink,
  parseBlockLink,
} from "./blockLinks";

describe("block links", () => {
  it("creates and parses a same-document block link", () => {
    const link = createBlockLink("block 42/alpha");

    expect(link).toBe("#block=block%2042%2Falpha");
    expect(parseBlockLink(link)).toBe("block 42/alpha");
  });

  it("parses an absolute URL containing a block fragment", () => {
    expect(parseBlockLink("https://example.com/document#block=abc-123")).toBe(
      "abc-123",
    );
  });

  it("rejects ordinary and malformed links", () => {
    expect(isBlockLink("https://example.com")).toBe(false);
    expect(parseBlockLink("#section-one")).toBeNull();
    expect(parseBlockLink("#block=%E0%A4%A")).toBeNull();
  });
});

