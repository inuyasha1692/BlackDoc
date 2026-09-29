// Run against Vite on port 5173:
// playwright-cli run-code --filename scripts/check-split-image-copy.js
async (page) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const context = page.context();
  await context.route("https://api.github.com/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ tag_name: "v0.1.4" }),
  }));
  await context.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const paragraph = (id, text) => ({ id, type: "paragraph", props: {}, content: text, children: [] });
    const image = (id) => ({ id, type: "image", props: {
      url: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="coral"/></svg>'),
      caption: "图片复制验证", previewWidth: 240,
    }, children: [] });
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command) => command === "desktop_bootstrap" ? {
        draft: null,
        document: { path: "image-copy-test.bdoc", name: "image-copy-test.bdoc", blocks: [
          paragraph("before", "Before split"),
          { id: "pane", type: "splitPane", props: { leftWidth: 50, rightHeight: 240 }, children: [
            { id: "left", type: "splitColumn", props: { side: "left" }, children: [image("left-image")] },
            { id: "right", type: "splitColumn", props: { side: "right" }, children: [image("right-image")] },
          ] },
          paragraph("after", ""),
          image("outside-image"),
        ] },
      } : null,
    };
  });
  const results = [];
  for (const id of ["left-image", "right-image", "outside-image"]) {
    for (const action of ["hover Ctrl+C", "click Ctrl+C", "menu copy"]) {
      const testPage = await context.newPage();
      page = testPage;
      await page.goto("http://127.0.0.1:5173");
      await page.locator('.bn-block[data-id="left-image"] img').waitFor();
      await page.locator('.bn-block[data-id="before"] .bn-inline-content').click();
      await page.evaluate(() => navigator.clipboard.writeText("previous-clipboard-sentinel"));
      const image = page.locator(`.bn-block[data-id="${id}"] img`);
      await image.hover();
      if (action === "menu copy") {
        await page.getByRole("button", { name: "图片，拖动手柄和块菜单", exact: true }).click();
        await page.getByRole("menuitem", { name: "复制", exact: true }).click();
      } else {
        if (action === "click Ctrl+C") await image.click();
        await page.keyboard.press("Control+c");
      }
      const text = await page.evaluate(() => navigator.clipboard.readText());
      if (!text.includes("图片复制验证") || text.includes("previous-clipboard-sentinel")) {
        throw new Error(`${id} ${action}: clipboard was not updated`);
      }
      await page.locator('.bn-block[data-id="before"] .bn-inline-content').click({ position: { x: 30, y: 14 } });
      // Native selectionchange is asynchronous. Wait for the editor to observe
      // the user's destination click before sending the paste shortcut.
      try { await page.waitForFunction(() => {
        const selection = document.querySelector(".tiptap").editor.state.selection;
        return selection.$from.parent.type.name === "paragraph" &&
          selection.$from.node(selection.$from.depth - 1).attrs.id === "before";
      }, null, { timeout: 3000 }); } catch {
        const state = await page.evaluate(() => {
          const selection = document.querySelector(".tiptap").editor.state.selection;
          return { selection: selection.toJSON(), block: selection.$from.node(selection.$from.depth - 1).attrs.id,
            domFocus: document.getSelection()?.focusNode?.parentElement?.closest("[data-id]")?.getAttribute("data-id") };
        });
        throw new Error(`${id} ${action}: destination click not observed: ${JSON.stringify(state)}; checks: ${JSON.stringify(results)}`);
      }
      await page.keyboard.press("Control+v");
      try {
        await page.waitForFunction(() => document.querySelectorAll('[data-content-type="image"]').length === 4, null, { timeout: 3000 });
      } catch {
        throw new Error(`${id} ${action}: paste failed; prior checks: ${JSON.stringify(results)}`);
      }
      const pasted = await page.locator('[data-content-type="image"]').evaluateAll(elements =>
        elements.filter(element => !element.closest(".split-pane-column") &&
          element.closest("[data-id]")?.getAttribute("data-id") !== "outside-image").map(element => ({
            id: element.closest("[data-id]")?.getAttribute("data-id"),
            caption: element.getAttribute("data-caption"), width: element.getAttribute("data-preview-width"),
          })));
      if (pasted.length !== 1 || pasted[0].id === id || pasted[0].caption !== "图片复制验证" || pasted[0].width !== "240") {
        throw new Error(`${id} ${action}: pasted image properties or position are wrong: ${JSON.stringify(pasted)}`);
      }
      if (await page.locator(".split-pane-column").count() !== 2 || await page.locator(".split-pane-column [data-content-type=image]").count() !== 2) {
        throw new Error(`${id} ${action}: copy changed the original split pane`);
      }
      results.push(`PASS ${id}: ${action}, paste outside with caption/width and a new ID`);
      await testPage.close();
    }
  }
  return results;
}
