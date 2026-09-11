// Onde os arquivos exportados moram, e como o banco se refere a eles.
//
// O banco e COMPARTILHADO entre a producao (contêiner, `/app`) e a maquina
// local (Windows). Os arquivos, nao: cada ambiente escreve no proprio disco.
// Guardar o caminho absoluto no banco juntava as duas coisas e produzia um
// registro que so funciona onde foi gerado.
//
// O sintoma: 19 ebooks com caminho `/app/data/exports/...` nao abriam da
// maquina local, e 35 com caminho do Windows nao abriam em producao. A tela
// dizia "EPUB ainda nao esta pronto", que mandava procurar um problema de
// geracao que nao existia -- o livro estava pronto, o arquivo e que estava em
// outro computador.
//
// A partir daqui o banco guarda so o NOME do arquivo, e cada ambiente resolve
// contra a propria pasta. Os registros antigos continuam funcionando: a leitura
// aceita os dois formatos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PASTA_DE_EXPORTS = path.resolve(__dirname, "..", "..", "data", "exports");

/**
 * O que vai para o banco. Recebe o caminho absoluto que o gerador devolveu e
 * guarda so o nome, que e igual nos dois ambientes.
 */
export function paraGuardar(absoluto: string): string {
  return path.basename(absoluto);
}

/**
 * Onde o arquivo esta NESTA maquina, ou `null` se nao estiver aqui.
 *
 * Tenta, nesta ordem:
 *   1. o valor como esta (nome novo, ou absoluto gerado nesta maquina);
 *   2. o nome do arquivo dentro da pasta local de exports.
 *
 * O passo 2 e o que faz um registro antigo de producao voltar a funcionar
 * assim que o arquivo existir aqui -- sem precisar mexer no banco.
 */
export function resolverExport(guardado: string | null | undefined): string | null {
  if (!guardado) return null;

  const primeiro = path.isAbsolute(guardado) ? guardado : path.join(PASTA_DE_EXPORTS, guardado);
  const segundo = path.join(PASTA_DE_EXPORTS, path.basename(guardado));

  for (const candidato of primeiro === segundo ? [primeiro] : [primeiro, segundo]) {
    try {
      if (fs.existsSync(candidato)) return candidato;
    } catch {
      // Caminho invalido para este sistema de arquivos -- um caminho de
      // contêiner no Windows, por exemplo. Segue para o proximo candidato.
    }
  }
  return null;
}

/**
 * O arquivo existe no banco mas nao nesta maquina? Serve para a mensagem de
 * erro dizer a verdade em vez de "ainda nao esta pronto".
 */
export function exportadoEmOutroLugar(guardado: string | null | undefined): boolean {
  return !!guardado && resolverExport(guardado) === null;
}
