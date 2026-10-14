// Small popovers anchored to a button: the toolbar menus, page settings and the sprint menu.
// Only one is open at a time; Escape or a click outside closes it.



let popEl = null;
let afterClose = null;      // e.g. the floating toolbar re-places itself when a menu closes

export const currentPopover = () => popEl;
export const popoverCloseHook = () => afterClose;
export function onPopoverClose(fn) { afterClose = fn; }

export function closePopover() {
  if (!popEl) return;
  popEl.remove();
  popEl = null;
  document.removeEventListener("mousedown", outside, true);
  document.removeEventListener("keydown", popKey, true);
  afterClose?.();
}
function outside(e) { if (popEl && !popEl.contains(e.target) && !e.target.closest(".dd-menu")) closePopover(); }
function popKey(e) { if (e.key === "Escape" && popEl) { e.stopPropagation(); closePopover(); } }
export function popover(anchor, html, onMount) {
  closePopover();
  popEl = document.createElement("div");
  popEl.className = "popover";
  popEl.innerHTML = html;
  document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect();
  popEl.style.top = r.bottom + 6 + "px";
  popEl.style.left = Math.min(r.left, innerWidth - popEl.offsetWidth - 12) + "px";
  // keep it on screen (the toolbar may be floating low on the page)
  if (r.bottom + 6 + popEl.offsetHeight > innerHeight - 8) popEl.style.top = Math.max(8, r.top - 6 - popEl.offsetHeight) + "px";
  onMount?.(popEl);
  document.addEventListener("keydown", popKey, true);
  setTimeout(() => document.addEventListener("mousedown", outside, true));
}
