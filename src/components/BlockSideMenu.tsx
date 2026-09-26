import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  BlockColorsItem,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  type SideMenuProps,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { useCallback, useEffect, useRef } from "react";
import { Link2, Plus } from "lucide-react";
import { sideMenuHeadingPosition } from "../editor/sideMenuPosition";
import {
  BLOCK_LINK_COPIED_EVENT,
  BLOCK_LINK_COPY_FAILED_EVENT,
  createBlockLink,
} from "../editor/blockLinks";

export type PendingSlashBlockRef = {
  current: { id: string; committed: boolean } | null;
};

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

const BlackDocDragHandleMenu = () => (
  <DragHandleMenu>
    <CopyBlockLinkItem />
    <RemoveBlockItem>删除</RemoveBlockItem>
    <BlockColorsItem>颜色</BlockColorsItem>
    <TableRowHeaderItem>设为标题行</TableRowHeaderItem>
    <TableColumnHeaderItem>设为标题列</TableColumnHeaderItem>
  </DragHandleMenu>
);

export const BlackDocSideMenu = (props: SideMenuProps) => (
  <SideMenu {...props} dragHandleMenu={BlackDocDragHandleMenu} />
);

const AddBlockButton = ({
  pendingSlashBlockRef,
  runWithoutChangeTracking,
}: {
  pendingSlashBlockRef: PendingSlashBlockRef;
  runWithoutChangeTracking: (change: () => void) => void;
}) => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const suggestionMenu = useExtension(SuggestionMenu);
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: state => state?.block,
  });

  const onClick = useCallback(() => {
    if (!block) return;

    const isBlockEmpty = Array.isArray(block.content) && block.content.length === 0;
    if (isBlockEmpty) {
      editor.setTextCursorPosition(block);
    } else {
      let insertedBlockId = "";
      runWithoutChangeTracking(() => {
        const insertedBlock = editor.insertBlocks(
          [{ type: "paragraph" }],
          block,
          "after",
        )[0];
        insertedBlockId = insertedBlock.id;
        editor.setTextCursorPosition(insertedBlock);
      });
      pendingSlashBlockRef.current = { id: insertedBlockId, committed: false };
    }

    suggestionMenu.openSuggestionMenu("/");
  }, [block, editor, pendingSlashBlockRef, runWithoutChangeTracking, suggestionMenu]);

  if (!block) return null;

  return (
    <Components.SideMenu.Button
      className="bn-button"
      label="添加块"
      icon={<Plus aria-hidden="true" size={24} onClick={onClick} data-test="dragHandleAdd" />}
    />
  );
};

export const BlackDocSideMenuController = ({
  pendingSlashBlockRef,
  runWithoutChangeTracking,
}: {
  pendingSlashBlockRef: PendingSlashBlockRef;
  runWithoutChangeTracking: (change: () => void) => void;
}) => {
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { selector: state => state?.block });
  const suggestionMenuState = useExtensionState(SuggestionMenu, {
    selector: state => state ? {
      show: state.show,
      triggerCharacter: state.triggerCharacter,
    } : undefined,
  });
  const slashMenuWasOpenRef = useRef(false);

  useEffect(() => {
    const slashMenuIsOpen = Boolean(
      suggestionMenuState?.show && suggestionMenuState.triggerCharacter === "/",
    );

    if (slashMenuWasOpenRef.current && !slashMenuIsOpen) {
      const pending = pendingSlashBlockRef.current;
      pendingSlashBlockRef.current = null;

      if (pending && !pending.committed) {
        const placeholder = editor.getBlock(pending.id);
        if (
          placeholder?.type === "paragraph" &&
          Array.isArray(placeholder.content) &&
          placeholder.content.length === 0 &&
          placeholder.children.length === 0
        ) {
          runWithoutChangeTracking(() => editor.removeBlocks([pending.id]));
        }
      }
    }

    slashMenuWasOpenRef.current = slashMenuIsOpen;
  }, [editor, pendingSlashBlockRef, runWithoutChangeTracking, suggestionMenuState?.show, suggestionMenuState?.triggerCharacter]);

  const SideMenuWithAddBlock: typeof BlackDocSideMenu = useCallback(
    props => (
      <SideMenu {...props}>
        <AddBlockButton
          pendingSlashBlockRef={pendingSlashBlockRef}
          runWithoutChangeTracking={runWithoutChangeTracking}
        />
        <DragHandleButton dragHandleMenu={BlackDocDragHandleMenu} />
      </SideMenu>
    ),
    [pendingSlashBlockRef, runWithoutChangeTracking],
  );

  return (
    <SideMenuController
      sideMenu={SideMenuWithAddBlock}
      floatingUIOptions={block?.type === "heading"
        ? { useFloatingOptions: { middleware: [sideMenuHeadingPosition] } }
        : undefined}
    />
  );
};
