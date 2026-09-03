import type { Achado } from "./continuidade";

// Verificação determinística de números que contradizem um fato fixo do
// sumário. Nasceu de um caso real: "Móveis de Memórias" dizia "quase quinze
// anos" no capítulo 1 e "vinte anos" no capítulo 14, no clímax -- a memória
// entre capítulos não pega isso, porque ela registra o que aconteceu em cada
// capítulo, não fatos da premissa original.
//
// Escopo deliberadamente estreito: só compara "N anos" contra um fato fixo que
// também tem "N anos". Um detector genérico ("qualquer número diferente em
// qualquer lugar") dispararia constantemente -- só o elenco de "Móveis de
// Memórias" tem cinco personagens com cinco idades diferentes, todas legítimas.
// Ancorar no fato fixo declarado (que o próprio sistema pediu ao modelo) evita
// esse ruído: só compara o que o livro mesmo afirmou ser fixo.

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9,
};
const DEZ_A_DEZENOVE: Record<string, number> = {
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezasseis: 16, dezessete: 17, dezassete: 17, dezoito: 18,
  dezenove: 19, dezanove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** "quinze" -> 15, "vinte e dois" -> 22, "12" -> 12, "cem" -> 100. */
function valorNumerico(bruto: string): number | null {
  const t = normalizar(bruto);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t === "cem" || t === "cento") return 100;
  if (DEZ_A_DEZENOVE[t] != null) return DEZ_A_DEZENOVE[t];
  if (UNIDADES[t] != null) return UNIDADES[t];
  if (DEZENAS[t] != null) return DEZENAS[t];
  const m = t.match(/^(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\s+e\s+(\w+)$/);
  if (m) {
    const dezena = DEZENAS[m[1]];
    const unidade = UNIDADES[m[2]];
    if (dezena != null && unidade != null) return dezena + unidade;
  }
  return null;
}

const PALAVRA_NUMERO =
  "(?:\\d+|zero|uma?|duas?|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezasseis|dezessete|dezassete|dezoito|dezenove|dezanove|(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)(?:\\s+e\\s+\\w+)?|cem|cento)";

const RE_ANOS = new RegExp(`\\b(${PALAVRA_NUMERO})\\s+anos?\\b`, "gi");

const STOP = new Set([
  "para", "como", "essa", "esse", "esta", "este", "pela", "pelo", "pois",
  "desde", "ainda", "muito", "sobre", "entre", "onde", "quando", "depois",
  "antes", "fixo", "fixos", "fato", "fatos",
]);

// Sinonimos para os fatos numericos mais comuns em enredo: tempo decorrido
// desde um desaparecimento ou uma morte. Sem isto, um fato que diz "desapareceu
// ha quinze anos" nao reconheceria "ausencia" no texto do capitulo -- e foi
// exatamente essa parafrase que apareceu no caso real: o fato usa
// "desaparecimento", o capitulo 14 diz "a ausência da minha irmã".
const GRUPOS_GATILHO: string[][] = [
  ["desaparec", "sumi", "ausenc"],
  ["morr", "morte", "falec", "obito"],
];

function raizesDoGrupo(fatoNormalizado: string): string[] {
  for (const grupo of GRUPOS_GATILHO) {
    if (grupo.some((raiz) => fatoNormalizado.includes(raiz))) return grupo;
  }
  return [];
}

/**
 * Palavras-chave de um fato fixo, para achar onde ele é citado em outro
 * trecho. Nomes próprios (capitalizados na frase) são excluídos de propósito:
 * um nome de personagem aparece perto de vários números legítimos no livro
 * inteiro -- idade, ano, telefone --, e usá-lo como âncora dava falso positivo:
 * "Carolina tinha trinta e quatro anos" acusava contradição só porque
 * "Carolina" também está no fato sobre o desaparecimento da irmã dela.
 */
function palavrasChave(fato: string): string[] {
  const nomesProprios = new Set(
    (fato.match(/\b[A-ZÀ-Ú][a-zà-ú]+\b/g) ?? []).map(normalizar),
  );
  const comuns = normalizar(fato)
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w) && !nomesProprios.has(w));
  return [...new Set([...raizesDoGrupo(normalizar(fato)), ...comuns])].slice(0, 8);
}

export interface TrechoNumerado {
  local: string;
  texto: string;
}

/**
 * Confere se o número de "N anos" declarado num fato fixo aparece contradito em
 * outro trecho do livro. Só verifica fatos que TÊM um número — "Clara é a irmã
 * desaparecida" não tem número e não entra aqui, só no elenco (papel "ausente").
 */
export function verificarFatosNumericos(
  fatosFixos: string[],
  trechos: TrechoNumerado[],
): Achado[] {
  const achados: Achado[] = [];

  for (const fato of fatosFixos) {
    // .match() com regex /g so devolve os textos inteiros, sem os grupos de
    // captura -- matchAll() e o unico que preserva o grupo (o numero sozinho,
    // sem "anos" junto) precisado por valorNumerico().
    const mFato = [...fato.matchAll(RE_ANOS)][0];
    if (!mFato) continue;
    const declarado = valorNumerico(mFato[1]);
    if (declarado == null) continue;

    const chaves = palavrasChave(fato);
    if (chaves.length === 0) continue;

    // Um achado por (fato, local): a primeira divergência já basta para o
    // revisor saber onde olhar, sem repetir o mesmo aviso várias vezes no
    // mesmo capítulo.
    for (const { local, texto } of trechos) {
      let jaAchado = false;
      for (const m of texto.matchAll(RE_ANOS)) {
        if (jaAchado) break;
        const valor = valorNumerico(m[1]);
        if (valor == null || valor === declarado) continue;

        const inicio = Math.max(0, (m.index ?? 0) - 90);
        const fim = Math.min(texto.length, (m.index ?? 0) + m[0].length + 90);
        const janela = normalizar(texto.slice(inicio, fim));
        if (!chaves.some((k) => janela.includes(k))) continue;

        achados.push({
          categoria: "fato-numerico-inconsistente",
          gravidade: "blocker",
          local,
          evidencia: `Fato fixo diz "${fato}", mas ${local} tem "${m[0].trim()}" (${valor} ≠ ${declarado}).`,
          sugestao: `Corrigir para "${declarado} anos" em ${local}, ou revisar o fato fixo se o número certo for outro.`,
        });
        jaAchado = true;
      }
    }
  }

  return achados;
}
