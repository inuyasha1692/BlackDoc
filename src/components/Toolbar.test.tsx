import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";

afterEach(cleanup);

function createProps() {
  return {
    theme: "light" as const,
    onToggleTheme: vi.fn(),
    onFind: vi.fn(),
    findOpen: false,
    documentName: "Example.bdoc",
    status: "saved" as const,
    busy: false,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onImportMarkdown: vi.fn(),
    onOpenExample: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onExport: vi.fn(),
    onAbout: vi.fn(),
    onShortcuts: vi.fn(),
  };
}

function openMoreMenu() {
  fireEvent.click(screen.getByRole("button", { name: /更多操作/ }));
}

describe("Toolbar primary actions and more menu", () => {
  it("keeps frequent actions visible and groups secondary actions", () => {
    const props = createProps();
    render(<Toolbar {...props} />);

    expect(screen.getByRole("button", { name: "打开" })).toBeVisible();
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
    expect(screen.getByRole("button", { name: "导出 HTML" })).toBeVisible();
    expect(screen.getByRole("button", { name: "查找替换" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "新建文档" })).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "更多操作" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    openMoreMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "新建文档" }));

    expect(props.onNew).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "导入 Markdown" })).not.toBeInTheDocument();
  });

  it("closes on outside interaction and Escape", () => {
    render(<Toolbar {...createProps()} />);
    const trigger = screen.getByRole("button", { name: "更多操作" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("disables document-changing menu actions while busy", () => {
    render(<Toolbar {...createProps()} busy />);
    openMoreMenu();

    expect(screen.getByRole("button", { name: "新建文档" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入 Markdown" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "功能示例" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "另存为" })).toBeDisabled();
  });

  it("opens the bundled example from the more menu", () => {
    const props = createProps();
    render(<Toolbar {...props} />);
    openMoreMenu();
    const helpSection = screen.getByRole("group", { name: "帮助与设置" });
    expect(within(screen.getByRole("group", { name: "文档" })).queryByRole("button", { name: "功能示例" })).toBeNull();
    fireEvent.click(within(helpSection).getByRole("button", { name: "功能示例" }));
    expect(props.onOpenExample).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "更多操作" })).toHaveAttribute("aria-expanded", "false");
  });
});
describe("Toolbar find entry", () => {
  it("opens the find bar and reflects its state", () => {
    const props = createProps();
    const { rerender } = render(<Toolbar {...props} />);
    const button = screen.getByRole("button", { name: "查找替换" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(props.onFind).toHaveBeenCalledOnce();
    rerender(<Toolbar {...props} findOpen />);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Toolbar theme toggle", () => {
  it("shows the available theme action in the more menu", () => {
    const props = createProps();
    const { rerender } = render(<Toolbar {...props} />);

    openMoreMenu();
    let button = screen.getByRole("button", { name: "切换到深色模式" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(props.onToggleTheme).toHaveBeenCalledOnce();

    rerender(<Toolbar {...props} theme="dark" busy />);
    openMoreMenu();
    button = screen.getByRole("button", { name: "切换到浅色模式" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(2);
  });
});

describe("Toolbar about entry", () => {
  it("opens version information from the more menu and signals an available update", () => {
    const props = createProps();
    const { rerender } = render(<Toolbar {...props} busy />);

    openMoreMenu();
    const button = screen.getByRole("button", { name: "关于与更新" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(props.onAbout).toHaveBeenCalledOnce();

    rerender(<Toolbar {...props} updateAvailable />);
    expect(screen.getByRole("button", { name: "更多操作，有新版本" })).toBeInTheDocument();
    openMoreMenu();
    expect(screen.getByRole("button", { name: "关于与更新，有新版本" })).toBeInTheDocument();
    expect(screen.getByText("新版本")).toBeVisible();
  });
});

describe("Toolbar shortcuts entry", () => {
  it("opens the shortcut list from the more menu", () => {
    const props = createProps();
    render(<Toolbar {...props} />);
    openMoreMenu();
    fireEvent.click(screen.getByRole("button", { name: "快捷键一览" }));
    expect(props.onShortcuts).toHaveBeenCalledOnce();
  });
});
