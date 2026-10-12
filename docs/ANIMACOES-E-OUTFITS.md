# Personagens, Outfits e Animações — Tibia Micro Edition 2.49

> Documento de engenharia reversa sobre o sistema de personagens.
> Status: **parcialmente confirmado** — o que é inferido está marcado como (inferência).

---

## 1. O que está confirmado nos dados

### 1.1 Dois modos de textura de sprites
- `atlas_X.2.png` → **LA (Luminância + Alfa)**: sprites *colorizáveis* (peças de
 outfit, cabelo, roupas). O cliente aplica cor em tempo real: `cor_final = tint × luminância`.
- `atlas_X.4.png` → **RGBA**: sprites coloridos fixos (monstros, NPCs, objetos).

### 1.2 A string de outfit em `settings.xml`
```xml
outfit="creature,10,2;
        g=outfit,11,11;
        outfit,10,7;
        outfit,11,9;
        outfit,10,0;
        c=71,221,198,255;208,223,238,255;55,58,69,255;55,58,69,255;0,0,0,255;"
subOutfit="none,0,0;"
```

Parse estrutural (separadores `;`):

| Segmento | Formato | Interpretação (inferência) |
|---|---|---|
| `creature,10,2` | `tipo,a,b` | Base do personagem: tipo "creature" + 2 índices de sprite |
| `g=outfit,11,11` | `g=prefixo,a,b` | Grupo/variação (possivelmente gênero ou "guild outfit") |
| `outfit,10,7` | `outfit,a,b` | **Peça de outfit** nº 2 |
| `outfit,11,9` | `outfit,a,b` | Peça de outfit nº 3 |
| `outfit,10,0` | `outfit,a,b` | Peça de outfit nº 4 |
| `c=r,g,b,a;…` | `c=RGBA` × N | **Cores aplicadas às peças LA** (corpo, detalhes, cabelo, contorno) |

→ O personagem é **composto por camadas** de sprites LA empilhadas na mesma
âncora (célula 63×63, centro-base) e tingidas com a lista de cores.

### 1.3 O atributo `frame` nos atlas
```xml
<texture file="atlas_1.4.png" frame="0">
```
- O formato **suporta múltiplos frames** por sprite (`frame="0"`, `"1"`, …).
- **Todos os dados atuais usam `frame="0"`** → as animações de personagens no
 cliente 2.49 provavelmente são **sequências de IDs de sprite** (não frames de
 textura). Animação multi-frame de textura existe no formato para efeitos
 (ex.: água), mas não está presente nestes packs.

### 1.4 Candidatos a sequências de animação (evidência real)
Sprites com **mesma dimensão e mesma âncora** e IDs próximos são os candidatos
mais fortes a frames da mesma criatura. Exemplo do `pack20`:

| IDs | Tamanho | Offset | Conclusão |
|---|---|---|---|
| 112, 116 | 27×53 | 19,9 | mesma silhueta, mesma âncora → **frames do mesmo bicho** |
| 111 | 27×62 | 19,0 | variante maior (outra animação/pose) |
| 337, 338, 340 | 48×63 | 7,0 | trio com mesma âncora → candidatos a walk cycle |

---

## 2. Ferramenta: `find_animation_sets.py`

Agrupa sprites por (largura, altura, offset) e clusteriza IDs próximos →
imprime **sequências candidatas a animação** por pack:

```bash
python3 web/tools/find_animation_sets.py            # todos os packs
python3 web/tools/find_animation_sets.py --pack 20  # só pack20
python3 web/tools/find_animation_sets.py --min 3    # só sequências com 3+ frames
```

Saída típica:
```
=== pack20 — sequências candidatas ===
[4 frames] ids 337..340  (48×63, off 7,0)
   337  338  339  340
[2 frames] ids 112,116   (27×53, off 19,9)
   112  116
```

**Como usar:** os IDs de uma sequência vão para o `world.json`/engine na ordem
para criar o ciclo de andar (ex.: desenhar `frames[t]` avançando `t` a cada passo).

---

## 3. Implementação no motor web (roteiro)

### 3.1 Tint de sprites LA — já implementado
`web/js/atlas.js` → `AtlasDB.tintSprite(id, img, [r,g,b])`:
```js
// cor_final = tint * luminância, mantendo o alfa original
data[i]   = tr * lum;
data[i+1] = tg * lum;
data[i+2] = tb * lum;
```

### 3.2 Composição de personagem (exemplo prático)
```js
// cada peça: { spriteId, tint: [r,g,b] }
const partes = [
  { id: 501, tint: [71,221,198] },   // corpo
  { id: 502, tint: [208,223,238] },  // pernas
  { id: 503, tint: [55,58,69] },     // botas
  { id: 504, tint: [30,30,30] },     // cabelo
];
for (const p of partes) {
  await atlas.draw(ctx, p.id, tileX, tileY, zoom, p.tint);
}
// todas as peças usam a MESMA âncora (célula 63×63, centro-base)
```

### 3.3 Walk cycle (proposta)
1. Ache a sequência via `find_animation_sets.py`
2. No loop do jogo, avance o frame a cada passo:
```js
const frame = frames[Math.floor(walkT * frames.length)];
await atlas.draw(ctx, frame, x, y, zoom);
```
3. Direções: por enquanto espelhe horizontalmente (`ctx.scale(-1,1)`) se a
 sequência só tiver uma direção — o cliente usa `handleFlipH="true"`
 (confirmado no `FRM_VIEWAREA` do `ui_base.xml`).

---

## 4. Lacunas conhecidas (o que ainda NÃO sabemos)

| Lacuna | Como descobrir |
|---|---|
| Quais IDs LA = cabeça/tronco/pernas/cabelo | Renderizar candidatos no `tools/browser.html` e comparar com o menu do cliente original |
| Ordem exata de empilhamento das peças | Capturar sprites do cliente original rodando (memória/GPU) e comparar |
| Quantos frames por passo/direção | Sniffar o protocolo binário (TCP 9191) enquanto anda |
| Como o servidor referencia a sequência | Engenharia do `libtibiame.so` (Ghidra) — procurar handlers do pacote de criaturas |
| `a,b` em `outfit,a,b` significam o quê | Correlacionar com os ids do pack30/atlas de outfits no `FRM_OUTFITSHOP` |

> Dica: o `FRM_OUTFITSHOP` do `ui_base.xml` (pack1) tem a lista completa de
> categorias do editor de aparência: `outfithair, outfithead, outfitbody,
> outfitextras` — útil para mapear as peças.
