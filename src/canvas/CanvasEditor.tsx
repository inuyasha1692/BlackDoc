import "./assets";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useContext, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { openExternalLink } from "../desktop";
import { AppThemeContext } from "../theme";
import { parseScene, serializeScene } from "./scene";

export default function CanvasEditor({
  source,
  onChange,
}: {
  source: string;
  onChange: (scene: string) => void;
}) {
  const theme = useContext(AppThemeContext);
  const [initialData] = useState(() => ({
    ...parseScene(source),
    scrollToContent: true,
  }));
  const lastScene = useRef(serializeScene(initialData.elements, initialData.appState, initialData.files));
  const surface = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => {
    if (!api || !surface.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true, viewportZoomFactor: 0.8, animate: false,
      }));
    });
    observer.observe(surface.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [api]);
  return (
    <div ref={surface} className="canvas-excalidraw">
    <Excalidraw
      excalidrawAPI={setApi}
      initialData={initialData}
      langCode="zh-CN"
      theme={theme}
      autoFocus
      handleKeyboardGlobally={false}
      aiEnabled={false}
      validateEmbeddable={false}
      onChange={(elements, appState, files) => {
        // Excalidraw also emits changes for theme and other transient UI state.
        const scene = serializeScene(elements, appState, files);
        if (scene === lastScene.current) return;
        lastScene.current = scene;
        onChange(scene);
      }}
      onLinkOpen={(element, event) => {
        event.preventDefault();
        if (element.link) void openExternalLink(element.link);
      }}
      UIOptions={{
        canvasActions: {
          export: false,
          saveAsImage: false,
          saveToActiveFile: false,
          toggleTheme: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
    </Excalidraw>
    </div>
  );
}
