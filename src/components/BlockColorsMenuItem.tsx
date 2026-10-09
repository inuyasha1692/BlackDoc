import { blockHasType, editorHasBlockWithType } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtensionState,
} from "@blocknote/react";
import type { blackDocSchema } from "../editor/schema";
import "./formattingColors.css";

const colors = [
  "default",
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
] as const;

export function BlockColorsMenuItem({
  onColorApplied,
}: {
  onColorApplied: () => void;
}) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<typeof blackDocSchema.blockSchema, typeof blackDocSchema.inlineContentSchema, typeof blackDocSchema.styleSchema>();
  const dict = useDictionary();
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: state => state?.block,
  });

  if (!block) return null;

  const canSetTextColor = blockHasType(block, editor, block.type, {
    textColor: "string",
  }) && editorHasBlockWithType(editor, block.type, { textColor: "string" });
  const canSetBackgroundColor = blockHasType(block, editor, block.type, {
    backgroundColor: "string",
  }) && editorHasBlockWithType(editor, block.type, { backgroundColor: "string" });

  if (!canSetTextColor && !canSetBackgroundColor) return null;

  const setColor = (property: "textColor" | "backgroundColor", color: string) => {
    editor.updateBlock(block, {
      type: block.type,
      props: { [property]: color },
    });
    onColorApplied();
  };

  const resetColors = () => {
    editor.updateBlock(block, {
      type: block.type,
      props: {
        ...(canSetTextColor ? { textColor: "default" } : {}),
        ...(canSetBackgroundColor ? { backgroundColor: "default" } : {}),
      },
    });
    onColorApplied();
  };

  return (
    <Components.Generic.Menu.Root position="right" sub>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          颜色
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown
        sub
        className="bn-menu-dropdown bn-color-picker-dropdown block-color-picker"
      >
        {canSetTextColor && (
          <section aria-label={dict.color_picker.text_title}>
            <div className="formatting-color-label">字体颜色</div>
            <div className="formatting-color-swatches block-font-color-swatches" role="group" aria-label={dict.color_picker.text_title}>
              {colors.map(color => (
                <button
                  aria-label={`${dict.color_picker.text_title}：${dict.color_picker.colors[color]}`}
                  aria-pressed={(block.props.textColor ?? "default") === color}
                  data-test={`block-text-color-${color}`}
                  key={color}
                  onClick={() => setColor("textColor", color)}
                  onMouseDown={event => event.preventDefault()}
                  title={dict.color_picker.colors[color]}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="bn-color-icon"
                    data-background-color="default"
                    data-text-color={color}
                  >
                    A
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {canSetBackgroundColor && (
          <section aria-label={dict.color_picker.background_title}>
            <div className="formatting-color-label">背景颜色</div>
            <div className="formatting-color-swatches block-background-color-swatches" role="group" aria-label={dict.color_picker.background_title}>
              {colors.map(color => (
                <button
                  aria-label={`${dict.color_picker.background_title}：${dict.color_picker.colors[color]}`}
                  aria-pressed={(block.props.backgroundColor ?? "default") === color}
                  data-test={`block-background-color-${color}`}
                  key={color}
                  onClick={() => setColor("backgroundColor", color)}
                  onMouseDown={event => event.preventDefault()}
                  title={dict.color_picker.colors[color]}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`bn-color-icon color-fill${color === "default" ? " color-clear" : ""}`}
                    data-background-color={color}
                    data-text-color="default"
                  />
                </button>
              ))}
            </div>
          </section>
        )}
        <button
          className="formatting-color-reset"
          onClick={resetColors}
          onMouseDown={event => event.preventDefault()}
          type="button"
        >
          恢复默认
        </button>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
