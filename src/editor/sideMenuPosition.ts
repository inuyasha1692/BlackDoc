// Measure the rendered first line so all six heading levels and custom fonts align.
export const sideMenuHeadingPosition = {
  name: "blackdoc-heading-position",
  fn: ({ elements, rects }: {
    elements: { reference: unknown };
    rects: { floating: { height: number }; reference: { y: number } };
  }) => {
    const value = elements.reference;
    const reference = value instanceof Element ? value : (value as { contextElement?: Element } | null)?.contextElement;
    if (!(reference instanceof Element)) return {};
    const heading = reference.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6");
    if (!heading) return {};
    const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
    const bounds = heading.getBoundingClientRect();
    const topOffset = bounds.top - reference.getBoundingClientRect().top;
    return { y: rects.reference.y + topOffset + (Number.isFinite(lineHeight) ? lineHeight : bounds.height) / 2 - rects.floating.height / 2 };
  },
};
