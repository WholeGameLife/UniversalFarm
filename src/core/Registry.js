/** 数据注册表：把 data/ 的数组转成按 id 查找，并做基本校验 */
export class Registry {
  constructor(name, entries = []) {
    this.name = name;
    this.map = new Map();
    entries.forEach((e) => this.add(e));
  }

  add(entry) {
    if (!entry?.id) throw new Error(`[${this.name}] 条目缺少 id`);
    if (this.map.has(entry.id)) throw new Error(`[${this.name}] 重复 id: ${entry.id}`);
    this.map.set(entry.id, Object.freeze(entry));
  }

  get(id) {
    const e = this.map.get(id);
    if (!e) throw new Error(`[${this.name}] 未找到: ${id}`);
    return e;
  }

  has(id) {
    return this.map.has(id);
  }

  all() {
    return [...this.map.values()];
  }
}
