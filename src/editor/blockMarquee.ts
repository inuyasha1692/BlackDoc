import { blockToNode, createExtension } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { BlackDocBlock, BlackDocEditor } from "./schema";
import { RIGHT_SCROLL_SELECTOR } from "./splitPane";

const key = new PluginKey<readonly string[]>("block-marquee");
const controllers = new WeakMap<object, BlockMarqueeController>();
const layoutTypes = new Set(["columnList", "column", "splitPane", "splitColumn"]);
const emptySelection: readonly string[] = [];

type Entry = { id: string; node: PMNode; pos: number };
type Rect = { left: number; top: number; right: number; bottom: number };

function entries(doc: PMNode): Entry[] {
  const result: Entry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.isInGroup("bnBlock") && node.attrs.id) {
      result.push({ id: node.attrs.id, node, pos });
    }
  });
  return result;
}

export function normalizeBlockIds(doc: PMNode, ids: readonly string[]): string[] {
  const requested = new Set(ids);
  const selected: Entry[] = [];
  for (const entry of entries(doc)) {
    if (requested.has(entry.id) && !selected.some(parent =>
      entry.pos > parent.pos && entry.pos < parent.pos + parent.node.nodeSize,
    )) selected.push(entry);
  }
  return selected.map(entry => entry.id);
}

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function contentElement(view: EditorView, entry: Entry): HTMLElement | null {
  const element = view.nodeDOM(entry.pos);
  if (!(element instanceof HTMLElement)) return null;
  return element.querySelector<HTMLElement>(".bn-block-content") ?? element;
}

export function blocksInRectangle(view: EditorView, rect: Rect, scrollingContainer?: HTMLElement | null): string[] {
  const ids = entries(view.state.doc).filter(entry => {
    const type = entry.node.type.name === "blockContainer"
      ? entry.node.firstChild?.type.name : entry.node.type.name;
    if (type && layoutTypes.has(type)) return false;
    const content = contentElement(view, entry);
    if (!content || !content.getClientRects().length) return false;
    const bounds = content.getBoundingClientRect();
    const visible = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    for (let parent = content.parentElement; parent && parent !== view.dom; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent !== scrollingContainer && /auto|scroll|hidden|clip/.test(style.overflowY)) {
        const clip = parent.getBoundingClientRect();
        visible.top = Math.max(visible.top, clip.top);
        visible.bottom = Math.min(visible.bottom, clip.bottom);
      }
    }
    return visible.bottom > visible.top && intersects(rect, visible);
  }).map(entry => entry.id);
  return normalizeBlockIds(view.state.doc, ids);
}

export function moveMarqueeBlocks(
  editor: BlackDocEditor, ids: readonly string[], targetId: string,
  placement: "before" | "after",
): boolean {
  if (!editor.isEditable) return false;
  const selected = normalizeBlockIds(editor.prosemirrorView.state.doc, ids);
  const blocks = selected.map(id => editor.getBlock(id)).filter((block): block is BlackDocBlock => !!block);
  const contains = (block: BlackDocBlock): boolean => block.id === targetId || block.children.some(contains);
  if (!blocks.length || blocks.some(contains) || !editor.getBlock(targetId)) return false;
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorView.state.tr));
  editor.transact(() => {
    // Removing a column can unwrap its layout and shift all later positions.
    for (const block of [...blocks].reverse()) editor.removeBlocks([block.id]);
    editor.insertBlocks(blocks, targetId, placement);
  });
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorView.state.tr));
  getBlockMarquee(editor)?.select(selected);
  return true;
}

export class BlockMarqueeController {
  private listeners = new Set<() => void>();
  private ids: readonly string[] = emptySelection;
  private dragImage: HTMLElement | null = null;
  private afterDrag: (() => void) | undefined;
  dragging = false;

