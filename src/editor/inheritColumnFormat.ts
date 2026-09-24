import { createExtension } from "@blocknote/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping, ReplaceStep } from "@tiptap/pm/transform";
import { TableMap } from "prosemirror-tables";

const formatKeys = ["backgroundColor", "textColor", "textAlignment"] as const;

export const InheritColumnFormatExtension = createExtension(() => ({
  key: "inherit-column-format",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("inherit-column-format"),
      appendTransaction(transactions, _oldState, state) {
        if (transactions.some(isHistoryTransaction)) return null;
        const mapping = new Mapping();
        const insertions: { pos: number; mapIndex: number }[] = [];

        // Native column insertion adds one empty cell per row. Track only those
        // insertions, not whole-table replacements, row inserts or pasted cells.
        for (const transaction of transactions) {
          for (const step of transaction.steps) {
            mapping.appendMap(step.getMap());
            if (!(step instanceof ReplaceStep) || step.from !== step.to) continue;
            const cell = step.slice.content.firstChild;
            if (
              step.slice.openStart !== 0 || step.slice.openEnd !== 0 ||
              step.slice.content.childCount !== 1 || !cell ||
              !["cell", "header_cell"].includes(cell.type.spec.tableRole) ||
              cell.textContent || cell.childCount !== 1 || cell.firstChild?.childCount !== 0
            ) continue;
            insertions.push({ pos: step.from, mapIndex: mapping.maps.length });
          }
        }

        const tr = state.tr;
        for (const insertion of insertions) {
          const mapped = mapping.slice(insertion.mapIndex).mapResult(insertion.pos, 1);
          if (mapped.deleted) continue;
          const pos = mapped.pos;
          const $pos = state.doc.resolve(pos);
          const cell = $pos.nodeAfter;
          if (!cell || $pos.parent.type.spec.tableRole !== "row") continue;
          const table = $pos.node($pos.depth - 1);
          if (table.type.spec.tableRole !== "table") continue;
          const tableStart = $pos.start($pos.depth - 1);
          const map = TableMap.get(table);
          const rect = map.findCell(pos - tableStart);
          if (rect.left === 0) continue;
          const left = table.nodeAt(map.map[rect.top * map.width + rect.left - 1]);
          if (!left || !formatKeys.some(key => cell.attrs[key] !== left.attrs[key])) continue;
          tr.setNodeMarkup(pos, undefined, {
            ...cell.attrs,
            ...Object.fromEntries(formatKeys.map(key => [key, left.attrs[key]])),
          });
        }
        return tr.docChanged ? tr : null;
      },
    }),
  ],
}));
