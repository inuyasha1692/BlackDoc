import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { describe, expect, it } from "vitest";
import { emptyScene, parseScene, serializeScene } from "./scene";

const element = (
  id: string,
  type = "rectangle",
  fileId: string | null = null,
  isDeleted = false,
): ExcalidrawElement =>
  ({ id, type, x: 10, y: 20, fileId, isDeleted }) as ExcalidrawElement;

const imageFile = (id: string): BinaryFiles[string] =>
  ({
    id,
    dataURL: "data:image/png;base64,aGVsbG8=",
    mimeType: "image/png",
    created: 1,
    lastRetrieved: 2,
  }) as BinaryFiles[string];

describe("parseScene", () => {
  it("creates and parses an empty version 1 scene", () => {
    const expected = {
      version: 1,
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };
    expect(emptyScene()).toEqual(expected);
    expect(parseScene("")).toEqual(expected);
    expect(parseScene(JSON.stringify(expected))).toEqual(expected);
  });

  it("returns independent empty scenes", () => {
    const first = emptyScene();
    const second = emptyScene();
    expect(first).not.toBe(second);
    expect(first.elements).not.toBe(second.elements);
    expect(first.appState).not.toBe(second.appState);
    expect(first.files).not.toBe(second.files);
  });

  it("preserves valid elements, background, and embedded image data", () => {
    const scene = {
      version: 1,
      elements: [element("image", "image", "asset")],
      appState: { viewBackgroundColor: "#123456" },
      files: { asset: imageFile("asset") },
    };
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });

  it.each([undefined, null, 0, 2, "1"])(
    "rejects unsupported or missing version %s",
    (version) => {
      expect(() => parseScene(JSON.stringify({ ...emptyScene(), version })))
        .toThrow();
    },
  );

  it.each(["{", "undefined", " ", '{"version":1,}'])(
    "rejects malformed JSON %s",
    (source) => {
      expect(() => parseScene(source)).toThrow();
    },
  );

  it.each([null, [], true, 1, "scene", {}])(
    "rejects an invalid scene root %j",
    (value) => {
      expect(() => parseScene(JSON.stringify(value))).toThrow();
    },
  );

  it.each([
    { elements: null },
    { elements: {} },
    { appState: null },
    { appState: [] },
    { appState: {} },
    { appState: { viewBackgroundColor: 123 } },
    { files: null },
    { files: [] },
  ])("rejects invalid scene fields %j", (fields) => {
    expect(() => parseScene(JSON.stringify({ ...emptyScene(), ...fields })))
      .toThrow();
  });

  it.each([
    null,
    [],
    {},
    { id: 1, type: "rectangle", x: 0, y: 0 },
    { id: "a", type: null, x: 0, y: 0 },
    { id: "a", type: "rectangle", x: "0", y: 0 },
    { id: "a", type: "rectangle", x: 0, y: null },
  ])("rejects invalid elements %j", (invalidElement) => {
    expect(() => parseScene(JSON.stringify({
      ...emptyScene(),
      elements: [invalidElement],
    }))).toThrow();
  });

  it.each(["x", "y"])("rejects non-finite %s coordinates", (axis) => {
    const source = `{"version":1,"elements":[{"id":"a","type":"rectangle","x":0,"y":0,"${axis}":1e400}],"appState":{"viewBackgroundColor":"#fff"},"files":{}}`;
    expect(() => parseScene(source)).toThrow();
  });

  it.each([
    null,
    {},
    { dataURL: 123 },
    { dataURL: "https://example.com/image.png" },
    { dataURL: "blob:local-image" },
    { dataURL: "data:text/html;base64,aGVsbG8=" },
  ])("rejects non-embedded image resources %j", (file) => {
    expect(() => parseScene(JSON.stringify({
      ...emptyScene(),
      files: { asset: file },
    }))).toThrow();
  });
});

describe("serializeScene", () => {
  it("round-trips an empty scene", () => {
    const scene = emptyScene();
    expect(parseScene(serializeScene(scene.elements, scene.appState, scene.files)))
      .toEqual(scene);
  });

  it("saves complete image files only for active image references", () => {
    const elements = [
      element("first", "image", "shared"),
      element("second", "image", "shared"),
      element("deleted", "image", "removed", true),
      element("shape", "rectangle", "not-an-image"),
      element("pending", "image"),
    ];
    const files = {
      shared: imageFile("shared"),
      removed: imageFile("removed"),
      orphan: imageFile("orphan"),
      "not-an-image": imageFile("not-an-image"),
    };
    const before = JSON.stringify({ elements, files });
    const result = parseScene(serializeScene(elements, emptyScene().appState, files));

    expect(result.version).toBe(1);
    expect(result.elements).toEqual(elements.filter((item) => !item.isDeleted));
    expect(result.files).toEqual({ shared: files.shared });
    expect(JSON.stringify({ elements, files })).toBe(before);
  });

  it("retains shared resources until the last image reference is deleted", () => {
    const files = { shared: imageFile("shared") };
    const elements = [
      element("first", "image", "shared", true),
      element("second", "image", "shared"),
    ];
    const saved = parseScene(serializeScene(elements, emptyScene().appState, files));
    expect(saved.files).toEqual(files);

    const deleted = saved.elements.map((item) => ({ ...item, isDeleted: true }));
    const result = parseScene(serializeScene(deleted, saved.appState, saved.files));
    expect(result.elements).toEqual([]);
    expect(result.files).toEqual({});
  });

  it("drops orphaned files when image elements are removed entirely", () => {
    const result = parseScene(serializeScene(
      [element("shape")],
      emptyScene().appState,
      { orphan: imageFile("orphan") },
    ));
    expect(result.files).toEqual({});
    expect(result.elements).toEqual([element("shape")]);
  });

  it("persists the background without temporary selection or viewport state", () => {
    const appState = {
      viewBackgroundColor: "#abcdef",
      selectedElementIds: { shape: true },
      selectedGroupIds: { group: true },
      editingGroupId: "group",
      scrollX: 100,
      scrollY: -200,
      zoom: { value: 2 },
      width: 1200,
      height: 800,
    };
    const before = JSON.stringify(appState);
    const result = JSON.parse(serializeScene([element("shape")], appState, {}));
    expect(result).toEqual({
      version: 1,
      elements: [element("shape")],
      appState: { viewBackgroundColor: "#abcdef" },
      files: {},
    });
    expect(JSON.stringify(appState)).toBe(before);
  });
});
