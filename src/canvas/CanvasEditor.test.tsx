import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import { AppThemeContext } from "../theme";
import CanvasEditor from "./CanvasEditor";
import { emptyScene, parseScene } from "./scene";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (elements: Record<string, unknown>[]) => elements.map((element, index) => ({ ...element, id: `pasted-${index}` })),
  Excalidraw: (props: ExcalidrawProps) => { capture(props); return null; },
  MainMenu: Object.assign(() => null, {
    DefaultItems: { LoadScene: () => null, ClearCanvas: () => null, ChangeCanvasBackground: () => null },
  }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

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
    expect(initialData).toEqual({ ...scene, scrollToContent: false });
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

describe("canvas initial viewport", () => {
  it("does not fit an empty canvas when its editor resizes", () => {
    let resize: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const elements: ReturnType<typeof emptyScene>["elements"] = [];
    const scrollToContent = vi.fn();
    const api = { getSceneElements: () => elements, scrollToContent } as unknown as ExcalidrawImperativeAPI;
    render(<CanvasEditor source="" onChange={vi.fn()} />);
    expect(props().initialData).toEqual({ ...emptyScene(), scrollToContent: false });
    act(() => { props().excalidrawAPI!(api); });
    act(() => { resize(); });
    expect(scrollToContent).not.toHaveBeenCalled();
  });

  it("still centers existing artwork on opening", () => {
    const scene = { ...emptyScene(), elements: [{ id: "shape", type: "rectangle", x: 0, y: 0 }] };
    render(<CanvasEditor source={JSON.stringify(scene)} onChange={vi.fn()} />);
    expect(props().initialData).toEqual({ ...scene, scrollToContent: true });
  });
});
describe("canvas image block paste", () => {
  const url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  function clipboard(html: string) {
    return { clipboardData: {
      getData: (format: string) => format === "blocknote/html" || format === "text/html" ? html : `![图片](${url})`,
    } } as unknown as ClipboardEvent;
  }
  function decodeImage(fail = false) {
    vi.stubGlobal("Image", class {
      naturalWidth = 640;
      naturalHeight = 320;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
    });
  }

  it("pastes copied embedded image HTML as an image with its file, instead of Markdown text", async () => {
    decodeImage();
    const onChange = vi.fn();
    render(<CanvasEditor source="" onChange={onChange} />);
    const data: Parameters<NonNullable<ExcalidrawProps["onPaste"]>>[0] = { text: `![图片](${url})` };
    expect(props().onPaste).toBeTypeOf("function");
    expect(await props().onPaste!(data, clipboard(`<div data-content-type="image" data-preview-width="240"><img src="${url}" /><p>图片说明</p></div>`))).toBe(true);
    expect(data.text).toBeUndefined();
    expect(data.elements).toHaveLength(1);
    expect(data.elements![0]).toMatchObject({ type: "image", width: 240, height: 120, status: "saved" });
    const image = data.elements![0];
    expect(image.type).toBe("image");
    if (image.type !== "image") throw new Error("Expected image");
    expect(data.files![image.fileId!].dataURL).toBe(url);
    props().onChange!(data.elements! as Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0], emptyScene().appState as Parameters<NonNullable<ExcalidrawProps["onChange"]>>[1], data.files!);
    const saved = parseScene(onChange.mock.calls[0][0]);
    expect(saved.elements[0].type).toBe("image");
    expect(Object.values(saved.files)[0].dataURL).toBe(url);
  });

  it("accepts external image HTML and preserves its aspect ratio", async () => {
    decodeImage();
    render(<CanvasEditor source="" onChange={vi.fn()} />);
    const data = { text: `![图片](${url})` } as Parameters<NonNullable<ExcalidrawProps["onPaste"]>>[0];
    await props().onPaste!(data, clipboard(`<figure><img src="${url}" style="width: 160px" /><figcaption>说明</figcaption></figure>`));
    expect(data.elements![0]).toMatchObject({ type: "image", width: 160, height: 80 });
  });

  it("leaves text, mixed blocks and Excalidraw elements to native paste", async () => {
    render(<CanvasEditor source="" onChange={vi.fn()} />);
    for (const html of ["<p>文字</p>", `<p>文字</p><img src="${url}" />`, '<img src="https://example.com/image.png" />']) {
      const data = { text: "原始内容" };
      expect(await props().onPaste!(data, clipboard(html))).toBe(true);
      expect(data).toEqual({ text: "原始内容" });
    }
    const data = { elements: [], text: "原始内容" };
    await props().onPaste!(data, clipboard(`<img src="${url}" />`));
    expect(data).toEqual({ elements: [], text: "原始内容" });
  });

  it("reports an unreadable copied image without inserting its encoded text", async () => {
    decodeImage(true);
    render(<CanvasEditor source="" onChange={vi.fn()} />);
    const data = { text: `![图片](${url})` } as Parameters<NonNullable<ExcalidrawProps["onPaste"]>>[0];
    await props().onPaste!(data, clipboard(`<img src="${url}" />`));
    expect(data.text).toBeUndefined();
    expect(data.elements).toBeUndefined();
    expect(data.errorMessage).toContain("图片");
  });
});