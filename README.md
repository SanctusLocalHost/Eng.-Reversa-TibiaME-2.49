# 🔍 Eng. Reversa TibiaME 2.49

<!-- repo: Eng.-Reversa-TibiaME-2.49 -->

**Engenharia reversa completa do cliente Android do TibiaME 2.49 (CipSoft GmbH)**
— documentação de formatos, motor de jogo web 100% offline (PWA) e ferramentas
de criação de mapas, personagens e animações.

> ⚠️ **Este repositório NÃO contém nenhum asset do jogo** (sprites, sons, textos,
> dados). Apenas documentação técnica e código original. Os assets são
> © CipSoft GmbH e permanecem no seu dispositivo.

---

## ⚖️ Aviso Legal

- Projeto **não oficial**, sem qualquer vínculo com a CipSoft GmbH.
- Fins **educacionais e de interoperabilidade** (análise de formatos de arquivo).
- Nenhum arquivo proprietário é distribuído: o motor web lê os assets da
  **sua própria instalação** do jogo (pasta `files/` do app, com packs
  baixados pelo cliente oficial).
- "TibiaME" e "Tibia" são marcas da CipSoft GmbH.
- Código deste repositório: licença MIT (ver [LICENSE](LICENSE)).

---

## 🚀 Início Rápido

1. **Obtenha seus assets**: copie a pasta `files/` do TibiaME instalado em um
   Android (em aparelhos modernos: `Android/data/com.cipsoft.tibiame/files/`)
   para uma pasta no PC, ex.: `MUNDO DE BATALHA/`.
2. **Clone/coloque este repositório dentro dela** (as pastas `web/`, `pack*`,
   `server.py` devem ficar lado a lado).
3. **Jogue**:
   - **PWA (sem servidor)**: duplo clique em `web/index.html` (Chrome/Edge →
     botão "Escolher Pasta"; Brave/Firefox/Safari → botão "modo compatível").
   - **Servidor local**: `python3 server.py` → `http://localhost:8000/web/`
4. **Explore os 12.238 sprites**: `web/tools/browser.html`
5. **Crie mapas**: edite `web/data/world.json` (ou use as ferramentas — seção 8).

---

## 🔍 Identificação do Alvo

| Item | Valor |
|---|---|
| Jogo | **TibiaME (Tibia Micro Edition)** — MMO mobile da CipSoft |
| Versão analisada | Cliente Android **2.49** (terminalVersion 39) |
| Origem dos dados | `com.cipsoft.tibiame/files/` (packs baixados pelo cliente) |
| Engine do cliente | C++ nativo via JNI (`src/common/core/TPayment.cpp`, `ui/controls/TGameViewArea.cpp`, `io/TXmlSerializableClass.cpp`) |
| Rede | Login: `login01-04.tibiame.com` / `tibiame01-04.cipsoft.com` · Game: TCP `:9191` |

---

