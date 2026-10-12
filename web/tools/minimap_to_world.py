#!/usr/bin/env python3
"""
minimap_to_world.py — Converte um MINIMAPA colorido (imagem reduzida, sem sprites)
em world.json para o MUNDO DE BATALHA (mecanismo TibiaME).

Por que não usar IA para isso? Um minimapa real tem ~200×200 tiles = 40.000+
números — nenhuma IA de texto consegue devolver isso com precisão. Este script
faz a classificação pixel a pixel localmente, em segundos.

Uso:
    python3 web/tools/minimap_to_world.py MINIMAPA.png --cell 3 --trees
    python3 web/tools/minimap_to_world.py MINIMAPA.png --auto --trees --preview preview.png
    python3 web/tools/minimap_to_world.py MINIMAPA.png --cell 3 -o web/data/world.json

Opções:
    --cell N       pixels por tile no minimapa (ex: 3). Use --auto para detectar.
    --auto         detecta o tamanho da célula automaticamente (run-length).
    --trees        converte manchas verde-escuras em árvores (objetos 114-117).
    --smooth       filtro de maioria 3x3 (remove pixels isolados de ruído).
    --preview FILE gera imagem de conferência com a grade classificada.
    --spawn X,Y    força o spawn (default: centro andável mais próximo).
    --name NOME    nome do mapa.

Paleta (edite se seu minimapa usa outras cores):
    água=none, grama, floresta, areia, pedra, caminho, neve
"""
import argparse
import json
import os
import sys
from collections import Counter
from PIL import Image

# ---------------------------------------------------------------- paleta
# id 1=grama, 2=terra, 3=caminho, 4=areia, 6=pedra, 49=água
PALETTE = [
    # (r, g, b, tile_id, categoria)
    (38, 92, 168, 49, 'water'),    # água azul
    (29, 77, 143, 49, 'water'),    # água azul escura
    (95, 160, 70, 1, 'grass'),     # grama
    (110, 175, 80, 1, 'grass'),    # grama clara
    (45, 100, 45, 1, 'forest'),    # floresta (→ árvores com --trees)
    (60, 120, 55, 1, 'forest'),    # floresta média
    (225, 205, 140, 4, 'sand'),    # areia
    (238, 220, 160, 4, 'sand'),    # areia clara
    (200, 180, 120, 3, 'path'),    # caminho/estrada (bege escuro)
    (160, 155, 145, 6, 'stone'),   # pedra cinza
    (120, 115, 110, 6, 'stone'),   # pedra escura
    (215, 215, 215, 6, 'stone'),   # pedra clara
    (240, 244, 248, 6, 'snow'),    # neve (→ pedra clara por padrão)
]

WALKABLE = {"1": True, "2": True, "3": True, "4": True, "6": True}


def classify(px):
    """Classifica um pixel (r,g,b) → (tile_id, categoria) por distância RGB."""
    r, g, b = px[0], px[1], px[2]
    best = None
    best_d = 1e18
    for (pr, pg, pb, tid, cat) in PALETTE:
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_d:
            best_d = d
            best = (tid, cat)
    return best


