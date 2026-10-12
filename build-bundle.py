#!/usr/bin/env python3
"""
build-bundle.py — Gera bundle.js (jogo) e bundle-core.js (ferramentas) a partir
dos módulos ES em web/js/, permitindo rodar o jogo direto do file:// (PWA)
sem precisar de servidor (módulos ES são bloqueados por CORS no file://).

Uso:  python3 build-bundle.py
Rode SEMPRE que editar os arquivos em web/js/.
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
JS = os.path.join(BASE, 'web', 'js')

CORE_ORDER = ['loader.js', 'atlas.js', 'i18n.js', 'audio.js', 'world.js', 'game.js', 'ui.js']
MAIN = 'main.js'


def strip_module(src):
    """Remove imports/exports de um módulo para concatenar num IIFE clássico."""
    out = []
    lines = src.split('\n')
    skip_import = False
    skip_export_block = False
    for line in lines:
        s = line.strip()
        if skip_import:
            if s.endswith(';'):
                skip_import = False
            continue
        if skip_export_block:
            if s.startswith('}'):
                skip_export_block = False
            continue
        if s.startswith('import '):
            if s.endswith(';'):
                continue
            skip_import = True
            continue
        if s.startswith('export {'):
            if s.endswith('};') or s.endswith('}'):
                continue
            skip_export_block = True
            continue
        if s.startswith('export '):
            line = line.replace('export ', '', 1)
            s = line.strip()
        out.append(line)
    return '\n'.join(out)


def build(name, include_main):
    parts = []
    parts.append('/* Gerado automaticamente por build-bundle.py — NÃO EDITE DIRETAMENTE')
    parts.append('   Edite web/js/*.js e rode:  python3 build-bundle.py */')
    parts.append('(function (global) {')
    parts.append("'use strict';")
    for fn in CORE_ORDER:
        path = os.path.join(JS, fn)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        parts.append(f'\n/* ==================== {fn} ==================== */\n')
        parts.append(strip_module(src))
    if include_main:
        with open(os.path.join(JS, MAIN), encoding='utf-8') as f:
            parts.append(f'\n/* ==================== {MAIN} ==================== */\n')
            parts.append(strip_module(f.read()))
    else:
        # expõe core para ferramentas (ex: tools/browser.html)
        parts.append("""
/* expõe núcleo para ferramentas */
global.MDB = {
  AtlasDB, parseColor, TILE, PACKS,
  UISystem, Widget, FormWidget, LabelWidget, ButtonWidget,
  I18n, AudioEngine, World, Game, ZOOMS,
  initLoader, initLoaderFromFileList, isFileSystemMode, isFileListMode, isLocalMode, fileListCount,
  loadText, loadXML, loadImage, loadAudioBuffer, listDir,
};
""")
    parts.append('})(typeof window !== "undefined" ? window : this);')
    outpath = os.path.join(BASE, 'web', name)
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(parts))
    size = os.path.getsize(outpath)
    print(f'[ok] {outpath} ({size/1024:.1f} KB)')


if __name__ == '__main__':
    print('Gerando bundles...')
    build('bundle-core.js', include_main=False)
    build('bundle.js', include_main=True)
    print('Pronto! O jogo agora roda direto do index.html (file://).')
