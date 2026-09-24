// Run against Vite on port 5173:
// playwright-cli run-code --filename scripts/check-split-pane-hover.js
async (page) => {
  await page.route("https://api.github.com/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ tag_name: "v0.1.0" }),
  }));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const paragraph = (id, text) => ({ id, type: "paragraph", content: text });
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command) => command === "desktop_bootstrap" ? {
        draft: null,
        document: { path: "split-test.bdoc", name: "split-test.bdoc", blocks: [
          paragraph("before", "Before split"),
          { id: "pane", type: "splitPane", props: { leftWidth: 50, rightHeight: 240 }, children: [
            { id: "left", type: "splitColumn", props: { side: "left" }, children: [
              paragraph("left-1", "Left first"), paragraph("left-2", "Left second"),
            ] },
            { id: "right", type: "splitColumn", props: { side: "right" }, children:
              Array.from({ length: 20 }, (_, i) => paragraph(`right-${i}`, `Right paragraph ${i}`)) },
          ] },
          paragraph("after", "After split"),
        ] },
      } : null,
    };
  });
  await page.goto("http://127.0.0.1:5173");
  await page.locator(".split-pane-right-scroll").waitFor();
  const results = [];
  const hoverHandle = async (id) => {
    const block = page.locator(`.bn-block[data-id="${id}"]`);
    await block.hover();
    const rect = await block.boundingBox();
    const handle = page.locator('.bn-side-menu [draggable="true"]');
    await handle.waitFor();
    // Approach through the column padding, as a user does from the text.
    await page.mouse.move(rect.x - 12, rect.y + rect.height / 2, { steps: 8 });
    await page.waitForFunction(({ x, y }) => {
      const menu = document.querySelector(".bn-side-menu");
      if (!menu) return false;
      const bounds = menu.getBoundingClientRect();
      return Math.abs(bounds.right - x) < 2 && Math.abs(bounds.y - y) < 2;
    }, { x: rect.x, y: rect.y }, { timeout: 2000 });
    return handle;
  };
  // Demonstrate that the check catches the original CSS on the real editor.
  const oldStyles = await page.addStyleTag({ content: `
    .bn-editor .split-pane-column > .bn-block > .split-pane-right-scroll {
      scrollbar-width: thin; scrollbar-color: gray transparent;
    }` });
  let reproduced = false;
  try { await hoverHandle("right-1"); } catch { reproduced = true; }
  await oldStyles.evaluate(el => el.remove());
  if (!reproduced) throw new Error("The original hover regression did not reproduce");
  results.push("Original CSS: handle jumps to the column (reproduced)");
  for (const viewport of [1280, 900]) {
    await page.setViewportSize({ width: viewport, height: 800 });
    for (const width of [25, 50, 75]) {
      await page.locator(".split-pane-editor").evaluate((el, value) =>
        el.style.setProperty("--split-left-width", `${value}%`), width);
      for (const id of ["right-1", "left-2", "right-12"]) {
        await hoverHandle(id);
      }
      results.push(`PASS hover: viewport ${viewport}, left width ${width}%`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator(".split-pane-editor").evaluate(el =>
    el.style.removeProperty("--split-left-width"));
  await page.getByRole("combobox", { name: "右侧高度预设" }).selectOption("640");
  await hoverHandle("right-1");
  results.push("PASS hover: no vertical overflow");
  await page.getByRole("combobox", { name: "右侧高度预设" }).selectOption("240");
  const handle = await hoverHandle("right-1");
  const source = await handle.boundingBox();
  const target = await page.locator('.bn-block[data-id="left-2"]').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 8, source.y + 8, { steps: 4 });
  await page.mouse.move(target.x + 60, target.y + target.height - 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForFunction(() =>
    document.querySelector('.bn-block[data-id="right-1"]')
      ?.closest(".split-pane-column")?.getAttribute("data-id") === "left",
  null, { timeout: 3000 });
  if (await page.locator(".split-pane-column").count() !== 2) {
    throw new Error("Dragging changed the split column structure");
  }
  results.push("PASS drag: right paragraph moved into left column");
  await page.screenshot({ path: "output/playwright/split-after.png" });
  return results;
}