def detect_cell(img):
    """Detecta o tamanho da célula por run-length nas linhas (moda dos múltiplos)."""
    w, h = img.size
    runs = Counter()
    px = img.load()
    for y in range(0, h, max(1, h // 50)):
        last = None
        run = 0
        for x in range(w):
            c = px[x, y]
            if last is not None and all(abs(c[i] - last[i]) < 24 for i in range(3)):
                run += 1
            else:
                if run > 0:
                    runs[run] += 1
                run = 1
                last = c
        if run > 0:
            runs[run] += 1
    for cell in range(2, 9):
        total = sum(runs.values())
        multiples = sum(n for l, n in runs.items() if l % cell == 0)
        if total and multiples / total > 0.72:
            return cell
    return 3  # padrão para minimapas TibiaME


def sample_cell(img, cx, cy, cell):
    """Cor média do centro da célula (ignora 1px de borda p/ evitar transições)."""
    px = img.load()
    w, h = img.size
    m = 1 if cell >= 3 else 0
    rs = gs = bs = n = 0
    for y in range(cy * cell + m, min((cy + 1) * cell - m, h)):
        for x in range(cx * cell + m, min((cx + 1) * cell - m, w)):
            r, g, b = px[x, y][:3]
            rs += r; gs += g; bs += b; n += 1
    if n == 0:
        r, g, b = px[min(cx * cell, w - 1), min(cy * cell, h - 1)][:3]
        return (r, g, b)
    return (rs // n, gs // n, bs // n)


def smooth_grid(grid, w, h):
    """Filtro de maioria 3x3 (remove ruído)."""
    def majority(x, y):
        counts = Counter()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    counts[grid[ny][nx]] += 1
        return counts.most_common(1)[0][0]
    return [[majority(x, y) for x in range(w)] for y in range(h)]


def main():
    ap = argparse.ArgumentParser(description='Minimapa colorido → world.json (TibiaME)')
    ap.add_argument('image')
    ap.add_argument('--cell', type=int, default=None, help='pixels por tile')
    ap.add_argument('--auto', action='store_true', help='detectar célula automaticamente')
    ap.add_argument('--trees', action='store_true', help='floresta vira árvores (objetos)')
    ap.add_argument('--smooth', action='store_true', help='filtro de maioria 3x3')
    ap.add_argument('--preview', default=None, help='PNG de conferência')
    ap.add_argument('--spawn', default=None, help='força spawn X,Y')
    ap.add_argument('--name', default='Mapa Importado', help='nome do mapa')
    ap.add_argument('-o', '--out', default=None, help='saída world.json')
    args = ap.parse_args()

    if not os.path.exists(args.image):
        print(f'✗ Imagem não encontrada: {args.image}')
        sys.exit(1)

    img = Image.open(args.image).convert('RGB')
    W, H = img.size
    cell = args.cell or (detect_cell(img) if args.auto else 3)
    gw, gh = W // cell, H // cell
    modo = '--auto' if args.auto else '--cell'
    print(f'Imagem: {W}×{H} px | célula: {cell}px ({modo}) → grid {gw}×{gh} tiles')
    if gw * gh < 4:
        print('✗ Grid muito pequeno. Verifique o tamanho da célula (tente --cell 1).')
        sys.exit(1)

    # 1) amostra + classifica
    tiles = []
    cats = []
    for gy in range(gh):
        row_t, row_c = [], []
        for gx in range(gw):
            r, g, b = sample_cell(img, gx, gy, cell)
            tid, cat = classify((r, g, b))
            row_t.append(tid)
            row_c.append(cat)
        tiles.append(row_t)
        cats.append(row_c)

    # 2) suavização opcional
    if args.smooth:
        tiles = smooth_grid(tiles, gw, gh)
        cats = None

    # 3) floresta → árvores (se pedido)
    objects = []
    if args.trees and cats:
        tree_ids = [114, 115, 116, 117]
        ti = 0
        for gy in range(gh):
            for gx in range(gw):
                if cats[gy][gx] == 'forest':
                    tiles[gy][gx] = 1  # chão grama embaixo
                    objects.append({
                        'id': tree_ids[ti % len(tree_ids)],
                        'x': gx, 'y': gy, 'block': True,
                    })
                    ti += 1

    # 4) spawn: centro andável mais próximo
    if args.spawn:
        sx, sy = [int(v) for v in args.spawn.split(',')]
    else:
        cx, cy = gw // 2, gh // 2
        sx = sy = None
        best_d = 1e18
        for gy in range(gh):
            for gx in range(gw):
                if WALKABLE.get(str(tiles[gy][gx])) and not any(o['x'] == gx and o['y'] == gy for o in objects):
                    d = (gx - cx) ** 2 + (gy - cy) ** 2
                    if d < best_d:
                        best_d = d
                        sx, sy = gx, gy
        if sx is None:
            print('✗ Nenhuma célula andável encontrada! Ajuste a paleta às cores do seu minimapa.')
            sys.exit(1)

    world = {
        'name': args.name,
        'width': gw,
        'height': gh,
        'walkable': WALKABLE,
        'playerSprite': 112,
        'ambientSetting': 1,
        'spawn': {'x': sx, 'y': sy},
        'ground': tiles,
        'objects': objects,
        'creatures': [],
    }

    out = args.out or 'world.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(world, f, ensure_ascii=False, indent=1)
    counts = Counter(t for row in tiles for t in row)
    print(f'✓ {out} gerado — {gw}×{gh} tiles, {len(objects)} objetos, spawn ({sx},{sy})')
    print('  Tiles:', dict(counts.most_common()))

    # 5) preview de conferência
    if args.preview:
        COLORS = {49: (38, 92, 168), 1: (95, 160, 70), 4: (225, 205, 140),
                  3: (200, 180, 120), 6: (160, 155, 145), 2: (120, 100, 60)}
        pv = Image.new('RGB', (gw * cell, gh * cell), (0, 0, 0))
        ppx = pv.load()
        for gy in range(gh):
            for gx in range(gw):
                c = COLORS.get(tiles[gy][gx], (255, 0, 255))
                for y in range(gy * cell, (gy + 1) * cell):
                    for x in range(gx * cell, (gx + 1) * cell):
                        ppx[x, y] = c
        pv.save(args.preview)
        print(f'✓ Preview: {args.preview} (compare com o original!)')

    print(f'\nValide com:  python3 web/tools/validate_world.py {out}')


if __name__ == '__main__':
    main()
