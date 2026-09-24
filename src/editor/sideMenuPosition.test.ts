import { describe, it, expect } from "vitest";
import { sideMenuHeadingPosition } from "./sideMenuPosition";

describe("heading side menu position", () => {
  it.each([1,2,3,4,5,6])("centers the first line of h%s using actual geometry", level => {
    const element = document.createElement("div");
    element.innerHTML = `<h${level} style="line-height:24px">Heading</h${level}>`;
    element.getBoundingClientRect = () => ({top:100}) as DOMRect;
    element.firstElementChild!.getBoundingClientRect = () => ({top:120,height:48}) as DOMRect;
    expect(sideMenuHeadingPosition.fn({elements:{reference:{contextElement:element}},rects:{reference:{y:200},floating:{height:30}}})).toEqual({y:217});
  });
  it("leaves non-heading positioning untouched", () => {
    expect(sideMenuHeadingPosition.fn({elements:{reference:document.createElement("div")},rects:{reference:{y:100},floating:{height:30}}})).toEqual({});
  });
});
