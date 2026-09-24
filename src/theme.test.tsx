import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme, THEME_STORAGE_KEY } from "./theme";
import { useAppTheme } from "./useAppTheme";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("color-scheme");
});

describe("application theme preference", () => {
  it.each([null, "system", "invalid", "LIGHT"])("defaults to light for %s", value => {
    if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);
    expect(readTheme()).toBe("light");
  });

  it("restores dark mode and sets the document and native control scheme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(useAppTheme);
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });


  it("toggles between exactly two modes and remembers the choice on remount", () => {
    const first = renderHook(useAppTheme);
    expect(first.result.current.theme).toBe("light");
    act(() => first.result.current.toggleTheme());
    expect(first.result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    first.unmount();
    const next = renderHook(useAppTheme);
    expect(next.result.current.theme).toBe("dark");
    act(() => next.result.current.toggleTheme());
    expect(next.result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("syncs another window's preference without responding to unrelated storage changes", () => {
    const { result } = renderHook(useAppTheme);
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "another-key", newValue: "dark",
    })));
    expect(result.current.theme).toBe("light");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: THEME_STORAGE_KEY, newValue: "dark", storageArea: localStorage,
    })));
    expect(result.current.theme).toBe("dark");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: THEME_STORAGE_KEY, newValue: "light", storageArea: sessionStorage,
    })));
    expect(result.current.theme).toBe("dark");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current.theme).toBe("light");
  });

  it("still switches themes when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    const { result } = renderHook(useAppTheme);
    expect(result.current.theme).toBe("light");
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("can apply the stored preference before React mounts", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    applyTheme(readTheme());
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
