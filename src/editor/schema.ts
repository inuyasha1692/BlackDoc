import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactDiagramBlockSpec } from "@blocknote/diagram-block";
import { createReactInlineMathSpec, createReactMathBlockSpec } from "@blocknote/math-block";
import { withMultiColumn } from "@blocknote/xl-multi-column";
import { CanvasBlock } from "../canvas/CanvasBlock";
import { SplitColumnBlock, SplitPaneBlock } from "./SplitPaneBlock";

export const blackDocSchema = withMultiColumn(BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
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
  },
}));

export type BlackDocBlock = typeof blackDocSchema.Block;
export type BlackDocPartialBlock = typeof blackDocSchema.PartialBlock;
export type BlackDocEditor = typeof blackDocSchema.BlockNoteEditor;
