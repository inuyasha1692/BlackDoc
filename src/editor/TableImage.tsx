import { createReactInlineContentSpec } from "@blocknote/react";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const tableImageConfig = {
  type: "tableImage",
  propSchema: {
    url: { default: "" },
    name: { default: "" },
    previewWidth: { default: 0 },
  },
  content: "none",
} as const;

const TableImageContent = ({ inlineContent, editor, getPos }: {
  inlineContent: { props: { url: string; name: string; previewWidth: number } };
  editor: { prosemirrorView: EditorView };
  getPos: () => number | undefined;
}) => <img
  src={inlineContent.props.url}
  alt={inlineContent.props.name}
  onMouseDown={event => {
    const pos = getPos();
    if (pos === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const view = editor.prosemirrorView;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }}
  style={{
    display: "inline-block",
    maxWidth: "100%",
    width: inlineContent.props.previewWidth > 0 ? `${inlineContent.props.previewWidth}px` : undefined,
    height: "auto",
    verticalAlign: "middle",
  }}
/>;

export const TableImage = () => createReactInlineContentSpec(
  tableImageConfig,
  {
    render: TableImageContent,
    toExternalHTML: TableImageContent,
  },
);
