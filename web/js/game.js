// game.js — Renderer do mundo + jogador + entrada
//
// Fiel ao cliente original:
//  • tile = 63×63 px, ancoragem base-centro (offset "o" do atlas)
//  • zooms 100/125/150/175%
//  • view ~13×13 tiles com offscreen (aqui: janela + 1 tile de margem)
//  • caminhada tile-a-tile (walklock)

import { TILE } from './atlas.js';

export const ZOOMS = [1, 1.25, 1.5, 1.75];

export class Game {
  constructor(atlas, world, opts = {}) {
    this.atlas = atlas;
    this.world = world;
    this.tileSize = TILE;
    this.zoomIdx = 0;
    this.zoom = ZOOMS[0];
    this.player = {
      x: world.spawn.x, y: world.spawn.y,     // tile atual
      px: world.spawn.x * TILE, py: world.spawn.y * TILE, // pos suavizada
      from: { x: world.spawn.x * TILE, y: world.spawn.y * TILE },
      to: { x: world.spawn.x * TILE, y: world.spawn.y * TILE },
      walking: false,
      walkT: 1,
      dir: { x: 0, y: 1 },
      spriteId: opts.playerSprite || 112,
      name: opts.playerName || 'Jogador',
      hp: 100, maxHp: 100, mana: 60, maxMana: 100, xp: 0.35, level: 8,
    };
    this.path = [];
    this.stepTime = 0.28;  // segundos por tile (≈ original)
    this.cam = { x: 0, y: 0 };
    this.viewBounds = { x: 0, y: 0, w: 0, h: 0 };
    this.directionMarker = null;
    this.keys = new Set();
    this.onStatusUpdate = null;
    this.onZoneChange = null;
    this.t = 0;
  }

  setView(bounds) { this.viewBounds = bounds; }

  // movimentos por teclado/joystick
  inputDir(dx, dy) {
    // normaliza para 8 direções
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 4;
    const dirAng = Math.round(ang / step) * step;
    this.requestMove(
      Math.round(Math.cos(dirAng)),
      Math.round(Math.sin(dirAng))
    );
  }

  requestMove(dx, dy) {
    if (this.player.walking) return;
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (!this.world.walkableAt(nx, ny)) { this.bump(); return; }
    this.player.dir = { x: dx, y: dy };
    this.player.from = { x: this.player.x * this.tileSize, y: this.player.y * this.tileSize };
    this.player.to = { x: nx * this.tileSize, y: ny * this.tileSize };
    this.player.walking = true;
    this.player.walkT = 0;
    this.player.x = nx; this.player.y = ny;
    this.path = [];
  }

  walkPath(path) {
    this.path = path || [];
    this.tryNextStep();
  }

  tryNextStep() {
    if (this.player.walking || !this.path.length) return;
    const next = this.path.shift();
    if (!next) return;
    const dx = next.x - this.player.x, dy = next.y - this.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) { this.path = []; return; }
    if (!this.world.walkableAt(next.x, next.y)) { this.path = []; return; }
    this.player.dir = { x: dx, y: dy };
    this.player.from = { x: this.player.x * this.tileSize, y: this.player.y * this.tileSize };
    this.player.to = { x: next.x * this.tileSize, y: next.y * this.tileSize };
    this.player.walking = true;
    this.player.walkT = 0;
    this.player.x = next.x; this.player.y = next.y;
  }

  bump() {
    // efeito de colisão: pequeno "empurrão" visual (opcional)
  }

  update(dt) {
    this.t += dt;
    const p = this.player;
    if (p.walking) {
      p.walkT += dt / this.stepTime;
      if (p.walkT >= 1) {
        p.walkT = 1;
        p.walking = false;
        p.px = p.to.x; p.py = p.to.y;
        this.tryNextStep();
      }
      p.px = p.from.x + (p.to.x - p.from.x) * p.walkT;
      p.py = p.from.y + (p.to.y - p.from.y) * p.walkT;
    }
    // câmera segue
    const targetX = p.px + this.tileSize / 2 - this.viewBounds.w / 2;
    const targetY = p.py + this.tileSize / 2 - this.viewBounds.h / 2;
    this.cam.x += (targetX - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (targetY - this.cam.y) * Math.min(1, dt * 8);
    const maxX = this.world.width * this.tileSize - this.viewBounds.w;
    const maxY = this.world.height * this.tileSize - this.viewBounds.h;
    this.cam.x = Math.max(-this.tileSize, Math.min(maxX + this.tileSize, this.cam.x));
    this.cam.y = Math.max(-this.tileSize, Math.min(maxY + this.tileSize, this.cam.y));
    // eventos de status (demonstração)
    if (this.onStatusUpdate) this.onStatusUpdate(p);
  }

  async draw(ctx, dt) {
    const v = this.viewBounds;
    if (!v.w || !v.h) return;
    const z = this.zoom;
    const ts = this.tileSize;
    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.translate(v.x - this.cam.x, v.y - this.cam.y);
    ctx.scale(z, z);

    // faixa visível de tiles (com 1 de margem = offscreen)
    const x0 = Math.max(0, Math.floor(this.cam.x / ts) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / ts) - 1);
    const x1 = Math.min(this.world.width - 1, Math.ceil((this.cam.x + v.w / z) / ts) + 1);
    const y1 = Math.min(this.world.height - 1, Math.ceil((this.cam.y + v.h / z) / ts) + 1);

    // 1) chão
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const g = this.world.groundAt(tx, ty);
        if (g != null) await this.atlas.draw(ctx, g, tx * ts, ty * ts, 1);
      }
    }

    // 2) objetos + criaturas ordenados por base (pintor)
    const draws = [];
    for (const d of this.world.drawables()) {
      if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
      const s = this.atlas.get(d.id);
      if (!s) continue;
      const baseY = d.y * ts + s.o[1] + s.s[1];
      draws.push({ ...d, baseY });
    }
    draws.sort((a, b) => a.baseY - b.baseY);
    for (const d of draws) await this.atlas.draw(ctx, d.id, d.x * ts, d.y * ts, 1);

    // 3) jogador
    const p = this.player;
    await this.atlas.draw(ctx, p.spriteId, Math.round(p.px / ts) * ts, Math.round(p.py / ts) * ts, 1);
    // nome do jogador
    const ns = this.atlas.get(p.spriteId);
    const nH = ns ? ns.o[1] + ns.s[1] : ts;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const nW = ctx.measureText(p.name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(p.px + ts / 2 - nW / 2 - 3, p.py - 14, nW + 6, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(p.name, p.px + ts / 2, p.py - 5);

    ctx.restore();
  }

  setZoom(idx) {
    this.zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, idx));
    this.zoom = ZOOMS[this.zoomIdx];
  }
  cycleZoom() { this.setZoom(this.zoomIdx + 1); }
  zoomLabel() { return `${Math.round(this.zoom * 100)}%`; }
}
