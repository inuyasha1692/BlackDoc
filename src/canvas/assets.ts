// Evaluate before importing Excalidraw: font URLs are captured at registration.
if (typeof window !== "undefined") {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  (
    window as Window & { EXCALIDRAW_ASSET_PATH?: string | string[] }
  ).EXCALIDRAW_ASSET_PATH = new URL("excalidraw-assets/", base).href;
}

export {};
