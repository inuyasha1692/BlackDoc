import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import { Menu as MantineMenu } from "@mantine/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
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
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AudioLines,
  Braces,
  ChevronDown,
  Copy,
  FileText,
  Film,
  GripVertical,
  Image,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PenTool,
  Plus,
  Quote,
  Scissors,
  Square,
  Table2,
  Trash2,
  Type,
  Workflow,
} from "lucide-react";
import { sideMenuHeadingPosition } from "../editor/sideMenuPosition";
import {
  BLOCK_LINK_COPIED_EVENT,
  BLOCK_LINK_COPY_FAILED_EVENT,
  createBlockLink,
} from "../editor/blockLinks";
import { BlockColorsMenuItem } from "./BlockColorsMenuItem";

export type PendingSlashBlockRef = {
  current: {
    anchorRect?: DOMRect;
    anchorElement?: Element;
    hoverTriggered?: boolean;
  } | null;
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

const isEmptyTextBlock = (block: any): boolean =>
  Array.isArray(block?.content) &&
  block.content.length === 0 &&
  block.children.length === 0;

const convertibleBlockTypes = new Set([
  "paragraph",
  "heading",
  "numberedListItem",
  "bulletListItem",
  "checkListItem",
  "quote",
  "codeBlock",
]);

type BlockConversion = {
  title: string;
  type: string;
  level?: number;
  icon: ReactNode;
};

const blockConversions: BlockConversion[] = [
  { title: "段落", type: "paragraph", icon: <Type size={18} /> },
  ...[1, 2, 3, 4, 5, 6].map(level => ({
    title: `H${level}`,
    type: "heading",
    level,
    icon: <span className="blackdoc-block-type-heading">H{level}</span>,
  })),
  { title: "有序列表", type: "numberedListItem", icon: <ListOrdered size={18} /> },
  { title: "无序列表", type: "bulletListItem", icon: <List size={18} /> },
  { title: "检查清单", type: "checkListItem", icon: <ListChecks size={18} /> },
  { title: "引用", type: "quote", icon: <Quote size={18} /> },
  { title: "代码块", type: "codeBlock", icon: <Braces size={18} /> },
];

const isConvertibleTextBlock = (editor: any, block: any): boolean => {
  if (!convertibleBlockTypes.has(block?.type)) return false;
  const contentType = editor.schema.blockSchema[block.type]?.content;
  return contentType === "inline" || contentType === "plain";
};

const selectBlockForClipboard = (editor: any, blockId: string): boolean => {
  const view = editor.prosemirrorView;
  let blockPosition: number | undefined;
  view.state.doc.descendants((node: any, position: number) => {
    if (node.attrs?.id === blockId) {
      blockPosition = position;
      return false;
    }
    return true;
  });

  if (blockPosition === undefined) return false;
  const node = view.state.doc.nodeAt(blockPosition);
  if (!node || !NodeSelection.isSelectable(node)) return false;

  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPosition)),
  );
  view.focus();
  return document.execCommand("copy");
};

const blockTypeLabel = (block: any): string => {
  if (block.type === "heading") return `标题 H${block.props.level}`;
  const labels: Record<string, string> = {
    paragraph: "正文段落",
    bulletListItem: "无序列表",
    numberedListItem: "有序列表",
    checkListItem: "检查清单",
    toggleListItem: "可折叠列表",
    quote: "引用",
    codeBlock: "代码块",
    table: "表格",
    image: "图片",
    video: "视频",
    audio: "音频",
    file: "文件",
    divider: "分隔线",
    canvas: "画布",
    diagram: "图表",
    mathBlock: "块级公式",
    splitPane: "双分区",
  };
  return labels[block.type] ?? "内容块";
};

const blockTypeIcon = (block: any) => {
  if (block.type === "heading") {
    return <span className="blackdoc-block-type-heading">H{block.props.level}</span>;
  }

  const icons: Record<string, ReactNode> = {
    paragraph: <Type size={16} />,
    bulletListItem: <List size={16} />,
    numberedListItem: <ListOrdered size={16} />,
    checkListItem: <ListChecks size={16} />,
    toggleListItem: <ListChecks size={16} />,
    quote: <Quote size={16} />,
    codeBlock: <Braces size={16} />,
    table: <Table2 size={16} />,
    image: <Image size={16} />,
    video: <Film size={16} />,
    audio: <AudioLines size={16} />,
    file: <FileText size={16} />,
    divider: <Minus size={16} />,
    canvas: <PenTool size={16} />,
    diagram: <Workflow size={16} />,
    mathBlock: <span className="blackdoc-block-type-heading">ƒx</span>,
    splitPane: <Square size={16} />,
  };
  return icons[block.type] ?? <Square size={16} />;
};

