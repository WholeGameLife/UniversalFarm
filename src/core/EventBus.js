/** 轻量事件总线：系统之间、系统与视图之间解耦通信 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, payload) {
    this.listeners.get(type)?.forEach((h) => h(payload));
    // 通配监听，便于调试 / 日志
    this.listeners.get('*')?.forEach((h) => h({ type, payload }));
  }
}
