# 📐 ESPECIFICAÇÃO — CONVERTER IMAGEM DE MAPA → `world.json` (para IA de visão)

> Este documento define **exatamente como o motor entende um mapa** e contém um
> **PROMPT PRONTO** (seção 5) para você enviar a outra IA junto com a imagem do mapa.
> A outra IA devolverá o JSON completo com **todos os números exatos**.

---

## 1. Como o motor entende um mapa

```
• Grade de células de 63 × 63 pixels (tile size nativo do TibiaME, zoom 100%)
• Coordenadas:  x = coluna (0 = esquerda → direita)
                y = linha  (0 = TOPO   → baixo)
• Cada célula tem:
    - GROUND  : 1 sprite de chão que preenche os 63×63 px (obrigatório)
    - OBJECTS : 0..n sprites "em pé" (árvore, muro…) — guardamos a célula dos PÉS
    - CREATURE: 0..1 monstro/NPC — célula dos pés
• Âncora do sprite: centro-base da célula (o motor aplica o offset do atlas)
• walkable[ID] = true/false → define quais chãos o jogador pode pisar
• spawn = célula onde o jogador nasce (precisa ser andável)
```

Dimensões: `width  = largura_da_imagem_em_px  ÷ 63`
           `height = altura_da_imagem_em_px   ÷ 63`  (sempre arredondando para baixo)

---

## 2. Schema JSON EXATO (é isto que a IA deve devolver)

```json
{
  "name": "Nome do Mapa",
  "width": 20,
  "height": 15,
  "walkable": { "1": true, "2": true, "4": true, "6": true },
  "playerSprite": 112,
  "ambientSetting": 1,
  "spawn": { "x": 10, "y": 7 },
  "ground": [
    [49,49,49],
    [49,1,1],
    [49,1,49]
  ],
  "objects": [
    { "id": 114, "x": 5, "y": 3, "block": true }
  ],
  "creatures": [
    { "id": 27, "x": 8, "y": 6, "name": "Monstro" }
  ]
}
```

Regras de consistência obrigatórias:
1. `ground` tem **exatamente `height` linhas**, e cada linha exatamente `width` números.
2. `ground[0]` = linha do **topo** da imagem.
3. Todo ID usado deve pertencer à **tabela de IDs** (seção 3).
4. `spawn` deve cair em célula cujo ground esteja em `walkable`.
5. `block: true` em objetos que impedem passagem (árvores, muros, encostas).

---

## 3. TABELA DE IDs VERIFICADOS (extraídos e confirmados dos atlases)

| ID | Tipo | Aparência | Andável | Pack |
|----|------|-----------|---------|------|
| **1** | chão | Grama verde com tufos | ✅ sim | 10 |
| **2** | chão | Terra escura/grama seca | ✅ sim | 10 |
| **4** | chão | Areia clara com manchas escuras | ✅ sim | 10 |
| **6** | chão | Pedra clara (rocha lisa) | ✅ sim | 10 |
| **49** | chão | Água azul com ondas | ❌ não | 10 |
| **3** | chão | Caminho com cantos (transição) | ✅ sim | 10 |
| 114 | objeto | Árvore frondosa (copa redonda) | ❌ blocker | 2 |
| 115 | objeto | Árvore frondosa variante 2 | ❌ blocker | 2 |
| 116 | objeto | Árvore alta/estreita | ❌ blocker | 2 |
| 117 | objeto | Árvore robusta (copa larga) | ❌ blocker | 2 |
| 40 | objeto | Encosta/paredão rochoso | ❌ blocker | 2 |
| 27 | criatura | Monstro grande com arma | — | 20 |
| 111 | criatura | Guardião vegetal (treant) | — | 20 |
| 112 | criatura | Fera quadrúpede | — | 20 |

> Mais IDs: abra `web/tools/browser.html`, veja o sprite e o número.
> Chãos adicionais existem no pack10/pack11 (todos 63×63, os "tiles").
> Objetos: sprites "em pé" (altura > 63 ou base alinhada ao fundo da célula).

---

## 4. REQUISITOS DA IMAGEM ENVIADA

| Requisito | Motivo |
|---|---|
| PNG sem perdas (não JPG) | JPG cria artefatos que confundem a IA |
| Largura e altura múltiplas de 63 px | Grade perfeita |
| Zoom 100% (sprites em tamanho nativo 63 px) | Sprites têm tamanho fixo |
| Sem UI/HUD (sem botões, joystick, nomes) | Só o mapa |
| Boa iluminação/contraste (nada de foto de tela torta) | Precisão visual |

Se a imagem for um screenshot grande, **divida em pedaços com sobreposição de
1 tile** e peça a análise em partes (evita "cegueira" de imagens grandes).

---

## 5. 🤖 PROMPT PRONTO — copie daqui até o fim do bloco e cole na outra IA

