import { createReactBlockSpec } from "@blocknote/react";
import { closeHistory } from "@tiptap/pm/history";
import { SplitPaneControls } from "./SplitPaneView";

export const SplitPaneBlock = createReactBlockSpec(
  {
    type: "splitPane",
    propSchema: { leftWidth: { default: 50 }, rightHeight: { default: 400 } },
    content: "none",
  },
  {
    render: ({ block, editor }) => <SplitPaneControls
      id={block.id}
      leftWidth={block.props.leftWidth} rightHeight={block.props.rightHeight}
      editable={editor.isEditable}
      onChange={props => {
        if (Object.entries(props).every(([key, value]) =>
          block.props[key as keyof typeof block.props] === value)) return;
        editor._tiptapEditor.view.dispatch(closeHistory(editor._tiptapEditor.state.tr));
        editor.updateBlock(block, { props });
        editor._tiptapEditor.view.dispatch(closeHistory(editor._tiptapEditor.state.tr));
      }}
      onDelete={() => editor.removeBlocks([block])}
    />,
    toExternalHTML: () => <div data-split-pane="" />,
  },
);

export const SplitColumnBlock = createReactBlockSpec(
  {
    type: "splitColumn",
    propSchema: { side: { default: "left", values: ["left", "right"] as const } },
    content: "none",
  },
  {
    render: () => <span aria-hidden="true" />,
    toExternalHTML: ({ block }) => <div data-split-column={block.props.side} />,
  },
);
