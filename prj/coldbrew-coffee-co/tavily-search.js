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
  "cold brew coffee market trends 2024 2025",
  "cold brew coffee competitor marketing strategies",
  "cold brew coffee young professionals audience pain points and desires",
  "cold brew coffee best performing ad hooks and angles",
  "cold brew coffee young professionals viral content topics social media"
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
      // only keep titles and snippets to save space
      results[query] = response.results.map(r => ({ title: r.title, content: r.content }));
    } catch (e) {
      console.error(`Error searching for ${query}: ${e.message}`);
    }
  }
  
  fs.writeFileSync('tavily_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to tavily_results.json');
}

runSearches();
