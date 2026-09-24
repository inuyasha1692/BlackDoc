import { createReactBlockSpec } from "@blocknote/react";
import { CanvasPreview } from "./CanvasPreview";

export const CanvasBlock = createReactBlockSpec(
  { type: "canvas", propSchema: { scene: { default: "" }, previewWidth: { default: 0 }, textAlignment: { default: "left", values: ["left", "center", "right"] as const } }, content: "none" },
  {
    render: ({ block, editor }) => <CanvasPreview
      source={block.props.scene}
      id={block.id}
      previewWidth={block.props.previewWidth}
      editable={editor.isEditable}
      alignment={block.props.textAlignment}
      onAlign={textAlignment => editor.updateBlock(block, { props: { textAlignment } })}
      onResize={previewWidth => editor.updateBlock(block, { props: { previewWidth } })}
    />,
    toExternalHTML: ({ block }) => <figure data-canvas-id={block.id} />,
  },
);
