import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormattingColorButton } from "./FormattingColorButton";

const { editor, showSelection } = vi.hoisted(() => ({
  editor: {
    isEditable: true,
    getSelection: vi.fn(),
    getTextCursorPosition: vi.fn(),
    getActiveStyles: vi.fn(),
    addStyles: vi.fn(),
    removeStyles: vi.fn(),
    focus: vi.fn(),
  },
  showSelection: vi.fn(),
}));

vi.mock("@blocknote/react", async () => {
  const { createContext, useContext } = await import("react");
  const PopoverContext = createContext<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>({
    open: false,
    onOpenChange: () => {},
  });
  return {
    useBlockNoteEditor: () => editor,
    useExtension: () => ({ showSelection }),
    useEditorState: ({ selector }: {
      selector: (context: { editor: typeof editor }) => unknown;
    }) => selector({ editor }),
    useDictionary: () => ({
      formatting_toolbar: { colors: { tooltip: "Colors" } },
      color_picker: { colors: {
        default: "default", gray: "gray", brown: "brown", red: "red",
        orange: "orange", yellow: "yellow", green: "green", blue: "blue",
        purple: "purple", pink: "pink",
      } },
    }),
    useComponentsContext: () => ({
      Generic: { Popover: {
        Root: ({ children, ...value }: {
          children: ReactNode;
          open: boolean;
          onOpenChange: (open: boolean) => void;
        }) => <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>,
        Trigger: ({ children }: { children: ReactNode }) => {
          const { open, onOpenChange } = useContext(PopoverContext);
          return <div onClick={() => onOpenChange(!open)}>{children}</div>;
        },
        Content: ({ children }: { children: ReactNode }) => {
          const { open } = useContext(PopoverContext);
          return open ? <div>{children}</div> : null;
        },
      } },
      FormattingToolbar: {
        Button: ({ label, icon }: { label: string; icon: ReactNode }) =>
          <button type="button" aria-label={label}>{icon}</button>,
      },
    }),
  };
});

const colors = ["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"];
const palettes = [
  ["textColor", "字体颜色"],
  ["backgroundColor", "背景颜色"],
] as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  editor.isEditable = true;
  editor.getSelection.mockReturnValue(undefined);
  editor.getTextCursorPosition.mockReturnValue({ block: { content: [] } });
  editor.getActiveStyles.mockReturnValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function openPalette() {
  const result = render(<FormattingColorButton />);
  fireEvent.click(screen.getByRole("button", { name: "Colors" }));
  return result;
}

function expectClosedAndFocused() {
  expect(screen.queryByRole("group", { name: "字体颜色" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "背景颜色" })).not.toBeInTheDocument();
  vi.runAllTimers();
  expect(editor.focus).toHaveBeenCalledOnce();
}

describe("FormattingColorButton", () => {
  it("renders ten named buttons in each palette with default colors selected", () => {
    openPalette();

    for (const [, label] of palettes) {
      const group = within(screen.getByRole("group", { name: label }));
      expect(group.getAllByRole("button")).toHaveLength(10);
      for (const color of colors) {
        expect(group.getByRole("button", { name: `${label}：${color}` }))
          .toHaveAttribute("aria-pressed", String(color === "default"));
      }
    }
  });

  it("reflects active font and background colors and updates the selected buttons", () => {
    editor.getActiveStyles.mockReturnValue({ textColor: "red", backgroundColor: "blue" });
    const { rerender } = openPalette();

    expect(screen.getByRole("button", { name: "字体颜色：red" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "背景颜色：blue" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);

    editor.getActiveStyles.mockReturnValue({ textColor: "green", backgroundColor: "pink" });
    rerender(<FormattingColorButton />);

    expect(screen.getByRole("button", { name: "字体颜色：red" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "背景颜色：blue" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "字体颜色：green" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "背景颜色：pink" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
  });

  describe.each(palettes)("%s palette", (property, label) => {
    it.each(colors.filter(color => color !== "default"))("applies %s with addStyles", color => {
      openPalette();
      fireEvent.click(screen.getByRole("button", { name: `${label}：${color}` }));

      expect(editor.addStyles).toHaveBeenCalledExactlyOnceWith({ [property]: color });
      expect(editor.removeStyles).not.toHaveBeenCalled();
      expectClosedAndFocused();
    });

    it("removes only its own color when default is chosen", () => {
      editor.getActiveStyles.mockReturnValue({ textColor: "red", backgroundColor: "blue" });
      openPalette();
      fireEvent.click(screen.getByRole("button", { name: `${label}：default` }));

      expect(editor.removeStyles).toHaveBeenCalledExactlyOnceWith({ [property]: "default" });
      expect(editor.addStyles).not.toHaveBeenCalled();
      expectClosedAndFocused();
    });
  });

  it("clears both colors when restoring defaults", () => {
    editor.getActiveStyles.mockReturnValue({ textColor: "red", backgroundColor: "blue" });
    openPalette();
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));

    expect(editor.removeStyles).toHaveBeenCalledExactlyOnceWith({
      textColor: "default", backgroundColor: "default",
    });
    expect(editor.addStyles).not.toHaveBeenCalled();
    expectClosedAndFocused();
  });

  it("hides the control in a read-only editor", () => {
    editor.isEditable = false;
    const { container } = render(<FormattingColorButton />);

    expect(container).toBeEmptyDOMElement();
    expect(editor.getActiveStyles).not.toHaveBeenCalled();
  });

  it("keeps the selection visible while open and clears it on unmount", () => {
    const { unmount } = openPalette();
    expect(showSelection).toHaveBeenLastCalledWith(true, "formattingColors");

    unmount();
    expect(showSelection).toHaveBeenLastCalledWith(false, "formattingColors");
  });
});
