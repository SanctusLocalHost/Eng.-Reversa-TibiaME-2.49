/* Gerado automaticamente por build-bundle.py — NÃO EDITE DIRETAMENTE
   Edite web/js/*.js e rode:  python3 build-bundle.py */
(function (global) {
'use strict';

/* ==================== loader.js ==================== */

// loader.js — Carregamento universal: File System Access API (file:// / PWA) + fetch (http://)
//
// Modo PWA (file://): requer pasta do jogo selecionada (window.getGameRoot)
// Modo servidor (http://): usa fetch relativo à raiz do jogo

let gameRootHandle = null;
let fileIndex = null; // Map caminhoRelativo -> File (modo <input webkitdirectory>)

async function initLoader() {
  if (window.getGameRoot) {
    try { gameRootHandle = await window.getGameRoot(); } catch (_) { gameRootHandle = null; }
  }
  return !!(gameRootHandle || fileIndex);
}

// Fallback universal (funciona no Brave, Firefox, Safari): <input webkitdirectory>
function initLoaderFromFileList(fileList) {
  const files = [...fileList].filter(f => f && f.webkitRelativePath);
  if (!files.length) return false;
  // Detecta o prefixo da pasta raiz: procura "/pack1/" em algum caminho
  let prefix = null;
  for (const f of files) {
    const m = f.webkitRelativePath.match(/(^|\/)pack1\//);
    if (m) { prefix = f.webkitRelativePath.slice(0, m.index + (m[1] ? 1 : 0)); break; }
  }
  if (prefix === null) {
    // fallback: remove o primeiro componente (nome da pasta selecionada)
    prefix = files[0].webkitRelativePath.split('/')[0] + '/';
  }
  fileIndex = new Map();
  for (const f of files) {
    let rel = f.webkitRelativePath;
    if (rel.startsWith(prefix)) rel = rel.slice(prefix.length);
    fileIndex.set(rel, f);
  }
  gameRootHandle = null;
  return fileIndex.size > 0;
}

function isFileListMode() { return !!fileIndex; }

function isFileSystemMode() {
  return !!gameRootHandle;
}

function isLocalMode() {
  return !!(gameRootHandle || fileIndex);
}

function fileListCount() { return fileIndex ? fileIndex.size : 0; }

// ---------- modo servidor: base de fetch ----------
// Descobre a raiz do jogo a partir da URL da página:
//   /web/index.html        → '/'
//   /qualquer/web/index    → '/qualquer/'
//   /web/tools/browser.html→ '/'
function fetchBase() {
  const p = location.pathname;
  const i = p.indexOf('/web/');
  if (i >= 0) return p.slice(0, i + 1);
  // servindo a pasta web como raiz
  if (/\/tools\/[^/]*$/.test(p)) return '../';
  return './';
}

async function getFileHandle(path) {
  if (!gameRootHandle) throw new Error('Pasta do jogo não selecionada');
  const parts = path.split('/').filter(p => p);
  let handle = gameRootHandle;
  for (const part of parts) {
    handle = await handle.getFileHandle(part);
  }
  return handle;
}

async function loadText(path) {
  if (fileIndex) {
    const f = fileIndex.get(path);
    if (!f) throw new Error(`Arquivo não encontrado na lista: ${path}`);
    return f.text();
  }
  if (gameRootHandle) {
    const file = await (await getFileHandle(path)).getFile();
    return file.text();
  }
  const res = await fetch(fetchBase() + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.text();
}

async function loadXML(path) {
  const text = await loadText(path);
  const doc = new DOMParser().parseFromString(sanitizeXML(text), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`XML inválido: ${path}`);
  return doc;
}

async function loadImage(path) {
  let file = null;
  if (fileIndex) {
    file = fileIndex.get(path);
    if (!file) throw new Error(`Imagem não encontrada na lista: ${path}`);
  } else if (gameRootHandle) {
    file = await (await getFileHandle(path)).getFile();
  }
  if (file) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Falha ao carregar ${path}`)); };
      img.src = url;
    });
  }
  const res = await fetch(fetchBase() + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Falha ao carregar ${path}`)); };
    img.src = url;
  });
}

// ---------- áudio ----------
// Resolve extensão real (wav/ogg/mp3) sem poluir o console com 404s.
let audioExts = null; // Map nome -> [exts]

async function buildAudioExtMap() {
  audioExts = new Map();
  try {
    const res = await fetch(fetchBase() + 'pack5/');
    if (res.ok) {
      const text = await res.text();
      for (const m of text.matchAll(/href="([^"]+\.(wav|ogg|mp3))"/gi)) {
        const full = m[1];
        const base = full.slice(0, full.lastIndexOf('.'));
        if (!audioExts.has(base)) audioExts.set(base, []);
        audioExts.get(base).push(full.slice(full.lastIndexOf('.') + 1).toLowerCase());
      }
    }
  } catch (_) { /* sem listagem → probing */ }
  return audioExts;
}

