import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { all, one, run, sql, type EbookRow, type ChapterRow, type ChapterImageRow } from "../lib/db";
import { ensureGenerationRunning, finalizeEbookExport } from "../lib/generationJob";
import { startAudiobookGeneration } from "../lib/tts";
import { generateCoverImage, generateChapterImage, generateMarketingImage } from "../lib/images";
import { downloadPhoto } from "../lib/pexels";
import { useLocalCover } from "../lib/localCovers";
import { renderEbookPdf, renderPageThumbnails, layoutPreviewPagePath } from "../lib/pdf";
import { renderEbookDocx } from "../lib/docx";
import { renderEbookEpub } from "../lib/epub";
import { addLearning, grupoDaCategoria } from "../lib/memory";
import { generateMarketingStrategy, type MarketingCreative, type MarketingStrategy } from "../lib/marketing";
import { renderCreative } from "../lib/creatives";
import {
  parseManuscript,
  estimatePageCount,
  extractFullTextFromPdf,
  extractEpubManuscript,
  prettifyFilenameTitle,
} from "../lib/importContent";
import { isCategoriaValida } from "../../src/lib/categorias";
import { TODOS_OS_TONS } from "../../src/lib/modos";
import { isCategoriaPersonalizada } from "./categorias";
import { avaliarQualidade } from "../lib/qualityGate";
import { medirComResumos, type Metricas } from "../lib/metricas";

export const ebooksRouter = Router();

// avaliarQualidade() e pura para poder ser testada sem banco. Este envelope faz
// a leitura e fica aqui, onde o acesso ao banco ja e a regra.
async function avaliarEbook(ebookId: string) {
  const ebook = await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [ebookId]);
  if (!ebook) return null;
  const capitulos = await all<{ idx: number; title: string; content: string }>(
    "SELECT idx, title, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [ebookId]
  );
  return avaliarQualidade({ ebook, capitulos });
}

/**
 * Placar objetivo (server/lib/metricas.ts), calculado no mesmo ponto que o
 * Quality Gate. Nunca bloqueia nada -- é o número que diz se uma mudança de
 * prompt ajudou ou atrapalhou, sem depender de reler o livro.
 */
async function medirEbook(ebookId: string): Promise<Metricas | null> {
  const ebook = await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [ebookId]);
  if (!ebook) return null;
  const capitulos = await all<{ idx: number; content: string; resumo_fatos: string | null }>(
    "SELECT idx, content, resumo_fatos FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [ebookId]
  );
  let elenco: string[] | undefined;
  if (ebook.outline_json) {
    try {
      const outline = JSON.parse(ebook.outline_json) as { personagens?: Array<{ nome: string }> };
      elenco = (outline.personagens ?? []).map((p) => p.nome);
    } catch {
      elenco = undefined;
    }
  }
  return medirComResumos(
    ebook.category_main || ebook.theme,
    capitulos.map((c) => ({ idx: c.idx, content: c.content, resumoFatos: c.resumo_fatos })),
    elenco
  );
}

// Não há mais seleção de template visual — todo ebook usa o layout único de livro
// (ver server/templates/index.ts). Esse valor fixo só existe para preencher a coluna
// `template` (NOT NULL) do banco sem precisar de uma migração de schema.
const FIXED_TEMPLATE = "livro";
// Os tons agora vem dos modos editoriais. A lista antiga tinha quatro opcoes
// escritas para livro pratico, e 40 dos 57 ebooks do acervo sairam com
// "Motivador" -- inclusive os 14 de ficcao. Os quatro antigos continuam aceitos
// para nao invalidar ebook ja criado nem o fluxo do n8n.
const TONS_LEGADOS = ["Motivador", "Técnico e direto", "Descontraído", "Formal"];
const TONES = new Set([...TODOS_OS_TONS, ...TONS_LEGADOS]);
const CATEGORIES = new Set(["geral", "tecnico", "comportamental"]);

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

ebooksRouter.get("/", async (_req, res) => {
  const rows = await all(
    `SELECT id, title, theme, status, page_count, chapters_done, chapters_total, template, audio_status, category, version, created_at
       FROM ebooks ORDER BY created_at DESC`
  );
  res.json(rows);
});

