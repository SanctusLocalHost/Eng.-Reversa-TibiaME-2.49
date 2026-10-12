// ui.js — Motor de UI com layout (dock/align/anchor/9grid), parse do ui_*.xml
// Sintaxe compatível com pack1/ui_base.xml + ui_portrait.xml + ui_landscape.xml.

import { loadXML, loadImage, loadText } from './loader.js';
import { AtlasDB, parseColor, TILE } from './atlas.js';

const UIPATH = 'pack1';
const REF_TILE = 36.47; // referência: lado curto ≈ 8.5 tiles (UiConfig referenceSize=310)

export class UISystem {
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

export {
  Widget, FormWidget, LabelWidget, ButtonWidget, ImageWidget, ProgressBarWidget,
  ItemSlotWidget, GameObjectWidget, TextBoxWidget, ListContainerWidget, ListElementWidget,
  ScrollbarWidget, ComboBoxWidget, CheckBoxWidget, AnimatedImageWidget, SwipeWidget,
  AnalogStickWidget, DirectionIndicatorWidget, MiniMapWidget, GameViewAreaWidget,
  LoadingIndicatorWidget,
};
