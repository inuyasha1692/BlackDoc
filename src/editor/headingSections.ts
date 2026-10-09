import { createExtension } from "@blocknote/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView, type ViewMutationRecord } from "@tiptap/pm/view";
import { transactionTouchesNodeTypes } from "./transactionTouchesNodeTypes";

export const REVEAL_HEADING_SECTION = "blackdoc:reveal-heading-section";
export const RESET_DOCUMENT_FOLDS_META = "blackdoc-reset-document-folds";
export const HEADING_FOLDS_CHANGED = "blackdoc:heading-folds-changed";
const structureTypes = new Set(["heading", "blockContainer", "column"]);
export const isHeadingSectionExpanded = (id: string) => localStorage.getItem(`toggle-${id}`) !== "false";
const expanded = isHeadingSectionExpanded;

function expandDocumentFolds(doc: PMNode) {
  doc.descendants(node => {
    if (node.type.name === "blockContainer" &&
      (node.firstChild?.type.name === "heading" || node.firstChild?.type.name === "toggleListItem")) {
      localStorage.setItem(`toggle-${node.attrs.id}`, "true");
    }
  });
}

function selectedBlockId(selection: Selection): string | null {
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    const node = selection.$from.node(depth);
    if (node.type.name === "blockContainer") return node.attrs.id;
  }
  return null;
}

