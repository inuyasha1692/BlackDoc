import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const HeadingNumberExtension = createExtension(() => ({
  key: "blackdoc-heading-numbers",
  prosemirrorPlugins: [new Plugin({
    key: new PluginKey("blackdoc-heading-numbers"),
    props: {
      decorations(state) {
        const counters = Array<number>(7).fill(0);
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== "blockContainer") return;
          const heading = node.firstChild;
          if (heading?.type.name !== "heading") return;
          const level = Math.min(6, Math.max(1, Number(heading.attrs.level) || 1));
          if (level === 1) {
            counters.fill(0, 2);
            return;
          }
          counters[level] += 1;
          counters.fill(0, level + 1);
          const number = counters.slice(2, level + 1).join(".");
          decorations.push(Decoration.node(pos + 1, pos + 1 + heading.nodeSize, {
            "data-heading-number": number,
            style: `--blackdoc-heading-number: "${number} ";`,
          }));
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  })],
}));
