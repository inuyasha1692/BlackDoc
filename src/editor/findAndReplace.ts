import { createExtension } from "@blocknote/core";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";

export const FindAndReplaceExtension = () => createExtension({
  key: "blackDocFindAndReplace",
  tiptapExtensions: [FindAndReplace.configure({ searchDebounceMs: 0, injectCSS: false })],
});