// Secundarias sao texto livre digitado pelo usuario, nao caminhos da taxonomia.
// Antes isto passava por isCategoriaValida(), que descartava em silencio tudo que
// nao fosse um caminho conhecido -- o campo aceitaria digitacao e nao gravaria nada.
function limparSecundarias(bruto: unknown[], principal: string): string[] {
  const vistos = new Set<string>();
  return bruto
    .map((c) => String(c).trim().slice(0, 60))
    .filter((c) => {
      const chave = c.toLowerCase();
      if (!c || c === principal || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, 8);
}

ebooksRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const theme = String(body.theme ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const tone = String(body.tone ?? "Motivador");
  const language = String(body.language ?? "Português (Brasil)").trim();
  const pageCount = Number(body.page_count);
  const wordsPerPage = Number(body.words_per_page ?? 250);
  const authorName = String(body.author_name ?? "").trim();
  const authorBio = String(body.author_bio ?? "").trim();
  const includeCopyright = !!body.include_copyright && authorName.length > 0;
  const includeAbout = !!body.include_about && authorName.length > 0;
  const titleMode = body.title_mode === "manual" ? "manual" : "ai";
  const customTitle = String(body.custom_title ?? "").trim();
  const customSubtitle = String(body.custom_subtitle ?? "").trim();
  const generateCover = !!body.generate_cover;
  const coverSuggestion = String(body.cover_suggestion ?? "").trim().slice(0, 500);
  const coverSource = body.cover_source === "stock" ? "stock" : body.cover_source === "local" ? "local" : "ai";
  const coverStockUrl = String(body.cover_stock_url ?? "").trim();
  const coverCredit = String(body.cover_credit ?? "").trim().slice(0, 200);
  const coverLocalFile = String(body.cover_local_file ?? "").trim();
  const coverAltText = String(body.cover_alt_text ?? "").trim().slice(0, 300);
  const generateImages = !!body.generate_images;
  const imageCount = generateImages ? Number(body.image_count) : 0;
  const imageSuggestion = String(body.image_suggestion ?? "").trim().slice(0, 500);
  const imageSource = body.image_source === "stock" ? "stock" : "ai";
  const category = CATEGORIES.has(body.category) ? body.category : "geral";
  const referenceMaterial = String(body.reference_material ?? "").trim().slice(0, 120000);
  const extraInstructions = String(body.extra_instructions ?? "").trim().slice(0, 5000);
  // Classificação: o caminho principal é o mesmo valor que vai em `theme`
  // (é ele que alimenta o prompt da IA); as secundárias só classificam.
  const categoryMain = String(body.category_main ?? theme).trim();
  const categoriesSecondary = Array.isArray(body.categories_secondary)
    ? limparSecundarias(body.categories_secondary as unknown[], categoryMain)
    : [];
  // Dois modos de pedir extensao. 'pages' e o historico e segue sendo o padrao;
  // 'words' e a unidade que a geracao de fato controla.
  // Padrao 'auto' de proposito: o fluxo automatizado (n8n) e os ebooks curtos
  // nao devem passar a esperar por um clique que ninguem vai dar.
  const outlineApproval = body.review_outline ? "required" : "auto";
  const extensionMode = body.extension_mode === "words" ? "words" : "pages";
  const wordGoal =
    extensionMode === "words" ? Number(body.word_goal) : Math.round(pageCount * wordsPerPage);
  const audioRequested = !!body.audio_requested;
  const audioVoice = String(body.audio_voice ?? "").trim().slice(0, 80);

  // Categoria criada a mao pelo usuario tambem vale. Sem esta segunda checagem
  // o proprio app cadastraria a categoria e depois recusaria o ebook com ela.
  if (categoryMain && !isCategoriaValida(categoryMain) && !(await isCategoriaPersonalizada(categoryMain))) {
    res.status(400).json({ error: "Categoria principal inválida." });
    return;
  }

  if (!theme || !audience) {
    res.status(400).json({ error: "Tema e público-alvo são obrigatórios." });
    return;
  }
  if (!Number.isFinite(pageCount) || pageCount < 1 || pageCount > 400) {
    res.status(400).json({ error: "Número de páginas deve estar entre 1 e 400." });
    return;
  }
  if (!Number.isFinite(wordsPerPage) || wordsPerPage < 150 || wordsPerPage > 500) {
    res.status(400).json({ error: "Palavras por página deve estar entre 150 e 500." });
    return;
  }
  // O teto de palavras acompanha o de paginas: 400 x 500 = 200.000 e o maximo que
  // o pedido por paginas ja permitia, entao os dois modos param no mesmo lugar.
  if (extensionMode === "words" && (!Number.isFinite(wordGoal) || wordGoal < 1000 || wordGoal > 200000)) {
    res.status(400).json({ error: "Meta de palavras deve estar entre 1.000 e 200.000." });
    return;
  }
  if (!TONES.has(tone)) {
    res.status(400).json({ error: "Tom de voz inválido." });
    return;
  }
  if (titleMode === "manual" && !customTitle) {
    res.status(400).json({ error: "Informe o título manual ou deixe a IA gerar." });
    return;
  }
  if (generateImages && (!Number.isFinite(imageCount) || imageCount < 1 || imageCount > 39)) {
    res.status(400).json({ error: "Quantidade de imagens internas deve estar entre 1 e 39." });
    return;
  }
  if (generateCover && coverSource === "stock" && !coverStockUrl) {
    res.status(400).json({ error: "Selecione uma foto do banco de imagens para a capa." });
    return;
  }
  if (generateCover && coverSource === "local" && !coverLocalFile) {
    res.status(400).json({ error: "Selecione um arquivo da pasta covers/ para a capa." });
    return;
  }
  if (category !== "geral" && !referenceMaterial) {
    res.status(400).json({ error: "Cole ou envie um material de referência para este tipo de ebook." });
    return;
  }

  const id = randomUUID();
  await run(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count, words_per_page,
       author_name, author_bio, include_copyright, include_about, title_mode,
       generate_cover, cover_suggestion, cover_source, cover_stock_url, cover_credit, cover_alt_text,
       cover_local_file,
       generate_images, image_count, image_suggestion, image_source, category, reference_material,
       extra_instructions, category_main, categories_secondary, audio_requested, audio_voice,
       extension_mode, word_goal, outline_approval, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, 'generating')`,
    [
    id,
    titleMode === "manual" ? customTitle : "",
    titleMode === "manual" ? customSubtitle : "",
    theme,
    audience,
    tone,
    language,
    FIXED_TEMPLATE,
    pageCount,
    wordsPerPage,
    authorName,
    authorBio,
    includeCopyright,
    includeAbout,
    titleMode,
    generateCover,
    generateCover ? coverSuggestion : "",
    coverSource,
    generateCover && coverSource === "stock" ? coverStockUrl : "",
    generateCover && coverSource === "stock" ? coverCredit : "",
    generateCover && coverSource === "stock" ? coverAltText : "",
    generateCover && coverSource === "local" ? coverLocalFile : "",
    generateImages,
    generateImages ? imageCount : 0,
    generateImages ? imageSuggestion : "",
    imageSource,
    category,
    referenceMaterial,
    extraInstructions,
    categoryMain,
    JSON.stringify(categoriesSecondary),
    audioRequested,
    audioVoice,
    extensionMode,
    wordGoal,
    outlineApproval,
    ]
  );

  await ensureGenerationRunning(id);
  res.status(201).json({ id });
});

const IMPORT_EXTENSIONS = new Set([".txt", ".md", ".pdf", ".epub"]);

ebooksRouter.post("/import", importUpload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Envie um arquivo .txt, .md, .pdf ou .epub com o conteúdo do ebook." });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!IMPORT_EXTENSIONS.has(ext)) {
    res.status(400).json({
      error: "Formato não suportado. Envie um arquivo .txt, .md, .pdf ou .epub (.docx ainda não é suportado).",
    });
    return;
  }

  const body = req.body ?? {};
  const audience = String(body.audience ?? "").trim();
  const language = String(body.language ?? "Português (Brasil)").trim();
  const authorName = String(body.author_name ?? "").trim();
  const authorBio = String(body.author_bio ?? "").trim();
  const includeCopyright = !!body.include_copyright && authorName.length > 0;
  const includeAbout = !!body.include_about && authorName.length > 0;
  const generateCover = !!body.generate_cover;
  const coverSuggestion = String(body.cover_suggestion ?? "").trim().slice(0, 500);
  const coverSource = body.cover_source === "stock" ? "stock" : body.cover_source === "local" ? "local" : "ai";
  const coverStockUrl = String(body.cover_stock_url ?? "").trim();
  const coverCredit = String(body.cover_credit ?? "").trim().slice(0, 200);
  const coverAltText = String(body.cover_alt_text ?? "").trim().slice(0, 300);
  const coverLocalFile = String(body.cover_local_file ?? "").trim();
  const generateImages = !!body.generate_images;
  const imageCount = generateImages ? Number(body.image_count) : 0;
  const imageSuggestion = String(body.image_suggestion ?? "").trim().slice(0, 500);
  const imageSource = body.image_source === "stock" ? "stock" : "ai";

  if (generateCover && coverSource === "stock" && !coverStockUrl) {
    res.status(400).json({ error: "Selecione uma foto do banco de imagens para a capa." });
    return;
  }
  if (generateCover && coverSource === "local" && !coverLocalFile) {
    res.status(400).json({ error: "Selecione um arquivo da pasta covers/ para a capa." });
    return;
  }
  if (generateImages && (!Number.isFinite(imageCount) || imageCount < 1 || imageCount > 39)) {
    res.status(400).json({ error: "Quantidade de imagens internas deve estar entre 1 e 39." });
    return;
  }

  const explicitTitle = String(body.title ?? "").trim();
  const fallbackTitle = explicitTitle || prettifyFilenameTitle(path.basename(req.file.originalname, ext));

  // O EPUB tem caminho próprio: cada documento do spine já é um capítulo, então
  // respeitamos essa divisão em vez de procurar cabeçalho no texto corrido.
  let manuscript;
  try {
    if (ext === ".epub") {
      manuscript = await extractEpubManuscript(req.file.buffer, fallbackTitle, !!explicitTitle);
    } else {
      const rawText =
        ext === ".pdf"
          ? await extractFullTextFromPdf(req.file.buffer)
          : req.file.buffer.toString("utf-8");
      if (!rawText.trim()) {
        res.status(422).json({ error: "Não foi possível extrair texto do arquivo enviado." });
        return;
      }
      manuscript = parseManuscript(rawText, fallbackTitle, !!explicitTitle);
    }
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Falha ao ler o arquivo enviado." });
    return;
  }

  if (manuscript.chapters.length === 0 && !manuscript.intro && !manuscript.conclusion) {
    res.status(422).json({ error: "Não foi possível identificar capítulos no arquivo enviado." });
    return;
  }

  const subtitle = String(body.subtitle ?? "").trim();
  const theme = String(body.theme ?? "").trim() || manuscript.title;
  // Classificação é opcional na importação: um manuscrito pronto pode entrar sem
  // categoria e ser classificado depois, na revisão.
  const rawCategoryMain = String(body.category_main ?? "").trim();
  const importCategoryMain =
    isCategoriaValida(rawCategoryMain) || (await isCategoriaPersonalizada(rawCategoryMain))
      ? rawCategoryMain
      : "";
  let importCategoriesSecondary: string[] = [];
  try {
    const parsed = JSON.parse(String(body.categories_secondary ?? "[]"));
    if (Array.isArray(parsed)) {
      importCategoriesSecondary = limparSecundarias(parsed, importCategoryMain);
    }
  } catch {
    importCategoriesSecondary = [];
  }
  const outline = {
    title: manuscript.title,
    subtitle,
    chapters: manuscript.chapters.map((c) => ({ title: c.title, summary: c.content.slice(0, 200) })),
  };
  const pageCount = estimatePageCount(manuscript);

  const id = randomUUID();
  await run(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count,
       author_name, author_bio, include_copyright, include_about, title_mode,
       outline_json, intro, conclusion, chapters_total, chapters_done,
       generate_cover, cover_suggestion, cover_source, cover_stock_url, cover_credit, cover_alt_text, cover_local_file,
       generate_images, image_count, image_suggestion, image_source, category, reference_material,
       extra_instructions, category_main, categories_secondary, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, 'generating')`,
    [
    id,
    outline.title,
    outline.subtitle,
    theme,
    audience,
    "Importado",
    language,
    FIXED_TEMPLATE,
    pageCount,
    authorName,
    authorBio,
    includeCopyright,
    includeAbout,
    "manual",
    JSON.stringify(outline),
    manuscript.intro,
    manuscript.conclusion,
    manuscript.chapters.length,
    manuscript.chapters.length,
    generateCover,
    generateCover ? coverSuggestion : "",
    coverSource,
    generateCover && coverSource === "stock" ? coverStockUrl : "",
    generateCover && coverSource === "stock" ? coverCredit : "",
    generateCover && coverSource === "stock" ? coverAltText : "",
    generateCover && coverSource === "local" ? coverLocalFile : "",
    generateImages,
    generateImages ? imageCount : 0,
    generateImages ? imageSuggestion : "",
    imageSource,
    "geral",
    "",
    "",
    importCategoryMain,
    JSON.stringify(importCategoriesSecondary),
    ]
  );

  // for...of no lugar de forEach: o callback do forEach nao espera promise.
  for (const [i, c] of manuscript.chapters.entries()) {
    await run(
      "INSERT INTO chapters (id, ebook_id, idx, title, summary, content) VALUES ($1, $2, $3, $4, $5, $6)",
      [randomUUID(), id, i, c.title, c.content.slice(0, 200), c.content]
    );
  }

  await ensureGenerationRunning(id);
  res.status(201).json({ id });
});