async function loadAudioBuffer(path, ctx) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  let exts;
  if (fileIndex) {
    // lista exata: escolhe a extensão que existe (sem 404)
    exts = ['wav', 'ogg', 'mp3'].filter(e => fileIndex.has(`${path}.${e}`));
    if (!exts.length) throw new Error(`Áudio não encontrado na lista: ${path}`);
  } else if (gameRootHandle) {
    exts = ['wav', 'ogg', 'mp3'];
  } else {
    if (!audioExts) await buildAudioExtMap();
    exts = audioExts.get(name) || ['wav', 'ogg', 'mp3'];
  }
  let lastErr;
  for (const ext of exts) {
    const full = `${path}.${ext}`;
    try {
      let arrayBuf;
      if (fileIndex) {
        arrayBuf = await fileIndex.get(full).arrayBuffer();
      } else if (gameRootHandle) {
        const file = await (await getFileHandle(full)).getFile();
        arrayBuf = await file.arrayBuffer();
      } else {
        const res = await fetch(fetchBase() + full);
        if (!res.ok) continue;
        arrayBuf = await res.arrayBuffer();
      }
      return await ctx.decodeAudioData(arrayBuf);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Áudio não encontrado: ${path} (${lastErr?.message || ''})`);
}

// Sanitiza XML com atributos duplicados (os dados reais do TibiaME têm)
function sanitizeXML(text) {
  let t = text.replace(/^\uFEFF/, '');
  return t.replace(/<[^>]*>/g, (tag) => {
    if (/^<\?|^<!|^<\//.test(tag)) return tag;
    const seen = new Set();
    return tag.replace(/(\S+)(\s*=\s*"[^"]*"|\s*=\s*'[^']*')/g, (match, name) => {
      if (seen.has(name)) return '';
      seen.add(name);
      return match;
    });
  });
}

// Lista diretório (descobre arquivos nos modos locais ou via listagem HTTP)
async function listDir(path) {
  if (fileIndex) {
    const prefix = path.replace(/\/+$/, '') + '/';
    const names = new Set();
    for (const key of fileIndex.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0];
        if (name) names.add(name);
      }
    }
    return [...names];
  }
  if (gameRootHandle) {
    const parts = path.split('/').filter(p => p);
    let handle = gameRootHandle;
    for (const part of parts) handle = await handle.getDirectoryHandle(part);
    const names = [];
    for await (const [name] of handle.entries()) names.push(name);
    return names;
  }
  try {
    const res = await fetch(fetchBase() + path + '/');
    if (!res.ok) return [];
    const text = await res.text();
    return [...text.matchAll(/href="([^"?]+)"/g)].map(m => m[1]).filter(n => !n.includes('/'));
  } catch (_) { return []; }
}


/* ==================== atlas.js ==================== */

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


const TILE = 63;                    // célula do tile em px (100% zoom)
const PACKS = [2, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 30];

class AtlasDB {
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
function parseColor(str) {
  // aceita "#RRGGBBAA" e "#RRGGBB"
  if (!str || !str.startsWith('#')) return null;
  let h = str.slice(1);
  if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  return null;
}


/* ==================== i18n.js ==================== */

// i18n.js — Parser de XLIFF 1.2 (pack4/extremeclienttexts.<lang>.xlf)


class I18n {
  constructor() { this.strings = new Map(); this.lang = 'pt'; }

  async load(lang = 'pt') {
    this.lang = lang;
    const doc = await loadXML(`pack4/${lang}/extremeclienttexts.${lang}.xlf`);
    for (const tu of doc.querySelectorAll('trans-unit')) {
      const id = tu.getAttribute('id');
      const target = tu.querySelector('target');
      const source = tu.querySelector('source');
      const text = (target ? target.textContent : (source ? source.textContent : '')).trim();
      this.strings.set(id, text);
    }
    return this;
  }

  t(id, ...args) {
    let s = this.strings.get(id);
    if (s === undefined) s = id; // fallback: mostra o próprio id
    // substituições simples: %s, {0}, {1}...
    args.forEach((a, i) => {
      s = s.replace(`{${i}}`, String(a)).replace('%s', String(a));
    });
    return s;
  }

  has(id) { return this.strings.has(id); }
}


/* ==================== audio.js ==================== */

// audio.js — Sistema de áudio (pack5/music.xml + soundfx.xml) via WebAudio
//
// Formato:
//   <setting id="12">
//     <client channels="1|2">
//       <channel priority="50">
//         <sound file="nome" volume="100|50-100" repetitions="infinite" fadeInDuration="10"/>
//         <break length="5-15"/>
//         <list repetitions="infinite"><randomize><sound ... probability="25"/>...</randomize></list>
//   Arquivos referenciados sem extensão (wav/ogg/mp3).


function range(v) {
  if (v == null) return 1;
  const s = String(v);
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    return a + Math.random() * (b - a);
  }
  return Number(s) / 100;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = new Map();  // id -> setting node
    this.buffers = new Map();   // file -> AudioBuffer
    this.playingLoops = new Map(); // file -> {source, gain}
    this.ambientVolume = 1;
    this.effectVolume = 1;
    this.enabled = true;
  }

  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async init() {
    for (const [f, p] of [['music.xml', 'music'], ['soundfx.xml', 'sfx']]) {
      const doc = await loadXML(`pack5/${f}`);
      for (const s of doc.querySelectorAll('setting')) {
        this.settings.set(`${p}:${s.getAttribute('id')}`, s);
      }
    }
  }

  async buffer(name) {
    if (!this.buffers.has(name)) {
      const ctx = this.ensureCtx();
      this.buffers.set(name, await loadAudioBuffer(`pack5/${name}`, ctx));
    }
    return this.buffers.get(name);
  }

  // Toca um <setting> completo (música ambiente ou conjunto de sfx)
  async playSetting(kind, id, opts = {}) {
    if (!this.enabled) return;
    const setting = this.settings.get(`${kind}:${id}`);
    if (!setting) { console.warn(`audio setting ${kind}:${id} não existe`); return; }
    const client = setting.querySelector(`client[channels="${opts.channels || 1}"]`) || setting.querySelector('client');
    if (!client) return;
    for (const ch of client.querySelectorAll(':scope > channel')) {
      await this.playChannel(ch, opts);
    }
  }

  async playChannel(channel, opts = {}) {
    for (const el of channel.children) {
      const tag = el.tagName;
      if (tag === 'sound') {
        const file = el.getAttribute('file');
        const vol = range(el.getAttribute('volume'));
        const reps = el.getAttribute('repetitions');
        const fade = Number(el.getAttribute('fadeInDuration') || 0);
        const baseVol = (opts.volume || 1) * (opts.isMusic ? this.ambientVolume : this.effectVolume);
        if (reps === 'infinite') {
          this.startLoop(file, vol * baseVol, fade);
        } else {
          try { this.playOnce(file, vol * baseVol, fade); } catch (_) {}
        }
      } else if (tag === 'break') {
        const len = range(el.getAttribute('length'));
        await this.sleep(len * 1000);
      } else if (tag === 'list') {
        await this.playList(el, opts);
      } else if (tag === 'randomize') {
        await this.playRandomize(el, opts);
      }
    }
  }

  async playList(list, opts) {
    const reps = list.getAttribute('repetitions') === 'infinite';
    do {
      for (const el of list.children) {
        if (el.tagName === 'randomize') await this.playRandomize(el, opts);
        else if (el.tagName === 'break') await this.sleep(range(el.getAttribute('length')) * 1000);
        else if (el.tagName === 'sound') {
          const vol = range(el.getAttribute('volume')) * (opts.isMusic ? this.ambientVolume : this.effectVolume);
          try { this.playOnce(el.getAttribute('file'), vol, Number(el.getAttribute('fadeInDuration') || 0)); } catch (_) {}
        }
      }
    } while (reps && this.enabled);
  }

  async playRandomize(rand, opts) {
    // escolhe 1 item por probabilidade
    const items = [...rand.children].filter(el => ['sound', 'break'].includes(el.tagName));
    const probs = items.map(el => Number(el.getAttribute('probability') || 100 / items.length));
    let r = Math.random() * probs.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= probs[i];
      if (r <= 0 || i === items.length - 1) {
        const el = items[i];
        if (el.tagName === 'sound') {
          const vol = range(el.getAttribute('volume')) * (opts.isMusic ? this.ambientVolume : this.effectVolume);
          try { this.playOnce(el.getAttribute('file'), vol, Number(el.getAttribute('fadeInDuration') || 0)); } catch (_) {}
        } else {
          await this.sleep(range(el.getAttribute('length')) * 1000);
        }
        return;
      }
    }
  }

  playOnce(file, vol = 1, fade = 0) {
    const ctx = this.ensureCtx();
    this.buffer(file).then(buf => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + (fade || 0.05));
      src.connect(g).connect(ctx.destination);
      src.start();
      src.onended = () => { try { g.disconnect(); } catch (_) {} };
    }).catch(e => console.warn('audio:', e.message));
  }

  startLoop(file, vol = 1, fade = 0) {
    if (this.playingLoops.has(file)) return;
    const ctx = this.ensureCtx();
    this.buffer(file).then(buf => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + (fade || 1));
      src.connect(g).connect(ctx.destination);
      src.start();
      this.playingLoops.set(file, { src, g });
    }).catch(e => console.warn('audio loop:', e.message));
  }

  stopLoop(file) {
    const l = this.playingLoops.get(file);
    if (l) { try { l.src.stop(); l.g.disconnect(); } catch (_) {} this.playingLoops.delete(file); }
  }

  stopAllLoops() { for (const f of [...this.playingLoops.keys()]) this.stopLoop(f); }

  setVolumes(ambient, effect) {
    this.ambientVolume = ambient / 100;
    this.effectVolume = effect / 100;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}


/* ==================== world.js ==================== */

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

class World {
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


/* ==================== game.js ==================== */

// game.js — Renderer do mundo + jogador + entrada
//
// Fiel ao cliente original:
//  • tile = 63×63 px, ancoragem base-centro (offset "o" do atlas)
//  • zooms 100/125/150/175%
//  • view ~13×13 tiles com offscreen (aqui: janela + 1 tile de margem)
//  • caminhada tile-a-tile (walklock)


const ZOOMS = [1, 1.25, 1.5, 1.75];

class Game {
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


/* ==================== ui.js ==================== */

// ui.js — Motor de UI com layout (dock/align/anchor/9grid), parse do ui_*.xml
// Sintaxe compatível com pack1/ui_base.xml + ui_portrait.xml + ui_landscape.xml.


const UIPATH = 'pack1';
const REF_TILE = 36.47; // referência: lado curto ≈ 8.5 tiles (UiConfig referenceSize=310)

class UISystem {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.uiTile = REF_TILE;
    this.root = null;
    this.widgets = new Map();     // id -> widget
    this.templates = new Map();   // id -> template xml node
    this.i18n = opts.i18n || { t: (s) => s };
    this.atlas = opts.atlas || new AtlasDB();
    this.density = 1;
    this.imageCache = new Map();
    this.dpi = window.devicePixelRatio || 1;
    this.orientation = 'portrait'; // 'portrait' | 'landscape'
    this.isTablet = false;
  }

  // ---------- unidades ----------
  resize(w, h) {
    const c = this.canvas;
    this.dpi = window.devicePixelRatio || 1;
    c.width = w * this.dpi; c.height = h * this.dpi;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    this.w = w; this.h = h;
    this.orientation = w >= h ? 'landscape' : 'portrait';
    this.uiTile = Math.min(w, h) / 8.5;
    this.scale = Math.min(w, h) / 310; // densidade determinada por tamanho (UiConfig)
    this.density = this.scale;
    if (this.root) this.root.bounds = { x: 0, y: 0, w, h };
  }

  // value,type → px. type: relative|relativeToParent|relativeToTile|absolute|absolute_mm
  toPx(v, type, refPx) {
    if (v == null || isNaN(v)) return 0;
    switch (type) {
      case 'relative':
      case 'relativeToParent':
        return (v / 100) * refPx;
      case 'relativeToTile':
        return (v / 100) * this.uiTile;
      case 'absolute_mm':
        // milímetros físicos (como o cliente original)
        return v * (96 / 25.4) * Math.max(1, this.dpi);
      case 'absolute':
      default:
        return v * this.scale;
    }
  }

  // ---------- backgroundImage ----------
  // formatos:
  //   "file.png;scaleType:9grid,7x8,32x33,multipleStretched"
  //   "file.png,0,0,0,94,94;scaleType:multipleCenter"
  //   "#RRGGBBAA"
  parseBackground(spec) {
    if (!spec) return { type: 'none' };
    if (spec.startsWith('#')) {
      const c = parseColor(spec);
      return c ? { type: 'color', color: c } : { type: 'none' };
    }
    const parts = spec.split(';');
    let filePart = parts[0].replace('%UIPATH%', UIPATH);
    // avalia expressões simples como "2*94"
    const tokens = filePart.split(',').map(t => t.trim());
    const file = tokens.shift();
    const nums = tokens.map(t => {
      try { return eval(t); } catch (_) { return 0; }
    });
    const style = {};
    for (const p of parts.slice(1)) {
      const m = p.match(/scaleType:\s*([^,]+),?(.*)/);
      if (m) {
        style.type = m[1];
        style.args = m[2] ? m[2].split(',').map(x => {
          const pair = x.trim().split('x').map(Number);
          return pair;
        }) : [];
        if (m[1].includes('9grid')) {
          // "9grid,7x8,32x33" → args[0]=borda, args[1]=centro (podem vir em 1 token "9grid;90x18,91x19")
          if (!style.args[0] && style.args[1]) style.args[0] = style.args[1];
        }
      }
    }
    if (style.type && style.type.includes('9grid')) {
      return { type: '9grid', file, style, args: nums };
    }
    if (style.type === 'multipleCenter' || style.type === 'center') {
      return { type: 'multipleCenter', file, style, args: nums };
    }
    return { type: 'image', file, style, args: nums };
  }

  async image(file) {
    if (!this.imageCache.has(file)) this.imageCache.set(file, loadImage(file));
    try { return await this.imageCache.get(file); } catch (_) { return null; }
  }

  // desenha fundo de um widget
  async drawBackground(widget) {
    const bg = widget.bgSpec;
    if (!bg) return;
    const ctx = this.ctx;
    const { x, y, w, h } = widget.bounds;
    if (bg.type === 'color') {
      const [r, g, b, a] = bg.color;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillRect(x, y, w, h);
      return;
    }
    const img = await this.image(bg.file);
    if (!img) return;
    if (bg.type === '9grid') {
      // margens: args[0] = [bw, bh], args[1] = [cw, ch]
      let [bw, bh] = bg.style.args[0] || [0, 0];
      let [cw, ch] = bg.style.args[1] || [0, 0];
      if (!cw) cw = w - bw * 2; if (!ch) ch = h - bh * 2;
      const tiled = bg.style.type.includes('iled');
      this.draw9Grid(img, x, y, w, h, bw, bh, cw, ch, tiled);
    } else if (bg.type === 'multipleCenter') {
      // args: x,y,?,h,size (célula) — usamos último valor como tamanho da célula
      const [sx = 0, sy = 0, , sh = 0, cell = 0] = bg.args;
      const size = cell || sh || 0;
      const wCount = Math.max(1, Math.ceil(w / size));
      const hCount = Math.max(1, Math.ceil(h / size));
      const startX = x + (w - wCount * size) / 2;
      const startY = y + (h - hCount * size) / 2;
      for (let ix = 0; ix < wCount; ix++)
        for (let iy = 0; iy < hCount; iy++)
          ctx.drawImage(img, sx, sy + iy * size, size, size, startX + ix * size, startY + iy * size, size, size);
    } else {
      // imagem simples: estica
      const [sx = 0, sy = 0, sw = img.width, sh = img.height] = bg.args;
      ctx.drawImage(img, sx, sy, sw || img.width, sh || img.height, x, y, w, h);
    }
  }

  draw9Grid(img, x, y, w, h, bw, bh, cw, ch, tiled) {
    const ctx = this.ctx;
    const iw = img.width, ih = img.height;
    const bw2 = Math.min(bw, Math.floor(w / 2)), bh2 = Math.min(bh, Math.floor(h / 2));
    const rw = Math.max(0, iw - bw * 2), rh = Math.max(0, ih - bh * 2);
    const midW = w - bw2 * 2, midH = h - bh2 * 2;
    // cantos
    ctx.drawImage(img, 0, 0, bw, bh, x, y, bw2, bh2);
    ctx.drawImage(img, iw - bw, 0, bw, bh, x + w - bw2, y, bw2, bh2);
    ctx.drawImage(img, 0, ih - bh, bw, bh, x, y + h - bh2, bw2, bh2);
    ctx.drawImage(img, iw - bw, ih - bh, bw, bh, x + w - bw2, y + h - bh2, bw2, bh2);
    if (tiled) {
      // repete o centro
      let px = x + bw2;
      while (px < x + w - bw2) {
        const pw = Math.min(rw, x + w - bw2 - px);
        ctx.drawImage(img, bw, 0, rw, bh, px, y, pw, bh2);               // topo
        ctx.drawImage(img, bw, ih - bh, rw, bh, px, y + h - bh2, pw, bh2); // base
        let py = y + bh2;
        while (py < y + h - bh2) {
          const ph = Math.min(rh, y + h - bh2 - py);
          ctx.drawImage(img, bw, bh, rw, rh, px, py, pw, ph);
          py += rh;
        }
        px += rw;
      }
      // laterais
      let py2 = y + bh2;
      while (py2 < y + h - bh2) {
        const ph = Math.min(rh, y + h - bh2 - py2);
        ctx.drawImage(img, 0, bh, bw, rh, x, py2, bw2, ph);
        ctx.drawImage(img, iw - bw, bh, bw, rh, x + w - bw2, py2, bw2, ph);
        py2 += rh;
      }
    } else {
      ctx.drawImage(img, bw, 0, rw, bh, x + bw2, y, midW, bh2);
      ctx.drawImage(img, bw, ih - bh, rw, bh, x + bw2, y + h - bh2, midW, bh2);
      ctx.drawImage(img, 0, bh, bw, rh, x, y + bh2, bw2, midH);
      ctx.drawImage(img, iw - bw, bh, bw, rh, x + w - bw2, y + bh2, bw2, midH);
      ctx.drawImage(img, bw, bh, rw, rh, x + bw2, y + bh2, midW, midH);
    }
  }

  // ---------- parsing XML de UI ----------
  async loadUI(files) {
    for (const f of files) await this.parseUIFile(f);
    return this;
  }

  async parseUIFile(path) {
    const doc = await loadXML(path);
    // templates primeiro (resolução por uso pode depender)
    for (const t of doc.querySelectorAll('UiTemplate')) {
      const id = t.getAttribute('id');
      this.templates.set(id, t);
    }
  }

  // constrói árvore de widgets a partir de um UiForm raiz (resolvendo UiIf/templates)
  buildRoot(formId, extraAttrs = {}) {
    const node = this.findForm(formId);
    if (!node) throw new Error(`Form ${formId} não encontrado`);
    const root = new Widget(this, null, { x: 0, y: 0, w: this.w, h: this.h });
    this.root = root;
    this.widgets.clear();
    this.buildInto(root, node, extraAttrs);
    return root;
  }

  findForm(id) {
    // procura nos arquivos base/portrait/landscape já carregados
    if (this.formDocs) return this.findNode(this.formDocs, id);
    return null;
  }

  // permite registrar os formulários carregados de ui_base.xml etc.
  registerForms(docs) { this.formDocs = docs; }

  findNode(docs, id) {
    for (const doc of docs) {
      const el = doc.getElementById ? doc.getElementById(id) : doc.querySelector(`[id="${id}"]`);
      if (el) return el;
    }
    return null;
  }

  // resolve template chain → map de atributos
  resolveTemplate(node) {
    const attrs = new Map();
    const chain = [];
    let cur = node;
    while (cur) {
      chain.unshift(cur);
      const ut = cur.getAttribute('useTemplate');
      cur = ut ? this.templates.get(ut) : null;
      if (cur && chain.includes(cur)) break; // ciclo
    }
    for (const c of chain) {
      for (const a of c.attributes) attrs.set(a.name, a.value);
    }
    // children: coleta na ordem da cadeia (templates primeiro), depois filhos reais
    const children = [];
    const added = new Set();
    const collect = (n) => {
      for (const ch of n.children) {
        const cid = ch.getAttribute && ch.getAttribute('id');
        if (cid && added.has(cid)) continue;
        if (cid) added.add(cid);
        children.push(ch);
      }
      const ut = n.getAttribute('useTemplate');
      if (ut && this.templates.has(ut)) collect(this.templates.get(ut));
    };
    collect(node);
    return { attrs, children };
  }

  // cria widget para um elemento XML
  createWidget(xmlNode, resolved) {
    const tag = xmlNode.tagName;
    const a = (k) => resolved.attrs.get(k);
    const common = {
      id: a('id'),
      size: (a('size') || '').split(',').map(s => s.trim() === '' || s === '-1' ? -1 : Number(s)),
      sizeType: (a('sizeType') || 'absolute').split(','),
      offset: (a('offset') || '0,0').split(',').map(Number),
      offsetType: (a('offsetType') || 'absolute').split(','),
      alignH: a('alignH'), alignHWith: a('alignHWith'),
      alignV: a('alignV'), alignVWith: a('alignVWith'),
      anchor: a('anchor'),
      dockLeft: a('dockLeft'), dockRight: a('dockRight'),
      dockTop: a('dockTop'), dockBottom: a('dockBottom'),
      layer: a('layer') ? parseInt(a('layer'), 10) : 0,
      handlePointer: a('handlePointer') !== 'false',
      visible: a('visible') !== 'false',
    };
    let w;
    switch (tag) {
      case 'UiForm': w = new FormWidget(this, common); break;
      case 'UiLabel': w = new LabelWidget(this, common); break;
      case 'UiButton': w = new ButtonWidget(this, common); break;
      case 'UiImage': w = new ImageWidget(this, common); break;
      case 'UiProgressBar': w = new ProgressBarWidget(this, common); break;
      case 'UiItemSlot': w = new ItemSlotWidget(this, common); break;
      case 'UiGameObject': w = new GameObjectWidget(this, common); break;
      case 'UiGameCreature': w = new GameObjectWidget(this, common); break;
      case 'UiTextBox': w = new TextBoxWidget(this, common); break;
      case 'UiListContainer': w = new ListContainerWidget(this, common); break;
      case 'UiListElement': w = new ListElementWidget(this, common); break;
      case 'UiScrollbar': w = new ScrollbarWidget(this, common); break;
      case 'UiComboBox': w = new ComboBoxWidget(this, common); break;
      case 'UiCheckBox': w = new CheckBoxWidget(this, common); break;
      case 'UiAnimatedImage': w = new AnimatedImageWidget(this, common); break;
      case 'UiAnalogStick': w = new AnalogStickWidget(this, common); break;
      case 'UiMiniMap': w = new MiniMapWidget(this, common); break;
      case 'UiGameViewArea': w = new GameViewAreaWidget(this, common); break;
      case 'UiDirectionIndicator': w = new DirectionIndicatorWidget(this, common); break;
      case 'UiSwipe': case 'UiSwipeControl': w = new SwipeWidget(this, common); break;
      case 'UiLoadingIndicator': w = new LoadingIndicatorWidget(this, common); break;
      default: w = new Widget(this, common);
    }
    // atributos comuns restantes
    w.text = a('text') || '';
    w.fontSize = a('fontSize') ? Number(a('fontSize')) : null;
    w.fontSizeType = a('fontSizeType');
    w.textAlignH = a('textAlignH');
    w.textAlignV = a('textAlignV');
    w.backgroundImage = a('backgroundImage');
    w.onPressedImage = a('onPressedImage');
    w.foregroundColor = a('foregroundColor');
    w.foregroundColorEmpty = a('foregroundColorEmpty');
    w.backgroundColor = a('backgroundColor');
    w.borderSize = a('borderSize');
    w.hotkey = a('hotkey');
    w.spriteId = a('spriteId') ? Number(a('spriteId')) : (a('object') ? Number(a('object')) : null);
    w.value = a('value');
    w.visible = common.visible;
    w.confine = a('confineChildrenToParentRect') === 'true';
    if (w.backgroundImage) w.bgSpec = this.parseBackground(w.backgroundImage);
    if (w.onPressedImage) w.pressedSpec = this.parseBackground(w.onPressedImage);
    // cores do progressbar
    if (w.foregroundColor) w.fgColor = parseColor(w.foregroundColor);
    if (w.foregroundColorEmpty) w.fgEmptyColor = parseColor(w.foregroundColorEmpty);
    if (w.backgroundColor) w.bgColor = parseColor(w.backgroundColor);
    return w;
  }

  buildInto(parent, xmlNode, extraAttrs = {}) {
    const resolved = this.resolveTemplate(xmlNode);
    for (const [k, v] of Object.entries(extraAttrs)) resolved.attrs.set(k, v);
    const w = this.createWidget(xmlNode, resolved);
    parent.addChild(w);
    if (w.id) this.widgets.set(w.id, w);
    for (const ch of resolved.children) this.buildInto(w, ch);
    return w;
  }

  // ---------- layout ----------
  layout() {
    if (this.root) this.root.layout();
  }

  // ---------- render ----------
  async render(clear = true) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpi, 0, 0, this.dpi, 0, 0);
    if (clear) ctx.clearRect(0, 0, this.w, this.h);
    if (this.root) await this.root.render();
  }

  // ---------- eventos ----------
  widgetAt(x, y) {
    if (!this.root) return null;
    return this.root.hitTest(x, y);
  }

  find(id) { return this.widgets.get(id) || null; }
}

// ====================== Widgets ======================
class Widget {
  constructor(ui, attrs = {}) {
    this.ui = ui;
    this.id = attrs.id;
    this.parent = null;
    this.children = [];
    this.size = attrs.size || [-1, -1];
    this.sizeType = attrs.sizeType || ['absolute', 'absolute'];
    this.offset = attrs.offset || [0, 0];
    this.offsetType = attrs.offsetType || ['absolute', 'absolute'];
    this.alignH = attrs.alignH; this.alignHWith = attrs.alignHWith;
    this.alignV = attrs.alignV; this.alignVWith = attrs.alignVWith;
    this.anchor = attrs.anchor;
    this.dockLeft = attrs.dockLeft; this.dockRight = attrs.dockRight;
    this.dockTop = attrs.dockTop; this.dockBottom = attrs.dockBottom;
    this.layer = attrs.layer || 0;
    this.handlePointer = attrs.handlePointer !== false;
    this.visible = true;
    this.bounds = { x: 0, y: 0, w: 0, h: 0 };
    this.onClick = null;
    this.onValue = null;
    this.value = attrs.value;
    this.pressed = false;
    this.bgSpec = null; this.pressedSpec = null;
    // propriedades visuais/de texto (podem vir de XML ou criação direta)
    this.text = attrs.text || '';
    this.fontSize = attrs.fontSize != null ? Number(attrs.fontSize) : null;
    this.fontSizeType = attrs.fontSizeType || 'absolute';
    this.textAlignH = attrs.textAlignH;
    this.textAlignV = attrs.textAlignV;
    this.backgroundColor = attrs.backgroundColor;
    this.foregroundColor = attrs.foregroundColor;
    this.foregroundColorEmpty = attrs.foregroundColorEmpty;
    this.borderSize = attrs.borderSize;
    this.spriteId = attrs.spriteId != null ? Number(attrs.spriteId) : null;
    if (attrs.backgroundImage) this.bgSpec = ui.parseBackground(attrs.backgroundImage);
    if (attrs.onPressedImage) this.pressedSpec = ui.parseBackground(attrs.onPressedImage);
    if (this.foregroundColor) this.fgColor = parseColor(this.foregroundColor);
    if (this.foregroundColorEmpty) this.fgEmptyColor = parseColor(this.foregroundColorEmpty);
    if (this.backgroundColor) this.bgColor = parseColor(this.backgroundColor);
  }

  addChild(w) { w.parent = this; this.children.push(w); return w; }
  get(id) { if (this.id === id) return this; for (const c of this.children) { const r = c.get(id); if (r) return r; } return null; }

  // tamanho em px a partir do pai
  measure(avail) {
    const w = this.size[0], h = this.size[1];
    const wt = this.sizeType[0] || 'absolute', ht = this.sizeType[1] || 'absolute';
    let pw = avail.w, ph = avail.h;
    if (w === -1) pw = -1; else pw = this.ui.toPx(w, wt, avail.w);
    if (h === -1) ph = -1; else ph = this.ui.toPx(h, ht, avail.h);
    return { w: pw, h: ph };
  }

  layout() {
    if (!this.parent) { // raiz
      this.bounds = { x: 0, y: 0, w: this.ui.w, h: this.ui.h };
      for (const c of this.children) c.layout();
      return;
    }
    const p = this.parent.bounds;
    let m = this.measure(p);
    let bw = m.w === -1 ? p.w : m.w;
    let bh = m.h === -1 ? p.h : m.h;

    // dock tem prioridade: ajusta posição e tamanho relativo ao alvo
    const dock = (d) => {
      if (!d) return;
      const [target, edge, offRaw, unit] = d.split(',');
      const off = Number(offRaw) || 0;
      const ref = this.resolveRef(target, edge);
      if (!ref) return;
      const offPx = this.ui.toPx(off, unit || 'absolute', p.w);
      if (edge === 'left') { bw = ref.x - this.bounds.x - offPx; }
      if (edge === 'right') { bw = (ref.x + ref.w) - this.bounds.x + offPx; }
      if (edge === 'top') { bh = ref.y - this.bounds.y - offPx; }
      if (edge === 'bottom') { bh = (ref.y + ref.h) - this.bounds.y + offPx; }
    };
    // posicionamento inicial
    let x = p.x, y = p.y;
    if (this.dockLeft) { const [t, e, o, u] = this.dockLeft.split(','); const ref = this.resolveRef(t, e); if (ref) { x = ref.x + this.ui.toPx(Number(o) || 0, u, p.w); } }
    if (this.dockTop) { const [t, e, o, u] = this.dockTop.split(','); const ref = this.resolveRef(t, e); if (ref) { y = ref.y + this.ui.toPx(Number(o) || 0, u, p.h); } }
    if (this.dockRight) { const [t, e, o, u] = this.dockRight.split(','); const ref = this.resolveRef(t, e); if (ref) { x = (ref.x + ref.w) - bw + this.ui.toPx(Number(o) || 0, u, p.w); } }
    if (this.dockBottom) { const [t, e, o, u] = this.dockBottom.split(','); const ref = this.resolveRef(t, e); if (ref) { y = (ref.y + ref.h) - bh + this.ui.toPx(Number(o) || 0, u, p.h); } }
    if (this.anchor) { const ref = this.resolveRef(this.anchor, 'left'); if (ref) { x = ref.x; y = ref.y; } }
    // align
    if (this.alignH) {
      const ref = this.resolveRef(this.alignHWith || 'PARENT', 'left') || p;
      if (this.alignH === 'left') x = ref.x;
      else if (this.alignH === 'right') x = (ref.x + ref.w) - bw;
      else if (this.alignH === 'center') x = ref.x + (ref.w - bw) / 2;
    }
    if (this.alignV) {
      const ref = this.resolveRef(this.alignVWith || 'PARENT', 'top') || p;
      if (this.alignV === 'top') y = ref.y;
      else if (this.alignV === 'bottom') y = (ref.y + ref.h) - bh;
      else if (this.alignV === 'center') y = ref.y + (ref.h - bh) / 2;
    }
    // offset
    x += this.ui.toPx(this.offset[0] || 0, this.offsetType[0] || 'absolute', p.w);
    y += this.ui.toPx(this.offset[1] || 0, this.offsetType[1] || 'absolute', p.h);

    this.bounds = { x, y, w: Math.max(0, bw), h: Math.max(0, bh) };

    // docks que dependem da posição final (ex: dockRight sobre PARENT)
    if (this.dockRight) { const [t, e, o, u] = this.dockRight.split(','); const ref = this.resolveRef(t, e); if (ref) { this.bounds.w = Math.max(0, (ref.x + ref.w) - this.bounds.x + this.ui.toPx(Number(o) || 0, u, p.w)); } }
    if (this.dockBottom) { const [t, e, o, u] = this.dockBottom.split(','); const ref = this.resolveRef(t, e); if (ref) { this.bounds.h = Math.max(0, (ref.y + ref.h) - this.bounds.y + this.ui.toPx(Number(o) || 0, u, p.h)); } }

    for (const c of this.children) c.layout();
  }

  // resolve alvo do dock/align/anchor → bounds
  resolveRef(target, edge) {
    const ui = this.ui;
    if (!target || target === 'PARENT') {
      const p = this.parent ? this.parent.bounds : { x: 0, y: 0, w: ui.w, h: ui.h };
      if (edge === 'right') return { x: p.x + p.w, y: p.y, w: 0, h: p.h };
      if (edge === 'bottom') return { x: p.x, y: p.y + p.h, w: p.w, h: 0 };
      if (edge === 'center') return { x: p.x + p.w / 2, y: p.y + p.h / 2, w: 0, h: 0 };
      return p;
    }
    const w = ui.find(target);
    if (!w) return null;
    const b = w.bounds;
    if (edge === 'right') return { x: b.x + b.w, y: b.y, w: 0, h: b.h };
    if (edge === 'bottom') return { x: b.x, y: b.y + b.h, w: b.w, h: 0 };
    if (edge === 'center') return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0 };
    return b;
  }

  async render() {
    if (!this.visible) return;
    const ui = this.ui;
    const ctx = ui.ctx;
    await this.drawBackground(this.bgSpec);
    await this.drawSelf();
    // filhos por layer
    const kids = [...this.children].filter(c => c.visible).sort((a, b) => (a.layer - b.layer) || 0);
    for (const c of kids) await c.render();
    await this.drawOverlay();
  }

  async drawBackground(spec) {
    if (!spec) return;
    await this.ui.drawBackground({ bgSpec: spec, bounds: this.bounds });
  }

  async drawSelf() {}
  async drawOverlay() {}

  hitTest(x, y) {
    if (!this.visible) return null;
    const kids = [...this.children].filter(c => c.visible).sort((a, b) => (b.layer - a.layer));
    for (const c of kids) {
      const r = c.hitTest(x, y);
      if (r) return r;
    }
    const b = this.bounds;
    if (this.handlePointer && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return this;
    return null;
  }

  pointerDown(x, y) {
    const hit = this.hitTest(x, y);
    if (hit) { hit.pressed = true; return hit; }
    return null;
  }
  pointerUp(x, y) {
    const hit = this.hitTest(x, y);
    if (hit && hit.pressed) {
      hit.pressed = false;
      if (hit.onClick) hit.onClick(hit);
    }
    for (const w of this.all()) if (w.pressed) w.pressed = false;
    return hit;
  }
  *all() { yield this; for (const c of this.children) yield* c.all(); }
}

class FormWidget extends Widget {}

class LabelWidget extends Widget {
  async drawSelf() {
    if (!this.text) return;
    const ctx = this.ui.ctx;
    const b = this.bounds;
    const size = this.fontSize ? (this.fontSizeType === 'relative' ? this.fontSize / 100 * 14 : this.fontSize) * this.ui.scale : 14 * this.ui.scale;
    ctx.font = `${size}px sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    const txt = this.ui.i18n.t(this.text);
    const lines = txt.split('\n');
    const lh = size * 1.25;
    const align = this.textAlignH || 'center';
    const valign = this.textAlignV || 'center';
    const totalH = lines.length * lh;
    let ty = b.y + (valign === 'top' ? 0 : valign === 'bottom' ? b.h - totalH : (b.h - totalH) / 2) + size;
    ctx.textBaseline = 'alphabetic';
    for (const line of lines) {
      const tw = ctx.measureText(line).width;
      const tx = align === 'left' ? b.x : align === 'right' ? b.x + b.w - tw : b.x + (b.w - tw) / 2;
      ctx.fillText(line, tx, ty);
      ty += lh;
    }
  }
}

