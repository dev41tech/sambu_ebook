// Credenciais de acesso ao app.
//
// Ate agora usuario e senha viviam so no .env, sem como trocar sem editar o
// arquivo e reiniciar. Aqui eles passam a viver no banco, com o .env como valor
// inicial: enquanto ninguem trocou a senha, valem APP_USERNAME e APP_PASSWORD.
//
// A senha e guardada com scrypt + salt aleatorio, nunca em texto puro. scrypt
// vem do node:crypto, entao nao entra dependencia nova.
import crypto from "node:crypto";
import { promisify } from "node:util";
import { one, run } from "./db";

// scrypt e caro DE PROPOSITO -- e o que o torna bom para senha. A versao
// SINCRONA, porem, cobra esse custo do event loop: cada tentativa de login
// congelava o processo inteiro por dezenas de milissegundos, e o processo e o
// mesmo que serve as rotas e escreve os livros. Sem limite de tentativas, isso
// virava um jeito barato de derrubar o servidor de fora.
const scrypt = promisify(crypto.scrypt) as (
  senha: string,
  salt: string,
  tamanho: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const MIN_SENHA = 8;

export interface Credenciais {
  username: string;
  password_hash: string;
}

async function hash(senha: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivada = (await scrypt(senha, salt, SCRYPT_KEYLEN)).toString("hex");
  return `scrypt$${salt}$${derivada}`;
}

async function confere(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, salt, esperado] = guardado.split("$");
  if (algoritmo !== "scrypt" || !salt || !esperado) return false;
  const derivada = await scrypt(senha, salt, SCRYPT_KEYLEN);
  const alvo = Buffer.from(esperado, "hex");
  // Comprimentos diferentes fariam o timingSafeEqual lancar em vez de devolver
  // false, e a excecao vazaria como erro 500 no login.
  if (derivada.length !== alvo.length) return false;
  return crypto.timingSafeEqual(derivada, alvo);
}

function comparaTextoFixo(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function guardadas(): Promise<Credenciais | undefined> {
  return one<Credenciais>("SELECT username, password_hash FROM app_credentials WHERE id = 1");
}

/** Usuario em vigor: o do banco, se ja foi trocado; senao o do .env. */
export async function usuarioAtual(): Promise<string> {
  const linha = await guardadas();
  return linha?.username ?? (process.env.APP_USERNAME ?? "");
}

/** Valida um par usuario/senha contra o que estiver em vigor. */
export async function autentica(username: string, password: string): Promise<boolean> {
  const linha = await guardadas();

  if (linha) {
    return comparaTextoFixo(username, linha.username) && (await confere(password, linha.password_hash));
  }

  // Estado inicial: ninguem trocou a senha ainda.
  const envUser = process.env.APP_USERNAME ?? "";
  const envPass = process.env.APP_PASSWORD ?? "";
  if (!envUser || !envPass) return false;
  return comparaTextoFixo(username, envUser) && comparaTextoFixo(password, envPass);
}

export type ResultadoTroca = { ok: true } | { ok: false; erro: string };

/** Troca usuario e senha. Exige a senha atual, mesmo com sessao ativa. */
export async function trocaSenha(
  senhaAtual: string,
  novoUsuario: string,
  novaSenha: string
): Promise<ResultadoTroca> {
  const usuario = novoUsuario.trim();
  if (!usuario) return { ok: false, erro: "Informe o nome de usuário." };
  if (novaSenha.length < MIN_SENHA) {
    return { ok: false, erro: `A nova senha precisa ter pelo menos ${MIN_SENHA} caracteres.` };
  }

  // Confere a senha atual contra o usuario em vigor -- ter a sessao aberta nao
  // basta, senao um navegador esquecido logado permitiria a troca.
  const atual = await usuarioAtual();
  if (!(await autentica(atual, senhaAtual))) {
    return { ok: false, erro: "Senha atual incorreta." };
  }

  await run(
    `INSERT INTO app_credentials (id, username, password_hash, updated_at)
     VALUES (1, $1, $2, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT (id)
     DO UPDATE SET username = excluded.username,
                   password_hash = excluded.password_hash,
                   updated_at = excluded.updated_at`,
    [usuario, await hash(novaSenha)]
  );
  return { ok: true };
}