ebooksRouter.post("/:id/feedback", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const feedback = String(req.body?.feedback ?? "").trim();
  if (!feedback) {
    res.status(400).json({ error: "Escreva uma sugestão antes de enviar." });
    return;
  }
  await addLearning(feedback, row.id, row.category, grupoDaCategoria(row.category_main || row.theme));
  res.json({ ok: true });
});

// Libera a escrita depois que o autor conferiu sumario e elenco.
ebooksRouter.post("/:id/outline/approve", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "outline_review") {
    res.status(409).json({ error: "Este ebook não está aguardando aprovação do sumário." });
    return;
  }
  await run(
    `UPDATE ebooks SET outline_approval = 'approved', status = 'generating',
       outline_approved_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $1`,
    [row.id]
  );
  await ensureGenerationRunning(row.id);
  res.json({ ok: true });
});

// Recusa o planejamento: apaga o sumario para que a proxima tentativa reescreva
// do zero. O portao vem antes da escrita, entao normalmente nao ha texto a
// perder -- mas conferimos, porque um ebook pode chegar aqui por outro caminho.
ebooksRouter.post("/:id/outline/reject", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "outline_review") {
    res.status(409).json({ error: "Este ebook não está aguardando aprovação do sumário." });
    return;
  }
  const escritos = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM chapters WHERE ebook_id = $1 AND length(trim(content)) > 0",
    [row.id]
  );
  if ((escritos?.n ?? 0) > 0) {
    res.status(409).json({ error: "Há capítulos já escritos. Use a caixa de instruções para regerar." });
    return;
  }
  await sql.begin(async (tx) => {
    await run("DELETE FROM chapters WHERE ebook_id = $1", [row.id], tx);
    await run(
      `UPDATE ebooks SET outline_json = NULL, chapters_total = 0, chapters_done = 0,
         status = 'generating', current_step = NULL WHERE id = $1`,
      [row.id],
      tx
    );
  });
  await ensureGenerationRunning(row.id);
  res.json({ ok: true });
});

