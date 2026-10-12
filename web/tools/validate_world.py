#!/usr/bin/env python3
"""
validate_world.py — Valida um world.json contra os atlases reais do jogo.

Uso:
    python3 web/tools/validate_world.py web/data/world.json

Confere:
  • dimensões width/height
  • ground com exatamente height linhas de width números
  • todos os IDs existem nos atlas (packs 2,10,11,20-27,30)
  • spawn em célula andável
  • walkable coerente (só chãos)
  • estatísticas do mapa (contagem por tile, objetos, criaturas)
"""
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKS = [2, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 30]


def load_valid_ids():
    ids = {}
    for n in PACKS:
        xml_path = os.path.join(ROOT, f'pack{n}', f'{n}.xml')
        if not os.path.exists(xml_path):
            continue
        tree = ET.parse(xml_path)
        for t in tree.getroot().iter('t'):
            ids[int(t.get('id'))] = n
    return ids


def main():
    if len(sys.argv) < 2:
        print('Uso: python3 web/tools/validate_world.py <caminho/world.json>')
        sys.exit(1)
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f'[erro] Arquivo não encontrado: {path}')
        sys.exit(1)

    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    errors, warnings = [], []
    valid_ids = load_valid_ids()
    print(f'Atlas: {len(valid_ids)} IDs válidos carregados')

    # dimensões
    w, h = data.get('width'), data.get('height')
    ground = data.get('ground', [])
    if not isinstance(w, int) or not isinstance(h, int):
        errors.append('width/height ausentes ou não inteiros')
    else:
        if len(ground) != h:
            errors.append(f'ground tem {len(ground)} linhas, esperado {h}')
        for i, row in enumerate(ground):
            if len(row) != w:
                errors.append(f'ground[{i}] tem {len(row)} colunas, esperado {w}')

    # ids
    used = set()
    for row in ground:
        used.update(row)
    for o in data.get('objects', []):
        used.add(o.get('id'))
    for c in data.get('creatures', []):
        used.add(c.get('id'))
    if data.get('playerSprite'):
        used.add(data['playerSprite'])

    missing = {i for i in used if i not in valid_ids}
    for i in sorted(missing):
        errors.append(f'ID {i} não existe em nenhum atlas')

    # walkable
    walkable = {int(k): v for k, v in data.get('walkable', {}).items()}
    for tid in Counter(t for row in ground for t in row):
        if tid not in walkable:
            warnings.append(f'tile {tid} não está em walkable (será tratado como bloqueado)')

    # spawn
    spawn = data.get('spawn')
    if not spawn:
        errors.append('spawn ausente')
    else:
        sx, sy = spawn.get('x'), spawn.get('y')
        if not (isinstance(sx, int) and isinstance(sy, int) and 0 <= sx < (w or 0) and 0 <= sy < (h or 0)):
            errors.append(f'spawn inválido: {spawn}')
        else:
            tid = ground[sy][sx]
            if not walkable.get(tid):
                errors.append(f'spawn ({sx},{sy}) está sobre tile {tid} não andável!')

    # objetos/criaturas fora do mapa
    for kind in ['objects', 'creatures']:
        for it in data.get(kind, []):
            x, y = it.get('x'), it.get('y')
            if not (isinstance(x, int) and isinstance(y, int) and 0 <= x < (w or 0) and 0 <= y < (h or 0)):
                errors.append(f'{kind}: posição fora do mapa: {it}')

    # estatísticas
    counts = Counter(t for row in ground for t in row)
    print(f'\nMapa: {data.get("name", "?")} — {w}×{h} tiles ({w*63}×{h*63} px)')
    print('Chão mais usado:')
    for tid, n in counts.most_common(8):
        print(f'  tile {tid:>4}: {n:>6} células ({100*n/max(1, sum(counts.values())):.1f}%)')
    print(f'Objetos: {len(data.get("objects", []))} | Criaturas: {len(data.get("creatures", []))}')
    print(f'Spawn: {spawn}')

    if warnings:
        print(f'\nAtenção: Avisos ({len(warnings)}):')
        for msg in warnings[:10]:
            print('  -', msg)
    if errors:
        print(f'\n[erro] ERROS ({len(errors)}):')
        for msg in errors[:20]:
            print('  -', msg)
        sys.exit(1)
    print('\n[ok] world.json VÁLIDO! Pode jogar: abra web/index.html (ou rode server.py).')


if __name__ == '__main__':
    main()
