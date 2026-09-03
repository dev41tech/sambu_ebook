import { randomUUID } from "node:crypto";
import { all, one, run, sql, type EbookRow } from "./db";
import {
  generateOutline,
  generateIntro,
  generateChapter,
  generateConclusion,
  generateAboutAuthor,
  humanizeText,
  resumirCapitulo,
  expandirCapitulo,
  type EbookContext,
  type Outline,
} from "./ai";
import { renderEbookPdf } from "./pdf";
import { renderEbookDocx } from "./docx";
import { renderEbookEpub } from "./epub";
import { generateCoverImage, generateChapterImage } from "./images";
import { searchPhotos, downloadPhoto } from "./pexels";
import { useLocalCover } from "./localCovers";
import { getKnowledgeContext } from "./knowledge";
import { hasWebSearch, searchWeb, formatResearch } from "./webSearch";
import { getRecentLearnings, grupoDaCategoria } from "./memory";
import { startAudiobookGeneration } from "./tts";
import { mensagemDeErroParaUsuario } from "./sanitizar";
import { verificarContinuidade, contarPorGravidade } from "./continuidade";
import { ehFiccao } from "../../src/lib/categorias";

// Limite de jobs de geração rodando ao mesmo tempo — evita que disparar vários ebooks de
// uma vez (ex.: em lote via n8n) estoure rate limit da OpenAI ou gere custo de imagem
// simultâneo sem controle. O excedente fica na fila e começa assim que uma vaga libera.
const MAX_CONCURRENT_JOBS = 2;
const activeJobs = new Set<string>();
// Ids entre a checagem e a entrada na fila. Sem este conjunto, o `await` de
// getEbook() abria uma janela em que duas chamadas concorrentes enfileiravam o
// mesmo ebook e dois jobs escreviam os mesmos capitulos.
const reservados = new Set<string>();
const queuedJobs: string[] = [];

function getEbook(id: string): Promise<EbookRow | undefined> {
  return one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [id]);
}

async function setStep(id: string, step: string) {
  await run("UPDATE ebooks SET current_step = $1 WHERE id = $2", [step, id]);
}

// A humanizacao e uma segunda passada sobre um texto que ja esta pronto. Se ela
// recusar ou devolver lixo, perder o rascunho bom -- ou derrubar o livro inteiro
// no capitulo 60 -- e pior do que publicar o rascunho sem essa passada.
async function humanizarOuManter(
  draft: string,
  rotulo: string,
  maxTokens: number,
  caminhoCategoria = ""
): Promise<string> {
  try {
    return await humanizeText(draft, rotulo, maxTokens, caminhoCategoria);
  } catch (err) {
    console.warn(`[geracao] humanizacao ignorada em ${rotulo}: ${err instanceof Error ? err.message : err}`);
    return draft;
  }
}

async function ctxFromRow(row: EbookRow): Promise<EbookContext> {
  const knowledgeContext = await getKnowledgeContext();
  const learnings = (await getRecentLearnings(12, row.category, grupoDaCategoria(row.category_main || row.theme))).map(
    (l) => l.content
  );
  return {
    theme: row.theme,
    secondaryCategories: (() => {
      try {
        const v = JSON.parse(row.categories_secondary || "[]");
        return Array.isArray(v) ? v.map(String) : [];
      } catch {
        return [];
      }
    })(),
    audience: row.audience,
    tone: row.tone,
    language: row.language,
    pageCount: row.page_count,
    wordsPerPage: row.words_per_page,
    wordGoal: row.extension_mode === "words" ? row.word_goal : 0,
    titleMode: row.title_mode as "ai" | "manual",
    referenceMaterial: row.reference_material || null,
    extraInstructions: row.extra_instructions || null,
    webResearch: row.web_research || null,
    knowledgeContext: knowledgeContext || null,
    learnings,
  };
}

