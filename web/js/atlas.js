// atlas.js — Banco de sprites: parse dos N.xml + texturas atlas
//
// Formato do índice (por pack N):
//   <packdata><images packid="N">
//     <texture file="atlas_X.Y.png" frame="0">
//       <t id="2780" s="6,9" p="49,247" o="38,16" />
//   ...
// Semântica:
//   id  = ID global do sprite (protocolo do jogo)
//   s   = "w,h" tamanho em px
//   p   = "x,y" posição dentro da textura atlas
//   o   = "x,y" offset de desenho relativo à célula do tile (63x63)
//   .2  = LA  (luminância+alfa) → sprite colorizável
//   .4  = RGBA (colorido)

import { loadXML, loadImage } from './loader.js';

export const TILE = 63;                    // célula do tile em px (100% zoom)
export const PACKS = [2, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 30];

export class AtlasDB {
  constructor() {
    this.sprites = new Map();   // id -> {pack, tex, s:[w,h], p:[x,y], o:[ox,oy], frame}
    this.textures = new Map();  // "pack/tex" -> Promise<HTMLImageElement>
    this.texIds = new Map();    // "pack/tex" -> [ids...] para lazy-load
    this.tintCache = new Map(); // id|tint -> canvas
    this.loadedPacks = new Set();
  }

  async loadPack(n) {
    if (this.loadedPacks.has(n)) return;
    const doc = await loadXML(`pack${n}/${n}.xml`);
    const imagesEl = doc.querySelector('images');
    for (const tex of doc.querySelectorAll('texture')) {
      const file = tex.getAttribute('file');
      const frame = tex.getAttribute('frame') || '0';
      const key = `pack${n}/${file}`;
      const ids = [];
      for (const t of tex.querySelectorAll('t')) {
        const id = parseInt(t.getAttribute('id'), 10);
        const s = t.getAttribute('s').split(',').map(Number);
        const p = t.getAttribute('p').split(',').map(Number);
        const o = t.getAttribute('o').split(',').map(Number);
        this.sprites.set(id, { id, pack: n, tex: key, s, p, o, frame, texFile: file });
        ids.push(id);
      }
      this.texIds.set(key, ids);
    }
    this.loadedPacks.add(n);
  }

  async loadAllPacks(progress) {
    let done = 0;
    for (const n of PACKS) {
      await this.loadPack(n);
      done++;
      if (progress) progress(done, PACKS.length);
    }
  }

  get(id) {
    return this.sprites.get(id) || null;
  }

  texture(key) {
    if (!this.textures.has(key)) this.textures.set(key, loadImage(key));
    return this.textures.get(key);
  }

  async textureFor(id) {
    const s = this.sprites.get(id);
    if (!s) throw new Error(`Sprite ${id} não existe`);
    return this.texture(s.tex);
  }

  // Desenha sprite com ancoragem original: posição (x,y) = canto sup-esq da CÉLULA do tile.
  // (o sprite é desenhado em x + o.x*zoom, y + o.y*zoom)
  async draw(ctx, id, x, y, zoom = 1, tint = null, alpha = 1) {
    const s = this.sprites.get(id);
    if (!s) return;
    let img;
    try {
      img = await this.texture(s.tex);
    } catch (e) {
      this.warnOnce(s.tex, e);
      return;
    }
    let src = img;
    let sx = s.p[0], sy = s.p[1], sw = s.s[0], sh = s.s[1];
    if (tint) {
      src = this.tintSprite(id, img, tint);
      sx = 0; sy = 0;
    }
    const dx = x + s.o[0] * zoom;
    const dy = y + s.o[1] * zoom;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, sw * zoom, sh * zoom);
    ctx.restore();
  }

  warnOnce(key, err) {
    if (!this._warned) this._warned = new Set();
    if (!this._warned.has(key)) {
      this._warned.add(key);
      console.warn(`Textura indisponível (ignorada): ${key} — ${err.message}`);
    }
  }

  // Colorização de sprites LA: cor = tint * luminância, mantendo alfa
  tintSprite(id, img, tint) {
    const key = `${id}|${tint}`;
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const s = this.sprites.get(id);
    const cv = document.createElement('canvas');
    cv.width = s.s[0]; cv.height = s.s[1];
    const c = cv.getContext('2d');
    c.drawImage(img, s.p[0], s.p[1], s.s[0], s.s[1], 0, 0, s.s[0], s.s[1]);
    const data = c.getImageData(0, 0, cv.width, cv.height);
    // tint = [r,g,b]
    const tr = tint[0], tg = tint[1], tb = tint[2];
    for (let i = 0; i < data.data.length; i += 4) {
      const a = data.data[i + 3] / 255;
      const lum = data.data[i] / 255; // canal L (r=g=b em LA)
      data.data[i]     = Math.min(255, tr * lum);
      data.data[i + 1] = Math.min(255, tg * lum);
      data.data[i + 2] = Math.min(255, tb * lum);
      data.data[i + 3] = data.data[i + 3]; // mantém alfa original
    }
    c.putImageData(data, 0, 0);
    this.tintCache.set(key, cv);
    return cv;
  }

  // lista todos os sprites de um pack para o navegador de sprites
  idsOfPack(n) {
    const out = [];
    for (const s of this.sprites.values()) if (s.pack === n) out.push(s.id);
    return out.sort((a, b) => a - b);
  }
}

// helpers de cor
export function parseColor(str) {
  // aceita "#RRGGBBAA" e "#RRGGBB"
  if (!str || !str.startsWith('#')) return null;
  let h = str.slice(1);
  if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  return null;
}