export function renderSectionHeading(block: { id: string; props: { level: number; isToggleable?: boolean } }) {
  const title = document.createElement(`h${block.props.level}`);
  title.className = "bn-inline-content";
  const addAttributes = (element: HTMLElement) => {
    element.classList.add("bn-block-content");
    element.setAttribute("data-content-type", "heading");
    for (const [prop, value] of Object.entries(block.props)) {
      element.setAttribute(`data-${prop.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, String(value));
    }
  };
  if (!block.props.isToggleable) {
    addAttributes(title);
    return { dom: title, contentDOM: title };
  }
  const dom = document.createElement("div");
  addAttributes(dom);
  const wrapper = document.createElement("div");
  wrapper.className = "bn-toggle-wrapper";
  wrapper.setAttribute("data-show-children", String(expanded(block.id)));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bn-toggle-button";
  button.setAttribute("aria-label", "折叠标题");
  button.setAttribute("aria-expanded", String(expanded(block.id)));
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>';
  const preventFocus = (event: MouseEvent) => event.preventDefault();
  button.addEventListener("mousedown", preventFocus);
  wrapper.append(button, title);
  dom.append(wrapper);
  return {
    dom, contentDOM: title,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.type === "attributes" &&
      ((mutation.target === wrapper && mutation.attributeName === "data-show-children") || mutation.target === button),
    destroy: () => button.removeEventListener("mousedown", preventFocus),
  };
}

function sections(doc: PMNode) {
  const owners = new Map<string, string[]>();
  const toggleableHeadings = new Set<string>();
  const decorations: Decoration[] = [];
  function visit(parent: PMNode, pos: number, inherited: string[]) {
    const headings: { id: string; level: number }[] = [];
    parent.forEach((node, offset) => {
      const nodePos = pos + offset;
      let scope = [...inherited, ...headings.map(heading => heading.id)];
      if (node.type.name === "blockContainer") {
        const heading = node.firstChild?.type.name === "heading" ? node.firstChild : null;
        const id = node.attrs.id as string;
        if (heading) {
          if (heading.attrs.isToggleable !== false) toggleableHeadings.add(id);
          const level = Number(heading.attrs.level);
          while (headings.length && headings.at(-1)!.level >= level) headings.pop();
          scope = [...inherited, ...headings.map(item => item.id)];
          headings.push({ id, level });
        }
        owners.set(id, scope);
        if (scope.some(owner => !expanded(owner))) {
          decorations.push(Decoration.node(nodePos, nodePos + node.nodeSize, { class: "heading-section-hidden" }));
        }
        if (heading) scope = [...scope, id];
      }
      visit(node, nodePos + 1, scope);
    });
  }
  visit(doc, 0, []);
  return { owners, toggleableHeadings, decorations: DecorationSet.create(doc, decorations) };
}

const key = new PluginKey<ReturnType<typeof sections> & { revision: number }>("heading-sections");

export function getHeadingFoldState(view: EditorView) {
  const state = key.getState(view.state);
  return {
    owners: state?.owners ?? new Map<string, string[]>(),
    expanded: new Map(Array.from(state?.toggleableHeadings ?? [], id => [id, expanded(id)] as const)),
  };
}

export function setHeadingSectionExpanded(view: EditorView, id: string, open: boolean) {
  if (!key.getState(view.state)?.toggleableHeadings.has(id)) return;
  localStorage.setItem(`toggle-${id}`, String(open));
  const tr = view.state.tr.setMeta(key, true);
  const selected = selectedBlockId(view.state.selection);
  if (!open && selected && key.getState(view.state)?.owners.get(selected)?.includes(id)) {
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === "blockContainer" && node.attrs.id === id) {
        tr.setSelection(TextSelection.create(tr.doc, pos + node.firstChild!.nodeSize));
        return false;
      }
    });
  }
  view.dispatch(tr);
}

export const HeadingSectionsExtension = createExtension(() => {
  function syncButtons(view: EditorView) {
    for (const wrapper of view.dom.querySelectorAll<HTMLElement>(':is([data-content-type="heading"], [data-content-type="toggleListItem"]) .bn-toggle-wrapper')) {
      const id = wrapper.closest("[data-id]")?.getAttribute("data-id");
      if (!id) continue;
      wrapper.setAttribute("data-show-children", String(expanded(id)));
      if (!wrapper.closest('[data-content-type="heading"]')) continue;
      const button = wrapper.querySelector(".bn-toggle-button");
      button?.setAttribute("aria-expanded", String(expanded(id)));
      button?.setAttribute("aria-label", expanded(id) ? "折叠标题" : "展开标题");
    }
    view.dom.dispatchEvent(new CustomEvent(HEADING_FOLDS_CHANGED, { bubbles: true }));
  }
  function toggleHeading(view: EditorView, event: MouseEvent) {
    const button = event.target instanceof Element ? event.target.closest(".bn-toggle-button") : null;
    const wrapper = button?.closest(".bn-toggle-wrapper");
    if (!wrapper?.closest('[data-content-type="heading"]')) return false;
    const id = wrapper.closest("[data-id]")?.getAttribute("data-id");
    if (!id) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    setHeadingSectionExpanded(view, id, !expanded(id));
    return true;
  }
  return {
    key: "heading-sections",
    prosemirrorPlugins: [new Plugin({
      key,
      state: {
        init: (_config, state) => {
          expandDocumentFolds(state.doc);
          return { ...sections(state.doc), revision: 0 };
        },
        apply(tr, previous, _oldState, newState) {
          const openingDocument = tr.getMeta(RESET_DOCUMENT_FOLDS_META);
          if (openingDocument) expandDocumentFolds(tr.doc);
          let next = previous;
          if (openingDocument || tr.getMeta(key) || (tr.docChanged && transactionTouchesNodeTypes(tr, structureTypes, false))) {
            next = { ...sections(tr.doc), revision: previous.revision + 1 };
          } else if (tr.docChanged) {
            next = { ...previous, decorations: previous.decorations.map(tr.mapping, tr.doc) };
          }
          if (tr.docChanged) {
            const id = selectedBlockId(newState.selection);
            const folded = (id ? next.owners.get(id) ?? [] : []).filter(owner => !expanded(owner));
            if (folded.length) {
              for (const owner of folded) localStorage.setItem(`toggle-${owner}`, "true");
              next = { ...sections(tr.doc), revision: previous.revision + 1 };
            }
          }
          return next;
        },
      },
      props: {
        decorations: state => key.getState(state)?.decorations,
        handleDOMEvents: {
          click: toggleHeading,
        },
      },
      view: view => {
        const onReveal = (event: Event) => {
          const id = (event as CustomEvent<string>).detail;
          const owners = key.getState(view.state)?.owners.get(id);
          if (!owners) return;
          for (const owner of owners) localStorage.setItem(`toggle-${owner}`, "true");
          view.dispatch(view.state.tr.setMeta(key, true));
        };
        const onClick = (event: MouseEvent) => { toggleHeading(view, event); };
        view.dom.addEventListener("click", onClick, true);
        view.dom.addEventListener(REVEAL_HEADING_SECTION, onReveal);
        syncButtons(view);
        return {
          update: (nextView, oldState) => {
            if (key.getState(nextView.state)?.revision !== key.getState(oldState)?.revision) syncButtons(nextView);
          },
          destroy: () => {
            view.dom.removeEventListener("click", onClick, true);
            view.dom.removeEventListener(REVEAL_HEADING_SECTION, onReveal);
          },
        };
      },
    })],
  };
});
