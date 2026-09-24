import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBlockLink,
  isBlockLink,
  parseBlockLink,
  revealBlock,
} from "./blockLinks";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("revealBlock scrolling", () => {
  it("scrolls the inner pane without moving an already visible outer pane", () => {
    document.body.innerHTML =
      '<div class="split-pane"><div class="split-pane-right-scroll"><div id="block=heading"></div></div></div>';
    const section = document.querySelector<HTMLElement>(".split-pane")!;
    const pane = document.querySelector<HTMLElement>(".split-pane-right-scroll")!;
    const heading = document.getElementById("block=heading")!;
    section.getBoundingClientRect = () => ({ top: 160 }) as DOMRect;
    pane.getBoundingClientRect = () => ({ top: 180 }) as DOMRect;
    heading.getBoundingClientRect = () => ({ top: 580 }) as DOMRect;
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    const innerScroll = vi.fn();
    pane.scrollTo = innerScroll;
    const outerScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    heading.animate = vi.fn().mockReturnValue({
      addEventListener: vi.fn(), cancel: vi.fn(),
    } as unknown as Animation);

    expect(revealBlock("heading")).toBe(true);
    expect(innerScroll).toHaveBeenCalledWith({ top: 388, behavior: "instant" });
    expect(outerScroll).not.toHaveBeenCalled();
  });
});
