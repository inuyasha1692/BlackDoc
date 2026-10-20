import { defaultStyleSpecs } from "@blocknote/core";

const palette = new Set(["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);

// Palette names use the editor's theme. Imported CSS colors need an inline
// declaration as BlockNote's default render only emits data attributes.
export function inlineColorSpec(type: "textColor" | "backgroundColor") {
  const original = defaultStyleSpecs[type];
  const apply = (dom: HTMLElement, value: string) => {
    if (!palette.has(value)) {
      dom.style[type === "textColor" ? "color" : "backgroundColor"] = value;
    }
  };
  return {
    ...original,
    implementation: {
      ...original.implementation,
      render: (...args: Parameters<typeof original.implementation.render>) => {
        const result = original.implementation.render(...args);
        apply(result.dom, args[0]);
        return result;
      },
      mark: original.implementation.mark.extend({
        renderHTML(context) {
          const result = this.parent!(context) as { dom: HTMLElement; contentDOM?: HTMLElement };
          apply(result.dom, context.mark.attrs.stringValue);
          return result;
        },
        addMarkView() {
          const render = this.parent!();
          return context => {
            const result = render(context);
            apply(result.dom as HTMLElement, context.mark.attrs.stringValue);
            return result;
          };
        },
      }),
    },
  };
}
