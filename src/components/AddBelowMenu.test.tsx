import { useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AddBelowMenu, type BlockCreationMenuProps } from "./AddBelowMenu";

const { insert } = vi.hoisted(() => ({ insert: vi.fn(() => true) }));
vi.mock("../editor/insertBlockBelow", () => ({ insertBlockBelowFromMenu: insert }));
vi.mock("@mantine/core", () => ({ Menu: { Sub: ({ children, onChange }: { children: ReactNode; onChange: (open: boolean) => void }) => {
  const [open, setOpen] = useState(false);
  return <div onMouseEnter={() => { if (!open) { setOpen(true); onChange(true); } }}>{children}</div>;
} } }));
vi.mock("@blocknote/react", () => ({
  useBlockNoteEditor: () => ({}),
  useComponentsContext: () => ({ Generic: { Menu: {
    Root: ({ children, onOpenChange }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => {
      const [open, setOpen] = useState(false);
      return <div onMouseEnter={() => { if (!open) { setOpen(true); onOpenChange(true); } }}>{children}</div>;
    },
    Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    Item: ({ children }: { children: ReactNode }) => <button>{children}</button>,
    Dropdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  } } }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const CreationMenu: BlockCreationMenuProps["blockCreationMenu"] = ({ items, onItemClick }) => <>
  {items.map(item => <button key={item.title} onClick={() => onItemClick?.(item)}>{item.title}</button>)}
</>;

it("only loads the slash items on hover and inserts after choosing an item", async () => {
  const item = { title: "图片", onItemClick: vi.fn() };
  const getItems = vi.fn(async () => [item]);
  const close = vi.fn();
  render(<AddBelowMenu blockId="target" getBlockCreationItems={getItems} blockCreationMenu={CreationMenu} onInserted={close} />);
  fireEvent.mouseEnter(screen.getByRole("button", { name: "在下方添加" }));
  await screen.findByRole("button", { name: "图片" });
  expect(getItems).toHaveBeenCalledWith("", "target");
  expect(insert).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "图片" }));
  expect(insert).toHaveBeenCalledWith(expect.anything(), "target", item.onItemClick);
  expect(close).toHaveBeenCalledOnce();
});

it("ignores an old async response after the target changes", async () => {
  let resolve!: (items: { title: string; onItemClick: () => void }[]) => void;
  const getItems = vi.fn(() => new Promise<{ title: string; onItemClick: () => void }[]>(done => { resolve = done; }));
  const view = render(<AddBelowMenu blockId="old" getBlockCreationItems={getItems} blockCreationMenu={CreationMenu} onInserted={() => {}} />);
  fireEvent.mouseEnter(screen.getByRole("button", { name: "在下方添加" }));
  view.rerender(<AddBelowMenu blockId="new" getBlockCreationItems={getItems} blockCreationMenu={CreationMenu} onInserted={() => {}} />);
  resolve([{ title: "旧选项", onItemClick() {} }]);
  await waitFor(() => expect(screen.queryByRole("button", { name: "旧选项" })).toBeNull());
});
