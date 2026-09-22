import {
  DeleteLinkButton,
  LinkToolbar,
  OpenLinkButton,
  type LinkToolbarProps,
} from "@blocknote/react";
import { isBlockLink } from "../editor/blockLinks";
import { BlockDocEditLinkButton } from "./BlockLinkControls";

export const BlockDocLinkToolbar = (props: LinkToolbarProps) => (
  <LinkToolbar {...props}>
    <BlockDocEditLinkButton
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
  </LinkToolbar>
);
