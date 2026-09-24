import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasPreview } from "./CanvasPreview";
import { AppThemeContext } from "../theme";
import { canvasSvg } from "./export";

vi.mock("./export", () => ({ canvasSvg: vi.fn().mockResolvedValue("data:image/svg+xml,") }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("canvas preview sizing", () => {
  it("keeps the existing preview SVG when the app theme changes", async () => {
    vi.useFakeTimers();
    vi.mocked(canvasSvg).mockClear();
    const props = { source: "", id: "theme", editable: true, previewWidth: 320, onResize: vi.fn() };
    const { rerender } = render(
      <AppThemeContext.Provider value="light"><CanvasPreview {...props} /></AppThemeContext.Provider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const uri = screen.getByRole("img", { name: "画布" }).getAttribute("src");
    expect(canvasSvg).toHaveBeenCalledTimes(1);
    rerender(<AppThemeContext.Provider value="dark"><CanvasPreview {...props} /></AppThemeContext.Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole("img", { name: "画布" })).toHaveAttribute("src", uri);
    expect(canvasSvg).toHaveBeenCalledTimes(1);
    expect(props.onResize).not.toHaveBeenCalled();
  });
  it("offers three alignment choices and follows saved alignment", () => {
    const onAlign = vi.fn();
    const props = { source: "", id: "test", editable: true, previewWidth: 320, onResize: vi.fn(), onAlign };
    const { container, rerender } = render(<CanvasPreview {...props} alignment="left" />);
    fireEvent.click(screen.getByRole("button", { name: "画板居中" }));
    expect(onAlign).toHaveBeenCalledWith("center");
    rerender(<CanvasPreview {...props} alignment="center" />);
    expect(screen.getByRole("button", { name: "画板居中" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".canvas-preview-frame")).toHaveStyle({ marginLeft: "auto", marginRight: "auto" });
    fireEvent.click(screen.getByRole("button", { name: "画板靠右" }));
    expect(onAlign).toHaveBeenLastCalledWith("right");
    rerender(<CanvasPreview {...props} alignment="right" />);
    expect(container.querySelector(".canvas-preview-frame")).toHaveStyle({ marginLeft: "auto", marginRight: "0px" });
  });
  it("uses the saved width and follows external updates such as undo", () => {
    const props = { source: "", id: "test", editable: true, onResize: vi.fn() };
    const { container, rerender } = render(<CanvasPreview {...props} previewWidth={320} />);
    expect(container.querySelector(".canvas-preview-frame")).toHaveStyle({ width: "320px" });
    rerender(<CanvasPreview {...props} previewWidth={480} />);
    expect(container.querySelector(".canvas-preview-frame")).toHaveStyle({ width: "480px" });
    rerender(<CanvasPreview {...props} previewWidth={0} />);
    expect(container.querySelector(".canvas-preview-frame")).toHaveStyle({ width: "100%" });
  });

  it("resizes with the keyboard without opening the editor and clamps the minimum", () => {
    const onResize = vi.fn();
    const open = vi.fn();
    window.addEventListener("blackdoc-open-canvas", open);
    const { container } = render(<CanvasPreview source="" id="test" editable previewWidth={320} onResize={onResize} />);
    const frame = container.querySelector(".canvas-preview-frame")!;
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ width: 320 } as DOMRect);
    fireEvent.keyDown(screen.getByRole("button", { name: "调整画布右侧宽度" }), { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(310);
    fireEvent.keyDown(screen.getByRole("button", { name: "调整画布左侧宽度" }), { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(330);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ width: 160 } as DOMRect);
    fireEvent.keyDown(screen.getByRole("button", { name: "调整画布右侧宽度" }), { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(160);
    expect(open).not.toHaveBeenCalled();
    window.removeEventListener("blackdoc-open-canvas", open);
  });

  it("hides resize controls in read-only mode", () => {
    render(<CanvasPreview source="" id="test" editable={false} previewWidth={NaN} onResize={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "调整画布右侧宽度" })).toBeNull();
  });
});
