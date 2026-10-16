import { EventBus } from './EventBus.js';
import { createRng } from './rng.js';

/**
 * 游戏核心：持有 state/data，注册系统，分发命令，推进逻辑。
 * 不依赖 DOM，可在 Node 中运行测试。
 */
export class Game {
  constructor({ data, state, systems = [] }) {
    this.data = data;
    this.state = state;
    this.bus = new EventBus();
    this.rng = createRng(state.meta.seed);
    this.systems = [];
    this.commands = new Map();
    this.queries = new Map();
    systems.forEach((s) => this.register(s));
  }

  get ctx() {
    return { state: this.state, data: this.data, bus: this.bus, rng: this.rng, game: this };
  }

  register(system) {
    this.systems.push(system);
    for (const [name, fn] of Object.entries(system.commands ?? {})) {
      if (this.commands.has(name)) throw new Error(`重复命令: ${name}`);
      this.commands.set(name, fn);
    }
    for (const [name, fn] of Object.entries(system.queries ?? {})) {
      this.queries.set(`${system.id}/${name}`, fn);
    }
  }

  /** 初始化所有系统（注册监听等） */
  start() {
    this.systems.forEach((s) => s.init?.(this.ctx));
    this.bus.emit('game:started');
    this.changed();
  }

  /** 视图 → 逻辑 的唯一入口 */
  dispatch(name, payload = {}) {
    const fn = this.commands.get(name);
    if (!fn) return { ok: false, reason: `未知命令 ${name}` };
    const result = fn(this.ctx, payload) ?? { ok: true };
    if (!result.ok) this.bus.emit('ui:toast', { text: result.reason, kind: 'warn' });
    this.changed();
    return result;
  }

  /** 只读查询：game.query('farm/tileView', x, y) */
  query(name, ...args) {
    const fn = this.queries.get(name);
    if (!fn) throw new Error(`未知查询 ${name}`);
    return fn(this.ctx, ...args);
  }

  update(dt) {
    this.systems.forEach((s) => s.update?.(this.ctx, dt));
  }

  isUnlocked(key) {
    return !!this.state.unlocks[key];
  }

  unlock(key) {
    if (this.state.unlocks[key]) return;
    this.state.unlocks[key] = true;
    this.bus.emit('unlock:gained', { key });
  }

  /** 通知视图刷新（同一帧内合并） */
  changed() {
    this.bus.emit('state:changed');
  }
}
