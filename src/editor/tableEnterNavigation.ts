import { createExtension } from "@blocknote/core";
import { Selection } from "@tiptap/pm/state";
import { isInTable, nextCell, selectionCell } from "prosemirror-tables";

export const TableEnterNavigationExtension = createExtension(({ editor }) => ({
  key: "table-enter-navigation",
  keyboardShortcuts: {
    Enter: () => {
      const { state, view } = editor._tiptapEditor;
      if (!isInTable(state)) return false;

      const cell = selectionCell(state);
      const target = cell ? nextCell(cell, "vert", 1) : null;
      if (target) {
        // Enter navigates without selecting or replacing the destination text.
        view.dispatch(
          state.tr
            .setSelection(Selection.near(state.doc.resolve(target.pos + 1)))
            .scrollIntoView(),
        );
      }
      return true;
    },
  },
}));
