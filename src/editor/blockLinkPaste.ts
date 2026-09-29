import { isBlockLink } from "./blockLinks";
import type { BlackDocEditor } from "./schema";

export function pasteBlockLink(
  editor: BlackDocEditor,
  clipboard: Pick<DataTransfer, "getData"> | null,
): boolean {
  const text = clipboard?.getData("text/plain").trim() ?? "";
  if (!isBlockLink(text)) return false;

  if (editor.getSelectedText()) {
    editor.createLink(text);
  } else {
    editor.insertInlineContent(
      [{ type: "link", content: text, href: text }],
      { updateSelection: true },
    );
  }
  return true;
}
