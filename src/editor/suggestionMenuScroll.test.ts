import { describe, expect, it, vi } from "vitest";
import { scrollMenuItemIntoView } from "./suggestionMenuScroll";

describe("scrollMenuItemIntoView", () => {
  it("scrolls the menu container when the selected item is below its viewport", () => {
    const menu = document.createElement("div");
    const item = document.createElement("button");
    menu.scrollTop = 10;
    menu.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
    item.getBoundingClientRect = () => ({ top: 190, bottom: 220 }) as DOMRect;

    scrollMenuItemIntoView(menu, item);

    expect(menu.scrollTop).toBe(30);
  });

  it("does not move the menu or page when the selected item is visible", () => {
    const menu = document.createElement("div");
    const item = document.createElement("button");
    menu.scrollTop = 10;
    menu.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
    item.getBoundingClientRect = () => ({ top: 120, bottom: 150 }) as DOMRect;
    const scrollIntoView = vi.fn();
    item.scrollIntoView = scrollIntoView;

    scrollMenuItemIntoView(menu, item);

    expect(menu.scrollTop).toBe(10);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls upward within the menu for an item above its viewport", () => {
    const menu = document.createElement("div");
    const item = document.createElement("button");
    menu.scrollTop = 30;
    menu.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
    item.getBoundingClientRect = () => ({ top: 80, bottom: 120 }) as DOMRect;

    scrollMenuItemIntoView(menu, item);

    expect(menu.scrollTop).toBe(10);
  });
});
