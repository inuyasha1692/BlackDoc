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
  const setupCenteredTarget = (top: number, height = 40, documentHeight = 3000) => {
    document.body.innerHTML = '<div id="block=heading"></div>';
    const target = document.getElementById("block=heading")!;
    target.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(documentHeight);
    const outerScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    target.animate = vi.fn().mockReturnValue({ addEventListener: vi.fn(), cancel: vi.fn() });
    return { target, outerScroll };
  };

  it.each([
    { top: 1200, height: 40, documentHeight: 3000, expected: 970 },
    { top: 0, height: 40, documentHeight: 3000, expected: 0 },
    { top: 1200, height: 40, documentHeight: 1500, expected: 600 },
    { top: 1200, height: 1000, documentHeight: 3000, expected: 1450 },
  ])("centers a block and clamps at document boundaries ($expected)", ({ top, height, documentHeight, expected }) => {
    const { outerScroll } = setupCenteredTarget(top, height, documentHeight);
    expect(revealBlock("heading", "center")).toBe(true);
    expect(outerScroll).toHaveBeenLastCalledWith({ top: expected, behavior: "instant" });
  });

  it.each([
    { paneTop: 250, targetTop: 1200, scrollHeight: 2000, inner: 770, outer: 200 },
    { paneTop: 1000, targetTop: 1950, scrollHeight: 2000, inner: 770, outer: 950 },
    { paneTop: 250, targetTop: 700, scrollHeight: 600, inner: 200, outer: 270 },
  ])("centers a nested target using its final inner scroll position ($outer)", ({ paneTop, targetTop, scrollHeight, inner, outer }) => {
    const { target, outerScroll } = setupCenteredTarget(targetTop);
    const pane = document.createElement("div");
    pane.className = "split-pane-right-scroll";
    target.before(pane);
    pane.append(target);
    pane.getBoundingClientRect = () => ({ top: paneTop }) as DOMRect;
    vi.spyOn(pane, "clientHeight", "get").mockReturnValue(400);
    vi.spyOn(pane, "scrollHeight", "get").mockReturnValue(scrollHeight);
    pane.scrollTo = vi.fn();
    expect(revealBlock("heading", "center")).toBe(true);
    expect(pane.scrollTo).toHaveBeenLastCalledWith({ top: inner, behavior: "instant" });
    if (outer === 200) expect(outerScroll).not.toHaveBeenCalled();
    else expect(outerScroll).toHaveBeenLastCalledWith({ top: outer, behavior: "instant" });
  });

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