async function runJob(ebookId: string) {
  try {
    let row = await getEbook(ebookId);
    if (!row || row.status === "review" || row.status === "ready" || row.status === "outline_review") return;

    // Etapa 0: pesquisa na internet (opcional — só roda se TAVILY_API_KEY estiver
    // configurada, e uma única vez por ebook, reaproveitado em todos os capítulos).
    // Ebooks importados de arquivo já chegam com outline_json preenchido e não precisam
    // de pesquisa, já que não passam pela escrita por IA.
    if (hasWebSearch() && !row.web_research && !row.outline_json) {
      await setStep(ebookId, "research");
      try {
        const results = await searchWeb(`${row.theme} ${row.audience}`.trim());
        const formatted = formatResearch(results);
        if (formatted) {
          await run("UPDATE ebooks SET web_research = $1 WHERE id = $2", [formatted, ebookId]);
          row = (await getEbook(ebookId))!;
        }
      } catch (err) {
        // Pesquisa é um complemento opcional — não deve travar a geração do ebook.
        console.warn(`[sambu-ebooks] pesquisa na internet falhou para ${ebookId}:`, err);
      }
    }

    const ctx = await ctxFromRow(row);

    // Etapa 1: outline
    let outline: Outline;
    if (!row.outline_json) {
      await setStep(ebookId, "outline");
      outline = await generateOutline({
        ...ctx,
        customTitle: row.title_mode === "manual" ? row.title : null,
        customSubtitle: row.title_mode === "manual" ? row.subtitle : null,
      });
      // O db.transaction() do better-sqlite3 so aceitava funcao sincrona; aqui a
      // transacao e do proprio driver. O `tx` passado como terceiro argumento faz
      // as queries rodarem na mesma conexao -- sem ele elas sairiam da transacao.
      await sql.begin(async (tx) => {
        await run(
          "UPDATE ebooks SET title = $1, subtitle = $2, outline_json = $3, chapters_total = $4 WHERE id = $5",
          [outline.title, outline.subtitle, JSON.stringify(outline), outline.chapters.length, ebookId],
          tx
        );
        for (const [i, c] of outline.chapters.entries()) {
          await run(
            "INSERT INTO chapters (id, ebook_id, idx, title, summary, content) VALUES ($1, $2, $3, $4, $5, '')",
            [randomUUID(), ebookId, i, c.title, c.summary],
            tx
          );
        }
      });
      row = (await getEbook(ebookId))!;
    } else {
      outline = JSON.parse(row.outline_json);
    }

    // Etapa 1b: portao de aprovacao do sumario.
    //
    // Um ebook longo era escrito inteiro a partir de um unico comando. "Alem das
    // Quatro Linhas" gastou US$ 1,33 e 33 minutos para entregar um livro com 36
    // dos 84 capitulos protagonizados por outro casal -- so da para ver isso
    // depois de pronto. Aqui a geracao para com o sumario e o elenco na mao do
    // autor, antes de qualquer capitulo ser escrito.
    if (row.outline_approval === "required") {
      await run("UPDATE ebooks SET status = 'outline_review', current_step = NULL WHERE id = $1", [ebookId]);
      return;
    }

    // Etapa 2: capa (opcional)
    if (row.generate_cover && !row.cover_path) {
      await setStep(ebookId, "cover");
      if (row.cover_source === "stock" && row.cover_stock_url) {
        const cover = await downloadPhoto(row.cover_stock_url, "", row.cover_alt_text || outline.title, `${ebookId}-cover`);
        await run("UPDATE ebooks SET cover_path = $1, cover_credit = $2 WHERE id = $3", [
          cover.path,
          row.cover_credit,
          ebookId,
        ]);
      } else if (row.cover_source === "local" && row.cover_local_file) {
        const cover = useLocalCover(row.cover_local_file, outline.title, ebookId);
        await run("UPDATE ebooks SET cover_path = $1, cover_alt_text = $2 WHERE id = $3", [
          cover.path,
          cover.altText,
          ebookId,
        ]);
      } else {
        const cover = await generateCoverImage(ebookId, outline.title, row.theme, row.audience, row.cover_suggestion);
        await run("UPDATE ebooks SET cover_path = $1, cover_alt_text = $2 WHERE id = $3", [
          cover.path,
          cover.altText,
          ebookId,
        ]);
      }
      row = (await getEbook(ebookId))!;
    }

    // Etapa 3: introdução (intro === '' significa "conteúdo importado sem introdução
    // separada" — só regeramos por IA quando o campo ainda é NULL, nunca escrito).
    if (row.intro === null) {
      await setStep(ebookId, "intro");
      const draft = await generateIntro(ctx, outline);
      const intro = await humanizarOuManter(draft, `Introdução do ebook "${outline.title}"`, 1500, ctx.theme);
      await run("UPDATE ebooks SET intro = $1 WHERE id = $2", [intro, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 4: capítulos, um de cada vez
    const chapters = await all<{
      id: string;
      idx: number;
      title: string;
      summary: string;
      content: string;
      resumo_fatos: string | null;
    }>("SELECT * FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC", [ebookId]);

    for (const chapter of chapters) {
      if (chapter.content && chapter.content.trim().length > 0) continue;
      await setStep(ebookId, "chapter");

      // O que ja aconteceu, nao so os titulos anteriores. Era a lista de titulos
      // que fazia o capitulo 5 recomecar na ilha depois de o 4 terminar com todo
      // mundo dentro da jangada, no mar.
      const anteriores = chapters
        .filter((c) => c.idx < chapter.idx)
        .map((c) => ({ idx: c.idx, title: c.title, resumo: c.resumo_fatos }));

      const draft = await generateChapter(ctx, outline, chapter.idx, anteriores);
      let content = await humanizarOuManter(draft, `Capítulo "${chapter.title}" do ebook "${outline.title}"`, 4000, ctx.theme);

      // Forca o minimo: pedir a meta certa nao garante que ela seja cumprida, e
      // sem este segundo passo o livro fechava abaixo do prometido mesmo depois
      // de recalibrar a conta de capitulos. Um limiar de 85% -- o mesmo que
      // custo.ts usa para decidir se avisa o usuario -- separa "saiu um pouco
      // curto" de "precisa ser reescrito".
      const alvoTotal = ctx.wordGoal && ctx.wordGoal > 0 ? ctx.wordGoal : ctx.pageCount * ctx.wordsPerPage;
      const metaCapitulo = Math.round(alvoTotal / outline.chapters.length);
      const palavrasEscritas = content.trim().split(/\s+/).filter(Boolean).length;
      if (palavrasEscritas < metaCapitulo * 0.85) {
        try {
          const expandido = await expandirCapitulo(ctx, content, metaCapitulo);
          const palavrasExpandidas = expandido.trim().split(/\s+/).filter(Boolean).length;
          // So aceita se realmente cresceu. Uma reescrita que saiu do mesmo
          // tamanho ou menor nao ajuda e ainda troca um texto bom por um novo,
          // sem necessidade.
          if (palavrasExpandidas > palavrasEscritas) content = expandido;
        } catch (err) {
          // Expandir e uma tentativa extra, nao uma etapa obrigatoria -- se
          // falhar, o capitulo mais curto (mas ja valido) segue em frente.
          console.warn(`[geracao] expansao do capitulo ${chapter.idx + 1} falhou:`, err instanceof Error ? err.message : err);
        }
      }

      await run("UPDATE chapters SET content = $1 WHERE id = $2", [content, chapter.id]);
      await run("UPDATE ebooks SET chapters_done = chapters_done + 1 WHERE id = $1", [ebookId]);

      // Resumo factual para os proximos capitulos. Falhar aqui nao pode derrubar
      // o livro: sem resumo o capitulo seguinte volta a receber so o titulo,
      // que e o comportamento antigo -- pior, mas nao fatal.
      try {
        const resumo = await resumirCapitulo(ctx, chapter.title, content);
        await run("UPDATE chapters SET resumo_fatos = $1 WHERE id = $2", [resumo, chapter.id]);
        // O array em memoria alimenta o proximo capitulo desta mesma execucao.
        chapter.resumo_fatos = resumo;
      } catch (err) {
        console.warn(`[geracao] resumo do capitulo ${chapter.idx + 1} falhou:`, err instanceof Error ? err.message : err);
      }
    }

    row = (await getEbook(ebookId))!;

    // Etapa 4b: imagens internas (opcional), distribuídas entre os capítulos em sequência
    if (row.generate_images && chapters.length > 0 && row.images_done < row.image_count) {
      await setStep(ebookId, "images");
      const usedPhotoIds = new Set<number>();
      for (let i = row.images_done; i < row.image_count; i++) {
        const chapter = chapters[i % chapters.length];
        let path: string;
        let altText: string;
        let credit = "";
        if (row.image_source === "stock") {
          const searchQuery = row.image_suggestion.trim() || row.theme;
          const results = await searchPhotos(searchQuery, "landscape", 8);
          if (results.length === 0) {
            throw new Error(`Nenhuma foto encontrada no Pexels para "${searchQuery}".`);
          }
          // O 1º colocado do Pexels às vezes vem sem nenhuma relação com a busca (ex.:
          // "marmitas saudáveis" retornou um atleta de cadeira de rodas em 1º, mas comida
          // de verdade do 2º ao 5º lugar). Preferimos o restante do top-8 e só usamos o 1º
          // se não sobrar outro candidato ainda não usado no livro.
          const pool = results.length > 1 ? results.slice(1) : results;
          const photo = pool.find((r) => !usedPhotoIds.has(r.id)) ?? pool[0];
          usedPhotoIds.add(photo.id);
          const saved = await downloadPhoto(photo.downloadUrl, photo.photographer, photo.alt, `${chapter.id}-${i}`);
          path = saved.path;
          altText = saved.altText;
          credit = saved.credit;
        } else {
          const image = await generateChapterImage(
            ebookId,
            `${chapter.id}-${i}`,
            i,
            chapter.title,
            chapter.summary || chapter.title,
            row.audience,
            row.image_suggestion,
            row.cover_suggestion
          );
          path = image.path;
          altText = image.altText;
        }
        await run(
          "INSERT INTO chapter_images (id, ebook_id, chapter_id, path, alt_text, credit) VALUES ($1, $2, $3, $4, $5, $6)",
          [randomUUID(), ebookId, chapter.id, path, altText, credit]
        );
        await run("UPDATE ebooks SET images_done = images_done + 1 WHERE id = $1", [ebookId]);
      }
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5: conclusão (mesma lógica da introdução — ver comentário na etapa 3)
    if (row.conclusion === null) {
      await setStep(ebookId, "conclusion");
      // Os resumos factuais de todos os capitulos ja existem a esta altura --
      // a conclusao roda depois de todos eles. Sem isso ela so via titulos e
      // inventava cenas que nunca foram escritas ("bolos voando" num livro
      // que nao tem essa cena em capitulo nenhum).
      const capitulosParaConclusao = chapters.map((c) => ({
        idx: c.idx,
        title: c.title,
        resumo: c.resumo_fatos,
      }));
      const draft = await generateConclusion(ctx, outline, capitulosParaConclusao);
      const conclusion = await humanizarOuManter(draft, `Conclusão do ebook "${outline.title}"`, 1200, ctx.theme);
      await run("UPDATE ebooks SET conclusion = $1 WHERE id = $2", [conclusion, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5b: sobre o autor (opcional)
    if (row.include_about && row.author_name && !row.about_author) {
      await setStep(ebookId, "about");
      const about = await generateAboutAuthor(row.author_name, row.author_bio, row.language);
      await run("UPDATE ebooks SET about_author = $1 WHERE id = $2", [about, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5c: verificacao de continuidade. Deterministica, sem chamada de IA,
    // entao roda sempre e nao pesa no custo. So compara nomes -- nao aprova nem
    // reprova o livro, apenas registra onde o revisor precisa olhar.
    try {
      const capitulosFinais = await all<{ idx: number; title: string; content: string }>(
        "SELECT idx, title, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
        [ebookId]
      );
      const achados = verificarContinuidade({
        outline,
        intro: row.intro,
        conclusao: row.conclusion,
        capitulos: capitulosFinais,
        ficcao: ehFiccao(row.category_main || row.theme),
      });
      await run("UPDATE ebooks SET continuity_json = $1 WHERE id = $2", [JSON.stringify(achados), ebookId]);
      if (achados.length > 0) {
        console.warn(`[continuidade] ${ebookId}: ${achados.length} achado(s)`, contarPorGravidade(achados));
      }
    } catch (err) {
      // A verificacao e um extra. Falhar aqui nao pode perder um livro inteiro
      // que acabou de custar dinheiro para ser escrito.
      console.warn(`[continuidade] falhou para ${ebookId}:`, err);
    }

    // Etapa 6: conteúdo pronto — para aqui para revisão, sem exportar ainda.
    // A exportação final (PDF/DOCX/EPUB) só roda quando o usuário confirma pela
    // tela de revisão (ver finalizeEbookExport, chamado por POST /:id/finalize).
    await run("UPDATE ebooks SET status = 'review', current_step = NULL WHERE id = $1", [ebookId]);
  } catch (err) {
    const bruta = err instanceof Error ? err.message : "Erro inesperado durante a geração.";
    // A mensagem real fica no log do servidor; a tela recebe a versão sanitizada.
    console.error(`[geracao] ${ebookId}: ${bruta}`);
    await run("UPDATE ebooks SET status = 'error', error_message = $1 WHERE id = $2", [mensagemDeErroParaUsuario(bruta), ebookId]);
  } finally {
    activeJobs.delete(ebookId);
    await startNextQueuedJob();
  }
}

async function startNextQueuedJob() {
  while (activeJobs.size < MAX_CONCURRENT_JOBS && queuedJobs.length > 0) {
    const nextId = queuedJobs.shift()!;
    if (activeJobs.has(nextId)) continue;
    // Reserva o lugar em activeJobs ANTES do await, nao depois. Entre o shift()
    // acima e o antigo `activeJobs.add()` (que so rodava depois do getEbook)
    // havia uma janela em que o id nao estava nem na fila nem em activeJobs --
    // uma chamada concorrente a ensureGenerationRunning() nessa janela (a tela
    // de progresso faz polling em GET /:id) via o id livre, reenfileirava, e
    // um segundo runJob() do MESMO ebook comecava. Foi o que aconteceu em
    // "Sombras de Vidro": 27 capitulos gravados (com custo de OpenAI cobrado)
    // para um livro de 19. A janela do reservados/queuedJobs em
    // ensureGenerationRunning ja fechava a outra ponta dessa mesma corrida;
    // esta era a que faltava.
    activeJobs.add(nextId);
    const row = await getEbook(nextId);
    if (!row || row.status === "review" || row.status === "ready" || row.status === "outline_review") {
      activeJobs.delete(nextId);
      continue;
    }
    void runJob(nextId);
  }
}

export async function ensureGenerationRunning(ebookId: string) {
  if (activeJobs.has(ebookId) || queuedJobs.includes(ebookId) || reservados.has(ebookId)) return;

  // A reserva precisa acontecer ANTES do await. Com a checagem e a inclusao na
  // fila separadas por uma ida ao banco, duas chamadas simultaneas -- a tela de
  // "gerando" faz polling na rota de detalhe, que chama esta funcao -- passavam
  // as duas pelo `if` antes de qualquer uma reservar. O resultado eram dois jobs
  // do mesmo ebook escrevendo os mesmos capitulos: em "Sob o Sol do Misterio"
  // deu 47 capitulos gerados para um livro de 40, com a OpenAI cobrando os 7.
  reservados.add(ebookId);
  try {
    const row = await getEbook(ebookId);
    if (!row || row.status === "review" || row.status === "ready" || row.status === "outline_review") return;
    queuedJobs.push(ebookId);
  } finally {
    reservados.delete(ebookId);
  }
  await startNextQueuedJob();
}

export async function finalizeEbookExport(ebookId: string): Promise<void> {
  const row = await getEbook(ebookId);
  if (!row) throw new Error("Ebook não encontrado.");
  const chapters = await all<{ id: string; title: string; content: string }>(
    "SELECT * FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
    [ebookId]
  );

  const pdfPath = await renderEbookPdf(row, chapters);
  const docxPath = await renderEbookDocx(row, chapters);
  const epubPath = await renderEbookEpub(row, chapters);

  await run(
    "UPDATE ebooks SET status = 'ready', current_step = NULL, pdf_path = $1, docx_path = $2, epub_path = $3 WHERE id = $4",
    [pdfPath, docxPath, epubPath, ebookId]
  );

  // Quando o usuário marcou o audiobook já na criação, a narração dispara sozinha
  // aqui — só depois do texto finalizado, que é quando há capítulos para narrar.
  // Sem isso a marcação na tela de criação ficaria guardada e nunca usada.
  if (row.audio_requested && row.audio_status !== "ready" && row.audio_status !== "generating") {
    await startAudiobookGeneration(ebookId);
  }
}
