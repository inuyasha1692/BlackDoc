import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import { AppThemeContext } from "../theme";
import CanvasEditor from "./CanvasEditor";
import { emptyScene, parseScene } from "./scene";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: ExcalidrawProps) => { capture(props); return null; },
  MainMenu: Object.assign(() => null, {
    DefaultItems: { LoadScene: () => null, ClearCanvas: () => null, ChangeCanvasBackground: () => null },
  }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const props = () => capture.mock.lastCall![0] as ExcalidrawProps;
const emit = (scene: ReturnType<typeof emptyScene>, theme: "light" | "dark") =>
  props().onChange!(
    scene.elements as Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0],
    { ...scene.appState, theme } as Parameters<NonNullable<ExcalidrawProps["onChange"]>>[1],
    scene.files,
  );

describe("canvas app theme", () => {
  it("defaults to light and keeps Excalidraw theme controls disabled", () => {
    render(<CanvasEditor source="" onChange={vi.fn()} />);
    expect(props().theme).toBe("light");
    expect(props().UIOptions?.canvasActions?.toggleTheme).toBe(false);
  });

  it("passes theme changes without replacing initial data or persisting UI-only changes", () => {
    const scene = { ...emptyScene(), appState: { viewBackgroundColor: "#abcdef" } };
    const source = JSON.stringify(scene);
    const onChange = vi.fn();
    const { rerender } = render(
      <AppThemeContext.Provider value="light"><CanvasEditor source={source} onChange={onChange} /></AppThemeContext.Provider>,
    );
    const initialData = props().initialData;
    emit(scene, "light");
    for (const theme of ["dark", "light"] as const) {
      rerender(
        <AppThemeContext.Provider value={theme}><CanvasEditor source={source} onChange={onChange} /></AppThemeContext.Provider>,
      );
      expect(props().theme).toBe(theme);
      expect(props().initialData).toBe(initialData);
      emit(scene, theme);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(scene)).toBe(source);
    expect(initialData).toEqual({ ...scene, scrollToContent: true });
  });

  it("still saves artwork changes and undo while discarding repeated theme notifications", () => {
    const scene = emptyScene();
    const onChange = vi.fn();
    render(<AppThemeContext.Provider value="dark"><CanvasEditor source="" onChange={onChange} /></AppThemeContext.Provider>);
    const edited = { ...scene, appState: { viewBackgroundColor: "#123456" } };
    emit(edited, "dark");
    emit(edited, "light");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(parseScene(onChange.mock.calls[0][0])).toEqual(edited);
    emit(scene, "light");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(parseScene(onChange.mock.calls[1][0])).toEqual(scene);
  });
});