## 🏗️ Arquitetura Geral

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENTE ANDROID (thin client)                                   │
│  • Engine C++ nativo (render, UI, áudio, rede)                   │
│  • Dados locais: pack1..pack30 (sprites, UI, sons, textos)       │
├──────────────────────────────────────────────────────────────────┤
│              PROTOCOLO BINÁRIO PROPRIETÁRIO (TCP)                │
│  Servidor envia: sprite IDs + posições (mapa é server-side!)     │
├──────────────────────────────────────────────────────────────────┤
│  SERVIDOR CIPSOFT                                                │
│  • Bancos de mundo (tiles, spawns, quests, NPCs, loot)           │
└──────────────────────────────────────────────────────────────────┘
```

**Ponto-chave:** os **mapas completos não existem no cliente**. O servidor envia
em tempo real o estado do mundo (IDs de sprite por célula). Por isso este
projeto inclui ferramentas para criar mundos offline próprios.

### Consequências práticas
- Assets locais = **catálogo de sprites** (12.238 sprites!) sem mapa.
- A "moeda" de renderização = **ID de sprite** → este repo cataloga e usa esses IDs.
- Um remake offline precisa de: engine + assets + **mapas próprios** (world.json).

---

## 📦 Estrutura do Cliente

| Pasta | Conteúdo | Qtd |
|---|---|---|
| `pack1/` | UI completa: PNGs (9grid, botões, joystick, barras) em 4 zooms + `ui_base.xml` (379 KB), `ui_portrait.xml`, `ui_landscape.xml` | ~700 arquivos |
| `pack2/` | Atlas de sprites clássicos (árvores, encostas, criaturas antigas) | 382 sprites |
| `pack3/` | `dictionary.dat` (tabela binária de IDs de texto) | 1 |
| `pack4/` | Localização XLIFF (`de,en,es,ms,pl,pt` — 330 strings cada) | 6 |
| `pack5/` | Áudio: 9 loops `.ogg`, ~84 SFX `.wav`, 9 músicas `.mp3` + `music.xml` (72 settings) + `soundfx.xml` (68 settings) | ~100 |
| `pack10,11,20-27/` | Atlas de sprites do mundo (chão, paredes, objetos, criaturas, itens, efeitos) | 10.000+ |
| `pack30/` | 56 tiles especiais 63×63 (minimapa/mapa-múndi) | 56 |
| `settings.xml` | Preferências (idioma, volume, zoom, keybindings, personagens, quickLoad) | — |
| `settings.dat` | Binário com lista de servidores de login | — |

---

## 🧩 Formatos de Arquivo (decodificados)

### 7.1 Atlas de sprites — `packN/N.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<packdata>
  <images packid="10">
    <texture file="atlas_1.4.png" frame="0">
      <t id="2780" s="6,9"  p="49,247"  o="38,16" />
      <t id="2802" s="6,10" p="250,168" o="37,17" />
    </texture>
    ...
  </images>
</packdata>
```

| Campo | Significado |
|---|---|
| `id` | **ID global do sprite** (referência do protocolo/engine) |
| `s` | Tamanho `"largura,altura"` em px |
| `p` | Posição `"x,y"` na textura atlas |
| `o` | Offset de desenho `"x,y"` relativo à célula do tile |
| `frame` | Frame de animação da textura (todos `0` nos dados atuais) |

### 7.2 Regra de ancoragem (verificada em 12.238 sprites)

- **Célula do tile = 63×63 px**
- Desenho em `(tile.x*63 + o.x, tile.y*63 + o.y)`
- Convenção: **centro-base do sprite ancorado no centro-base da célula**:
  - `o.x + w/2 ≈ 31.5` (centralização horizontal)
  - `o.y + h ≈ 63` (pés na base)

| Exemplo | Tamanho | Offset | Resultado |
|---|---|---|---|
| chão perfeito | 63×63 | 0,0 | preenche a célula |
| objeto centrado | 59×59 | 2,2 | 2+29.5 = 31.5 ✓ |
| árvore | 13×46 | 27,4 | 27+6.5 = 33.5 ≈ 31.5 |
| efeito 2×2 | 126×126 | −32,−32 | efeito sobre 4 células |

### 7.3 Sufixos das texturas

- `atlas_X.2.png` → **LA (Luminância+Alfa)** → sprite **colorizável** (tint)
- `atlas_X.4.png` → **RGBA** → sprite colorido fixo
- Cada textura tem seu conjunto próprio de IDs

### 7.4 Sistema de UI — `ui_base.xml` + orientação

Seleção por `<UiIf ui="ui_phone"/>` / `<UiIf ui="ui_tablet"/>`.

```xml
<UiConfig referenceSize="310,310" referenceSpriteSize="36" referenceSpriteGrid="11,11" ... />
```
> A UI assume que o lado curto da tela ≈ **8,5 tiles**.

**Unidades:**

| Tipo | Significado |
|---|---|
| `relative` / `relativeToParent` | % do pai |
| `relativeToTile` | 100 unidades = 1 tile de UI |
| `absolute` | px × fator de densidade (min(w,h)/310) |
| `absolute_mm` | **milímetros físicos** (ex.: joystick de 30 mm) |

**Atributos de layout:** `dockLeft/dockRight/dockTop/dockBottom` (`ALVO,aresta,offset,unidade`),
`alignH/alignV` + `alignHWith/alignVWith`, `anchor`, `offset/offsetType`,
`size/sizeType`, `layer`, `modal`, `backgroundImage`, `onPressedImage`,
`hotkey`, `useTemplate` (herança de templates `TEMPL_*`).

**Formatos de `backgroundImage` (decodificados):**
```
arquivo.png,srcX,srcY,srcW,srcH,extra;scaleType:9grid,BORDA_WxH,CENTRO_WxH,multipleStretched
arquivo.png,0,94,0,188,94;scaleType:multipleCenter   ← célula de 94×94 repetida
#RRGGBBAA                                             ← cor sólida
```

**Elementos completos:** `UiForm, UiLabel, UiButton, UiImage, UiItemSlot,
UiGameObject, UiGameCreature, UiListContainer, UiListElement, UiScrollbar,
UiProgressBar, UiTextBox, UiComboBox, UiCheckBox, UiSwipe, UiMiniMap,
UiLoadingIndicator, UiGameViewArea, UiDirectionIndicator, UiAnalogStick,
UiAnimatedImage, UiIconContextMenu`.

> O cliente real **ignora atributos desconhecidos** (evidência no `logfile.xml`:
> `unknown attribute "clearLineButton"...`) — o motor web faz o mesmo.

### 7.5 Áudio — `music.xml` + `soundfx.xml`

```xml
<setting id="12">
  <client channels="2">
    <channel priority="50">
      <sound file="cs_09_long_way" fadeInDuration="10" volume="60-80" />
      <sound file="ambience_dungeon_cave_loop" volume="100" repetitions="infinite" latencyallowed="false" />
      <list repetitions="infinite">
        <randomize>
          <sound file="ambience_dungeon_cave_sfx_01" volume="100" probability="25" />
          <break length="15-35" probability="50" />
        </randomize>
      </list>
    </channel>
  </client>