const BlockTypeAndHandleButton = () => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    selector: state => state?.block,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  if (!block) return null;

  const canConvert = isConvertibleTextBlock(editor, block);
  const setBlockType = (conversion: BlockConversion) => {
    try {
      const currentBlock = editor.getBlock(block.id);
      if (currentBlock && isConvertibleTextBlock(editor, currentBlock)) {
        const updatedBlock = editor.updateBlock(currentBlock, {
          type: conversion.type,
          ...(conversion.level
            ? { props: { level: conversion.level, isToggleable: true } }
            : {}),
        } as any);
        editor.setTextCursorPosition(updatedBlock, "end");
      }
    } catch {
      // The hovered block may have been removed before the conversion was selected.
    }
    setMenuOpen(false);
  };

  const copyBlock = () => {
    selectBlockForClipboard(editor, block.id);
  };
  const cutBlock = () => {
    if (!selectBlockForClipboard(editor, block.id)) return;
    try {
      editor.removeBlocks([block.id]);
    } catch {
      // Keep the block if it disappeared after the copy operation.
    }
  };
  const deleteBlock = () => {
    try {
      editor.removeBlocks([block.id]);
    } catch {
      // The block may have been removed by another editor action.
    }
  };

  return (
    <MantineMenu
      closeDelay={250}
      middlewares={{ flip: true, shift: true, inline: false, size: true }}
      opened={menuOpen}
      onChange={open => {
        setMenuOpen(open);
        if (open) sideMenu.freezeMenu();
        else sideMenu.unfreezeMenu();
      }}
      openDelay={100}
      position="left"
      returnFocus={false}
      trigger="click-hover"
      withinPortal={false}
    >
      <Components.Generic.Menu.Trigger>
        <Components.SideMenu.Button
          label={`${blockTypeLabel(block)}，拖动手柄和块菜单`}
          draggable
          onDragStart={event => sideMenu.blockDragStart(event, block)}
          onDragEnd={sideMenu.blockDragEnd}
          className="bn-button blackdoc-block-control-trigger"
        >
          <span className="blackdoc-block-type-badge">{blockTypeIcon(block)}</span>
          <span aria-hidden="true" className="blackdoc-block-control-separator" />
          <GripVertical aria-hidden="true" size={15} data-test="dragHandle" />
          <ChevronDown aria-hidden="true" size={12} />
        </Components.SideMenu.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu blackdoc-block-control-menu">
        {canConvert && (
          <>
            <Components.Generic.Menu.Label>转换块类型</Components.Generic.Menu.Label>
            <div className="slash-menu-icon-grid blackdoc-block-conversion-grid">
              {blockConversions.map(conversion => {
                const isCurrent = block.type === conversion.type &&
                  (conversion.type !== "heading" || block.props.level === conversion.level);
                return (
                  <button
                    aria-label={conversion.title}
                    aria-pressed={isCurrent}
                    className={`slash-menu-icon${isCurrent ? " is-current-block" : ""}`}
                    key={conversion.title}
                    onClick={() => setBlockType(conversion)}
                    onMouseDown={event => event.preventDefault()}
                    title={conversion.title}
                    type="button"
                  >
                    {conversion.icon}
                  </button>
                );
              })}
            </div>
            <Components.Generic.Menu.Divider />
          </>
        )}
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Copy aria-hidden="true" size={16} />}
          onClick={copyBlock}
        >
          复制
        </Components.Generic.Menu.Item>
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Scissors aria-hidden="true" size={16} />}
          onClick={cutBlock}
        >
          剪切
        </Components.Generic.Menu.Item>
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Trash2 aria-hidden="true" size={16} />}
          onClick={deleteBlock}
        >
          删除
        </Components.Generic.Menu.Item>
        {canConvert && (
          <>
            <Components.Generic.Menu.Divider />
            <CopyBlockLinkItem />
            <BlockColorsMenuItem onColorApplied={() => setMenuOpen(false)} />
            <TableRowHeaderItem>设为标题行</TableRowHeaderItem>
            <TableColumnHeaderItem>设为标题列</TableColumnHeaderItem>
          </>
        )}
      </Components.Generic.Menu.Dropdown>
    </MantineMenu>
  );
};

