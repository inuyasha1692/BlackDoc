import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutsDialog } from "./ShortcutsDialog";

afterEach(cleanup);

describe("ShortcutsDialog", () => {
  it("lists supported application and split-pane shortcuts", () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "快捷键一览" })).toBeInTheDocument();
    expect(screen.getByText("Ctrl / Cmd + Shift + S")).toBeInTheDocument();
    expect(screen.getByText("Ctrl / Cmd + F 或 H")).toBeInTheDocument();
    expect(screen.getByText("Ctrl / Cmd + E")).toBeInTheDocument();
    expect(screen.getByText("聚焦尺寸控制柄时")).toBeInTheDocument();
  });

  it("closes from the dialog action", () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
