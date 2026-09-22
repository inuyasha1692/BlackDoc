import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  type SideMenuProps,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useComponentsContext,
  useExtensionState,
} from "@blocknote/react";
import { Link2 } from "lucide-react";
import {
  BLOCK_LINK_COPIED_EVENT,
  BLOCK_LINK_COPY_FAILED_EVENT,
  createBlockLink,
} from "../editor/blockLinks";

const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();

  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
};

const CopyBlockLinkItem = () => {
  const Components = useComponentsContext()!;
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });

  if (!block) {
    return null;
  }

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<Link2 aria-hidden="true" size={16} />}
      onClick={() => {
        void copyText(createBlockLink(block.id))
          .then(() => window.dispatchEvent(new Event(BLOCK_LINK_COPIED_EVENT)))
          .catch(() =>
            window.dispatchEvent(new Event(BLOCK_LINK_COPY_FAILED_EVENT)),
          );
      }}
    >
      复制块链接
    </Components.Generic.Menu.Item>
  );
};

const BlockDocDragHandleMenu = () => (
  <DragHandleMenu>
    <CopyBlockLinkItem />
    <RemoveBlockItem>删除</RemoveBlockItem>
    <BlockColorsItem>颜色</BlockColorsItem>
    <TableRowHeaderItem>设为标题行</TableRowHeaderItem>
    <TableColumnHeaderItem>设为标题列</TableColumnHeaderItem>
  </DragHandleMenu>
);

export const BlockDocSideMenu = (props: SideMenuProps) => (
  <SideMenu {...props} dragHandleMenu={BlockDocDragHandleMenu} />
);
