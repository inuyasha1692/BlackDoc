export function scrollMenuItemIntoView(
  menu: HTMLElement,
  item: HTMLElement,
) {
  const menuRect = menu.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  if (itemRect.top < menuRect.top) {
    menu.scrollTop -= menuRect.top - itemRect.top;
  } else if (itemRect.bottom > menuRect.bottom) {
    menu.scrollTop += itemRect.bottom - menuRect.bottom;
  }
}
