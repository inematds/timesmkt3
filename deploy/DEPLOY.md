# Deploy VPS

Deploy recomendado para `timesmkt3`: VPS Ubuntu com:
- Node 20
- ffmpeg
- Docker
- PM2
- Playwright Chromium

## 1. Preparar servidor

```bash
sudo apt update
sudo apt install -y ffmpeg docker.io
sudo systemctl enable --now docker
sudo npm install -g pm2
```

## 2. Baixar o projeto

```bash
git clone git@github.com:inematds/timesmkt3.git
cd timesmkt3
npm install
cd remotion-ad && npm install && cd ..
npx playwright install chromium
```

## 3. Configurar ambiente

```bash
cp .env.example .env
```

Mínimo para subir o bot:
- `TELEGRAM_BOT_TOKEN`
- `UPSTASH_REDIS_ENDPOINT=localhost`
- `UPSTASH_REDIS_PASSWORD=`

Mínimo para pipeline útil:
- `TAVILY_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recomendados:
- `KIE_API_KEY` ou `POLLINATIONS_TOKEN`
- `PEXELS_API_KEY`
- `ELEVENLABS_API_KEY`
- credenciais de publicação social

## 4. Subir Redis local

```bash
docker run -d \
  --name timesmkt3-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:alpine
```

## 5. Subir bot e worker

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 6. Verificar

```bash
pm2 list
pm2 logs timesmkt3-bot --lines 50
pm2 logs timesmkt3-worker --lines 50
docker ps
```

## 7. Atualizar produção

```bash
git pull
npm install
cd remotion-ad && npm install && cd ..
pm2 restart ecosystem.config.cjs
```

## Observações

- `prj/` e `.env` não sobem para o Git. No servidor, você precisa criar/copiar isso manualmente.
- `remotion-ad/public/assets` e `remotion-ad/public/audio` são locais/gerados. Não dependem de versionamento.
- Se usar Upstash em vez de Redis local, preencha `UPSTASH_REDIS_ENDPOINT` e `UPSTASH_REDIS_PASSWORD`.
