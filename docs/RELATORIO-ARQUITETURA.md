# MUNDO DE BATALHA — Relatório de Engenharia Reversa Completa

> **Identificação:** Este diretório contém os **dados extraídos do cliente Android de Tibia Micro Edition 2.49**, um MMO RPG mobile.
> Origem: pasta `files/` do aplicativo no Android (cópia pessoal dos packs baixados pelo jogo).
> Os assets do jogo pertencem aos seus respectivos donos e não fazem parte deste material.

---

## 1. VISÃO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────┐
│  APLICATIVO ANDROID (nativo C++ via JNI)                        │
│  C:/jenkins/workspace/Android-Client/androidstudio/app/src/     │
│      main/jni/src/common/...                                    │
│  (nomes reais de arquivos vistos no log: TPayment.cpp,          │
│   TGameViewArea.cpp, TXmlSerializableClass.cpp)                 │
├─────────────────────────────────────────────────────────────────┤
│  Camada de DADOS LOCAIS (este diretório = "files/")             │
│  • pack1..pack30  → assets baixados (sprites, UI, áudio, texto) │
│  • settings.xml   → configurações do usuário                    │
│  • settings.dat   → lista de servidores de login (binário)      │
│  • logfile*.xml   → log + envio de crash report                 │
├─────────────────────────────────────────────────────────────────┤
│  Camada de REDE (cliente-servidor)                              │
│  • Login: login01-04.tibiame.com (+ réplicas)                   │
│  • Game:   gameserver <IP-do-servidor>:9191 (TCP)               │
│  • Crash reports: www.tibiame.com/errorlog.php                  │
└─────────────────────────────────────────────────────────────────┘
```

### Papel de cada componente
- **O mapa/estado do mundo NÃO está nestes arquivos** — é enviado pelo servidor em tempo real. Os pacotes locais contêm apenas: sprites, UI, áudio e textos. Logo, a versão HTML offline precisa de mapas próprios (criados com as ferramentas deste projeto).
- O cliente é "thin": renderiza o que o servidor manda (sprite IDs + posições). IDs de sprite são a "moeda" do protocolo.

---

## 2. ESTRUTURA DE DIRETÓRIOS

| Caminho | Conteúdo |
|---|---|
| `pack1/` | **UI completa**: ~700 PNGs de interface (9grid, botões, joystick, barras, flags, símbolos) em 4 zooms (100/125/150/175) + **3 arquivos XML de UI** (`ui_base.xml` 379 KB, `ui_portrait.xml`, `ui_landscape.xml`) |
| `pack2/` | Atlas de sprites clássicos (382 sprites): árvores, objetos, encostas, criaturas antigas |
| `pack3/` | `dictionary.dat` (tabela binária de IDs de texto, 9,5 KB) |
| `pack4/` | 6 idiomas (de, en, es, ms, pl, pt) — arquivos **XLIFF 1.2** (`extremeclienttexts.<lang>.xlf`, 330 strings cada) |
| `pack5/` | Áudio completo: 9 loops de ambiência (.ogg), ~84 efeitos (.wav), 9 músicas (.mp3) + `music.xml` (72 settings) e `soundfx.xml` (68 settings) |
| `pack10,11,20–27/` | Atlas de sprites do mundo: chão, paredes, objetos, criaturas, itens, efeitos (**12.238 sprites no total**) |
| `pack30/` | 56 tiles especiais 63×63 (mapa-múndi/minimapa) |
| `settings.xml` | Preferências: idioma, volume, zoom, keybindings, personagens salvos, quickLoad |
| `settings.dat` | Binário: servidores de login (login01-04.tibiame.com e réplicas) |
| `logfile*.xml` | Log de execução + configuração de envio de erro |
| `splashscreen_load_ui.png` | Tela de carregamento (240×240) |
| `assets_date` | Data de versão dos assets (2024-07-10) |
| `.nomedia` | Marca Android para não indexar na galeria |

---

## 3. FORMATO DOS ATLAS DE SPRITES (packs 2, 10, 11, 20–27, 30)

Cada pack `N` contém `N.xml` + arquivos `atlas_X.Y.png` (256×256):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<packdata>
  <images packid="10">
    <texture file="atlas_1.4.png" frame="0">
      <t id="2780" s="6,9"  p="49,247"  o="38,16" />
      <t id="2802" s="6,10" p="250,168" o="37,17" />
      ...
    </texture>
    ...
  </images>
</packdata>
```