  constructor(private editor: BlackDocEditor) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.ids;
  update(ids: readonly string[]) {
    if (ids.length === this.ids.length && ids.every((id, index) => id === this.ids[index])) return;
    this.ids = ids;
    for (const listener of this.listeners) listener();
  }
  select(ids: readonly string[]) {
    const view = this.editor.prosemirrorView;
    const next = normalizeBlockIds(view.state.doc, ids);
    const current = key.getState(view.state) ?? emptySelection;
    if (next.length === current.length && next.every((id, index) => id === current[index])) return;
    view.dispatch(view.state.tr.setMeta(key, next).setMeta("addToHistory", false));
  }
  includes(id: string) {
    if (this.ids.includes(id)) return true;
    const all = entries(this.editor.prosemirrorView.state.doc);
    const child = all.find(entry => entry.id === id);
    return !!child && all.some(parent => this.ids.includes(parent.id) &&
      child.pos > parent.pos && child.pos < parent.pos + parent.node.nodeSize);
  }
  private blocks() {
    return this.ids.map(id => this.editor.getBlock(id)).filter((block): block is BlackDocBlock => !!block);
  }
  writeClipboard(data: DataTransfer) {
    const blocks = this.blocks();
    const view = this.editor.prosemirrorView;
    const slice = new Slice(Fragment.fromArray(blocks.map(block => blockToNode(block, view.state.schema))), 0, 0);
    data.setData("blocknote/html", view.serializeForClipboard(slice).dom.innerHTML);
    data.setData("text/html", this.editor.blocksToHTMLLossy(blocks));
    data.setData("text/plain", this.editor.blocksToMarkdownLossy(blocks));
    return slice;
  }
  copy() {
    this.editor.prosemirrorView.focus();
    return document.execCommand("copy");
  }
  remove() {
    if (!this.editor.isEditable) return;
    const blocks = this.blocks();
    if (!blocks.length) return;
    const view = this.editor.prosemirrorView;
    view.dispatch(closeHistory(view.state.tr));
    this.editor.transact(() => {
      for (const block of [...blocks].reverse()) this.editor.removeBlocks([block.id]);
    });
    view.dispatch(closeHistory(view.state.tr));
    this.select([]);
  }
  startDrag(event: { dataTransfer: DataTransfer | null }, blockId: string, afterDrag?: () => void) {
    if (!this.editor.isEditable) return false;
    if (!this.includes(blockId) || !event.dataTransfer) return false;
    this.endDrag();
    this.dragging = true;
    this.afterDrag = afterDrag;
    const view = this.editor.prosemirrorView;
    event.dataTransfer.clearData();
    view.dragging = { slice: this.writeClipboard(event.dataTransfer), move: true };
    event.dataTransfer.effectAllowed = "move";
    this.dragImage = document.createElement("div");
    this.dragImage.className = "bn-default-styles block-marquee-drag-preview";
    for (const entry of entries(view.state.doc)) {
      if (!this.ids.includes(entry.id)) continue;
      const node = view.nodeDOM(entry.pos);
      if (node instanceof HTMLElement) this.dragImage.append(node.cloneNode(true));
    }
    this.dragImage.querySelectorAll("iframe, embed, object").forEach(element => element.remove());
    document.body.append(this.dragImage);
    event.dataTransfer.setDragImage(this.dragImage, 0, 0);
    return true;
  }
  endDrag() {
    this.dragImage?.remove();
    this.dragImage = null;
    if (this.dragging) this.editor.prosemirrorView.dragging = null;
    this.dragging = false;
    const afterDrag = this.afterDrag;
    this.afterDrag = undefined;
    afterDrag?.();
  }
}

export const getBlockMarquee = (editor: object) => controllers.get(editor);

