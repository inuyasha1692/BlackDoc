import { BlockNoteSchema, createExtension, defaultBlockSpecs } from "@blocknote/core";
import { createReactDiagramBlockSpec } from "@blocknote/diagram-block";
import { createReactInlineMathSpec, createReactMathBlockSpec } from "@blocknote/math-block";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { withMultiColumn } from "@blocknote/xl-multi-column";
import { CanvasBlock } from "../canvas/CanvasBlock";
import { SplitColumnBlock, SplitPaneBlock } from "./SplitPaneBlock";
import { TableImage } from "./TableImage";
import { TableImageAlignmentExtension } from "./tableImageAlignment";
import { transactionTouchesNodeTypes } from "./transactionTouchesNodeTypes";
import { renderSectionHeading } from "./headingSections";

const numberedListItemType = new Set(["numberedListItem"]);

function skipUnrelatedNumberedListUpdates(plugin: Plugin): Plugin {
  const stateField = plugin.spec.state;
  const key = plugin.spec.key as PluginKey | undefined;
  if (!stateField?.apply || !key) return plugin;

  return new Plugin({
    key,
    state: {
      init: (config, state) => stateField.init!.call(plugin, config, state),
      apply(transaction, previous, oldState, newState) {
        if (!transaction.docChanged) return previous;
        if (!transactionTouchesNodeTypes(transaction, numberedListItemType)) {
          return {
            ...previous,
            decorations: previous.decorations.map(transaction.mapping, transaction.doc),
          };
        }
        return stateField.apply!.call(plugin, transaction, previous, oldState, newState);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

function numberedListItemBlockSpec() {
  const spec = defaultBlockSpecs.numberedListItem;
  return {
    ...spec,
    extensions: spec.extensions?.map(factory => {
      return createExtension(({ editor }) => {
        const extension = typeof factory === "function"
          ? factory({ editor })
          : factory;
        if (extension.key !== "numbered-list-item-shortcuts") return extension;
        return {
          ...extension,
          prosemirrorPlugins: extension.prosemirrorPlugins?.map(
            skipUnrelatedNumberedListUpdates,
          ),
        };
      })();
    }),
  } as typeof spec;
}

function headingBlockSpec() {
  const spec = defaultBlockSpecs.heading;
  return {
    ...spec,
    implementation: { ...spec.implementation, render: renderSectionHeading },
    config: {
      ...spec.config,
      propSchema: {
        ...spec.config.propSchema,
        isToggleable: { default: true, optional: true },
      },
    },
    extensions: spec.extensions?.map(factory => {
      return createExtension(({ editor }) => {
        const extension = typeof factory === "function"
          ? factory({ editor })
          : factory;
        if (extension.key !== "heading-shortcuts") return extension;

        const keyboardShortcuts: NonNullable<typeof extension.keyboardShortcuts> = {};
        keyboardShortcuts["Mod-0"] = ({ editor }) => {
          const { block } = editor.getTextCursorPosition();
          if (editor.schema.blockSchema[block.type].content !== "inline") return false;
          editor.updateBlock(block, { type: "paragraph" });
          return true;
        };
        for (const level of [1, 2, 3, 4, 5, 6]) {
          keyboardShortcuts[`Mod-${level}`] = ({ editor }) => {
            const cursorPosition = editor.getTextCursorPosition();
            if (
              editor.schema.blockSchema[cursorPosition.block.type].content !== "inline"
            ) {
              return false;
            }

            editor.updateBlock(cursorPosition.block, {
              type: "heading",
              props: { level, isToggleable: true },
            });
            return true;
          };
        }
        return { ...extension, keyboardShortcuts };
      })();
    }),
  } as unknown as typeof spec;
}

export const blackDocSchema = withMultiColumn(BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    table: {
      ...defaultBlockSpecs.table,
      extensions: [...(defaultBlockSpecs.table.extensions ?? []), TableImageAlignmentExtension],
    },
    heading: headingBlockSpec(),
    numberedListItem: numberedListItemBlockSpec(),
    canvas: CanvasBlock(),
    splitPane: SplitPaneBlock(),
    splitColumn: SplitColumnBlock(),
  },
}).extend({
  blockSpecs: {
    diagram: createReactDiagramBlockSpec(),
    mathBlock: createReactMathBlockSpec(),
  },
  inlineContentSpecs: {
    math: createReactInlineMathSpec(),
    tableImage: TableImage(),
  },
}));

export type BlackDocBlock = typeof blackDocSchema.Block;
export type BlackDocPartialBlock = typeof blackDocSchema.PartialBlock;
export type BlackDocEditor = typeof blackDocSchema.BlockNoteEditor;