ebooksRouter.post("/:id/retry", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "error") {
    await run("UPDATE ebooks SET status = 'generating', error_message = NULL WHERE id = $1", [row.id]);
  }
  await ensureGenerationRunning(row.id);
  res.json({ ok: true });
});

// Regera o ebook inteiro a partir das instrucoes editadas na tela de detalhe.
//
// Nao e o /retry: aquele RETOMA de onde parou, pulando o outline e os capitulos
// que ja tem conteudo. Aqui as instrucoes mudaram, entao tudo que foi escrito
// com as instrucoes antigas precisa sair -- senao o job encontraria o outline
// velho e devolveria o mesmo livro com um briefing novo.
ebooksRouter.post("/:id/regenerate", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "generating") {
    res.status(409).json({ error: "Este ebook já está sendo gerado." });
    return;
  }

  const body = req.body ?? {};
  const theme = String(body.theme ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const tone = String(body.tone ?? row.tone).trim();
  const language = String(body.language ?? row.language).trim();
  const pageCount = Number(body.page_count);
  const wordsPerPage = Number(body.words_per_page);
  const extraInstructions = String(body.extra_instructions ?? "").trim().slice(0, 5000);
  const categoryMain = String(body.category_main ?? theme).trim();
  const categoriesSecondary = Array.isArray(body.categories_secondary)
    ? limparSecundarias(body.categories_secondary as unknown[], categoryMain)
    : [];

  if (!theme || !audience) {
    res.status(400).json({ error: "Tema e público-alvo são obrigatórios." });
    return;
  }
  if (categoryMain && !isCategoriaValida(categoryMain) && !(await isCategoriaPersonalizada(categoryMain))) {
    res.status(400).json({ error: "Categoria principal inválida." });
    return;
  }
  if (!Number.isFinite(pageCount) || pageCount < 1 || pageCount > 400) {
    res.status(400).json({ error: "Número de páginas deve estar entre 1 e 400." });
    return;
  }
  if (!Number.isFinite(wordsPerPage) || wordsPerPage < 150 || wordsPerPage > 500) {
    res.status(400).json({ error: "Palavras por página deve estar entre 150 e 500." });
    return;
  }

  // Arquivos exportados e imagens de capitulo descrevem o texto antigo. Ficariam
  // servindo o PDF do livro anterior enquanto o novo e escrito.
  const imagensAntigas = (
    await all<{ path: string }>("SELECT path FROM chapter_images WHERE ebook_id = $1", [row.id])
  ).map((r) => r.path);
  for (const caminho of [row.pdf_path, row.docx_path, row.epub_path, ...imagensAntigas]) {
    if (caminho && fs.existsSync(caminho)) fs.rmSync(caminho, { force: true });
  }

  await sql.begin(async (tx) => {
    await run("DELETE FROM chapter_images WHERE ebook_id = $1", [row.id], tx);
    await run("DELETE FROM chapters WHERE ebook_id = $1", [row.id], tx);
    await run(
      `UPDATE ebooks SET
         theme = $1, category_main = $2, categories_secondary = $3, audience = $4,
         tone = $5, language = $6, page_count = $7, words_per_page = $8,
         extra_instructions = $9,
         outline_json = NULL, intro = NULL, conclusion = NULL, about_author = NULL,
         marketing_json = NULL, pdf_path = NULL, docx_path = NULL, epub_path = NULL,
         chapters_total = 0, chapters_done = 0, images_done = 0,
         current_step = NULL, error_message = NULL, status = 'generating'
       WHERE id = $10`,
      [
        theme, categoryMain, JSON.stringify(categoriesSecondary), audience,
        tone, language, pageCount, wordsPerPage, extraInstructions, row.id,
      ],
      tx
    );
  });

  await ensureGenerationRunning(row.id);
  res.json({ ok: true });
});