### Campos do elemento `<t>`
| Atributo | Significado |
|---|---|
| `id` | **ID global do sprite** (a referência usada pelo protocolo do jogo) |
| `s` | Tamanho do sprite `"largura,altura"` em px |
| `p` | Posição `"x,y"` dentro da textura atlas |
| `o` | **Offset de desenho** `"x,y"` relativo ao canto superior-esquerdo da célula do tile |

### Regra de ancoragem (verificada estatisticamente em 12.238 sprites)
- **Célula do tile = 63×63 px.**
- O sprite é desenhado em `(tile.x*63 + o.x, tile.y*63 + o.y)`.
- A convenção: **centro-base do sprite ancorado no centro-base do tile**:
 - `o.x + w/2 ≈ 31.5` (centralizado horizontalmente)
 - `o.y + h ≈ 63` (pés apoiados na base do tile)
- Exemplos reais:
 - chão 63×63 → `o=0,0` (preenche a célula)
 - objeto 59×59 → `o=2,2` (centralizado)
 - árvore 13×46 → `o=27,4` (27 = 31.5−13/2; 4 = 63−46−13? não: base do tronco)
 - efeito 126×126 → `o=−32,−32` (centralizado sobre 2×2 tiles)

### Sufixos `.2` e `.4` das texturas
- `atlas_X.2.png` → **modo LA** (Luminância+Alfa) = sprite **colorizável** (roupas, cabelo, tintas de outfit)
- `atlas_X.4.png` → **modo RGBA** = sprite colorido normal
- Cada textura tem um conjunto próprio de IDs (sem sobreposição).

### Conteúdo dos packs (por análise de cor/forma)
- `pack10` id 1 = grama; id 4 = areia; id 49 = água; id 6 = pedra; id 3 = canto de caminho (transição); id 5 = cerca/estrutura
- `pack2` ids 114–117 = árvores/plantas; id 40 = encosta
- `pack20` ids 27, 111, 112, 116 = criaturas/monstros
- UI em pack1: sempre 4 variantes `_100/_125/_150/_175` = zooms suportados do cliente

---

## 4. MOTOR DE UI (pack1/ui_*.xml)

### Arquivos
1. `ui_base.xml` — definições comuns (templates + formulários)
2. `ui_portrait.xml` / `ui_landscape.xml` — sobrescritas por orientação
3. Seleção por `<UiIf ui="ui_phone"/>` / `<UiIf ui="ui_tablet"/>`

### Configuração global (UiConfig)
```xml
<UiConfig normalFontSize="14" normalFontSizeType="absolute"
  referenceSize="310,310" referenceSpriteSize="36" referenceSpriteGrid="11,11"
  densityDeterminationMethod="size" supportedOrientations="both"/>
```
→ A UI é baseada na exigência de que o lado curto da tela tenha ~8,5 tiles.

### Unidades de medida
| Tipo | Significado |
|---|---|
| `relative` / `relativeToParent` | % do tamanho do pai |
| `relativeToTile` | **100 unidades = 1 tile** (tile de UI) |
| `absolute` | pixels × fator de densidade |

### Atributos de layout (implementados no motor HTML)
- **dock**: `dockLeft/dockRight/dockTop/dockBottom = "ALVO,aresta,offset,unidade"` — cola o elemento em outro elemento ou em `PARENT` (ex.: `dockRight="FRM_NPCANSWERS,left,-20,relativeToTile"`)
- **align**: `alignH/alignV` (left/center/right × top/center/bottom) + `alignHWith/alignVWith` (em relação a qual referência)
- **anchor**: posiciona relativo a outro elemento (id)
- **offset + offsetType**: deslocamento na unidade escolhida
- **size + sizeType**: tamanho na unidade escolhida
- **layer**: ordem z (0 = fundo, valores maiores na frente)
- **modal, shrinkIfInvisible, handlePointer, handleFlipH, keyNavigationMode, tab**…
- **backgroundImage**: ver formatos abaixo
- **hotkey**: `bindingcommand_*` → mapeado em settings.xml → teclas
- **text**: `id_*` → resolvido pelo XLIFF do idioma ativo
- **useTemplate**: herança de template (TEMPL_*)

### Formatos de `backgroundImage` (decodificados)
```
file.png,srcX,srcY,srcW,srcH,extra;scaleType:9grid,7x8,32x33,multipleStretched
                                  └───────────┘ └──────┘
                                  borda (x,y)  centro (w,h)
file.png,0,94,0,2*94,94;scaleType:multipleCenter
       └── slice (x,y,w,h) repetido centralizado (células 94×94)
#RRGGBBAA                          → cor pura (formato AARRGGBB? não: RRGGBBAA)
```
- Modos 9grid: `stretched` (estica) ou `tiled` (repete) o centro; `multiple` = repetir células em vez de esticar.
- O cliente real **ignora atributos desconhecidos** (comprovado no logfile.xml: `unknown attribute "clearLineButton"...`). O motor HTML faz o mesmo.

