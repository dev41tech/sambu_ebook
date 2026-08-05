// Busca real na internet via Tavily (API voltada para uso com IA — já retorna conteúdo
// pronto para virar contexto de prompt, sem precisar fazer scraping manual de HTML).
// Opcional: se TAVILY_API_KEY não estiver configurada, a geração segue sem pesquisa.

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export function hasWebSearch(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha na busca (Tavily, ${res.status}).`);
  }
  const data = (await res.json()) as {
    results?: { title: string; url: string; content: string }[];
  };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content }));
}

const MAX_RESEARCH_CHARS = 9000;

export function formatResearch(results: WebSearchResult[]): string {
  if (results.length === 0) return "";
  const text = results
    .map((r) => `Fonte: ${r.title} (${r.url})\n${r.content}`)
    .join("\n\n")
    .slice(0, MAX_RESEARCH_CHARS);
  return text;
}
