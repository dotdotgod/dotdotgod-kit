// Fixed-height windowing; the complete filtered set remains keyboard-navigable.
function fileWindow(count, scrollTop, height, rowHeight = 36, overscan = 5) {
  const start = Math.max(0, Math.min(Math.floor(scrollTop / rowHeight) - overscan, Math.max(0, count - 1)));
  return { start, end: Math.min(count, start + Math.ceil(height / rowHeight) + overscan * 2) };
}

class FileList {
  constructor(element, onSelect) {
    this.element = element;
    this.onSelect = onSelect;
    this.items = [];
    this.focused = 0;
    this.selected = null;
    this.rowHeight = 36;
    element.setAttribute('aria-label', document.documentElement.lang === 'ko' ? '파일 목록' : 'Files');
    element.addEventListener('scroll', () => this.render());
    element.addEventListener('keydown', event => {
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key) || !this.items.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.focused = event.key === 'Home' ? 0 : event.key === 'End' ? this.items.length - 1 : Math.max(0, Math.min(this.items.length - 1, this.focused + delta));
      const top = this.focused * this.rowHeight;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + this.rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + this.rowHeight - element.clientHeight;
      this.render(true);
    });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(element);
  }

  setItems(items) {
    this.items = items;
    this.focused = 0;
    this.element.scrollTop = 0;
    this.render();
  }

  setSelected(id) {
    this.selected = id;
    for (const button of this.element.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.path === id));
    }
  }

  render(focus = false) {
    const element = this.element;
    const current = element.ownerDocument.activeElement;
    const restoreFocus = focus || element.contains(current);
    const { start, end } = fileWindow(this.items.length, element.scrollTop, element.clientHeight);
    if (this.focused < start || this.focused >= end) this.focused = start;
    const fragment = document.createDocumentFragment();
    const spacer = height => {
      const li = document.createElement('li');
      li.setAttribute('aria-hidden', 'true');
      li.style.height = `${height}px`;
      fragment.append(li);
    };
    spacer(start * this.rowHeight);
    for (let index = start; index < end; index++) {
      const item = this.items[index];
      const li = document.createElement('li');
      li.setAttribute('aria-posinset', String(index + 1));
      li.setAttribute('aria-setsize', String(this.items.length));
      const button = document.createElement('button');
      button.textContent = item.label;
      button.title = item.id;
      button.dataset.path = item.id;
      button.tabIndex = index === this.focused ? 0 : -1;
      button.setAttribute('aria-pressed', String(item.id === this.selected));
      button.addEventListener('focus', () => { this.focused = index; });
      button.onclick = () => this.onSelect(item);
      li.append(button);
      fragment.append(li);
    }
    spacer((this.items.length - end) * this.rowHeight);
    element.replaceChildren(fragment);
    if (restoreFocus) element.querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
  }
}

if (typeof module !== 'undefined') module.exports = { fileWindow };
