import { createReactInlineContentSpec } from "@blocknote/react";

const tableImageConfig = {
  type: "tableImage",
  propSchema: {
    url: { default: "" },
    name: { default: "" },
    previewWidth: { default: 0 },
  },
  content: "none",
} as const;

const TableImageContent = ({ inlineContent }: {
  inlineContent: { props: { url: string; name: string; previewWidth: number } };
}) => <img
  src={inlineContent.props.url}
  alt={inlineContent.props.name}
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
