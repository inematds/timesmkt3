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
  "pascoa 2026 tendencias marketing digital brasil educacao tecnologia inteligencia artificial campanhas criativas",
  "pascoa tecnologia educacao online brasil conteudo viral instagram reels carrossel ideias criativas 2025 2026",
  "publico brasileiro interesse pascoa aprendizado ia motivacoes comportamento digital redes sociais engajamento",
  "hooks virais pascoa humor criativo educacao tecnologia ia instagram tiktok reels brasil engajamento 2026",
  "campanhas pascoa marcas educacionais tech brasil posicionamento diferenciado criativo futurista tendencias"
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