class ButtonWidget extends LabelWidget {
  async drawSelf() {
    const spec = this.pressed && this.pressedSpec ? this.pressedSpec : this.bgSpec;
    if (spec) await this.ui.drawBackground({ bgSpec: spec, bounds: this.bounds });
    await super.drawSelf();
  }
  pointerDown(x, y) {
    if (this.handlePointer && x >= this.bounds.x && x <= this.bounds.x + this.bounds.w &&
        y >= this.bounds.y && y <= this.bounds.y + this.bounds.h) { this.pressed = true; return this; }
    return null;
  }
}

class ImageWidget extends Widget {
  async drawSelf() { if (this.bgSpec) await this.ui.drawBackground({ bgSpec: this.bgSpec, bounds: this.bounds }); }
}

class ProgressBarWidget extends Widget {
  constructor(ui, attrs) { super(ui, attrs); this.progress = attrs.value != null ? Number(attrs.value) : 1; }
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    const [bl, bt, br, bb] = (this.borderSize || '0,0,0,0').split(',').map(Number);
    if (this.bgColor) {
      const [r, g, bl2, a] = this.bgColor;
      ctx.fillStyle = `rgba(${r},${g},${bl2},${a})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    const inner = { x: b.x + bl, y: b.y + bt, w: b.w - bl - br, h: b.h - bt - bb };
    if (this.fgEmptyColor) {
      const [r, g, bl2, a] = this.fgEmptyColor;
      ctx.fillStyle = `rgba(${r},${g},${bl2},${a})`;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    if (this.fgColor) {
      const [r, g, bl2, a] = this.fgColor;
      ctx.fillStyle = `rgba(${r},${g},${bl2},${a})`;
      const fw = Math.max(0, Math.min(1, this.progress)) * inner.w;
      ctx.fillRect(inner.x, inner.y, fw, inner.h);
    }
  }
}

class ItemSlotWidget extends Widget {
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    if (this.spriteId) {
      await this.ui.atlas.draw(ctx, this.spriteId, b.x + b.w / 2 - 31.5, b.y + b.h - 63, 1);
    }
  }
}

class GameObjectWidget extends Widget {
  async drawSelf() {
    if (!this.spriteId) return;
    const ctx = this.ui.ctx;
    const b = this.bounds;
    await this.ui.atlas.draw(ctx, this.spriteId, b.x + b.w / 2 - 31.5, b.y + b.h - 63, 1);
  }
}

class TextBoxWidget extends LabelWidget {
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    await super.drawSelf();
  }
}

class ListContainerWidget extends Widget {}
class ListElementWidget extends ButtonWidget {}

class ScrollbarWidget extends Widget {
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    if (b.w > b.h) ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.1, b.w * 0.3, b.h * 0.8);
    else ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.1, b.w * 0.8, b.h * 0.3);
  }
}

class ComboBoxWidget extends ButtonWidget {}
class CheckBoxWidget extends ButtonWidget {
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (this.value === 'true') {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + 4, b.y + b.h / 2);
      ctx.lineTo(b.x + b.w / 3, b.y + b.h - 5);
      ctx.lineTo(b.x + b.w - 4, b.y + 4);
      ctx.stroke();
    }
  }
}

class AnimatedImageWidget extends ImageWidget {
  constructor(ui, attrs) { super(ui, attrs); this.t = 0; }
  async drawSelf() { await super.drawSelf(); this.t += 0.05; }
}

class SwipeWidget extends Widget {}

class AnalogStickWidget extends Widget {
  constructor(ui, attrs) {
    super(ui, attrs);
    this.active = false;
    this.dx = 0; this.dy = 0; // -1..1
    this.base = { x: 0, y: 0 };
    this.knob = { x: 0, y: 0 };
    this.touchId = null;
    this.onMove = null;
  }
  layout() {
    super.layout();
    const b = this.bounds;
    this.base = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    this.radius = Math.min(b.w, b.h) / 2;
    this.knob = { x: this.base.x, y: this.base.y };
  }
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.base.x, this.base.y, this.radius * 0.85, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(this.knob.x, this.knob.y, this.radius * 0.42, 0, Math.PI * 2); ctx.fill();
    // setas direcionais (norte sempre = cima)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const tri = (cx, cy, rot) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.beginPath(); ctx.moveTo(0, -this.radius * 0.75); ctx.lineTo(-7, -this.radius * 0.55); ctx.lineTo(7, -this.radius * 0.55); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    tri(this.base.x, this.base.y, 0);
    tri(this.base.x, this.base.y, Math.PI / 2);
    tri(this.base.x, this.base.y, Math.PI);
    tri(this.base.x, this.base.y, -Math.PI / 2);
  }
  pointerDown(x, y) {
    if (!this.handlePointer) return null;
    const b = this.bounds;
    // área de toque maior que o visual (hitSize do cliente original)
    const pad = Math.max(b.w, b.h) * 0.8;
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
      this.active = true;
      this.moveTo(x, y);
      return this;
    }
    return null;
  }
  moveTo(x, y) {
    if (!this.active) return;
    let dx = (x - this.base.x) / this.radius;
    let dy = (y - this.base.y) / this.radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    // deadzone
    if (len < 0.2) { dx = 0; dy = 0; }
    this.dx = dx; this.dy = dy;
    this.knob = { x: this.base.x + dx * this.radius * 0.6, y: this.base.y + dy * this.radius * 0.6 };
    if (this.onMove) this.onMove(dx, dy);
  }
  release() {
    this.active = false;
    this.dx = 0; this.dy = 0;
    this.knob = { x: this.base.x, y: this.base.y };
    if (this.onMove) this.onMove(0, 0);
  }
}

class DirectionIndicatorWidget extends Widget {
  constructor(ui, attrs) { super(ui, attrs); this.dir = { x: 0, y: 0 }; }
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(cx, cy, Math.min(b.w, b.h) / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    if (this.dir.x || this.dir.y) {
      const ang = Math.atan2(this.dir.y, this.dir.x);
      ctx.strokeStyle = 'rgba(255,220,0,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * (Math.min(b.w, b.h) / 2 - 4), cy + Math.sin(ang) * (Math.min(b.w, b.h) / 2 - 4));
      ctx.stroke();
    }
  }
}

class MiniMapWidget extends Widget {
  async drawSelf() {
    const ctx = this.ui.ctx;
    const b = this.bounds;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
}

class GameViewAreaWidget extends Widget {
  // o mundo é desenhado pelo game.js ANTES da UI; esta área é transparente
  constructor(ui, attrs) {
    super(ui, attrs);
    this.instantDirty = true;
  }
  async drawSelf() {}
}

class LoadingIndicatorWidget extends Widget {
  constructor(ui, attrs) { super(ui, attrs); this.t = 0; }
  async drawSelf() {
    this.t += 0.1;
    const ctx = this.ui.ctx;
    const b = this.bounds;
    const r = Math.min(b.w, b.h) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#FFF';
    ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, this.t, this.t + 2.2); ctx.stroke();
  }
}



/* ==================== main.js ==================== */

// main.js — Bootstrap PWA: carregamento, menu principal, HUD e loop do jogo
// Funciona em modo PWA (File System Access API, file://) e em modo servidor (fetch).


const UI_IMAGES = {
  menuBg: 'pack1/9grid_backdrop_mainmenu.png',
  menuPanel: 'pack1/9grid_backdrop_menu.png',
  btnIdle: 'pack1/9grid_button_default_idle.png',
  btnActive: 'pack1/9grid_button_default_active.png',
  btnGreenIdle: 'pack1/9grid_button_default_green_idle.png',
  btnGreenActive: 'pack1/9grid_button_default_green_active.png',
};

const btnSpec = (ui, img) =>
  ui.parseBackground(`${img};scaleType:9grid,7x8,32x33,multipleStretched`);

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.i18n = new I18n();
    this.ui = new UISystem(this.canvas, { i18n: this.i18n });
    this.atlas = new AtlasDB();
    this.ui.atlas = this.atlas;
    this.audio = new AudioEngine();
    this.state = 'boot'; // boot | menu | playing
    this.world = null;
    this.game = null;
    this.loadingPct = 0;
    this.loadingText = '';
    this.lastT = 0;
    this.mouse = { down: false, moved: false, startX: 0, startY: 0 };
    this.held = new Set();
    this.analogDir = { dx: 0, dy: 0 };
    this.hud = {};
    this.dialog = null;
    this.playerName = 'Aragorn'; // nome genérico (LOTR)
  }

  async boot() {
    if (this._booting || this._booted) return;
    this._booting = true;
    try {
      await initLoader();
      if (!isLocalMode() && location.protocol === 'file:') {
        // file:// sem pasta escolhida → aguarda o overlay
        this._booting = false;
        return;
      }
      document.getElementById('fs-overlay')?.classList.add('hidden');
      window.addEventListener('resize', () => this.onResize());
      this.onResize();
      this.bindInput();
      await this.loading(async (setPct, setText) => {
        setText('id_please_wait');
        setPct(0.05);
        await this.i18n.load('pt');
        await this.audio.init();
        setPct(0.15);
        await this.atlas.loadAllPacks((done, total) => setPct(0.15 + 0.6 * (done / total)));
        for (const key of Object.values(UI_IMAGES)) {
          try { await loadImage(key); } catch (_) {}
        }
        setPct(0.85);
        const worldData = JSON.parse(await loadText('web/data/world.json'));
        this.world = new World(worldData);
        this.game = new Game(this.atlas, this.world, {
          playerName: this.playerName,
          playerSprite: worldData.playerSprite || 112,
        });
        setPct(1);
      });
      this.state = 'menu';
      this.buildMainMenu();
      this._booted = true;
      if (isFileListMode()) {
        console.log(`Carregado via lista de arquivos: ${fileListCount()} arquivos indexados`);
      }
      this.loop();
    } finally {
      this._booting = false;
    }
  }

  async loading(run) {
    const ctx = this.canvas.getContext('2d');
    const draw = () => {
      const dpi = window.devicePixelRatio || 1;
      ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.ui.w, this.ui.h);
      ctx.fillStyle = '#FFF';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.loadingText || 'Carregando…', this.ui.w / 2, this.ui.h / 2 - 20);
      const bw = Math.min(300, this.ui.w * 0.6), bh = 18;
      ctx.strokeStyle = '#888';
      ctx.strokeRect(this.ui.w / 2 - bw / 2, this.ui.h / 2, bw, bh);
      ctx.fillStyle = '#4A4';
      const fill = isLocalMode() ? (bw - 4) * this.loadingPct : (bw - 4);
      ctx.fillRect(this.ui.w / 2 - bw / 2 + 2, this.ui.h / 2 + 2, Math.min(bw - 4, fill), bh - 4);
      ctx.fillStyle = '#AAA';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${Math.round(this.loadingPct * 100)}%`, this.ui.w / 2, this.ui.h / 2 + bh + 18);
    };
    const iv = setInterval(draw, 60);
    await run(
      (p) => { this.loadingPct = p; },
      (t) => { this.loadingText = this.i18n.has(t) ? this.i18n.t(t) : t; },
    );
    clearInterval(iv);
  }

  click() {
    try { this.audio.playSetting('sfx', 3); } catch (_) {}
  }

  // ---------- MENU PRINCIPAL ----------
  buildMainMenu() {
    const ui = this.ui;
    this.dialog = null;
    const root = new FormWidget(ui, { id: 'ROOT' });
    root.bounds = { x: 0, y: 0, w: ui.w, h: ui.h };
    ui.root = root;
    ui.widgets.clear();

    const menu = new FormWidget(ui, {
      id: 'MENU', size: [62, 74], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'center', layer: 1,
    });
    menu.bgSpec = ui.parseBackground(`${UI_IMAGES.menuBg};scaleType:9grid,7x8,32x33,multipleStretched`);
    root.addChild(menu);

    const title = new LabelWidget(ui, {
      id: 'TITLE', size: [100, 12], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'top', offset: [0, 8], offsetType: ['relative', 'relative'],
      text: 'MUNDO DE BATALHA', fontSize: 26, layer: 2,
    });
    menu.addChild(title);

    const sub = new LabelWidget(ui, {
      id: 'SUB', size: [100, 8], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'top', offset: [0, 20], offsetType: ['relative', 'relative'],
      text: 'PWA Offline v0.2 — engine TibiaME', fontSize: 11, layer: 2,
    });
    menu.addChild(sub);

    const mkBtn = (id, textId, yPct, onClick, green = false) => {
      const b = new ButtonWidget(ui, {
        id, size: [70, 11], sizeType: ['relative', 'relative'],
        alignH: 'center', alignV: 'top', offset: [0, yPct], offsetType: ['relative', 'relative'],
        text: textId, layer: 2,
      });
      b.bgSpec = btnSpec(ui, green ? UI_IMAGES.btnGreenIdle : UI_IMAGES.btnIdle);
      b.pressedSpec = btnSpec(ui, green ? UI_IMAGES.btnGreenActive : UI_IMAGES.btnActive);
      b.onClick = () => { this.click(); onClick && onClick(); };
      menu.addChild(b);
      return b;
    };

    mkBtn('BTN_CONTINUE', 'id_continue_game', 30, () => this.startGame());
    mkBtn('BTN_NEWGAME', 'id_new_game', 44, () => this.startGame(), true);
    mkBtn('BTN_OPTIONS', 'id_options', 58, () => this.openDialog('options'));
    mkBtn('BTN_ABOUT', 'id_about', 72, () => this.openDialog('about'));
    mkBtn('BTN_EXIT', 'id_exit', 86, () => this.openDialog('exit'));
  }

  // ---------- diálogos ----------
  openDialog(kind) {
    const ui = this.ui;
    const dlg = new FormWidget(ui, {
      id: 'DLG', size: [70, 60], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'center', layer: 20,
    });
    dlg.bgSpec = ui.parseBackground(`${UI_IMAGES.menuPanel};scaleType:9grid,18x18,19x19,multipleStretched`);

    const titleMap = { options: 'id_options', about: 'id_about', exit: 'id_exit', ingame: 'id_ingame_menu' };
    const title = new LabelWidget(ui, {
      id: 'DLG_TITLE', size: [100, 12], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'top', offset: [0, 3], offsetType: ['relative', 'relative'],
      text: titleMap[kind] || kind, fontSize: 16,
    });
    dlg.addChild(title);

    const body = new TextBoxWidget(ui, {
      id: 'DLG_BODY', size: [84, 52], sizeType: ['relative', 'relative'],
      alignH: 'center', alignV: 'center', offset: [0, 4], offsetType: ['relative', 'relative'],
      text: '', fontSize: 12, handlePointer: false,
    });
    dlg.addChild(body);

    const mkBtn = (id, textId, xPct, yPct, onClick, green = false) => {
      const b = new ButtonWidget(ui, {
        id, size: [38, 11], sizeType: ['relative', 'relative'],
        alignH: 'left', alignV: 'top', offset: [xPct, yPct], offsetType: ['relative', 'relative'],
        text: textId, fontSize: 12, layer: 5,
      });
      b.bgSpec = btnSpec(ui, green ? UI_IMAGES.btnGreenIdle : UI_IMAGES.btnIdle);
      b.pressedSpec = btnSpec(ui, green ? UI_IMAGES.btnGreenActive : UI_IMAGES.btnActive);
      b.onClick = () => { this.click(); onClick && onClick(); };
      dlg.addChild(b);
      return b;
    };

    if (kind === 'options') {
      body.text = `${this.i18n.t('id_ambient_volume')}: 100\n${this.i18n.t('id_sound_effect_volume')}: 100\n${this.i18n.t('id_gameviewzoommode')}: ${this.game ? this.game.zoomLabel() : '100%'}\n${this.i18n.t('id_language')}: Português (pt)`;
      mkBtn('DLG_BACK', 'id_back', 31, 82, () => this.closeDialog());
    } else if (kind === 'about') {
      body.text = `MUNDO DE BATALHA\n\n${this.i18n.t('id_version_major_d_minor_d_text_s', 2, 49, 'PWA HTML Offline')}\n\nEngenharia reversa do cliente TibiaME v2.49\nAssets © CipSoft GmbH — uso pessoal/educacional\n\n${this.i18n.t('id_copyright_notice')}`;
      mkBtn('DLG_BACK', 'id_back', 31, 82, () => this.closeDialog());
    } else if (kind === 'exit') {
      body.text = `${this.i18n.t('id_sure_header')}\n\n${this.i18n.t('id_sure_save_and_logout_text')}`;
      mkBtn('DLG_NO', 'id_no', 6, 82, () => this.closeDialog());
      mkBtn('DLG_YES', 'id_yes', 56, 82, () => {
        this.closeDialog();
        this.state = 'menu';
        this.buildMainMenu();
        this.audio.stopAllLoops();
      }, true);
    } else if (kind === 'ingame') {
      body.text = '';
      body.visible = false;
      mkBtn('DLG_RESUME', 'id_continue_game', 31, 30, () => this.closeDialog(), true);
      mkBtn('DLG_OPTIONS', 'id_options', 31, 46, () => { this.closeDialog(); this.openDialog('options'); });
      mkBtn('DLG_QUIT', 'id_logout', 31, 62, () => {
        this.closeDialog();
        this.state = 'menu';
        this.buildMainMenu();
        this.audio.stopAllLoops();
      });
    }

    this.dialog = dlg;
    this.ui.root.addChild(dlg);
  }

  closeDialog() {
    if (this.dialog && this.dialog.parent) {
      const parent = this.dialog.parent;
      parent.children = parent.children.filter(c => c !== this.dialog);
    }
    this.dialog = null;
  }

  // ---------- HUD ----------
  buildHUD() {
    const ui = this.ui;
    const root = new FormWidget(ui, { id: 'ROOT' });
    root.bounds = { x: 0, y: 0, w: ui.w, h: ui.h };
    ui.root = root;
    ui.widgets.clear();

    const view = new GameViewAreaWidget(ui, {
      id: 'FRM_VIEWAREA', size: [100, 100], sizeType: ['relative', 'relative'],
      layer: 0, handlePointer: true,
    });
    root.addChild(view);

    // barras do jogador
    const bars = new FormWidget(ui, {
      id: 'FRM_PLAYERBARS', size: [34, 26], sizeType: ['relative', 'relative'],
      alignH: 'left', alignV: 'top', offset: [1, 2], offsetType: ['relative', 'relative'], layer: 5,
    });
    root.addChild(bars);
    const hp = new ProgressBarWidget(ui, { id: 'PBA_HP', size: [100, 8], sizeType: ['relative', 'relative'], layer: 6 });
    hp.fgColor = [255, 40, 40, 0.9]; hp.fgEmptyColor = [80, 80, 80, 0.9]; hp.bgColor = [0, 0, 0, 0.8];
    bars.addChild(hp);
    const mana = new ProgressBarWidget(ui, {
      id: 'PBA_MANA', size: [100, 8], sizeType: ['relative', 'relative'],
      alignV: 'top', offset: [0, 10], offsetType: ['relative', 'relative'], layer: 6,
    });
    mana.fgColor = [40, 120, 255, 0.9]; mana.fgEmptyColor = [80, 80, 80, 0.9]; mana.bgColor = [0, 0, 0, 0.8];
    bars.addChild(mana);
    const xp = new ProgressBarWidget(ui, {
      id: 'PBA_XP', size: [100, 4], sizeType: ['relative', 'relative'],
      alignV: 'top', offset: [0, 20], offsetType: ['relative', 'relative'], layer: 6,
    });
    xp.fgColor = [40, 220, 40, 0.9]; xp.fgEmptyColor = [60, 60, 60, 0.9]; xp.bgColor = [0, 0, 0, 0.8];
    bars.addChild(xp);
    const pName = new LabelWidget(ui, {
      id: 'LBL_PLAYER', size: [100, 6], sizeType: ['relative', 'relative'],
      alignV: 'top', offset: [0, 24], offsetType: ['relative', 'relative'],
      text: `${this.playerName} (8)`, fontSize: 10, textAlignH: 'left',
    });
    bars.addChild(pName);

    // botões de ação
    const mkActionBtn = (id, textId, xPct, yPct, onClick) => {
      const b = new ButtonWidget(ui, {
        id, size: [26, 10], sizeType: ['relative', 'relative'],
        alignH: 'right', alignV: 'top', offset: [-xPct, yPct], offsetType: ['relative', 'relative'],
        text: textId, fontSize: 10, layer: 6,
      });
      b.bgSpec = btnSpec(ui, UI_IMAGES.btnIdle);
      b.pressedSpec = btnSpec(ui, UI_IMAGES.btnActive);
      b.onClick = () => { this.click(); onClick && onClick(); };
      root.addChild(b);
      return b;
    };
    mkActionBtn('BTN_BAG', 'id_backpack', 1, 2, () => {});
    mkActionBtn('BTN_SKILLS', 'id_playerinfo', 1, 14, () => {});
    mkActionBtn('BTN_ZOOM', 'id_gameviewzoommode', 1, 26, () => this.game.cycleZoom());
    mkActionBtn('BTN_MENU', 'id_ingame_menu', 1, 38, () => this.openDialog('ingame'));

    // joystick (30mm, igual ao CTL_VIRTUALDIRECTION original)
    const stick = new AnalogStickWidget(ui, {
      id: 'CTL_ANALOG', size: [30, 30], sizeType: ['absolute_mm', 'absolute_mm'],
      alignH: 'left', alignV: 'bottom', offset: [3, -3], offsetType: ['absolute_mm', 'absolute_mm'],
      layer: 8,
    });
    stick.onMove = (dx, dy) => { this.analogDir = { dx, dy }; };
    root.addChild(stick);

    const dir = new DirectionIndicatorWidget(ui, {
      id: 'CTL_DIR', size: [8, 8], sizeType: ['absolute_mm', 'absolute_mm'],
      alignH: 'right', alignV: 'bottom', offset: [-3, -3], offsetType: ['absolute_mm', 'absolute_mm'],
      layer: 8,
    });
    root.addChild(dir);

    this.hud = { view, hp, mana, xp, pName, stick, dir };
    this.analogDir = { dx: 0, dy: 0 };
  }

  startGame() {
    this.state = 'playing';
    this.buildHUD();
    const amb = this.world.ambientSetting;
    if (amb) {
      try { this.audio.playSetting('music', amb, { channels: 2, isMusic: true }); } catch (_) {}
    }
  }

  // ---------- entrada ----------
  bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      this.mouse.down = true; this.mouse.moved = false;
      this.mouse.startX = p.x; this.mouse.startY = p.y;
      if (this.state === 'playing') {
        const stick = this.hud.stick;
        if (stick && stick.pointerDown(p.x, p.y)) { c.setPointerCapture(e.pointerId); return; }
        if (this.dialog) {
          const hit = this.dialog.pointerDown(p.x, p.y);
          if (hit) c.setPointerCapture(e.pointerId);
          return;
        }
        const hit = this.ui.root.pointerDown(p.x, p.y);
        if (hit) c.setPointerCapture(e.pointerId);
      } else {
        if (this.dialog) {
          const hit = this.dialog.pointerDown(p.x, p.y);
          if (hit) c.setPointerCapture(e.pointerId);
        } else if (this.ui.root) {
          const hit = this.ui.root.pointerDown(p.x, p.y);
          if (hit) c.setPointerCapture(e.pointerId);
        }
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (!this.mouse.down) return;
      if (Math.hypot(p.x - this.mouse.startX, p.y - this.mouse.startY) > 6) this.mouse.moved = true;
      if (this.state === 'playing' && this.hud.stick && this.hud.stick.active) {
        this.hud.stick.moveTo(p.x, p.y);
      }
    });
    c.addEventListener('pointerup', (e) => {
      const p = pos(e);
      const wasStick = this.state === 'playing' && this.hud.stick && this.hud.stick.active;
      if (wasStick) this.hud.stick.release();
      if (this.state === 'playing' && !this.dialog && !wasStick) {
        const hit = this.ui.root.pointerUp(p.x, p.y);
        const onButton = hit && hit.id && !['FRM_VIEWAREA', 'ROOT'].includes(hit.id) && hit !== this.hud.view;
        if (!this.mouse.moved && !onButton) {
          // tap-to-walk
          const ts = 63 * this.game.zoom;
          const wx = Math.floor((p.x + this.game.cam.x) / ts);
          const wy = Math.floor((p.y + this.game.cam.y) / ts);
          const path = this.world.findPath(
            { x: this.game.player.x, y: this.game.player.y },
            { x: wx, y: wy },
          );
          if (path && path.length) this.game.walkPath(path);
        }
      } else if (this.dialog) {
        this.dialog.pointerUp(p.x, p.y);
      } else if (!wasStick && this.ui.root) {
        this.ui.root.pointerUp(p.x, p.y);
      }
      this.mouse.down = false;
    });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.held.add(k);
      if (this.state === 'playing') {
        if (this.dialog) {
          if (k === 'escape' || k === 'backspace') this.closeDialog();
          return;
        }
        if (k === 'escape' || k === 'm') this.openDialog('ingame');
        if (k === 'z') this.game.cycleZoom();
      } else if (this.state === 'menu') {
        if (this.dialog) {
          if (k === 'escape' || k === 'backspace') this.closeDialog();
          return;
        }
        if (k === '1') this.startGame();
        if (k === '3') this.openDialog('options');
        if (k === '4') this.openDialog('about');
        if (k === '6' || k === 'escape') this.openDialog('exit');
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
  }

  // ---------- loop ----------
  loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000) || 0.016;
    this.lastT = now;
    this.update(dt);
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  update(dt) {
    if (this.state === 'playing' && !this.dialog) {
      const p = this.game.player;
      let dx = 0, dy = 0;
      if (this.held.has('arrowleft') || this.held.has('a')) dx -= 1;
      if (this.held.has('arrowright') || this.held.has('d')) dx += 1;
      if (this.held.has('arrowup') || this.held.has('w')) dy -= 1;
      if (this.held.has('arrowdown') || this.held.has('s')) dy += 1;
      if (dx || dy) this.game.inputDir(dx, dy);
      if ((this.analogDir.dx || this.analogDir.dy) && !p.walking) {
        this.game.inputDir(this.analogDir.dx, this.analogDir.dy);
      }
      this.game.update(dt);
      this.hud.hp.progress = p.hp / p.maxHp;
      this.hud.mana.progress = p.mana / p.maxMana;
      this.hud.xp.progress = p.xp;
      this.hud.pName.text = `${p.name} (${p.level})`;
      this.hud.dir.dir = p.walking ? p.dir : { x: 0, y: 0 };
    }
  }

  async render() {
    if (this.state === 'boot') return;
    const ui = this.ui;
    if (this.state === 'playing') {
      this.game.setView({ x: 0, y: 0, w: ui.w, h: ui.h });
      await this.game.draw(ui.ctx, 0.016);
      if (ui.root) {
        ui.root.bounds = { x: 0, y: 0, w: ui.w, h: ui.h };
        ui.root.layout();
        await ui.render(false);
      }
    } else {
      if (ui.root) {
        ui.root.bounds = { x: 0, y: 0, w: ui.w, h: ui.h };
        ui.root.layout();
        await ui.render();
      }
    }
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.ui.resize(w, h);
  }
}

const app = new App();
window.app = app;
// expõe para o index.html (modo compatível <input webkitdirectory>)
window.initLoaderFromFileList = initLoaderFromFileList;

(async () => {
  try {
    const has = await initLoader();
    if (!has && location.protocol === 'file:') {
      // aguarda seleção da pasta no overlay do index.html
      const hint = document.getElementById('fs-hint');
      if (hint) hint.style.display = 'block';
      return;
    }
    await app.boot();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('err');
    if (el) {
      el.style.display = 'block';
      el.textContent = 'Erro: ' + err.message +
        '\n\nModo PWA: clique em "Escolher Pasta do Jogo".\nModo servidor: python3 server.py e abra localhost:8000/web/';
    }
  }
})();

})(typeof window !== "undefined" ? window : this);