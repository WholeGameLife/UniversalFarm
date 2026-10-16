/** 视图层小工具 */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 事件委托：容器内匹配 selector 的元素被点击时调用 handler(el, event) */
export function delegate(root, selector, handler) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(el, e);
  });
}

/** 仅在 html 变化时写 DOM，避免无谓重绘 */
export function setHtml(el, html) {
  if (el.__html !== html) {
    el.innerHTML = html;
    el.__html = html;
  }
}
