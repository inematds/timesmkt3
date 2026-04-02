# Migração: Claude CLI → Claude API

## Situação Atual

Os agentes do pipeline rodam via **Claude CLI** (`claude -p <prompt> --dangerously-skip-permissions`), spawned como subprocesso pelo worker (`pipeline/worker.js`).

### Função atual: `runClaude()`
```js
const child = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], { cwd: PROJECT_ROOT });
```

### Problemas do CLI
- **Rate limit** — "You've hit your limit · resets 9pm" — bloqueia o pipeline inteiro
- **Timeout** — processos longos (Opus scene plan) podem travar
- **Sem controle de modelo** — usa o modelo default da sessão CLI
- **Stdout parsing frágil** — depende de parsear texto de saída
- **Sem streaming** — espera tudo terminar para obter resultado
- **Concorrência limitada** — CLI tem limites de sessões simultâneas

---

## Migração Proposta

### Opção A: Claude API (Anthropic) — RECOMENDADA

**Requisitos:**
- `ANTHROPIC_API_KEY` no `.env`
- SDK: `@anthropic-ai/sdk` (npm)

**Mudanças no `worker.js`:**

1. Substituir `runClaude()` por função que usa a API:
```js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

async function runClaudeAPI(prompt, agentName, outputDir, timeout, opts = {}) {
  const model = opts.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
    // Tool use para Read/Write/Bash
  });

  return response.content[0].text;
}
```

2. **Tool use** — os agentes usam ferramentas (Read, Write, Bash). Na API, precisa definir tools e processar tool_use responses em loop.

3. **Streaming** — usar `client.messages.stream()` para progresso em tempo real.

**Vantagens:**
- Sem rate limit do CLI (usa quota da API key)
- Controle total do modelo (opus, sonnet, haiku)
- Streaming de progresso
- Respostas estruturadas
- Concorrência real (múltiplos agentes em paralelo)

**Custo:**
- API é paga por token (input + output)
- Opus é mais caro que Sonnet
- Estimar: ~$2-5 por campanha completa (5 stages)

---

### Opção B: OpenAI Codex / GPT-4

**Requisitos:**
- `OPENAI_API_KEY` no `.env`
- SDK: `openai` (npm)

**Mudanças:**
- Mesma estrutura, trocar SDK
- Adaptar prompts (escritos para Claude, podem precisar ajustes para GPT-4)
- Tool use via function calling do OpenAI

**Desvantagens:**
- Prompts otimizados para Claude
- Qualidade do scene plan pode variar
- Mais caro para modelos equivalentes ao Opus

---

### Opção C: Híbrida (CLI + API)

Manter CLI para agentes simples (Sonnet) e usar API para agentes complexos (Opus):
- Research Agent → CLI (Sonnet, rápido)
- Creative Director → CLI (Sonnet)
- Copywriter → CLI (Sonnet)
- **Dir. Fotografia → API (Opus)** — crítico, precisa de qualidade
- **Scene Plan → API (Opus)** — crítico
- Ad Creative Designer → CLI (Sonnet)
- Video Quick → CLI (Sonnet)
- Platform Agents → CLI (Sonnet)

---

## Plano de Implementação

### Fase 1: Preparação
- [ ] Instalar `@anthropic-ai/sdk`
- [ ] Adicionar `ANTHROPIC_API_KEY` ao `.env`
- [ ] Criar `pipeline/run-claude-api.js` com nova função `runClaudeAPI()`
- [ ] Implementar tool use loop (Read, Write, Bash, Glob)

### Fase 2: Migração gradual
- [ ] Adicionar flag `use_api: true` no payload
- [ ] Se `use_api`, usar `runClaudeAPI()` em vez de `runClaude()`
- [ ] Testar com 1 agente (Dir. Fotografia)
- [ ] Expandir para todos os agentes

### Fase 3: Remoção do CLI
- [ ] Remover dependência do `claude` CLI
- [ ] Atualizar documentação
- [ ] Remover `--dangerously-skip-permissions`

---

## Estimativa de Custo (API)

| Agente | Modelo | Tokens estimados | Custo/campanha |
|---|---|---|---|
| Research Agent | Sonnet | ~5K in + 3K out | ~$0.03 |
| Creative Director | Sonnet | ~8K in + 4K out | ~$0.05 |
| Copywriter | Sonnet | ~10K in + 5K out | ~$0.06 |
| Dir. Fotografia | Opus | ~15K in + 8K out | ~$0.50 |
| Scene Plan | Opus | ~20K in + 10K out | ~$0.70 |
| Ad Creative Designer | Sonnet | ~12K in + 8K out | ~$0.08 |
| Video Quick | Sonnet | ~8K in + 3K out | ~$0.04 |
| Platform Agents (6x) | Sonnet | ~30K in + 15K out | ~$0.18 |
| Distribution | Sonnet | ~5K in + 3K out | ~$0.03 |
| **Total por campanha** | | | **~$1.70** |

*Preços baseados em Claude API pricing de 2026. Opus: $15/M input, $75/M output. Sonnet: $3/M input, $15/M output.*