export const BlockMarqueeExtension = createExtension(({ editor: baseEditor }) => {
  const editor = baseEditor as unknown as BlackDocEditor;
  const controller = new BlockMarqueeController(editor);
  controllers.set(editor, controller);
  return {
    key: "block-marquee",
    prosemirrorPlugins: [new Plugin<readonly string[]>({
      key,
      state: {
        init: () => emptySelection,
        apply(tr, ids) {
          return tr.getMeta(key) ?? (tr.docChanged ? normalizeBlockIds(tr.doc, ids) : ids);
        },
      },
      props: {
        decorations(state) {
          const selected = new Set(key.getState(state));
          return DecorationSet.create(state.doc, entries(state.doc)
            .filter(entry => selected.has(entry.id))
            .map(entry => Decoration.node(entry.pos, entry.pos + entry.node.nodeSize,
              { class: "block-marquee-selected" })));
        },
      },
      view(view) {
        const owner = view.dom.ownerDocument;
        let gesture: { x: number; y: number; scrollY: number; currentX: number; currentY: number;
          active: boolean; scroll: HTMLElement | null; scrollTop: number } | null = null;
        let marquee: HTMLElement | null = null;
        let frame = 0;
        let focusFrame = 0;
        let cue: HTMLElement | null = null;
        const finish = () => {
          gesture = null;
          marquee?.remove();
          marquee = null;
          cancelAnimationFrame(frame);
          view.dom.classList.remove("block-marquee-selecting");
        };
        const draw = () => {
          if (!gesture?.active) return;
          const startY = gesture.y + gesture.scrollY - window.scrollY +
            gesture.scrollTop - (gesture.scroll?.scrollTop ?? 0);
          const rect = {
            left: Math.min(gesture.x, gesture.currentX), right: Math.max(gesture.x, gesture.currentX),
            top: Math.min(startY, gesture.currentY), bottom: Math.max(startY, gesture.currentY),
          };
          Object.assign(marquee!.style, { left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px` });
          const scrolling = gesture.scroll?.scrollTop !== gesture.scrollTop ? gesture.scroll : null;
          controller.select(blocksInRectangle(view, rect, scrolling));
        };
        const autoScroll = () => {
          if (!gesture?.active) return;
          const y = gesture.currentY;
          const bounds = gesture.scroll?.getBoundingClientRect();
          const top = bounds ? Math.max(0, bounds.top) + 30 : 80;
          const bottom = bounds ? Math.min(window.innerHeight, bounds.bottom) - 30 : window.innerHeight - 60;
          const speed = y < top ? -Math.min(18, (top - y) / 4)
            : y > bottom ? Math.min(18, (y - bottom) / 4) : 0;
          if (speed) {
            const previous = gesture.scroll?.scrollTop ?? window.scrollY;
            if (gesture.scroll) gesture.scroll.scrollBy({ top: speed, behavior: "instant" });
            else window.scrollBy({ top: speed, behavior: "instant" });
            if (previous !== (gesture.scroll?.scrollTop ?? window.scrollY)) {
              draw();
            }
          }
          frame = requestAnimationFrame(autoScroll);
        };
        const pointerDown = (event: PointerEvent) => {
          if (event.button !== 0 || !editor.isEditable) return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          const handle = target.closest(".blackdoc-block-control-trigger");
          if (handle) {
            const id = handle.querySelector("[data-block-id]")?.getAttribute("data-block-id");
            if (id && !controller.includes(id)) controller.select([]);
            return;
          }
          if (target.closest(".bn-side-menu, .bn-menu-dropdown, .block-marquee-drag-preview")) return;
          const region = view.dom.closest(".editor-region") ?? view.dom;
          const content = target.closest(".bn-block-content, .bn-toggle-button, button, input, textarea, a, [role=separator]");
          if (content || !region.contains(target)) {
            if (content?.closest("[data-id]") && controller.includes(content.closest("[data-id]")!.getAttribute("data-id")!)) return;
            controller.select([]);
            return;
          }
          const scroll = target.closest<HTMLElement>(RIGHT_SCROLL_SELECTOR);
          gesture = { x: event.clientX, y: event.clientY, scrollY: window.scrollY,
            currentX: event.clientX, currentY: event.clientY, active: false,
            scroll, scrollTop: scroll?.scrollTop ?? 0 };
          event.preventDefault();
        };
        const pointerMove = (event: PointerEvent) => {
          if (!gesture) return;
          gesture.currentX = event.clientX;
          gesture.currentY = event.clientY;
          if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 5) {
            gesture.active = true;
            owner.getSelection()?.removeAllRanges();
            marquee = owner.createElement("div");
            marquee.className = "block-marquee-rectangle";
            marquee.setAttribute("aria-hidden", "true");
            owner.body.append(marquee);
            view.dom.classList.add("block-marquee-selecting");
            frame = requestAnimationFrame(autoScroll);
          }
          if (gesture.active) { event.preventDefault(); draw(); }
        };
        const pointerUp = () => {
          if (gesture?.active) view.focus();
          if (gesture && !gesture.active) controller.select([]);
          finish();
        };
        const clipboard = (event: ClipboardEvent) => {
          if (!controller.getSnapshot().length || !event.clipboardData) return;
          if (!view.dom.contains(owner.activeElement) && !owner.activeElement?.closest(".bn-side-menu")) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          controller.writeClipboard(event.clipboardData);
          if (event.type === "cut") controller.remove();
        };
        const keydown = (event: KeyboardEvent) => {
          if (!controller.getSnapshot().length) return;
          const target = event.target instanceof Element ? event.target : null;
          if (target && !view.dom.contains(target) && !target.closest(".bn-side-menu")) return;
          if (event.key === "Escape") { controller.select([]); finish(); }
          else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault(); event.stopImmediatePropagation(); controller.remove();
          } else if ((event.ctrlKey || event.metaKey) && ["c", "x"].includes(event.key.toLowerCase())) {
            view.focus();
          } else if (!event.ctrlKey && !event.metaKey && event.key.length === 1) controller.select([]);
        };
        const dropTarget = (event: DragEvent) => {
          const element = event.target instanceof Element ? event.target : null;
          if (!element || !view.dom.contains(element)) return null;
          const candidates = entries(view.state.doc).filter(entry => {
            const type = entry.node.type.name === "blockContainer" ? entry.node.firstChild?.type.name : entry.node.type.name;
            return !type || !layoutTypes.has(type);
          });
          const directId = element.closest("[data-id]")?.getAttribute("data-id");
          let entry = candidates.find(candidate => candidate.id === directId);
          if (!entry) {
            let closest = Infinity;
            for (const candidate of candidates) {
              const content = contentElement(view, candidate);
              if (!content?.getClientRects().length) continue;
              const rect = content.getBoundingClientRect();
              const distance = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right) +
                Math.abs(event.clientY - (rect.top + rect.bottom) / 2);
              if (distance < closest) { entry = candidate; closest = distance; }
            }
          }
          if (!entry) return null;
          const content = contentElement(view, entry)!;
          const rect = content.getBoundingClientRect();
          const placement = event.clientY < (rect.top + rect.bottom) / 2 ? "before" : "after";
          return { id: entry.id, placement, rect } as const;
        };
        const clearCue = () => { cue?.remove(); cue = null; };
        const dragover = (event: DragEvent) => {
          if (!controller.dragging) return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          const target = dropTarget(event);
          if (!target || controller.includes(target.id)) { clearCue(); return; }
          cue ??= owner.createElement("div");
          cue.className = "block-marquee-drop-cue";
          Object.assign(cue.style, { left: `${target.rect.left}px`, width: `${target.rect.right - target.rect.left}px`,
            top: `${target.placement === "before" ? target.rect.top : target.rect.bottom}px` });
          owner.body.append(cue);
        };
        const restoreFocus = () => {
          cancelAnimationFrame(focusFrame);
          focusFrame = requestAnimationFrame(() => {
            if (controller.getSnapshot().length) view.focus();
          });
        };
        const drop = (event: DragEvent) => {
          if (!controller.dragging) return;
          event.preventDefault(); event.stopImmediatePropagation();
          const target = dropTarget(event);
          if (target) moveMarqueeBlocks(editor, controller.getSnapshot(), target.id, target.placement);
          clearCue(); controller.endDrag();
          restoreFocus();
        };
        const dragend = () => {
          const wasDragging = controller.dragging;
          clearCue(); controller.endDrag();
          if (wasDragging) restoreFocus();
        };
        const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp,
          pointercancel: pointerUp, copy: clipboard, cut: clipboard, keydown, dragend };
        for (const [name, handler] of Object.entries(handlers)) owner.addEventListener(name, handler as EventListener, true);
        view.dom.addEventListener("dragover", dragover, true);
        view.dom.addEventListener("drop", drop, true);
        return {
          update() { controller.update(key.getState(view.state) ?? emptySelection); },
          destroy() {
            finish(); dragend(); controllers.delete(editor);
            cancelAnimationFrame(focusFrame);
            for (const [name, handler] of Object.entries(handlers)) owner.removeEventListener(name, handler as EventListener, true);
            view.dom.removeEventListener("dragover", dragover, true);
            view.dom.removeEventListener("drop", drop, true);
          },
        };
      },
    })],
  };
});
