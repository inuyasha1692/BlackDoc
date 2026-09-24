import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentOutline } from "./DocumentOutline";

vi.mock("../editor/outline", () => ({
  getOutlineItems: () => ["outside", "first", "second", "other", "after"].map(id => ({
    id, text: id, level: 1,
  })),
}));

let pending: FrameRequestCallback | undefined;
let pane: HTMLElement;

function position(id: string, top: number, bottom = top + 30) {
  document.getElementById(id)!.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
}

function flush() {
  act(() => {
    const callback = pending;
    pending = undefined;
    callback?.(0);
  });
}

function scroll(target: HTMLElement | Window) {
  fireEvent.scroll(target);
  flush();
}

function expectActive(id: string) {
  expect(screen.getByRole("button", { name: id })).toHaveAttribute("aria-current", "location");
  expect(document.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(() => { pending = undefined; }));
  document.body.innerHTML = '<div id="block=outside"></div><div id="pane" class="split-pane-right-scroll"><div id="block=first"></div><div id="block=second"></div></div><div id="other-pane" class="split-pane-right-scroll"><div id="block=other"></div></div><div id="block=after"></div>';
  pane = document.getElementById("pane")!;
  position("pane", 100, 400);
  position("other-pane", 100, 400);
  position("block=outside", 80);
  position("block=first", 115);
  position("block=second", 500);
  position("block=other", 300);
  position("block=after", 600);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2000);
  render(<DocumentOutline blocks={[]} collapsed={false} onToggle={vi.fn()} />);
  flush();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pending = undefined;
});

describe("outline scroll ownership", () => {
  it("keeps the nearest preceding inner heading through gaps and reverse scrolling", () => {
    scroll(pane);
    expectActive("first");
    position("block=first", 0);
    scroll(pane);
    expectActive("first");
    position("block=second", 120);
    scroll(pane);
    expectActive("second");
    position("block=second", 0);
    scroll(pane);
    expectActive("second");
    position("block=second", 200);
    scroll(pane);
    expectActive("first");
  });

  it("only considers headings in the scrolled pane", () => {
    position("block=other", 110);
    position("block=after", 100);
    scroll(pane);
    expectActive("first");
  });

  it("uses the first inner heading before any heading reaches the activation line", () => {
    position("block=first", 200);
    scroll(pane);
    expectActive("first");
  });

  it("responds to main scrolling again, including the document end", () => {
    scroll(pane);
    expectActive("first");
    position("block=first", 0);
    scroll(window);
    expectActive("outside");
    position("block=after", 120);
    scroll(window);
    expectActive("after");
    position("block=after", 600);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(1200);
    scroll(pane);
    expectActive("first");
    scroll(window);
    expectActive("after");
  });
});
