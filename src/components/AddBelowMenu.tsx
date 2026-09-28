import { useBlockNoteEditor, useComponentsContext, type DefaultReactSuggestionItem, type SuggestionMenuProps } from "@blocknote/react";
import { Plus } from "lucide-react";
import { Menu as MantineMenu } from "@mantine/core";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { insertBlockBelowFromMenu } from "../editor/insertBlockBelow";
import { creationMenuMiddlewares, creationMenuViewportPadding } from "../editor/creationMenuPosition";

export type BlockCreationItem = DefaultReactSuggestionItem & { iconOnly?: boolean };
export type BlockCreationMenuProps = {
  getBlockCreationItems: (query: string, blockId?: string) => Promise<BlockCreationItem[]>;
  blockCreationMenu: ComponentType<SuggestionMenuProps<BlockCreationItem>>;
};

export function AddBelowMenu({ blockId, onInserted, getBlockCreationItems, blockCreationMenu: CreationMenu }: BlockCreationMenuProps & {
  blockId: string;
  onInserted: () => void;
}) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const [items, setItems] = useState<BlockCreationItem[]>([]);
  const [loadingState, setLoadingState] = useState<"loading-initial" | "loaded">("loading-initial");
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [viewportPadding, setViewportPadding] = useState({ top: 12, right: 12, bottom: 12, left: 12 });
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, [blockId]);
  const select = (item: BlockCreationItem) => {
    if (insertBlockBelowFromMenu(editor, blockId, item.onItemClick)) onInserted();
  };
  return <MantineMenu.Sub position="right-start" floatingStrategy="fixed" width={240}
    middlewares={creationMenuMiddlewares(viewportPadding)} onChange={open => {
    const id = ++request.current;
    if (!open) return;
    setViewportPadding(creationMenuViewportPadding());
    setLoadingState("loading-initial");
    setItems([]);
    setSelectedIndex(undefined);
    void getBlockCreationItems("", blockId).then(result => {
      if (id !== request.current) return;
      setItems(result);
      setLoadingState("loaded");
    }).catch(() => {
      if (id === request.current) setLoadingState("loaded");
    });
  }}>
    <Components.Generic.Menu.Trigger sub>
      <Components.Generic.Menu.Item className="bn-menu-item" subTrigger icon={<Plus size={16} aria-hidden="true" />}>
        在下方添加
      </Components.Generic.Menu.Item>
    </Components.Generic.Menu.Trigger>
    <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown blackdoc-add-below-menu">
      <div onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          if (items.length) setSelectedIndex(index => index === undefined
            ? (event.key === "ArrowDown" ? 0 : items.length - 1)
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
        } else if (event.key === "Enter" && selectedIndex !== undefined && items[selectedIndex]) {
          event.preventDefault();
          event.stopPropagation();
          select(items[selectedIndex]);
        }
      }}>
        <CreationMenu items={items} loadingState={loadingState} selectedIndex={selectedIndex} onItemClick={select} />
      </div>
    </Components.Generic.Menu.Dropdown>
  </MantineMenu.Sub>;
}
