import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SplitPaneControls } from "./SplitPaneView";

describe("split pane height controls", () => {
  it("allows an imported auto-height pane to switch to a custom pixel height", () => {
    const onChange = vi.fn();
    render(<SplitPaneControls id="pane" leftWidth={50} rightHeight={0}
      editable onChange={onChange} onDelete={vi.fn()} />);

    const input = screen.getByRole("spinbutton", { name: "右侧高度（像素）" });
    expect(input).toBeEnabled();
    expect(input).toHaveValue(null);
    expect(screen.getByRole("separator", { name: "右侧分区高度" })).toBeInTheDocument();

    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "520" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ rightHeight: 520 });
  });
});
