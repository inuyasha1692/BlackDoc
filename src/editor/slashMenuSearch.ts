import { filterSuggestionItems } from "@blocknote/core/extensions";
import type { SuggestionMenuOptions } from "@blocknote/core/extensions";

export const shouldOpenSlashMenu: NonNullable<SuggestionMenuOptions["shouldOpen"]> = transaction => {
  const { $from, empty } = transaction.selection;
  if (!empty || !$from.parent.isTextblock) return false;

  const atLineStart = $from.parentOffset === 0 || $from.nodeBefore?.type.name === "hardBreak";
  const atLineEnd = !$from.nodeAfter || $from.nodeAfter.type.name === "hardBreak";
  return atLineStart && atLineEnd;
};

export function filterSlashMenuItems<T extends { title: string; aliases?: readonly string[] }>(
  items: T[],
  query: string,
  composing: boolean,
): T[] {
  const matches = filterSuggestionItems(items, query);
  // Some IMEs commit the selected word before ProseMirror receives compositionend.
  // Keep the menu populated for unfinished pinyin, but filter as soon as the
  // committed text matches a command.
  return composing && matches.length === 0 ? items : matches;
}