interface ContentChapterUpdate {
  id: string;
  title?: string;
  content?: string;
}

ebooksRouter.put("/:id/content", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Só é possível editar o conteúdo depois que a escrita terminar." });
    return;
  }
  const body = req.body ?? {};

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const field of ["title", "subtitle", "intro", "conclusion", "about_author", "version"] as const) {
    if (typeof body[field] === "string") {
      // O placeholder e numerado pela posicao no array de valores — por isso o
      // push do valor vem antes de montar o texto.
      values.push(body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }
  if (updates.length > 0) {
    values.push(row.id);
    await run(`UPDATE ebooks SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
  }

  if (Array.isArray(body.chapters)) {
    for (const c of body.chapters as ContentChapterUpdate[]) {
      if (!c || typeof c.id !== "string") continue;
      await run(
        "UPDATE chapters SET title = COALESCE($1, title), content = COALESCE($2, content) WHERE id = $3 AND ebook_id = $4",
        [
          typeof c.title === "string" ? c.title : null,
          typeof c.content === "string" ? c.content : null,
          c.id,
          row.id,
        ]
      );
    }
  }

  res.json({ ok: true });
});

ebooksRouter.post("/:id/finalize", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "O ebook ainda não terminou de ser escrito." });
    return;
  }
  // Quality Gate. Ate aqui o verificador ja gravava `blocker` e o botao de
  // finalizar funcionava igual -- achado sem consequencia e relatorio, nao
  // controle. Agora um bloqueador impede a exportacao, e a resposta diz qual.
  const gate = await avaliarEbook(row.id);
  if (gate) {
    await run("UPDATE ebooks SET continuity_json = $1 WHERE id = $2", [JSON.stringify(gate.achados), row.id]);
    if (!gate.liberado && !req.body?.ignorar_bloqueios) {
      res.status(409).json({
        error: "O ebook tem problemas que impedem a publicação.",
        bloqueadores: gate.bloqueadores,
        contagem: gate.contagem,
      });
      return;
    }
  }

  // Métricas não bloqueiam publicação -- diferente do gate, uma falha aqui não
  // pode impedir o autor de exportar o próprio livro.
  try {
    const metricas = await medirEbook(row.id);
    if (metricas) await run("UPDATE ebooks SET metrics_json = $1 WHERE id = $2", [JSON.stringify(metricas), row.id]);
  } catch (err) {
    console.warn(`[metricas] falhou para ${row.id}:`, err instanceof Error ? err.message : err);
  }

  try {
    await finalizeEbookExport(row.id);
    res.json({ ok: true, achados: gate?.achados ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao exportar o ebook." });
  }
});

// Avalia sem exportar, para a tela mostrar o que trava a publicacao antes de o
// usuario clicar em finalizar e receber um erro.
ebooksRouter.get("/:id/quality", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const gate = await avaliarEbook(row.id);
  // Métricas calculadas na hora, não lidas do banco: o autor pode estar
  // conferindo antes de qualquer finalização, quando metrics_json ainda é nulo.
  const metricas = await medirEbook(row.id).catch(() => null);
  res.json({ ...(gate ?? { liberado: true, achados: [], bloqueadores: [], contagem: {} }), metricas });
});

async function loadEbookOr404(id: string, res: import("express").Response): Promise<EbookRow | null> {
  const row = await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [id]);
  if (!row) {
    res.status(404).json({ error: "Ebook não encontrado." });
    return null;
  }
  return row;
}

async function reRenderExports(ebookId: string) {
  const row = (await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [ebookId]))!;
  const chapters = await all<{ id: string; title: string; content: string }>(
    "SELECT id, title, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [ebookId]
  );
  const pdfPath = await renderEbookPdf(row, chapters);
  const docxPath = await renderEbookDocx(row, chapters);
  const epubPath = await renderEbookEpub(row, chapters);
  await run("UPDATE ebooks SET pdf_path = $1, docx_path = $2, epub_path = $3 WHERE id = $4", [
    pdfPath,
    docxPath,
    epubPath,
    ebookId,
  ]);
}

ebooksRouter.post("/:id/layout-preview", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "O ebook ainda não terminou de ser escrito." });
    return;
  }
  const chapters = await all<{ id: string; title: string; content: string }>(
    "SELECT id, title, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [row.id]
  );
  try {
    const preview = await renderPageThumbnails(row, chapters);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar a prévia de diagramação." });
  }
});

ebooksRouter.get("/:id/layout-preview/:index", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json({ error: "Índice de página inválido." });
    return;
  }
  const filePath = layoutPreviewPagePath(row.id, index);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Prévia ainda não gerada para esta página." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(filePath);
});

ebooksRouter.get("/:id", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "generating") await ensureGenerationRunning(row.id);
  const chapters = await all<ChapterRow>(
    "SELECT id, idx, title, summary, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [row.id]
  );
  const chapterImages = await all<Pick<ChapterImageRow, "id" | "chapter_id" | "alt_text" | "credit">>(
    "SELECT id, chapter_id, alt_text, credit FROM chapter_images WHERE ebook_id = $1 ORDER BY created_at ASC",
    [row.id]
  );
  res.json({ ...row, chapters, chapter_images: chapterImages });
});

ebooksRouter.delete("/:id", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const chapterImagePaths = (
    await all<{ path: string }>("SELECT path FROM chapter_images WHERE ebook_id = $1", [row.id])
  ).map((r) => r.path);
  for (const p of [row.pdf_path, row.docx_path, row.epub_path, row.audio_path, row.cover_path, ...chapterImagePaths]) {
    if (p && fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  await run("DELETE FROM ebooks WHERE id = $1", [row.id]);
  res.json({ ok: true });
});

ebooksRouter.get("/:id/cover", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.cover_path || !fs.existsSync(row.cover_path)) {
    res.status(404).json({ error: "Capa ainda não disponível." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(row.cover_path);
});

ebooksRouter.post("/:id/cover/regenerate", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de trocar a capa." });
    return;
  }
  const body = req.body ?? {};
  const source = body.source === "stock" ? "stock" : body.source === "local" ? "local" : "ai";
  try {
    let coverPath: string;
    let altText: string;
    let credit = "";
    let stockUrl = "";
    let localFile = "";
    if (source === "stock") {
      const stockUrlIn = String(body.stock_url ?? "").trim();
      if (!stockUrlIn) {
        res.status(400).json({ error: "Selecione uma foto do banco de imagens." });
        return;
      }
      stockUrl = stockUrlIn;
      altText = String(body.alt_text ?? "").trim().slice(0, 300) || row.title;
      credit = String(body.credit ?? "").trim().slice(0, 200);
      const saved = await downloadPhoto(stockUrlIn, "", altText, `${row.id}-cover`);
      coverPath = saved.path;
    } else if (source === "local") {
      const filename = String(body.local_file ?? "").trim();
      if (!filename) {
        res.status(400).json({ error: "Selecione um arquivo da pasta covers/." });
        return;
      }
      localFile = filename;
      const cover = useLocalCover(filename, row.title, row.id);
      coverPath = cover.path;
      altText = cover.altText;
    } else {
      const suggestion = String(body.suggestion ?? row.cover_suggestion ?? "").trim().slice(0, 500);
      const image = await generateCoverImage(row.id, row.title, row.theme, row.audience, suggestion);
      coverPath = image.path;
      altText = image.altText;
    }
    if (row.cover_path && row.cover_path !== coverPath && fs.existsSync(row.cover_path)) {
      fs.rmSync(row.cover_path, { force: true });
    }
    await run(
      "UPDATE ebooks SET cover_path = $1, cover_alt_text = $2, cover_source = $3, cover_stock_url = $4, cover_credit = $5, cover_local_file = $6 WHERE id = $7",
      [coverPath, altText, source, stockUrl, credit, localFile, row.id]
    );
    await reRenderExports(row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar nova capa." });
  }
});

ebooksRouter.get("/:id/chapter-image/:imageId", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const img = await one<ChapterImageRow>(
    "SELECT * FROM chapter_images WHERE id = $1 AND ebook_id = $2",
    [req.params.imageId, row.id]
  );
  if (!img || !fs.existsSync(img.path)) {
    res.status(404).json({ error: "Imagem não encontrada." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(img.path);
});

ebooksRouter.post("/:id/images/:imageId/regenerate", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de trocar imagens." });
    return;
  }
  const img = await one<ChapterImageRow>(
    "SELECT * FROM chapter_images WHERE id = $1 AND ebook_id = $2",
    [req.params.imageId, row.id]
  );
  if (!img) {
    res.status(404).json({ error: "Imagem não encontrada." });
    return;
  }
  const chapter = await one<ChapterRow>("SELECT * FROM chapters WHERE id = $1", [img.chapter_id]);
  if (!chapter) {
    res.status(404).json({ error: "Capítulo não encontrado." });
    return;
  }
  const body = req.body ?? {};
  const source = body.source === "stock" ? "stock" : "ai";
  try {
    let newPath: string;
    let altText: string;
    let credit = "";
    if (source === "stock") {
      const stockUrlIn = String(body.stock_url ?? "").trim();
      if (!stockUrlIn) {
        res.status(400).json({ error: "Selecione uma foto do banco de imagens." });
        return;
      }
      altText = String(body.alt_text ?? "").trim().slice(0, 300) || chapter.title;
      credit = String(body.credit ?? "").trim().slice(0, 200);
      const saved = await downloadPhoto(stockUrlIn, "", altText, img.id);
      newPath = saved.path;
    } else {
      const suggestion = String(body.suggestion ?? row.image_suggestion ?? "").trim().slice(0, 500);
      const image = await generateChapterImage(
        row.id,
        img.id,
        chapter.idx,
        chapter.title,
        chapter.summary || chapter.title,
        row.audience,
        suggestion,
        row.cover_suggestion
      );
      newPath = image.path;
      altText = image.altText;
    }
    if (img.path !== newPath && fs.existsSync(img.path)) {
      fs.rmSync(img.path, { force: true });
    }
    await run("UPDATE chapter_images SET path = $1, alt_text = $2, credit = $3 WHERE id = $4", [
      newPath,
      altText,
      credit,
      img.id,
    ]);
    await reRenderExports(row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar nova imagem." });
  }
});

ebooksRouter.get("/:id/pdf", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.pdf_path || !fs.existsSync(row.pdf_path)) {
    res.status(409).json({ error: "PDF ainda não está pronto." });
    return;
  }
  res.download(row.pdf_path, `${row.title || "ebook"}.pdf`);
});

ebooksRouter.get("/:id/docx", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.docx_path || !fs.existsSync(row.docx_path)) {
    res.status(409).json({ error: "DOCX ainda não está pronto." });
    return;
  }
  res.download(row.docx_path, `${row.title || "ebook"}.docx`);
});

ebooksRouter.get("/:id/epub", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.epub_path || !fs.existsSync(row.epub_path)) {
    res.status(409).json({ error: "EPUB ainda não está pronto." });
    return;
  }
  res.download(row.epub_path, `${row.title || "ebook"}.epub`);
});

ebooksRouter.post("/:id/audiobook", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de criar o audiobook." });
    return;
  }
  if (row.audio_status === "generating") {
    res.status(409).json({ error: "O audiobook já está sendo gerado." });
    return;
  }
  if (row.audio_status === "ready") {
    res.status(409).json({ error: "Este ebook já tem um audiobook pronto." });
    return;
  }
  await startAudiobookGeneration(row.id);
  res.json({ ok: true });
});

ebooksRouter.get("/:id/audiobook", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.audio_path || !fs.existsSync(row.audio_path)) {
    res.status(409).json({ error: "Audiobook ainda não está pronto." });
    return;
  }
  res.download(row.audio_path, `${row.title || "ebook"}.mp3`);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creativesDir = path.resolve(__dirname, "..", "..", "data", "exports", "criativos");

function creativeFilePath(ebookId: string, creativeId: string): string {
  const safeId = creativeId.replace(/[\\/:*?"<>|]/g, "-");
  return path.join(creativesDir, `${ebookId}-${safeId}.png`);
}

ebooksRouter.get("/:id/marketing/strategy", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.marketing_json) {
    res.status(404).json({ error: "Estratégia de marketing ainda não gerada." });
    return;
  }
  res.json(JSON.parse(row.marketing_json) as MarketingStrategy);
});

ebooksRouter.post("/:id/marketing/strategy", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de criar a estratégia de marketing." });
    return;
  }
  try {
    const chapters = await all<Pick<ChapterRow, "title" | "summary">>(
      "SELECT title, summary FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
      [row.id]
    );
    const strategy = await generateMarketingStrategy(row, chapters);
    await run("UPDATE ebooks SET marketing_json = $1 WHERE id = $2", [JSON.stringify(strategy), row.id]);
    res.json(strategy);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar estratégia de marketing." });
  }
});

ebooksRouter.post("/:id/marketing/render", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.marketing_json) {
    res.status(409).json({ error: "Gere a estratégia de marketing antes de renderizar um criativo." });
    return;
  }
  const creativeId = String(req.body?.creative_id ?? "").trim();
  if (!creativeId) {
    res.status(400).json({ error: "Informe o creative_id." });
    return;
  }
  const strategy = JSON.parse(row.marketing_json) as MarketingStrategy;
  const creative = strategy.criativos.find((c: MarketingCreative) => c.id === creativeId);
  if (!creative) {
    res.status(404).json({ error: "Criativo não encontrado na estratégia." });
    return;
  }
  try {
    const baseImage = await generateMarketingImage(
      row.id,
      creative.id,
      creative.tipo,
      creative.descricao_visual,
      row.theme,
      row.audience
    );
    await renderCreative(
      row.id,
      { id: creative.id, tipo: creative.tipo, headline: creative.headline, subheadline: creative.subheadline, cta: creative.cta },
      baseImage.path,
      row.author_name || row.title
    );
    fs.rmSync(baseImage.path, { force: true });
    res.json({ ok: true, creative_id: creative.id, url: `/api/ebooks/${row.id}/marketing/creative/${encodeURIComponent(creative.id)}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao renderizar criativo." });
  }
});

ebooksRouter.get("/:id/marketing/creative/:creativeId", async (req, res) => {
  const row = await loadEbookOr404(req.params.id, res);
  if (!row) return;
  const filePath = creativeFilePath(row.id, req.params.creativeId);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Criativo ainda não renderizado." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(filePath);
});
