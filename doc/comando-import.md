# Comando /import

Copia assets de múltiplas campanhas para uma pasta `imports/` central do projeto.

```
/import <campanhas> <origem> [modificador]
```

**Campanhas:** lista (`c55 c56`), range (`c55-c59`), ou `todos`.

**Origens:** `videos` (MP4 quick+pro), `ads` (PNG carousels), `imgs` (JPG gerados), `report` (pasta completa), `gatilhos` (pasta completa).

**Modificadores** (só para `report` / `gatilhos`): `videos` ou `ads`.

**Destino:** `prj/<projeto>/imports/{videos,ads}/` com prefixo da campanha.

Exemplos:
```
/import c55-c59 report
/import todos gatilhos videos
/import c56 gatilhos ads
```

Reimports sobrescrevem.

_Movido do CLAUDE.md em 2026-10-08 (carrega só quando a tarefa envolver /import)._
