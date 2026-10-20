import { createExtension } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";
import { cellAround, TableMap } from "prosemirror-tables";

const BORDER_HIT_WIDTH = 5;
const MIN_COLUMN_WIDTH = 35;

export const TableEqualColumnWidthsExtension = createExtension(() => ({
  key: "table-equal-column-widths",
  prosemirrorPlugins: [new Plugin({
    props: {
      handleDOMEvents: {
        dblclick(view, event) {
          if (!view.editable || event.button !== 0 || !(event.target instanceof Element)) return false;
          const cell = event.target.closest<HTMLTableCellElement>("td, th");
          const tableElement = cell?.closest("table");
          if (!cell || !tableElement || !view.dom.contains(cell)) return false;

          const bounds = cell.getBoundingClientRect();
          const atLeft = Math.abs(event.clientX - bounds.left) <= BORDER_HIT_WIDTH;
          const atRight = Math.abs(event.clientX - bounds.right) <= BORDER_HIT_WIDTH;
          if (!atLeft && !atRight) return false;

          const { state } = view;
          const $cell = cellAround(state.doc.resolve(view.posAtDOM(cell, 0)));
          if (!$cell) return false;
          const table = $cell.node(-1);
          const start = $cell.start(-1);
          const map = TableMap.get(table);
          const rect = map.findCell($cell.pos - start);
          // Only the internal vertical dividers trigger equal sizing.
          if (map.width < 2 || !((atLeft && rect.left > 0) || (atRight && rect.right < map.width))) return false;

          // Measure the column grid without the collapsed outer border so repeated
          // double-clicks do not gradually add the border width to the table.
          const totalWidth = tableElement.querySelector("colgroup")?.getBoundingClientRect().width ||
            tableElement.getBoundingClientRect().width;
          if (!Number.isFinite(totalWidth) || totalWidth <= 0) return false;
          const width = Math.max(MIN_COLUMN_WIDTH, totalWidth / map.width);
          const tr = state.tr;
          for (const offset of new Set(map.map)) {
            const node = table.nodeAt(offset)!;
            const colwidth = Array<number>(node.attrs.colspan).fill(width);
            if (node.attrs.colwidth?.length === colwidth.length &&
                node.attrs.colwidth.every((value: number) => value === width)) continue;
            tr.setNodeMarkup(start + offset, undefined, { ...node.attrs, colwidth });
          }
          event.preventDefault();
          if (tr.docChanged) view.dispatch(closeHistory(tr));
          return true;
        },
      },
    },
  })],
}));