```text
Você é um conversor de imagens de mapa do jogo TibiaME para o formato world.json.
Vou te enviar uma imagem renderizada de um mapa em visão aérea, com tiles de
63×63 pixels na tela. Sua tarefa é converter a imagem inteira em UM JSON válido.

PASSO A PASSO:
1. Calcule: width = largura_da_imagem / 63  e  height = altura_da_imagem / 63.
   (arredonde para baixo; ignore sobras de pixels nas bordas)
2. Divida mentalmente a imagem numa grade width × height de células 63×63 px.
   A célula [0,0] é o canto SUPERIOR ESQUERDO; y cresce para BAIXO.
3. Para CADA célula, identifique o TILE DE CHÃO (o sprite que preenche a célula
   inteira) usando SOMENTE esta tabela:
     1  = grama (verde com tufos)
     2  = terra escura / grama seca (marrom-esverdeado)
     4  = areia (bege/amarelo claro)
     6  = pedra clara (cinza liso)
     49 = água (azul com ondas)
     3  = caminho/estrada (faixa clara com cantos)
   Se o chão não encaixar em nenhum: use 1 (grama) e anoite no campo "unknown".
4. Identifique OBJETOS em pé (árvores, encostas) — registre a célula onde estão
   os PÉS/BASE do objeto (não a copa):
     114, 115, 116, 117 = árvores/plantas  →  { "id": ID, "x": COL, "y": LINHA, "block": true }
     40 = encosta/paredão                  →  { "id": 40, "x": COL, "y": LINHA, "block": true }
5. Identifique CRIATURAS (monstros/NPCs) e registre a célula dos pés:
     27 = monstro grande | 111 = guardião vegetal | 112 = fera
     → { "id": ID, "x": COL, "y": LINHA, "name": "Monstro" }
6. Escolha "spawn": uma célula de chão ANDÁVEL (1, 2, 4, 6 ou 3) de preferência
   no centro ou numa clareira de grama.

FORMATO DE SAÍDA — responda APENAS com o JSON abaixo, sem texto antes ou depois,
sem markdown, com números inteiros:

{
  "name": "Mapa Importado",
  "width": <N>,
  "height": <M>,
  "walkable": { "1": true, "2": true, "3": true, "4": true, "6": true },
  "playerSprite": 112,
  "ambientSetting": 1,
  "spawn": { "x": <COL>, "y": <LINHA> },
  "ground": [
    [ ...exatamente N números inteiros... ],
    ...exatamente M linhas...
  ],
  "objects": [
    { "id": 114, "x": 5, "y": 3, "block": true }
  ],
  "creatures": [
    { "id": 27, "x": 8, "y": 6, "name": "Monstro" }
  ],
  "unknown": []
}

VERIFICAÇÕES FINAIS OBRIGATÓRIAS (faça antes de responder):
- ground tem M linhas e cada linha tem N números.
- Todos os ids de ground pertencem a {1, 2, 3, 4, 6, 49}.
- Água (49) forma regiões contíguas coerentes (margens, lagos, rios).
- Árvores (114-117) estão apenas sobre grama/terra (1 ou 2).
- x sempre entre 0 e N-1; y sempre entre 0 e M-1.
- Nenhum comentário, nenhuma explicação: só o JSON.
```

---

## 6. ⚠️ MINIMAPAS (imagens reduzidas) — NÃO peça os números à IA!

Minimapas do TibiaME são imagens **reduzidas** (ex.: ~3 px por tile). Um mapa
real tem ~200×200 tiles = **40.000+ números** — nenhuma IA de texto devolve isso
com precisão (limite de tokens + erros de contagem). Para minimapas use o
**conversor local**:

```bash
# 1) Descubra o tamanho da célula (o "bloco de 1 tile" na imagem)
#    Dica: o bloco amarelo = 1 personagem ≈ 1 tile. Meça no GIMP/paint.
#    Ou use --auto para detectar automaticamente.

# 2) Converta (200×200 tiles em segundos, sem IA):
python3 web/tools/minimap_to_world.py MINIMAPA.png --auto --trees --smooth \
        --preview preview.png -o web/data/world.json --name "Meu Mapa"

# 3) Confira o preview.png contra o original e valide:
python3 web/tools/validate_world.py web/data/world.json
```

O que o conversor faz:
- Lê cada célula `--cell N` px, tira a cor média do centro e classifica pela
  paleta (água/grama/floresta/areia/pedra/caminho) → IDs 49/1/…/6/3
- `--trees`: manchas verde-escuras (floresta) viram **árvores (114-117)** com
  chão de grama por baixo
- `--smooth`: filtro de maioria 3×3 (remove ruído/pixels soltos)
- `--preview`: gera imagem lado-a-lado para você CONFERIR visualmente
- Escolhe spawn automaticamente no centro andável mais próximo
- Se as cores do seu minimapa forem diferentes, edite a `PALETTE` no topo do
  script (formato: `(r, g, b, id, categoria)`)

**Papel correto da IA no fluxo de minimapa:** peça a ela apenas a **legenda**
("quais cores você vê e o que significam? qual o tamanho em pixels do bloco de
1 personagem?"). Os números ficam com o script local.

---

## 7. Plano B (mais preciso para screenshots nativos): LEGENDA + GRADE

Para imagens complexas, peça em **duas etapas**:

**Etapa 1 — legenda:** *"Liste os tiles DIFERENTES que você vê na imagem (chão e
objetos), descrevendo cada um e atribuindo uma letra: W=água, G=grama, S=areia,
P=pedra, T=árvore, C=encosta… Responda só a legenda."*

**Etapa 2 — grade:** *"Agora converta a imagem inteira numa matriz de letras
usando SUA legenda (width×height). Cada linha entre aspas. Depois me devolva
o JSON final com os números correspondentes."*

A matriz de letras é mais fácil da IA acertar que números direto — e você pode
conferir visualmente antes de converter.

---

## 8. VALIDAÇÃO DO RESULTADO

Depois de receber o JSON da IA, valide antes de usar:

```bash
python3 web/tools/validate_world.py web/data/world.json
```

O validador confere: dimensões, linhas/colunas, IDs inexistentes, spawn em
célula andável, consistência do walkable e estatísticas do mapa. Ele aceita o
JSON direto da IA — salve a resposta como `web/data/world.json` e rode.

Se a IA devolver o JSON dentro de um bloco ```json ... ```, remova as cercas.