</setting>
```
- Nomes **sem extensão** (o cliente tenta `.wav` / `.ogg` / `.mp3`)
- `volume` aceita faixa (`60-80`), `break` em segundos, `randomize` com probabilidade
- `priority` define interrupções; `channels` 1/2 (mono/estéreo)

### 7.6 Localização — XLIFF 1.2 (`pack4/<lang>/extremeclienttexts.<lang>.xlf`)

```xml
<trans-unit approved="yes" id="id_about" maxwidth="20" size-unit="char">
  <source xml:lang="en">About TibiaME</source>
  <note from="developer">This is in the main menu</note>
  <target state="final" xml:lang="pt">Sobre o TibiaME</target>
</trans-unit>
```
> ⚠️ Os arquivos reais têm **XML malformado** (atributo duplicado
> `<target state="translated" ... state="translated">`) — o parser C++ é tolerante.
> O motor web inclui um sanitizador.

### 7.7 `settings.xml` / `settings.dat`

- `settings.xml`: idioma, `gameViewZoomMode` (100/125/150/175%), volumes,
  `bindings` por contexto (menu/chat/quicklist/inventory/actionmenu/navigation),
  `savedCharacters` + `quickLoad` com **outfit serializado** (ver `docs/ANIMACOES-E-OUTFITS.md`).
- `settings.dat`: binário com endereços dos servidores de login em texto plano.

### 7.8 `dictionary.dat` (pack3)

- Header: `uint32 LE = 1598`
- Corpo: **1597 registros × 6 bytes** (3 × `uint16 LE`)
- Semântica exata exige o binário nativo (provável tabela de IDs de texto cliente↔servidor)

---

## 🎨 Sistema de Sprites do Mundo

- View do jogo: ~**13×13 tiles** (offscreen 8×8 no cliente)
- Zooms: **100 / 125 / 150 / 175%**
- Desenho por **algoritmo do pintor**: chão → objetos/criaturas ordenados pela base
- Tiles de chão identificados por cor: grama=1, terra=2, areia=4, pedra=6, água=49, caminho=3 (pack10)

### Catálogo de IDs verificados (para world.json)

| ID | Tipo | Aparência | Andável |
|---|---|---|---|
| 1 | chão | grama | ✅ |
| 2 | chão | terra escura | ✅ |
| 3 | chão | caminho | ✅ |
| 4 | chão | areia | ✅ |
| 6 | chão | pedra | ✅ |
| 49 | chão | água | ❌ |
| 114-117 | objeto | árvores | ❌ blocker |
| 40 | objeto | encosta | ❌ blocker |
| 27 | criatura | monstro | — |
| 111, 112 | criatura | treant / fera | — |

> Use `web/tools/browser.html` para descobrir e conferir qualquer um dos
> 12.238 sprites (mostra id, tamanho, offset, textura e modo LA/RGBA).

---

## 🕹️ Motor Web (PWA 100% offline)

Reimplementação própria em JavaScript (vanilla, sem dependências) do que o
cliente C++ faz: **atlas, UI, áudio, mundo**.

| Original (C++/Android) | Motor web |
|---|---|
| `TGameViewArea` (13×13 tiles, offscreen) | `web/js/game.js` — câmera suavizada + painter |
| Zooms 100-175% | `ctx.scale()` + fator por nível |
| Atlas `.2` LA colorizável | `tintSprite()` (tint × luminância, cache) |
| `TXmlSerializableClass` (UI) | `web/js/ui.js` — dock/align/anchor/9grid/templates |
| `music.xml`/`soundfx.xml` | `web/js/audio.js` — WebAudio com scheduler |
| XLIFF | `web/js/i18n.js` |
| Caminhada tile-a-tile (walklock) | `web/js/game.js` — passo de 0.28s + tap-to-move (BFS) |

**Modos de execução:**
1. **PWA no disco** (`file://`) — Chrome/Edge: API de pasta; Brave/Firefox/Safari:
   `<input webkitdirectory>` (modo compatível). Basta abrir `web/index.html`.
