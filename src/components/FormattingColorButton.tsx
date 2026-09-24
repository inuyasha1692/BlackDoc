import { ShowSelectionExtension } from "@blocknote/core/extensions";
import { useBlockNoteEditor, useComponentsContext, useDictionary, useEditorState, useExtension } from "@blocknote/react";
import { useEffect, useState } from "react";
import "./formattingColors.css";

const colors = ["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;

export function FormattingColorButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const [open, setOpen] = useState(false);
  const { showSelection } = useExtension(ShowSelectionExtension);
  useEffect(() => {
    showSelection(open, "formattingColors");
    return () => showSelection(false, "formattingColors");
  }, [open, showSelection]);
  const state = useEditorState({ editor, selector: ({ editor }) => {
    if (!editor.isEditable || !(editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]).some(block => block.content !== undefined)) return undefined;
    return editor.getActiveStyles();
  } });
  if (!state) return null;
  const apply = (property: "textColor" | "backgroundColor", value: string) => {
    if (value === "default") editor.removeStyles({ [property]: value });
    else editor.addStyles({ [property]: value });
    setOpen(false);
    setTimeout(() => editor.focus());
  };
  return <Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
    <Components.Generic.Popover.Trigger>
      <Components.FormattingToolbar.Button className="bn-button" data-test="colors" label={dict.formatting_toolbar.colors.tooltip} onClick={() => setOpen(current => !current)}
        mainTooltip={dict.formatting_toolbar.colors.tooltip} icon={<span className="bn-color-icon" data-text-color={state.textColor ?? "default"} data-background-color={state.backgroundColor ?? "default"} style={{width:20,height:20,lineHeight:"20px",textAlign:"center"}} aria-hidden="true">A</span>} />
    </Components.Generic.Popover.Trigger>
    <Components.Generic.Popover.Content className="bn-popover-content formatting-color-panel" variant="form-popover">
      {([ ["textColor", "字体颜色"], ["backgroundColor", "背景颜色"] ] as const).map(([property, label]) => <section key={property} aria-label={label}>
        <div className="formatting-color-label">{label}</div>
        <div className="formatting-color-swatches" role="group" aria-label={label}>
          {colors.map(color => <button key={color} type="button" title={`${label}：${dict.color_picker.colors[color]}`}
            aria-label={`${label}：${dict.color_picker.colors[color]}`} aria-pressed={(state[property] ?? "default") === color}
            data-test={`${property === "textColor" ? "text" : "background"}-color-${color}`}
            onMouseDown={event => event.preventDefault()} onClick={() => apply(property, color)}>
            <span className={`bn-color-icon ${property === "backgroundColor" ? "color-fill" : ""} ${color === "default" && property === "backgroundColor" ? "color-clear" : ""}`}
              data-text-color={property === "textColor" ? color : "default"} data-background-color={property === "backgroundColor" ? color : "default"} aria-hidden="true">
              {property === "textColor" ? "A" : ""}
            </span>
          </button>)}
        </div>
      </section>)}
      <button type="button" className="formatting-color-reset" onMouseDown={event => event.preventDefault()} onClick={() => {
        editor.removeStyles({ textColor: "default", backgroundColor: "default" });
        setOpen(false);
        setTimeout(() => editor.focus());
      }}>恢复默认</button>
    </Components.Generic.Popover.Content>
  </Components.Generic.Popover.Root>;
}
