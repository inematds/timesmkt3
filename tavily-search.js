const { tavily } = require('@tavily/core');
const fs = require('fs');
const envData = fs.readFileSync('.env', 'utf-8');
const TAVILY_API_KEY = envData.match(/TAVILY_API_KEY=(.*)/)[1].trim();

if (!TAVILY_API_KEY) {
  console.error("TAVILY_API_KEY is not set in the .env file.");
  process.exit(1);
}

const client = tavily({ apiKey: TAVILY_API_KEY });

const queries = [
  "pascoa 2026 tendencias marketing digital reels carrossel instagram brasil chocolate familia ovos coloridos alegria renovacao",
  "campanha pascoa educacao online comunidade digital estrategias criativas instagram reels conteudo marcas brasileiras 2025 2026",
  "publico pascoa motivacoes emocionais familia renovacao ciclo novo esperanca dores conexao humana consumo consciente brasil",
  "melhores hooks pascoa reels instagram anuncio viral ovos coloridos chocolate artesanal familia alegria renovacao espiritual digital",
  "conteudo viral pascoa comunidade online solidariedade renovacao esperanca educacao digital gratuita brasil carrossel instagram stories 2026"
];

async function runSearches() {
  const results = {};
  for (const query of queries) {
    console.log(`Searching for: ${query}`);
    try {
      const response = await client.search(query, {
        searchDepth: "advanced",
        maxResults: 5
      });
      results[query] = response.results.map(r => ({ title: r.title, content: r.content }));
    } catch (e) {
      console.error(`Error searching for ${query}: ${e.message}`);
    }
  }

  fs.writeFileSync('tavily_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to tavily_results.json');
}

runSearches();
