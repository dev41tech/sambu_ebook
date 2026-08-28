// Estrategista de marketing: analisa um ebook já pronto e devolve posicionamento
// (público, dores, desejos, objeções) + uma lista pequena de criativos de venda prontos
// para virar imagem (capa alternativa, post, story, banner). Baseado num material que o
// próprio usuário trouxe, adaptado para: sair em JSON direto (sem bloco Markdown junto),
// usar OpenAI (mesma chave já configurada no projeto) e limitar a quantidade de criativos
// para manter o custo de geração de imagem sob controle.
import OpenAI from "openai";
import type { EbookRow, ChapterRow } from "./db";
import { withRetry } from "./retry";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada. Preencha o arquivo .env (veja .env.example).");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export type CreativeType = "capa" | "post" | "story" | "banner";

export interface MarketingCreative {
  id: string;
  tipo: CreativeType;
  objetivo: string;
  headline: string;
  subheadline: string;
  cta: string;
  descricao_visual: string;
}

export interface MarketingStrategy {
  publico_principal: string;
  publico_secundario: string;
  angulo_principal: string;
  /** Texto de vitrine: e o que o leitor le antes de decidir abrir o livro. */
  sinopse: string;
  dores: string[];
  desejos: string[];
  objecoes: string[];
  criativos: MarketingCreative[];
}

const SYSTEM_PROMPT = `Você é um estrategista de marketing e copywriter especializado em vender ebooks digitais para o público geral brasileiro.

Sua missão: analisar um ebook já escrito e pronto, e devolver um pacote de posicionamento e criativos de venda — pensando sempre em despertar interesse de compra em alguém que ainda não conhece o livro, não só em quem já decidiu comprar.

Regras obrigatórias:
- Português do Brasil, linguagem humana, direta e comercial — sem jargão de marketing vazio.
- Nunca prometa resultado garantido, cura, "fórmula mágica" ou use comparação de "antes e depois".
- Se o tema envolver saúde, emagrecimento, finanças, direito ou estética, seja responsável: fale de possibilidade e prática, não de garantia.
- Headlines curtas (até ~10 palavras), pensadas pra parar o scroll de alguém que não está procurando o livro.
- CTA sempre um verbo de ação direto (ex.: "Baixe agora", "Comece hoje", "Conheça o método").
- "sinopse": o texto que aparece na vitrine, antes da leitura. De 2 a 3 paragrafos curtos (entre 400 e 700 caracteres no total), escritos para quem ainda nao conhece o livro. Apresente o problema, o que a leitura oferece e para quem serve — sem revelar as conclusoes do livro e sem tom de anuncio. E texto de orelha de livro, nao headline de anuncio.
- Gere exatamente 4 criativos: 1 variação de capa, 1 post para rede social (formato quadrado), 1 story (formato vertical), 1 banner (formato paisagem para site/anúncio).
- "descricao_visual" deve descrever a cena/composição da imagem-base (sem mencionar texto/headline — o texto é aplicado depois por cima), coerente com o tema e público do livro, evitando clichê de banco de imagens.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, exatamente neste formato:
{
  "publico_principal": "",
  "publico_secundario": "",
  "angulo_principal": "",
  "sinopse": "",
  "dores": ["", ""],
  "desejos": ["", ""],
  "objecoes": ["", ""],
  "criativos": [
    { "id": "capa-alt", "tipo": "capa", "objetivo": "", "headline": "", "subheadline": "", "cta": "", "descricao_visual": "" },
    { "id": "post-1", "tipo": "post", "objetivo": "", "headline": "", "subheadline": "", "cta": "", "descricao_visual": "" },
    { "id": "story-1", "tipo": "story", "objetivo": "", "headline": "", "subheadline": "", "cta": "", "descricao_visual": "" },
    { "id": "banner-1", "tipo": "banner", "objetivo": "", "headline": "", "subheadline": "", "cta": "", "descricao_visual": "" }
  ]
}`;

export async function generateMarketingStrategy(
  ebook: EbookRow,
  chapters: Pick<ChapterRow, "title" | "summary">[]
): Promise<MarketingStrategy> {
  const chapterList = chapters.map((c, i) => `${i + 1}. ${c.title} — ${c.summary}`).join("\n");
  const prompt = `Título: ${ebook.title}
Subtítulo: ${ebook.subtitle}
Tema: ${ebook.theme}
Público informado na criação: ${ebook.audience}
Tom de voz: ${ebook.tone}

Introdução:
${ebook.intro || "(sem introdução)"}

Capítulos:
${chapterList}

Conclusão:
${ebook.conclusion || "(sem conclusão)"}`;

  const response = await withRetry(() =>
    getClient().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    })
  );

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Resposta vazia do estrategista de marketing.");
  }
  const parsed = JSON.parse(raw) as MarketingStrategy;
  if (!parsed.criativos || parsed.criativos.length === 0) {
    throw new Error("O estrategista não retornou nenhum criativo.");
  }
  return parsed;
}
