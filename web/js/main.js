// main.js — Bootstrap PWA: carregamento, menu principal, HUD e loop do jogo
// Funciona em modo PWA (File System Access API, file://) e em modo servidor (fetch).

import { AtlasDB } from './atlas.js';
import {
  UISystem, Widget, FormWidget, LabelWidget, ButtonWidget, TextBoxWidget,
  ProgressBarWidget, GameViewAreaWidget, AnalogStickWidget, DirectionIndicatorWidget,
} from './ui.js';
import { I18n } from './i18n.js';
import { AudioEngine } from './audio.js';
import { World } from './world.js';
import { Game } from './game.js';
import { loadText, loadImage, initLoader, isLocalMode, isFileListMode, fileListCount, initLoaderFromFileList } from './loader.js';

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
