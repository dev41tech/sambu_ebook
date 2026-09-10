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
  elencoEfetivo,
  condensarBloco,
  converterDialogoParaTravessao,
  reduzirAbstracao,
  blocoQueCobre,
  CAPITULOS_POR_BLOCO,
  type BlocoDeMemoria,
  type CapituloAnterior,
  type EbookContext,
  type Outline,
  type Personagem,
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
import {
  verificarContinuidade,
  contarPorGravidade,
  extrairNomes,
  nomesAutorizados,
  termosDeFatosFixos,
  normalizarTermo,
} from "./continuidade";
import { ehFiccao } from "../../src/lib/categorias";
import { modoDe } from "../../src/lib/modos";
import { abstracoesDe, formatoDeDialogo, LIMITE_ABSTRACAO_POR_MIL } from "./metricas";

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

// De quantos em quantos capitulos a verificacao de continuidade roda no MEIO da
// geracao, em vez de so no fim.
//
// A verificacao ja sabia apontar capitulo orfao -- mas so depois do livro
// pronto, quando reescrever significa pagar tudo de novo. Rodando a cada bloco,
// o capitulo que trocou os protagonistas e reescrito na hora, com o defeito
// nomeado no proprio prompt. Precisa ser >= 8, que e o piso de amostra que a
// checagem de capitulos orfaos exige.
const CHECAGEM_A_CADA = 10;

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
  caminhoCategoria = "",
  nomes: string[] = []
): Promise<string> {
  try {
    return await humanizeText(draft, rotulo, maxTokens, caminhoCategoria, nomes);
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

    // Etapa 3: capítulos, um de cada vez.
    //
    // A introdução era escrita AQUI, antes de qualquer capítulo existir, com os
    // títulos do sumário como única fonte -- abria um livro que ainda não tinha
    // sido escrito. Passou para depois dos capítulos (etapa 5), onde recebe os
    // mesmos resumos reais que a conclusão sempre recebeu.
    const chapters = await all<{
      id: string;
      idx: number;
      title: string;
      summary: string;
      content: string;
      resumo_fatos: string | null;
      personagens_json: string | null;
    }>("SELECT * FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC", [ebookId]);

    // Elenco que nasceu na prosa. O do sumario resolve o protagonista; este
    // resolve o resto -- sem ele, cada capitulo inventava os proprios
    // secundarios e nenhum sabia dos anteriores.
    const lerPersonagens = (bruto: string | null): Personagem[] => {
      if (!bruto) return [];
      try {
        const v = JSON.parse(bruto);
        return Array.isArray(v) ? (v as Personagem[]) : [];
      } catch {
        return [];
      }
    };
    // Capitulos ja escritos numa execucao anterior devolvem seu elenco: retomar
    // um livro interrompido no capitulo 40 nao pode perder quem foi criado ate la.
    const registrados: Personagem[] = chapters.flatMap((c) => lerPersonagens(c.personagens_json));

    const ficcao = ehFiccao(row.category_main || row.theme);
    // As duas passadas de prosa valem para o modo narrativo, que e onde vive a
    // regra de dialogo e onde a abstracao foi medida. Em nao ficcao o texto nao
    // tem fala de personagem e a comparacao nao significa a mesma coisa.
    const narrativo = modoDe(row.category_main || row.theme) === "narrativo";

    let memoriaLonga: BlocoDeMemoria[] = (() => {
      if (!row.memoria_longa) return [];
      try {
        const v = JSON.parse(row.memoria_longa);
        return Array.isArray(v) ? (v as BlocoDeMemoria[]) : [];
      } catch {
        return [];
      }
    })();

    // Um capitulo so e reescrito uma vez por execucao: sem este teto, uma
    // checagem que continuasse reprovando faria o mesmo capitulo ser pago em loop.
    const reescritos = new Set<number>();

    // Capitulos que terminaram em reflexao abstrata em vez de decisao, custo ou
    // informacao nova. So contado e reportado -- nenhuma reescrita e disparada
    // por isto. Primeiro medir a frequencia real, depois decidir se vale agir:
    // agir antes de medir e o que fez a reducao de abstracao nascer jogando dez
    // chamadas fora.
    const fechamentosFracos: number[] = [];

    // O que ja aconteceu, nao so os titulos anteriores. Era a lista de titulos
    // que fazia o capitulo 5 recomecar na ilha depois de o 4 terminar com todo
    // mundo dentro da jangada, no mar.
    const anterioresAte = (idx: number): CapituloAnterior[] =>
      chapters
        .filter((c) => c.idx < idx)
        .map((c) => ({ idx: c.idx, title: c.title, resumo: c.resumo_fatos }));

    /**
     * Padroniza a convencao de dialogo do capitulo.
     *
     * Mede antes de agir: so gasta chamada no capitulo que de fato saiu fora do
     * padrao. Em "Coracoes Urbanos" seriam 4 chamadas em 12 capitulos.
     */
    const padronizarDialogo = async (conteudo: string, idx: number): Promise<string> => {
      if (!narrativo) return conteudo;
      const antes = formatoDeDialogo(conteudo);
      if (!antes.usaAspas) return conteudo;
      try {
        const convertido = await converterDialogoParaTravessao(ctx, conteudo);
        const depois = formatoDeDialogo(convertido);
        // So aceita se realmente converteu, e sem perder as falas que ja
        // estavam certas -- mesma logica de aceitacao da expansao.
        if (depois.aspas < antes.aspas && depois.travessao >= antes.travessao) {
          console.warn(
            `[prosa] ${ebookId} cap. ${idx + 1}: ${antes.aspas} fala(s) em aspas convertidas para travessao.`,
          );
          return convertido;
        }
        console.warn(`[prosa] ${ebookId} cap. ${idx + 1}: conversao de dialogo descartada, nao melhorou.`);
      } catch (err) {
        // Padronizar e um acabamento, nao um requisito: falhar aqui nao pode
        // custar o capitulo, que ja esta escrito e valido.
        console.warn(`[prosa] conversao de dialogo do capitulo ${idx + 1} falhou:`, err instanceof Error ? err.message : err);
      }
      return conteudo;
    };

    /**
     * Reescreve o capitulo abstrato demais, nomeando o que esta sobrando.
     *
     * A metrica de abstracao existia e ninguem agia sobre ela. Este e o mesmo
     * padrao do expandirCapitulo -- mede contra um alvo, reescreve so quando
     * esta fora, e so aceita a reescrita se o numero melhorou.
     */
    const concretizar = async (conteudo: string, idx: number): Promise<string> => {
      if (!narrativo) return conteudo;
      const antes = abstracoesDe(conteudo);
      if (antes.porMil <= LIMITE_ABSTRACAO_POR_MIL) return conteudo;
      try {
        const reescrito = await reduzirAbstracao(ctx, conteudo, antes.termos);
        const depois = abstracoesDe(reescrito);
        const palavrasAntes = conteudo.trim().split(/\s+/).filter(Boolean).length;
        const palavrasDepois = reescrito.trim().split(/\s+/).filter(Boolean).length;

        // A reescrita precisa baixar a abstracao SEM encolher o capitulo. Cortar
        // metade do texto tambem "reduz a abstracao", e derrubaria a entrega em
        // palavras -- que hoje esta acima de 97% da meta e custou trabalho.
        if (depois.porMil < antes.porMil && palavrasDepois >= palavrasAntes * 0.95) {
          console.warn(
            `[prosa] ${ebookId} cap. ${idx + 1}: abstracao ${antes.porMil} -> ${depois.porMil} por mil.`,
          );
          return reescrito;
        }

        // Melhorou a prosa mas cortou texto. Era aqui que o ganho ia embora: no
        // terceiro livro de teste o capitulo 3 caiu de 13.6 para 8.1 de
        // abstracao e foi descartado inteiro por ter encolhido 17%.
        //
        // Em vez de jogar fora, devolve o tamanho com a maquinaria que ja
        // existe e ja sabe acertar alvo em numero de palavras. Custa uma chamada
        // a mais exatamente no caso que hoje ja desperdica uma inteira.
        if (depois.porMil < antes.porMil) {
          try {
            const expandido = await expandirCapitulo(ctx, reescrito, palavrasAntes);
            const finalAbs = abstracoesDe(expandido);
            const finalPalavras = expandido.trim().split(/\s+/).filter(Boolean).length;

            // Expandir pode reintroduzir a abstracao que a passada anterior
            // tirou -- por isso as duas condicoes sao checadas de novo, contra
            // o texto ORIGINAL, e nao contra o intermediario.
            if (finalAbs.porMil < antes.porMil && finalPalavras >= palavrasAntes * 0.95) {
              console.warn(
                `[prosa] ${ebookId} cap. ${idx + 1}: abstracao ${antes.porMil} -> ${finalAbs.porMil} por mil, ` +
                  `tamanho recuperado (${palavrasAntes} -> ${palavrasDepois} -> ${finalPalavras} palavras).`,
              );
              return expandido;
            }
            console.warn(
              `[prosa] ${ebookId} cap. ${idx + 1}: expansao apos a reducao nao fechou ` +
                `(abstracao ${finalAbs.porMil}, palavras ${finalPalavras} de ${palavrasAntes}).`,
            );
          } catch (err) {
            console.warn(
              `[prosa] expansao apos reducao no capitulo ${idx + 1} falhou:`,
              err instanceof Error ? err.message : err,
            );
          }
        }

        const motivo =
          depois.porMil >= antes.porMil
            ? "nao reduziu a abstracao"
            : `encolheu o capitulo em ${Math.round((1 - palavrasDepois / palavrasAntes) * 100)}% e a expansao nao recuperou`;
        console.warn(
          `[prosa] ${ebookId} cap. ${idx + 1}: reescrita descartada, ${motivo} ` +
            `(abstracao ${antes.porMil} -> ${depois.porMil}, palavras ${palavrasAntes} -> ${palavrasDepois}).`,
        );
      } catch (err) {
        console.warn(`[prosa] reducao de abstracao do capitulo ${idx + 1} falhou:`, err instanceof Error ? err.message : err);
      }
      return conteudo;
    };

    const escrever = async (
      chapter: { id: string; idx: number; title: string },
      correcao?: string,
    ): Promise<string> => {
      const draft = await generateChapter(ctx, outline, chapter.idx, anterioresAte(chapter.idx), registrados, {
        memoriaLonga,
        correcao,
      });
      const nomes = elencoEfetivo(outline, registrados).map((p) => p.nome);
      let content = await humanizarOuManter(
        draft,
        `Capítulo "${chapter.title}" do ebook "${outline.title}"`,
        4000,
        ctx.theme,
        nomes,
      );

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
      content = await padronizarDialogo(content, chapter.idx);
      content = await concretizar(content, chapter.idx);
      return content;
    };

    /**
     * Ja e alguem (ou algo) que o livro conhece?
     *
     * Compara PARTE A PARTE, e nao pelo nome inteiro: "Renata" e "Renata Campos"
     * sao a mesma pessoa, e comparar a string cheia nunca casava as duas -- num
     * livro de teste o registro "descobriu" as duas protagonistas como gente
     * nova por causa disso. Tambem barra o que vem dos fatos fixos, que e o que
     * impede uma cidade de virar personagem.
     */
    const jaConhecido = (nome: string): boolean => {
      const autorizados = nomesAutorizados(elencoEfetivo(outline, registrados));
      const reservados = termosDeFatosFixos(outline);
      const partes = nome.split(/\s+/).map(normalizarTermo).filter(Boolean);
      if (partes.length === 0) return true;
      return partes.some((p) => autorizados.has(p) || reservados.has(p));
    };

    /**
     * Plano B para quando o modelo devolve `personagensNovos` vazio -- falha
     * silenciosa que faz o secundario recem-criado sumir do livro do mesmo jeito
     * de antes do registro existir. Reaproveita o detector de nomes proprios da
     * verificacao de continuidade.
     *
     * Piso de 5 mencoes: e o mesmo que `continuidade.ts` usa para decidir que
     * alguem e "personagem de fato". Com 3 o detector trazia nome de passagem e
     * substantivo capitalizado por acaso -- e, num livro de teste, uma cidade.
     * Ele continua sendo um palpite: nao ha como um contador de nomes proprios
     * distinguir uma pessoa de um lugar, e por isso o teto por capitulo e baixo.
     */
    const personagensPorHeuristica = (conteudo: string, idx: number): Personagem[] => {
      const novos: Personagem[] = [];
      const vistos = new Set<string>();
      for (const [nome, n] of extrairNomes(conteudo)) {
        if (n < 5) continue;
        if (jaConhecido(nome) || vistos.has(normalizarTermo(nome))) continue;
        vistos.add(normalizarTermo(nome));
        novos.push({
          nome,
          papel: "apoio",
          descricao: `Detectado automaticamente no capítulo ${idx + 1} (${n} menções); o registro do modelo não o listou.`,
        });
        // Teto baixo de proposito: um elenco inflado por falso positivo
        // atrapalha os capitulos seguintes mais do que a ausencia de um
        // secundario, e ainda empurra gente real para fora pelo teto de
        // registrados.
        if (novos.length >= 3) break;
      }
      return novos;
    };

    // Resumo factual para os proximos capitulos, e quem nasceu neste. Falhar
    // aqui nao pode derrubar o livro: sem resumo o capitulo seguinte volta a
    // receber so o titulo, que e o comportamento antigo -- pior, mas nao fatal.
    const registrar = async (
      chapter: (typeof chapters)[number],
      content: string,
    ): Promise<void> => {
      try {
        const { resumo, personagensNovos, fechamentoConcreto } = await resumirCapitulo(
          ctx,
          chapter.title,
          content,
          elencoEfetivo(outline, registrados).map((p) => p.nome),
        );
        const usouPlanoB = ficcao && personagensNovos.length === 0;
        const brutos = usouPlanoB ? personagensPorHeuristica(content, chapter.idx) : personagensNovos;

        // Segunda linha de defesa: dizer ao modelo quem ja existe melhora a
        // resposta, nao a garante. Sem este filtro o elenco acumulava a mesma
        // pessoa duas vezes com dois nomes -- "Ana" ao lado de "Ana Costa" --,
        // o que polui o prompt e, pelo teto de registrados, empurra personagem
        // real para fora num livro longo.
        const detectados = ficcao ? brutos.filter((p) => !jaConhecido(p.nome)) : brutos;
        const descartados = brutos.length - detectados.length;
        if (descartados > 0) {
          console.warn(
            `[registro] ${ebookId} cap. ${chapter.idx + 1}: ${descartados} nome(s) descartado(s) por ja existirem no livro.`,
          );
        }

        // So loga quando o plano B ACHOU alguem: e o unico caso que denuncia
        // falha do registro. Capitulo que de fato nao apresenta ninguem novo e
        // o caso comum, e logar isso encheria o log de ruido sem informar nada.
        //
        // Este aviso e a unica fonte de dado sobre "com que frequencia o modelo
        // erra o registro" -- a pergunta que ficou em aberto na nota de deploy.
        if (usouPlanoB && detectados.length > 0) {
          console.warn(
            `[registro] ${ebookId} cap. ${chapter.idx + 1}: modelo devolveu elenco vazio; ` +
              `plano B detectou ${detectados.length}: ${detectados.map((p) => p.nome).join(", ")}.`,
          );
        }

        // Numa reescrita o capitulo ja tem gente registrada. Sobrescrever a
        // coluna com o resultado desta passada apagaria do banco quem ele havia
        // apresentado antes.
        const jaNoCapitulo = lerPersonagens(chapter.personagens_json);
        const vistos = new Set(jaNoCapitulo.map((p) => normalizarTermo(p.nome)));
        const ineditos = detectados.filter((p) => !vistos.has(normalizarTermo(p.nome)));
        const doCapitulo = [...jaNoCapitulo, ...ineditos];
        const novos = JSON.stringify(doCapitulo);

        await run("UPDATE chapters SET resumo_fatos = $1, personagens_json = $2 WHERE id = $3", [
          resumo,
          novos,
          chapter.id,
        ]);
        if (narrativo && fechamentoConcreto === false) {
          fechamentosFracos.push(chapter.idx);
        }

        // Os dois arrays em memoria alimentam o proximo capitulo desta mesma execucao.
        chapter.resumo_fatos = resumo;
        chapter.personagens_json = novos;
        for (const p of ineditos) {
          if (!registrados.some((r) => normalizarTermo(r.nome) === normalizarTermo(p.nome))) registrados.push(p);
        }
      } catch (err) {
        console.warn(`[geracao] resumo do capitulo ${chapter.idx + 1} falhou:`, err instanceof Error ? err.message : err);
      }
    };

    /**
     * Refaz um bloco da memoria longa depois que um capitulo dele foi reescrito.
     *
     * Sem isto, a reescrita de um capitulo antigo deixava o bloco condensado
     * descrevendo uma versao do texto que nao existe mais -- e e justamente essa
     * versao velha que viaja para todos os capitulos seguintes, que e o oposto
     * do que a memoria longa existe para fazer.
     */
    const regenerarBloco = async (inicio: number, fim: number): Promise<void> => {
      try {
        const doBloco = chapters
          .filter((c) => c.idx >= inicio && c.idx <= fim)
          .map((c) => ({ idx: c.idx, title: c.title, resumo: c.resumo_fatos }));
        if (doBloco.length === 0) return;
        const resumo = await condensarBloco(ctx, doBloco);
        memoriaLonga = memoriaLonga.map((b) => (b.ate === fim ? { ate: fim, resumo } : b));
        await run("UPDATE ebooks SET memoria_longa = $1 WHERE id = $2", [JSON.stringify(memoriaLonga), ebookId]);
        console.warn(`[geracao] ${ebookId}: memoria longa dos capitulos ${inicio + 1} a ${fim + 1} refeita apos reescrita.`);
      } catch (err) {
        console.warn(`[geracao] refazer a memoria longa dos capitulos ${inicio + 1} a ${fim + 1} falhou:`, err instanceof Error ? err.message : err);
      }
    };

    // A verificacao ja sabia apontar capitulo orfao, mas so depois do livro
    // pronto: avisava, nao corrigia. Aqui ela roda a cada bloco e o capitulo
    // reprovado e reescrito na hora, com o defeito nomeado no proprio prompt.
    const checarEReescrever = async (ateIdx: number): Promise<void> => {
      try {
        const escritos = chapters
          .filter((c) => c.idx <= ateIdx && c.content && c.content.trim().length > 0)
          .map((c) => ({ idx: c.idx, title: c.title, content: c.content }));
        if (escritos.length < 8) return; // piso de amostra da checagem de orfaos

        const achados = verificarContinuidade({
          outline,
          intro: null,
          conclusao: null,
          capitulos: escritos,
          ficcao: true,
          elencoRegistrado: registrados,
        });

        const alvos = new Set<number>();
        for (const a of achados) {
          if (a.gravidade !== "blocker" && a.gravidade !== "major") continue;
          for (const idx of a.capitulosAfetados ?? []) alvos.add(idx);
        }

        // Reescrever um capitulo invalida o bloco de memoria longa que o cobria.
        // Chave = fim do bloco, para que duas reescritas dentro do mesmo bloco
        // custem uma condensacao so.
        const blocosParaRefazer = new Map<number, number>();

        for (const idx of [...alvos].sort((a, b) => a - b)) {
          if (reescritos.has(idx)) continue;
          const alvo = chapters.find((c) => c.idx === idx);
          if (!alvo) continue;
          reescritos.add(idx);
          await setStep(ebookId, "chapter");
          const content = await escrever(
            alvo,
            "Ele não citava nenhuma das figuras centrais do livro — provavelmente inventou um elenco próprio em vez de usar o que já existe. Reescreva-o com os personagens do elenco acima em cena, mantendo o mesmo assunto, a mesma função na estrutura e o mesmo resultado ao final.",
          );
          await run("UPDATE chapters SET content = $1 WHERE id = $2", [content, alvo.id]);
          alvo.content = content;
          await registrar(alvo, content);
          console.warn(`[continuidade] ${ebookId}: capitulo ${idx + 1} reescrito no meio da geracao`);

          const bloco = blocoQueCobre(memoriaLonga, idx);
          if (bloco) blocosParaRefazer.set(bloco.fim, bloco.inicio);
        }

        // Depois das reescritas, nao entre elas: o resumo de cada capitulo
        // reescrito precisa ja estar gravado para entrar na condensacao.
        for (const [fim, inicio] of blocosParaRefazer) {
          await regenerarBloco(inicio, fim);
        }
      } catch (err) {
        // A checagem intermediaria e um ganho, nao um requisito: falhar nela nao
        // pode derrubar um livro que ja custou dinheiro ate aqui.
        console.warn(`[continuidade] checagem intermediaria falhou em ${ebookId}:`, err instanceof Error ? err.message : err);
      }
    };

    for (const chapter of chapters) {
      if (chapter.content && chapter.content.trim().length > 0) continue;
      await setStep(ebookId, "chapter");

      const content = await escrever(chapter);
      await run("UPDATE chapters SET content = $1 WHERE id = $2", [content, chapter.id]);
      chapter.content = content;
      await run("UPDATE ebooks SET chapters_done = chapters_done + 1 WHERE id = $1", [ebookId]);

      await registrar(chapter, content);

      // Memoria longa: a cada bloco fechado, os resumos daquele trecho viram um
      // paragrafo so, que viaja ate o fim do livro. Sem isto, tudo que sai da
      // janela dos 8 mais recentes voltava a ser apenas um titulo.
      const jaCoberto = memoriaLonga.length > 0 ? Math.max(...memoriaLonga.map((b) => b.ate)) : -1;
      if ((chapter.idx + 1) % CAPITULOS_POR_BLOCO === 0 && chapter.idx > jaCoberto) {
        try {
          const doBloco = chapters
            .filter((c) => c.idx > jaCoberto && c.idx <= chapter.idx)
            .map((c) => ({ idx: c.idx, title: c.title, resumo: c.resumo_fatos }));
          const resumo = await condensarBloco(ctx, doBloco);
          memoriaLonga = [...memoriaLonga, { ate: chapter.idx, resumo }];
          await run("UPDATE ebooks SET memoria_longa = $1 WHERE id = $2", [JSON.stringify(memoriaLonga), ebookId]);
        } catch (err) {
          console.warn(`[geracao] memoria longa ate o capitulo ${chapter.idx + 1} falhou:`, err instanceof Error ? err.message : err);
        }
      }

      if (ficcao && (chapter.idx + 1) % CHECAGEM_A_CADA === 0) {
        await checarEReescrever(chapter.idx);
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

    if (fechamentosFracos.length > 0) {
      console.warn(
        `[prosa] ${ebookId}: ${fechamentosFracos.length} de ${chapters.length} capitulos terminam em ` +
          `reflexao abstrata em vez de decisao, custo ou informacao nova. ` +
          `Capitulos: ${fechamentosFracos.map((i) => i + 1).join(", ")}.`,
      );
    }

    // Os resumos factuais de todos os capitulos ja existem a esta altura, e a
    // introducao e a conclusao rodam depois deles. Sem isso as duas so viam
    // titulos: a conclusao inventava cenas que nunca foram escritas ("bolos
    // voando" num livro que nao tem essa cena em capitulo nenhum), e a
    // introducao abria um livro que ainda nao existia.
    const capitulosEscritos: CapituloAnterior[] = chapters.map((c) => ({
      idx: c.idx,
      title: c.title,
      resumo: c.resumo_fatos,
    }));

    // Etapa 5: introdução (intro === '' significa "conteúdo importado sem
    // introdução separada" — só regeramos por IA quando o campo ainda é NULL,
    // nunca escrito).
    if (row.intro === null) {
      await setStep(ebookId, "intro");
      const draft = await generateIntro(ctx, outline, registrados, capitulosEscritos);
      const intro = await humanizarOuManter(
        draft,
        `Introdução do ebook "${outline.title}"`,
        1500,
        ctx.theme,
        elencoEfetivo(outline, registrados).map((p) => p.nome),
      );
      await run("UPDATE ebooks SET intro = $1 WHERE id = $2", [intro, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5b: conclusão (mesma lógica da introdução, logo acima)
    if (row.conclusion === null) {
      await setStep(ebookId, "conclusion");
      const draft = await generateConclusion(ctx, outline, capitulosEscritos, registrados);
      const conclusion = await humanizarOuManter(
        draft,
        `Conclusão do ebook "${outline.title}"`,
        1200,
        ctx.theme,
        elencoEfetivo(outline, registrados).map((p) => p.nome),
      );
      await run("UPDATE ebooks SET conclusion = $1 WHERE id = $2", [conclusion, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5c: sobre o autor (opcional)
    if (row.include_about && row.author_name && !row.about_author) {
      await setStep(ebookId, "about");
      const about = await generateAboutAuthor(row.author_name, row.author_bio, row.language);
      await run("UPDATE ebooks SET about_author = $1 WHERE id = $2", [about, ebookId]);
      row = (await getEbook(ebookId))!;
    }

    // Etapa 5d: verificacao de continuidade. Deterministica, sem chamada de IA,
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
        ficcao,
        // Sem isto a verificacao comparava o texto so contra o elenco do
        // sumario, e acusava de "nao autorizado" um secundario criado e
        // registrado corretamente no meio do livro.
        elencoRegistrado: registrados,
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

/**
 * Retoma, ao subir, os livros que estavam sendo escritos quando o processo caiu.
 *
 * A geracao vive na memoria do processo. Um deploy no meio de um livro de trinta
 * minutos deixava o registro travado em "generating" para sempre: sem erro, sem
 * botao de tentar de novo na tela, e com os capitulos ja escritos e pagos
 * parados no banco. Como o laco pula todo capitulo que ja tem conteudo, retomar
 * custa apenas o que faltava -- nao o livro inteiro de novo.
 */
export async function retomarGeracoesInterrompidas(): Promise<void> {
  const pendentes = await all<{ id: string; title: string; chapters_done: number; chapters_total: number }>(
    "SELECT id, title, chapters_done, chapters_total FROM ebooks WHERE status = 'generating' ORDER BY created_at ASC",
  );
  if (pendentes.length === 0) return;

  console.warn(`[geracao] retomando ${pendentes.length} livro(s) interrompido(s) por um reinicio do servidor.`);
  for (const p of pendentes) {
    console.warn(`[geracao] retomando "${p.title || p.id}" (${p.chapters_done}/${p.chapters_total} capitulos escritos).`);
    await ensureGenerationRunning(p.id);
  }
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
