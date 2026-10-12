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

import { loadXML, loadAudioBuffer } from './loader.js';

function range(v) {
  if (v == null) return 1;
  const s = String(v);
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    return a + Math.random() * (b - a);
  }
  return Number(s) / 100;
}

export class AudioEngine {
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
