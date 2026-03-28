# Pacing by Mood — Motion Director

Define ritmo, transições e intensidade de movimento com base no tom da campanha e da marca.

---

## Como Identificar o Mood

Ler `brand_identity.md` e o `campaign_brief`. Cruzar:

| Sinal | Mood resultante |
|---|---|
| Palavras: urgente, transformação, futuro, agora | `energetic` |
| Palavras: emocional, família, memória, celebração | `emotional` |
| Palavras: premium, exclusivo, sofisticado, calma | `premium` |
| Palavras: Páscoa, Natal, festa, celebração | `festive` |
| Palavras: educação, aprender, descoberta, jornada | `inspiring` |

---

## Presets de Ritmo por Mood

### `energetic` — Urgente / Tecnologia / Transformação
- Transições: `crossfade` 0.3s entre cenas do mesmo bloco, `cut` no hook
- Duração média por cena: 2.5–3.5s
- Movimento dominante: zoom_in aggressive no hook, zoom_out moderate no benefit
- Exemplo de marca: INEMA, startups, cursos de tech

### `emotional` — Família / Datas comemorativas / Conexão humana
- Transições: `crossfade` 0.6–0.8s — nunca corte seco
- Duração média por cena: 4–5s
- Movimento dominante: zoom_in subtle, pan_right moderate
- Exemplo de marca: Dia das Mães, campanhas de comunidade

### `premium` — Luxo / Produto hero / Sofisticação
- Transições: `fade_black` 0.5s entre blocos, `crossfade` 0.4s dentro do bloco
- Duração média por cena: 4–6s
- Movimento dominante: zoom_in subtle ou pan_right subtle — nunca aggressive
- Exemplo de marca: Cold Brew Coffee Co., moda, lifestyle

### `festive` — Datas sazonais / Celebração / Animação
- Transições: `cut` no hook (impacto), `crossfade` 0.4s no resto
- Duração média por cena: 2.5–4s
- Movimento dominante: zoom_in moderate no hook, zoom_out moderate no restante
- Exemplo de marca: Páscoa INEMA, Black Friday, lançamentos

### `inspiring` — Educação / Descoberta / Jornada
- Transições: `crossfade` 0.5s suave ao longo de todo o vídeo
- Duração média por cena: 3.5–5s
- Movimento dominante: pan_right moderate (narrativa de progressão)
- Exemplo de marca: INEMA CLUB, tutoriais, trilhas de aprendizado

---

## Regras de Ritmo Geral

- **Hook sempre mais curto** que as demais cenas (2–3s máximo)
- **CTA sempre mais longo** que o esperado (+1s) — dar tempo para ler e agir
- **Não usar o mesmo tipo de movimento em 3 cenas consecutivas** — varia para manter atenção
- **Vídeo com narração** → cenas seguem duração do áudio (renderer distribui automaticamente)
- **Vídeo sem narração** → hook 2.5s, benefit 3.5s, cta 4s
