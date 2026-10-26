import {
  DeleteLinkButton,
  LinkToolbar,
  OpenLinkButton,
  type LinkToolbarProps,
} from "@blocknote/react";
import { isBlockLink } from "../editor/blockLinks";
import { BlackDocEditLinkButton } from "./BlockLinkControls";

export const BlackDocLinkToolbar = (props: LinkToolbarProps) => (
  <LinkToolbar {...props}>
    <BlackDocEditLinkButton
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
      setToolbarPositionFrozen={props.setToolbarPositionFrozen}
      text={props.text}
      url={props.url}
    />
    {!isBlockLink(props.url) && <OpenLinkButton url={props.url} />}
    <DeleteLinkButton
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
    />
    <span className="block-link-toolbar-hint">
      Ctrl＋单击打开链接，直接单击编辑文字
    </span>
  </LinkToolbar>
);
