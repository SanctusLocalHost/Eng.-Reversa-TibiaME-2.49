#!/usr/bin/env python3
"""
find_animation_sets.py — Encontra sequências candidatas a ANIMAÇÃO nos atlas.

Heurística: sprites com MESMA dimensão (s) e MESMO offset (o) = mesma âncora.
IDs próximos nesse grupo são fortes candidatos a frames da mesma criatura
(walk cycle, ataque, etc.).

Uso:
    python3 web/tools/find_animation_sets.py                 # todos os packs
    python3 web/tools/find_animation_sets.py --pack 20       # só um pack
    python3 web/tools/find_animation_sets.py --min 3         # só com 3+ frames
    python3 web/tools/find_animation_sets.py --gap 5         # ids mais colados
    python3 web/tools/find_animation_sets.py --json conjuntos.json
"""
import argparse
import json
import os
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKS = [2, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 30]


def load_sprites(packs):
    sprites = {}
    for n in packs:
        xml_path = os.path.join(ROOT, f'pack{n}', f'{n}.xml')
        if not os.path.exists(xml_path):
            continue
        tree = ET.parse(xml_path)
        for t in tree.getroot().iter('t'):
            sid = int(t.get('id'))
            s = tuple(int(x) for x in t.get('s').split(','))
            o = tuple(int(x) for x in t.get('o').split(','))
            sprites[sid] = {'pack': n, 's': s, 'o': o}
    return sprites


def main():
    ap = argparse.ArgumentParser(description='Sequências candidatas a animação (atlas Tibia Micro Edition)')
    ap.add_argument('--pack', type=int, default=None)
    ap.add_argument('--min', type=int, default=2, help='mínimo de frames por sequência')
    ap.add_argument('--gap', type=int, default=20, help='distância máxima entre IDs vizinhos')
    ap.add_argument('--top', type=int, default=40, help='máx. sequências exibidas por pack')
    ap.add_argument('--json', default=None, help='salva resultado em JSON')
    args = ap.parse_args()

    packs = [args.pack] if args.pack else PACKS
    sprites = load_sprites(packs)

    # agrupa por (tamanho, offset)
    grupos = {}
    for sid, info in sprites.items():
        key = (info['s'], info['o'])
        grupos.setdefault(key, []).append(sid)

    resultados = {}
    for (s, o), ids in grupos.items():
        if len(ids) < args.min:
            continue
        ids.sort()
        # clusteriza ids próximos (gap <= args.gap)
        clusters = [[ids[0]]]
        for sid in ids[1:]:
            if sid - clusters[-1][-1] <= args.gap:
                clusters[-1].append(sid)
            else:
                clusters.append([sid])
        for cl in clusters:
            if len(cl) >= args.min:
                p = sprites[cl[0]]['pack']
                resultados.setdefault(p, []).append({
                    'size': list(s), 'offset': list(o), 'ids': cl,
                    'frames': len(cl),
                })

    # saída
    for p in sorted(resultados):
        seqs = sorted(resultados[p], key=lambda r: -r['frames'])[:args.top]
        print(f'=== pack{p} — sequências candidatas a animação ===')
        for r in seqs:
            print(f"[{r['frames']} frames] ids {r['ids'][0]}..{r['ids'][-1]}  "
                  f"({r['size'][0]}×{r['size'][1]}, off {r['offset'][0]},{r['offset'][1]})")
            print('   ' + '  '.join(str(i) for i in r['ids']))
        print()

    total = sum(len(v) for v in resultados.values())
    print(f'Total: {total} sequências candidatas em {len(resultados)} packs')
    print('Dica: confira visualmente no web/tools/browser.html e monte o walk cycle no motor.')

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(resultados, f, ensure_ascii=False, indent=1)
        print(f'→ salvo em {args.json}')


if __name__ == '__main__':
    main()