### Tipos de elementos UI (inventário completo)
`UiDescription, UiConfig, UiIf, UiTemplate, UiForm, UiLabel, UiButton, UiImage, UiItemSlot, UiGameObject, UiGameCreature, UiListContainer, UiListElement, UiScrollbar, UiProgressBar, UiTextBox, UiComboBox, UiCheckBox, UiSwipe, UiSwipeControl, UiMiniMap, UiLoadingIndicator, UiGameViewArea, UiDirectionIndicator, UiAnalogStick, UiAnimatedImage, UiIconContextMenu`

### Formulários principais (ids reais)
`FRM_MAINMENU, FRM_LOGIN, FRM_NEWGAME, FRM_NEWGAME_INTRO_1..5, FRM_NEWGAME_VOCATION, FRM_OPTIONS, FRM_ABOUT_1, FRM_VIEW, FRM_VIEWAREA (GameViewArea), FRM_PLAYERBARS, FRM_SKILLS, FRM_BACKPACK, FRM_EQUIPMENT, FRM_QUESTLOG, FRM_CHAT, FRM_MINIMAP, FRM_ACTIONS, FRM_MESSAGEBOX, FRM_NPCTALK, FRM_DEATH, FRM_OUTFITSHOP…`

---

## 5. SISTEMA DE ÁUDIO (pack5/music.xml + soundfx.xml)

### Estrutura
```xml
<setting id="12">            <!-- ambiente: caverna -->
  <client channels="1|2">   <!-- 1 canal mono / 2 canais estéreo -->
    <channel priority="50">
      <sound file="ambience_dungeon_cave_loop" volume="100" repetitions="infinite" latencyallowed="false"/>
      <break length="5-15" />
      <sound file="cs_09_long_way" fadeInDuration="10" volume="60-80" />
      <list repetitions="infinite">
        <randomize>
          <sound file="ambience_dungeon_cave_sfx_01" volume="100" probability="25" />
          <break length="15-35" probability="50" />
        </randomize>
        <break length="5-15" />
      </list>
    </channel>
  </client>
</setting>
```
- `soundfx.xml`: 68 settings → efeitos (cliques, level up, conquistas…)
- `music.xml`: 72 settings → ambiências por bioma (cidade, campo, deserto, caverna, lava, neve, floresta) e 9 músicas temáticas
- Elementos: `<sound>` (volume fixo ou faixa `50-100`), `<break>` (silêncio, segundos), `<list>`, `<randomize>` (probabilidade %), `fadeInDuration`, `repetitions="infinite"`, `priority` (quem interrompe quem)
- Arquivos referenciados **sem extensão** — o cliente tenta `.wav`, `.ogg`, `.mp3`.

---

## 6. LOCALIZAÇÃO (pack4 — XLIFF 1.2)

```xml
<trans-unit approved="yes" id="id_about" maxwidth="20" size-unit="char">
  <source xml:lang="en">About Tibia Micro Edition</source>
  <note from="developer">This is in the main menu</note>
  <target state="final" xml:lang="pt">Sobre o Tibia Micro Edition</target>
</trans-unit>
```
- 330 strings por idioma; ids `id_*` são referenciados nos XMLs de UI (`text="id_about"`) e no código nativo.
- Idiomas disponíveis: **de, en, es, ms, pl, pt**.

---

## 7. CONFIGURAÇÕES (settings.xml)

- `language`, `gameViewZoomMode` (100%), `soundAmbientVolume`, `soundEffectVolume`
- `savedCharacters` / `quickLoad` — personagens salvos com senha, vocação (`wizard`/`warrior`), mundo, outfit serializado (`outfit=creature,10,2;g=outfit,11,11;…` + cores `c=71,221,198,255;…`)
- `bindings` — grupos de teclas por contexto (menu, chat, quicklist, inventory, actionmenu, navigation, gameviewarea)
- `consentMode`, `autologout`, `powersaving`, `analogstick`, `flipH`…

### settings.dat (binário)
Cabeçalho com contadores + **strings de servidores de login em texto plano** (`login01.tibiame.com`, …).

