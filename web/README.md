# MUNDO DE BATALHA — PWA 100% Offline

Reimplementação em navegador do motor do cliente TibiaME v2.49 (CipSoft GmbH),
usando os assets extraídos localmente. **Sem internet, sem servidor.**

> ⚠️ Assets (sprites, sons, textos) são © CipSoft GmbH. Este projeto é para
> uso pessoal/educacional com os seus próprios arquivos extraídos.

---

## 🚀 Como rodar (escolha UMA opção)

### Opção A — PWA (recomendado): só dar duplo clique, SEM servidor
1. Abra `web/index.html` (duplo clique).
2. Clique em **"📁 Escolher Pasta do Jogo"** (Chrome/Edge).
   • **Brave, Firefox ou Safari:** use **"📂 Selecionar pasta (modo compatível)"** —
   o Brave bloqueia a API de pastas por padrão; o modo compatível funciona em todos.
3. Selecione a pasta **MUNDO DE BATALHA** (a que contém `pack1`, `pack2`, …).
4. Pronto — o jogo carrega e roda 100% offline direto do disco.

> Os módulos são carregados via `bundle.js` (gerado por `build-bundle.py`)
> porque o `file://` não permite módulos ES. Nada de servidor.

### Opção B — Servidor local (Firefox/Safari, ou desenvolvimento)
```bash
cd "MUNDO DE BATALHA"
python3 server.py            # http://localhost:8000
```
| URL | O quê |
|---|---|
| `http://localhost:8000/web/` | O jogo |
| `http://localhost:8000/web/tools/browser.html` | Navegador dos 12.238 sprites |

(Firefox/Safari não têm a API de pasta — use esta opção neles.)

---

## 🎮 Controles

| Entrada | Ação |
|---|---|
| `WASD` / setas | Andar (tile a tile, walklock) |
| Joystick virtual (canto inf. esquerdo) | Andar (toque/mouse) |
| Toque/clique no chão | Tap-to-move (pathfinding BFS) |
| `Z` / botão ZOOM | Zoom 100→125→150→175% |
| `Esc`/`M` / botão MENU | Menu dentro do jogo |
| `1/3/4/6` no menu | Atalhos (como no original) |

---

## 🗺️ Criar mapas

### Feitos à mão — `web/data/world.json`
```jsonc
{
  "width": 30, "height": 28,
  "ground": [[1,4,49, ...]],           // grid [y][x] de IDs de sprite
  "walkable": { "1": true, "4": true },
  "objects":  [{ "id": 114, "x": 8, "y": 8, "block": true }],
  "creatures":[{ "id": 27, "x": 18, "y": 10, "name": "Monstro" }],
  "spawn": { "x": 15, "y": 15 },
  "playerSprite": 112,
  "ambientSetting": 1
}
```
IDs verificados: chão `1`=grama `2`=terra `4`=areia `6`=pedra `49`=água ·
árvores `114–117` · encosta `40` · monstros `27/111/112`.
Descubra mais com `tools/browser.html`.

### A partir de uma IMAGEM
**Minimapa reduzido (ex: ~3px por tile):** use o conversor LOCAL (IA não
aguenta 40.000 números de texto):
```bash
python3 web/tools/minimap_to_world.py MINIMAPA.png --auto --trees --smooth \
        --preview preview.png -o web/data/world.json
python3 web/tools/validate_world.py web/data/world.json
```

**Screenshot em escala nativa (63px/tile):** siga `ESPECIFICACAO-MAPA-IA.md`
(prompt pronto para IA de visão). Depois valide com o mesmo comando acima.

Mapa pronto de exemplo (10×9 gerado por IA): `web/data/world-aurea.json`
— copie sobre `world.json` para jogá-lo.

---

## 📁 Estrutura

```
web/
  index.html            PWA shell (overlay de seleção de pasta)
  manifest.json         PWA manifest
  sw.js                 Service Worker (cache offline p/ modo http)
  bundle.js             ⚙️ GERADO (jogo completo, script clássico)
  bundle-core.js        ⚙️ GERADO (núcleo p/ ferramentas)
  css/style.css
  js/                   fontes dos módulos (para desenvolvimento)
    loader.js           File System API + fetch + sanitize XML
    atlas.js            banco de sprites (atlas + tint LA + offsets 63px)
    i18n.js             XLIFF (pt)
    audio.js            music.xml + soundfx.xml (WebAudio)
    ui.js               motor de UI (dock/align/anchor/9grid)
    world.js            mundo (grid, colisão, BFS)
    game.js             renderer do mundo + jogador + câmera
    main.js             bootstrap, menu, diálogos, HUD
  data/world.json       MAPA — edite aqui
  tools/browser.html    explorador de sprites (funciona em ambos os modos)
  tools/validate_world.py  validador de world.json contra os atlases
```

## 🔧 Desenvolvimento

Editou algo em `web/js/`? Regenere os bundles:
```bash
python3 build-bundle.py     # gera bundle.js e bundle-core.js
```

## ✅ Implementado vs. original

✅ Atlas/offset/ancoragem 63px · zoom 100/125/150/175 · pintor por base
✅ UI 9grid/dock/align/anchor/templates · XLIFF pt · music/soundfx.xml
✅ Tint de sprites LA · caminhada tile-a-tile · tap-to-move · joystick
✅ PWA: roda do disco (file://) sem servidor · Service Worker p/ modo http

🚧 Futuro (roadmap em `../docs/RELATORIO-ARQUITETURA.md`):
animações de criaturas, outfits completos, editor visual de mapas,
mais formulários do ui_base.xml, ciclo dia/noite.
