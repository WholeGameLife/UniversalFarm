import { esc } from '../dom.js';

export class Toasts {
  constructor(el, bus) {
    bus.on('ui:toast', ({ text, kind = 'info' }) => {
      const n = document.createElement('div');
      n.className = `toast ${kind}`;
      n.innerHTML = esc(text);
      el.appendChild(n);
      setTimeout(() => n.classList.add('out'), 2200);
      setTimeout(() => n.remove(), 2700);
    });
    bus.on('unlock:gained', ({ key }) => {
      if (key === 'mining') bus.emit('ui:toast', { text: '⛏️ 新功能：挖矿', kind: 'good' });
      if (key === 'travel_system') bus.emit('ui:toast', { text: '🚀 新功能：星际航行', kind: 'good' });
    });
  }
}
