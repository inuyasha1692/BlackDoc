import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasSvg } from "./export";
import { emptyScene } from "./scene";

const { exportToSvg } = vi.hoisted(() => ({ exportToSvg: vi.fn() }));

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg }));

const image = (fileId: string | null, isDeleted = false) => ({
  id: "image",
  type: "image",
  x: 10,
  y: 20,
  fileId,
  isDeleted,
});

beforeEach(() => {
  exportToSvg.mockReset();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  exportToSvg.mockResolvedValue(svg);
});

describe("canvasSvg", () => {
  it("passes image resources as files with active elements and export options", async () => {
    const active = image("asset");
    const files = {
      asset: {
        id: "asset",
        dataURL: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        created: 1,
      },
    };
    await canvasSvg(JSON.stringify({
      ...emptyScene(),
      elements: [active, { ...image("missing", true), id: "deleted" }],
      appState: { viewBackgroundColor: "#abcdef" },
      files,
    }));

    expect(exportToSvg).toHaveBeenCalledExactlyOnceWith({
      elements: [active],
      appState: {
        viewBackgroundColor: "#abcdef",
        exportBackground: true,
        exportWithDarkMode: false,
      },
      files,
      exportPadding: 24,
    });
  });

  it("returns SVG markup as a URI-encoded image data URL", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = 'Canvas #1 & <image> "100%" \u753b\u5e03';
    svg.append(text);
    exportToSvg.mockResolvedValue(svg);

    const result = await canvasSvg(JSON.stringify(emptyScene()));
    const prefix = "data:image/svg+xml;charset=utf-8,";
    expect(result).toBe(`${prefix}${encodeURIComponent(svg.outerHTML)}`);
    expect(decodeURIComponent(result.slice(prefix.length))).toBe(svg.outerHTML);
    expect(result).not.toContain("<svg");
  });

  it("exports an empty source as an empty scene", async () => {
    await canvasSvg("");
    expect(exportToSvg).toHaveBeenCalledExactlyOnceWith({
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
        exportBackground: true,
        exportWithDarkMode: false,
      },
      files: {},
      exportPadding: 24,
    });
  });

  it.each(["missing", null, ""])(
    "rejects an active image with missing file %s before exporting",
    async (fileId) => {
      await expect(canvasSvg(JSON.stringify({
        ...emptyScene(),
        elements: [image(fileId)],
      }))).rejects.toThrow();
      expect(exportToSvg).not.toHaveBeenCalled();
    },
  );

  it("ignores deleted images with missing resources", async () => {
    await canvasSvg(JSON.stringify({
      ...emptyScene(),
      elements: [image(null, true)],
    }));
    expect(exportToSvg).toHaveBeenCalledOnce();
    expect(exportToSvg.mock.calls[0][0].elements).toEqual([]);
  });

  it.each(["{", JSON.stringify({ ...emptyScene(), version: 2 })])(
    "rejects invalid scene input before exporting",
    async (source) => {
      await expect(canvasSvg(source)).rejects.toThrow();
      expect(exportToSvg).not.toHaveBeenCalled();
    },
  );

  it("propagates SVG renderer failures", async () => {
    const error = new Error("SVG export failed");
    exportToSvg.mockRejectedValue(error);
    await expect(canvasSvg("")).rejects.toBe(error);
  });
});
