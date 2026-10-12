// world.js — Modelo de mundo offline (substitui o servidor de mapas)
//
// O mapa é definido em data/world.json:
// {
//   "name": "...",
//   "width": 30, "height": 30,
//   "ground": [[tileId,...], ...],          // grid de tiles (IDs do atlas)
//   "objects": [{ "id": 114, "x": 5, "y": 5, "block": true }],
//   "creatures": [{ "id": 27, "x": 14, "y": 10, "name": "Monstro" }],
//   "walkable": { "1": true, "4": true },   // ids de chão andáveis
//   "spawn": { "x": 15, "y": 15 }
// }

export class World {
  constructor(data) {
    this.name = data.name || 'Mundo';
    this.width = data.width;
    this.height = data.height;
    this.ground = data.ground;               // [y][x] -> spriteId
    this.walkable = data.walkable || {};     // spriteId -> bool
    this.objects = data.objects || [];
    this.creatures = data.creatures || [];
    this.spawn = data.spawn || { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
    this.ambientSetting = data.ambientSetting || null; // id de music.xml (ambiente)
    this.blockMap = new Set();
    for (const o of this.objects) {
      if (o.block) this.blockMap.add(`${o.x},${o.y}`);
    }
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  groundAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.ground[y][x];
  }

  walkableAt(x, y) {
    const g = this.groundAt(x, y);
    if (g == null) return false;
    if (!this.walkable[String(g)]) return false;
    if (this.blockMap.has(`${x},${y}`)) return false;
    return true;
  }

  // BFS para tap-to-move
  findPath(from, to) {
    const { x: fx, y: fy } = from, { x: tx, y: ty } = to;
    if (!this.walkableAt(tx, ty)) return null;
    const key = (x, y) => `${x},${y}`;
    const prev = new Map();
    const q = [[fx, fy]];
    const visited = new Set([key(fx, fy)]);
    while (q.length) {
      const [cx, cy] = q.shift();
      if (cx === tx && cy === ty) {
        const path = [];
        let cur = key(tx, ty);
        while (cur !== key(fx, fy)) {
          const [px, py] = cur.split(',').map(Number);
          path.unshift({ x: px, y: py });
          cur = prev.get(cur);
        }
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny) || !this.walkableAt(nx, ny)) continue;
        const k = key(nx, ny);
        if (visited.has(k)) continue;
        visited.add(k);
        prev.set(k, key(cx, cy));
        q.push([nx, ny]);
      }
    }
    return null;
  }

  // entidades desenháveis ordenadas por base (algoritmo do pintor)
  drawables() {
    const list = [
      ...this.objects.map(o => ({ kind: 'object', id: o.id, x: o.x, y: o.y })),
      ...this.creatures.map(c => ({ kind: 'creature', id: c.id, x: c.x, y: c.y, name: c.name })),
    ];
    return list;
  }
}
