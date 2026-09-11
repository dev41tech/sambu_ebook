// Limite de tentativas de login.
//
// O app tem UM par usuario/senha. Sem limite, tentar a senha e so uma questao
// de tempo, e o endpoint fica aberto na internet junto com o resto do app.
//
// Em memoria de proposito: o app roda num container so, e um contador que se
// perde no restart e um problema menor do que uma dependencia nova ou uma
// tabela a mais para manter. Se um dia houver mais de uma instancia, isto
// precisa virar Redis -- esta anotado no doc de deploy.
//
// O relogio entra por parametro para os testes nao dependerem de esperar.

/** Quanto tempo a janela de contagem dura. */
const JANELA_MS = 15 * 60 * 1000;
/** Falhas na janela antes de bloquear. */
const MAX_FALHAS = 8;
/** Quanto tempo o bloqueio dura depois de estourar. */
const BLOQUEIO_MS = 15 * 60 * 1000;
/** Teto de chaves guardadas, para o mapa nao crescer sem limite. */
const MAX_CHAVES = 5000;

interface Registro {
  falhas: number;
  /** Momento da primeira falha da janela atual. */
  inicio: number;
  /** Ate quando esta bloqueado; 0 = liberado. */
  bloqueadoAte: number;
}

const registros = new Map<string, Registro>();

function limparVelhos(agora: number): void {
  if (registros.size < MAX_CHAVES) return;
  for (const [chave, r] of registros) {
    if (r.bloqueadoAte < agora && agora - r.inicio > JANELA_MS) registros.delete(chave);
  }
  // Ainda cheio depois da limpeza: descarta o mais antigo ate caber. Preferir
  // esquecer contagem a estourar memoria -- o pior caso e alguem ganhar
  // tentativas extras, nao o processo morrer.
  while (registros.size >= MAX_CHAVES) {
    const primeira = registros.keys().next();
    if (primeira.done) break;
    registros.delete(primeira.value);
  }
}

/** Quantos milissegundos faltam para a chave poder tentar de novo. 0 = pode. */
export function esperaRestante(chave: string, agora = Date.now()): number {
  const r = registros.get(chave);
  if (!r || r.bloqueadoAte <= agora) return 0;
  return r.bloqueadoAte - agora;
}

/** Registra uma tentativa que falhou. Devolve true se passou a estar bloqueada. */
export function registrarFalha(chave: string, agora = Date.now()): boolean {
  limparVelhos(agora);
  const r = registros.get(chave);

  if (!r || agora - r.inicio > JANELA_MS) {
    registros.set(chave, { falhas: 1, inicio: agora, bloqueadoAte: 0 });
    return false;
  }

  r.falhas += 1;
  if (r.falhas >= MAX_FALHAS) {
    r.bloqueadoAte = agora + BLOQUEIO_MS;
    // Zera a contagem junto com o bloqueio: sem isto, a primeira falha depois
    // de o bloqueio expirar ja bloquearia de novo na hora.
    r.falhas = 0;
    r.inicio = agora;
    return true;
  }
  return false;
}

/** Login deu certo: esquece o historico daquela origem. */
export function registrarSucesso(chave: string): void {
  registros.delete(chave);
}

/** So para os testes: devolve o modulo ao estado inicial. */
export function zerarTudo(): void {
  registros.clear();
}

export const PARA_TESTE = { JANELA_MS, MAX_FALHAS, BLOQUEIO_MS };
