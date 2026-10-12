// loader.js — Carregamento universal: File System Access API (file:// / PWA) + fetch (http://)
//
// Modo PWA (file://): requer pasta do jogo selecionada (window.getGameRoot)
// Modo servidor (http://): usa fetch relativo à raiz do jogo

let gameRootHandle = null;
let fileIndex = null; // Map caminhoRelativo -> File (modo <input webkitdirectory>)

export async function initLoader() {
  if (window.getGameRoot) {
    try { gameRootHandle = await window.getGameRoot(); } catch (_) { gameRootHandle = null; }
  }
  return !!(gameRootHandle || fileIndex);
}

// Fallback universal (funciona no Brave, Firefox, Safari): <input webkitdirectory>
export function initLoaderFromFileList(fileList) {
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

export function isFileListMode() { return !!fileIndex; }

export function isFileSystemMode() {
  return !!gameRootHandle;
}

export function isLocalMode() {
  return !!(gameRootHandle || fileIndex);
}

export function fileListCount() { return fileIndex ? fileIndex.size : 0; }

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

export async function loadText(path) {
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

export async function loadXML(path) {
  const text = await loadText(path);
  const doc = new DOMParser().parseFromString(sanitizeXML(text), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`XML inválido: ${path}`);
  return doc;
}

export async function loadImage(path) {
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

export async function loadAudioBuffer(path, ctx) {
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

// Sanitiza XML com atributos duplicados (os dados reais do jogo têm)
export function sanitizeXML(text) {
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
export async function listDir(path) {
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