### dictionary.dat (pack3)
- 4 bytes iniciais: `uint32 LE = 1598` (contagem)
- Seguidos de **1597 registros × 6 bytes** (3 × `uint16 LE`)
- Padrões observados: valores baixos sequenciais (0x0600+) intercalados com valores altos (0xF900+); provável **tabela de mapeamento de IDs de texto** (cliente ↔ servidor). Semântica exata exige o binário nativo.

---

## 8. REDE E PROTOCOLO (o que se sabe dos arquivos)

- Login: `login01–04.tibiame.com` (e réplicas)
- Gameserver: `<IP-do-servidor>:9191` (TCP)
- O protocolo é binário proprietário: login → lista de personagens → world info (sprites por ID + mapa por pacotes). **Não é necessário replicá-lo na versão offline.**

---

## 9. COMO MODIFICAR (guia rápido)

1. **Trocar gráficos**: edite os PNGs dos atlases mantendo posições (ou edite `N.xml` para reposicionar/cortar).
2. **Adicionar sprites**: acrescente `<t>` em `N.xml` apontando para área livre do atlas.
3. **Traduzir**: edite `pack4/pt/extremeclienttexts.pt.xlf` (target) ou crie novo idioma.
4. **Sons**: troque arquivos em `pack5/` (nomes sem extensão nos XMLs).
5. **UI**: edite `ui_base.xml` (base), `ui_portrait.xml`/`ui_landscape.xml` (orientação).
6. **Mundos offline (versão HTML)**: edite `web/data/world.json` (mapa, objetos, criaturas) — IDs de sprites descobertos pela ferramenta `web/tools/browser.html`.

---

## 10. VERSÃO HTML OFFLINE (este projeto)

### Arquitetura implementada
```
web/
  index.html          → shell do jogo (canvas + overlays)
  css/style.css
  js/loader.js        → carregamento de assets (cache em memória/IndexedDB)
  js/atlas.js         → banco de sprites (parse N.xml, tint LA, cache por id)
  js/i18n.js          → parser XLIFF (pt padrão)
  js/audio.js         → parser music/soundfx.xml + playback WebAudio
  js/ui.js            → motor de UI (dock/align/anchor/9grid/zoom + parse ui_*.xml)
  js/world.js         → modelo de mundo (tiles, objetos, criaturas, colisão)
  js/game.js          → renderer do mundo (63px tiles, zoom 100–175%, câmera,
                        joystick/teclado, caminhada tile-a-tile)
  js/main.js          → bootstrap, menu principal, HUD
  data/world.json     → mapa demo editável (IDs reais verificados)
  tools/browser.html  → navegador de sprites (explore os 12.238 sprites)
server.py             → servidor estático local (100% offline, sem internet)
```

### Como rodar (100% offline)
**PWA (sem servidor):** dê duplo clique em `web/index.html` (Chrome/Edge) e
clique em "Escolher Pasta do Jogo" → selecione a pasta `MUNDO DE BATALHA`.
O `bundle.js` (gerado por `build-bundle.py`) permite rodar direto do `file://`.

**Servidor local (alternativa):**
```bash
cd "MUNDO DE BATALHA"
python3 server.py            # sobe http://localhost:8000
# abra http://localhost:8000/web/
```

**Criar mapas por IA:** veja `ESPECIFICACAO-MAPA-IA.md` (prompt pronto para
IA de visão + validador `web/tools/validate_world.py`).

### Equivalências entre motor original e HTML
| Original (C++/Android) | Versão HTML |
|---|---|
| TGameViewArea (view 13×13 tiles, offscreen 8×8) | `game.js` renderiza ~15×15 tiles com câmera suavizada |
| Zoom 100/125/150/175 | `ctx.scale()` no canvas + fator por nível |
| Atlas `.2` (LA) colorizável | tint em offscreen canvas (luminância × cor) |
| Atlas `.4` (RGBA) | desenho direto |
| Dock/align/anchor/9grid | `ui.js` (mesma sintaxe XML) |
| XLIFF | `i18n.js` |
| music.xml/soundfx.xml | `audio.js` (WebAudio) |

### Roadmap / próximos passos sugeridos
1. Animar criaturas (sequências de frames por id — hoje frame="0" estático; a animação no cliente é por lista de IDs enviada pelo servidor)
2. Sistema de outfit completo (composição de peças `.2` colorizáveis)
3. Editor visual de mapas (HTML) que salva `world.json`
4. Emular mais formulários reais do `ui_base.xml` (login, vocação, inventário)
5. Day/night cycle e efeitos de luz (fadeEffect do GameViewArea)
