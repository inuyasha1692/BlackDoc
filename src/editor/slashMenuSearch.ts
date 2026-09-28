import { filterSuggestionItems } from "@blocknote/core/extensions";

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