const AddBlockButton = ({
  pendingSlashBlockRef,
  updateSlashMenuPlacement,
}: {
  pendingSlashBlockRef: PendingSlashBlockRef;
  updateSlashMenuPlacement: () => void;
}) => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const suggestionMenu = useExtension(SuggestionMenu);
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: state => state?.block,
  });

  const openSlashMenu = useCallback((
    event: MouseEvent<Element>,
    hoverTriggered: boolean,
  ) => {
    if (!block || !isEmptyTextBlock(block)) return;

    const anchorElement = event.currentTarget.closest("button") ?? event.currentTarget;
    if (pendingSlashBlockRef.current?.anchorElement === anchorElement) return;
    sideMenu.freezeMenu();
    const buttonRect = anchorElement.getBoundingClientRect();
    const anchorRect = new DOMRect(
      buttonRect.x,
      buttonRect.y,
      buttonRect.width,
      buttonRect.height,
    );
    editor.setTextCursorPosition(block);

    pendingSlashBlockRef.current = {
      anchorRect,
      anchorElement,
      hoverTriggered,
    };
    updateSlashMenuPlacement();
    suggestionMenu.openSuggestionMenu("/");
  }, [block, editor, pendingSlashBlockRef, sideMenu, suggestionMenu, updateSlashMenuPlacement]);

  const onClick = useCallback(
    (event: MouseEvent<Element>) => openSlashMenu(event, false),
    [openSlashMenu],
  );
  const onMouseEnter = useCallback(
    (event: MouseEvent<Element>) => openSlashMenu(event, true),
    [openSlashMenu],
  );

  if (!isEmptyTextBlock(block)) return null;

  return (
    <Components.SideMenu.Button
      className="bn-button blackdoc-add-block-trigger"
      label="添加块"
      icon={<Plus aria-hidden="true" size={24} onClick={onClick} onMouseEnter={onMouseEnter} data-test="dragHandleAdd" />}
    />
  );
};


export const BlackDocSideMenuController = ({
  pendingSlashBlockRef,
  updateSlashMenuPlacement,
}: {
  pendingSlashBlockRef: PendingSlashBlockRef;
  updateSlashMenuPlacement: () => void;
}) => {
  const suggestionMenu = useExtension(SuggestionMenu);
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, { selector: state => state?.block });
  const suggestionMenuState = useExtensionState(SuggestionMenu, {
    selector: state => state ? {
      show: state.show,
      triggerCharacter: state.triggerCharacter,
    } : undefined,
  });
  const slashMenuWasOpenRef = useRef(false);

  useEffect(() => {
    const pending = pendingSlashBlockRef.current;
    if (
      !pending?.hoverTriggered ||
      !suggestionMenuState?.show ||
      suggestionMenuState.triggerCharacter !== "/"
    ) {
      return;
    }

    let closeTimeout: number | undefined;
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".blackdoc-add-block-trigger, .blackdoc-slash-menu")) {
        window.clearTimeout(closeTimeout);
        closeTimeout = undefined;
        return;
      }

      if (closeTimeout === undefined) {
        closeTimeout = window.setTimeout(() => {
          closeTimeout = undefined;
          const hoveredMenu = document.querySelector(
            ".blackdoc-add-block-trigger:hover, .blackdoc-slash-menu:hover",
          );
          if (!hoveredMenu && pendingSlashBlockRef.current === pending) {
            suggestionMenu.closeMenu();
          }
        }, 300);
      }
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    return () => {
      window.clearTimeout(closeTimeout);
      document.removeEventListener("pointermove", handlePointerMove, true);
    };
  }, [pendingSlashBlockRef, suggestionMenu, suggestionMenuState?.show, suggestionMenuState?.triggerCharacter]);

  useEffect(() => {
    const slashMenuIsOpen = Boolean(
      suggestionMenuState?.show &&
      (suggestionMenuState.triggerCharacter === "/" ||
        suggestionMenuState.triggerCharacter === "、"),
    );

    if (!slashMenuWasOpenRef.current && slashMenuIsOpen && block) {
      sideMenu.freezeMenu();
    }

    if (slashMenuWasOpenRef.current && !slashMenuIsOpen) {
      if (sideMenu.menuFrozen) {
        sideMenu.unfreezeMenu();
      }
      pendingSlashBlockRef.current = null;
    }

    slashMenuWasOpenRef.current = slashMenuIsOpen;
  }, [block, pendingSlashBlockRef, sideMenu, suggestionMenuState?.show, suggestionMenuState?.triggerCharacter]);

  const SideMenuWithAddBlock = useCallback(
    (props: SideMenuProps) => (
      <SideMenu {...props}>
        {isEmptyTextBlock(block) ? (
          <AddBlockButton
            pendingSlashBlockRef={pendingSlashBlockRef}
            updateSlashMenuPlacement={updateSlashMenuPlacement}
          />
        ) : (
          <BlockTypeAndHandleButton />
        )}
      </SideMenu>
    ),
    [block, pendingSlashBlockRef, updateSlashMenuPlacement],
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