2. **Servidor local** — `python3 server.py` (`http://localhost:8000/web/`).
   Necessário para Firefox/Safari sem modo compatível e para desenvolvimento.

**Estrutura:**
```
web/
├── index.html          shell PWA (2 modos de seleção de pasta)
├── manifest.json + sw.js   PWA + Service Worker
├── bundle.js / bundle-core.js   (gerados por build-bundle.py)
├── js/
│   ├── loader.js       File System API + file-list + fetch + sanitize XML
│   ├── atlas.js        banco de sprites (12.238) + tint LA + ancoragem 63px
│   ├── ui.js           motor de UI (9grid, dock, align, anchor, layers)
│   ├── world.js        mundo offline (grid, colisão, BFS)
│   ├── game.js         renderer (painter, câmera, joystick, teclado, zoom)
│   ├── audio.js        scheduler de music.xml/soundfx.xml
│   ├── i18n.js         XLIFF
│   └── main.js         menu, diálogos, HUD, loop
├── data/               world.json (mapas — SEUS dados)
└── tools/              ferramentas (seção 9)
```

**Controles:** WASD/setas · joystick virtual · toque = tap-to-move ·
`Z` zoom · `Esc/M` menu.

---

## 🗺️ Criação de Mapas

### Schema `world.json`

```jsonc
{
  "name": "Minha Ilha",
  "width": 30, "height": 28,
  "walkable": { "1": true, "2": true, "3": true, "4": true, "6": true },
  "playerSprite": 112,
  "ambientSetting": 1,
  "spawn": { "x": 15, "y": 15 },
  "ground": [ [49,49,1,...], ... ],       // [y][x] — IDs de chão
  "objects":  [ { "id": 114, "x": 8, "y": 8, "block": true } ],
  "creatures":[ { "id": 27, "x": 18, "y": 10, "name": "Monstro" } ]
}
```

### Fluxo 1 — minimapa (imagem reduzida, ex.: ~3px por tile)

> NÃO peça os números à IA: um mapa real tem **~40.000 números** — nenhuma IA
> de texto devolve isso sem erro. Use o conversor local:

```bash
python3 web/tools/minimap_to_world.py MINIMAPA.png --auto --trees --smooth \
        --preview conferir.png -o web/data/world.json
python3 web/tools/validate_world.py web/data/world.json
```
O conversor detecta o tamanho da célula, classifica cores (paleta editável),
transforma floresta em árvores e gera preview de conferência.

### Fluxo 2 — screenshot em escala nativa (63px/tile) com IA de visão

Siga o prompt pronto em [`docs/ESPECIFICACAO-MAPA-IA.md`](docs/ESPECIFICACAO-MAPA-IA.md)
(divide a imagem na grade 63px, classifica cada célula, devolve JSON validável).
Para imagens grandes: fatiar em pedaços com sobreposição de 1 tile.

### Fluxo 3 — à mão / procedural
- Edite `world.json` direto (IDs da tabela acima)
- Ou gere com ruído/autômatos (ver `docs/ESPECIFICACAO-MAPA-IA.md` §procedural)

### Validação (sempre!)
```bash
python3 web/tools/validate_world.py web/data/world.json
```
Confere dimensões, linhas/colunas, IDs inexistentes, spawn andável e estatísticas.

---

## 🧍 Personagens, Outfits e Animações

Resumo (completo em [`docs/ANIMACOES-E-OUTFITS.md`](docs/ANIMACOES-E-OUTFITS.md)):

- Personagens são **compostos por camadas** de sprites LA colorizáveis:
  a string de outfit em `settings.xml` lista as peças + as **cores RGBA**
  (`c=71,221,198,255;...`) aplicadas via tint.
- O formato de atlas suporta frames (`<texture frame="N">`), mas os dados
  atuais são todos `frame="0"` → animações vêm de **sequências de IDs de sprite**.
- **Descoberta prática:** agrupe sprites por (tamanho, offset) e IDs próximos =
  frames da mesma criatura. Ex.: pack20 → ids **570..576** (7 frames, 27×46)
  são um walk cycle completo.
- Ferramenta: `python3 web/tools/find_animation_sets.py --pack 20` lista todas
  as sequências candidatas por pack.
- Implementação no motor: tint por peça (já pronto em `atlas.js`) + avanço de
  frame por passo (`frames[Math.floor(walkT * n)]`).

---

## 🛠️ Ferramentas

| Ferramenta | Função |
|---|---|
| `web/tools/browser.html` | Navegador visual dos 12.238 sprites (id, tamanho, offset, LA/RGBA) |
| `web/tools/minimap_to_world.py` | **Minimapa colorido → world.json** (detecção de célula, árvores, preview) |
| `web/tools/validate_world.py` | Valida world.json contra os atlases reais |
| `web/tools/find_animation_sets.py` | Descobre sequências candidatas a animação |
| `build-bundle.py` | Gera `bundle.js`/`bundle-core.js` (roda sem servidor) |
| `server.py` | Servidor estático local (modo alternativo) |

---

## 🗺️ Roadmap

- [ ] Animações de criaturas no motor (usar `find_animation_sets.py` + walk cycle)
- [ ] Composição completa de outfits (mapear peças LA do pack correspondente)
- [ ] Editor visual de mapas (HTML) que salva `world.json`
- [ ] Mais formulários do `ui_base.xml` (login, vocação, inventário, chat)
- [ ] Ciclo dia/noite (fadeEffect do `FRM_VIEWAREA`)
- [ ] Decodificar `dictionary.dat` e o protocolo binário (com binário nativo)

---

## 📜 Licença & Créditos

- **Código e documentação:** MIT — use, modifique, compartilhe (ver [LICENSE](LICENSE)).
- **Assets do jogo:** © CipSoft GmbH — não incluídos, não licenciados aqui.
- Documentação completa: [`docs/RELATORIO-ARQUITETURA.md`](docs/RELATORIO-ARQUITETURA.md)
  · [`docs/ESPECIFICACAO-MAPA-IA.md`](docs/ESPECIFICACAO-MAPA-IA.md)
  · [`docs/ANIMACOES-E-OUTFITS.md`](docs/ANIMACOES-E-OUTFITS.md)
