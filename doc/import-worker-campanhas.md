# Import Worker — Lote de Campanhas

Qualquer sistema externo pode disparar geração em lote copiando uma pasta para `imports/`
com um `manifest.json`.

---

## Estrutura

```text
timesmkt3/
  imports/
    lote-dia-das-maes/
      manifest.json
```

- Cada pasta em `imports/` é um lote.
- O worker lê o `manifest.json`, resolve as campanhas e gera os outputs.
- Quando tudo termina, a pasta do lote é removida automaticamente por default.

---

## manifest.json

```json
{
  "titulo": "Batch videos maes",
  "project_dir": "prj/inema",
  "output_root": "prj/inema/outputs/imports/batch_maes",
  "per_day": 3,
  "auto_approve_video": true,
  "cleanup_import": true,
  "defaults": {
    "targets": ["video_quick"],
    "image_source": "solid",
    "image_background_color": "#0D0D0D",
    "video_duration": 20,
    "narrator": "rachel",
    "platform_targets": ["instagram"]
  },
  "campaigns": [
    "c0043-dia_das_maes",
    {
      "campaign_id": "c0044-pascoa",
      "targets": ["ads", "video_pro"],
      "image_source": "brand",
      "output_name": "c0044-pascoa-pro"
    }
  ]
}
```

---

## Campos raiz

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---:|---|
| `titulo` | string | não | Nome do lote |
| `project_dir` | string | sim | Projeto base, ex: `prj/inema` |
| `output_root` | string | não | Pasta base de saída. Default: `project_dir/outputs/imports/<nome-do-lote>` |
| `per_day` | number | não | Limite de campanhas processadas por scan/dia |
| `auto_approve_video` | boolean | não | Se `true`, autoaprova `video_pro` |
| `cleanup_import` | boolean | não | Se `true`, remove a pasta do lote ao terminar |
| `defaults` | object | não | Defaults aplicados às campanhas |
| `campaigns` | array \| `"all"` | não | Campanhas escolhidas. Se ausente ou `"all"`, usa todas as campanhas ativas do projeto |

---

## Campos por campanha

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---:|---|
| `campaign_id` | string | sim | Nome da campanha existente em `project_dir/outputs/` |
| `output_name` | string | não | Nome da subpasta de saída |
| `output_dir` | string | não | Sobrescreve a pasta final dessa campanha |
| `targets` | array \| string | não | `ads`, `video_quick`, `video_pro`, `both` |
| `image_source` | string | não | `brand`, `api`, `free`, `screenshot`, `folder`, `solid` |
| `image_folder` | string | não | Pasta para `image_source: "folder"` |
| `image_background_color` | string | não | Cor para `image_source: "solid"` |
| `video_duration` | number | não | Duração do vídeo |
| `narrator` | string | não | Voz do vídeo |
| `platform_targets` | array | não | Plataformas do payload |

---

## Regras

- `targets: "ads"` roda apenas o `ad_creative_designer`.
- `targets: "video_quick"` roda apenas o quick.
- `targets: "video_pro"` roda apenas o pro.
- `targets: "both"` roda quick + pro.
- `image_source: "solid"` aceita `image_background_color`; sem cor, o fallback é `#0D0D0D`.
- O worker copia os artefatos base da campanha original (`creative/`, `copy/`, `research_results.json`) para a nova pasta de saída antes de gerar.
- Quando um vídeo final é gerado, ele também é copiado para a pasta agregada `<output_root>/videos/`.
- A cópia agregada não remove o arquivo original da campanha.

---

## CLI

```bash
# Processa todos os lotes pendentes em imports/
node scripts/campaign-import-worker.js scan

# Limpa imports/ completamente
node scripts/campaign-import-worker.js clean-imports
```
