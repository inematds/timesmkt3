const { tavily } = require('@tavily/core');
const { requireEnv } = require('./config/env');
const TAVILY_API_KEY = requireEnv('TAVILY_API_KEY');

if (!TAVILY_API_KEY) {
  console.error("TAVILY_API_KEY is not set in the .env file.");
  process.exit(1);
}

const client = tavily({ apiKey: TAVILY_API_KEY });

const queries = [
  "inteligencia artificial gestores executivos 2025 2026 tendencias lideranca ia agentes autonomos transformacao digital empresas",
  "vibe coding agentic systems executivos CEO gestao estrategica ia competencias digitais c-level brasil",
  "pascoa simbolismo renascimento transformacao profissional lideranca digital maestro metafora gestao ia 2026",
  "gestores tecnologia autonomia ia projetos sem TI automacao empreendedora empoderamento executivo brasil 2025",
  "conteudo viral instagram linkedin executivos inteligencia artificial pascoa engajamento lideranca transformacao carreira"
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
