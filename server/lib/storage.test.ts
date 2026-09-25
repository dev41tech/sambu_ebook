import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { subirParaStorage, tipoDoArquivo } from "./storage";

// O upload e a parte que so falha em producao: URL montada errada, header
// faltando ou content-type trocado so aparecem quando o arquivo ja esta no
// Supabase. Aqui o Supabase e um servidor local que grava o que recebeu.
interface Recebido {
  url: string;
  metodo: string;
  authorization: string;
  contentType: string;
  upsert: string;
  corpo: Buffer;
}

async function comServidorFalso(
  status: number,
  fn: (recebidos: Recebido[]) => Promise<void>,
): Promise<void> {
  const recebidos: Recebido[] = [];
  const servidor = http.createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (c) => partes.push(c as Buffer));
    req.on("end", () => {
      recebidos.push({
        url: req.url ?? "",
        metodo: req.method ?? "",
        authorization: String(req.headers.authorization ?? ""),
        contentType: String(req.headers["content-type"] ?? ""),
        upsert: String(req.headers["x-upsert"] ?? ""),
        corpo: Buffer.concat(partes),
      });
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status < 400 ? '{"Key":"ok"}' : '{"error":"nao autorizado"}');
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const porta = (servidor.address() as { port: number }).port;

  const antes = { url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.SUPABASE_STORAGE_BUCKET };
  process.env.SUPABASE_URL = `http://127.0.0.1:${porta}/`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  delete process.env.SUPABASE_STORAGE_BUCKET;
  try {
    await fn(recebidos);
  } finally {
    process.env.SUPABASE_URL = antes.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = antes.chave;
    if (antes.bucket) process.env.SUPABASE_STORAGE_BUCKET = antes.bucket;
    await new Promise<void>((r) => servidor.close(() => r()));
  }
}

function arquivoTemporario(nome: string, conteudo: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sambu-storage-"));
  const arquivo = path.join(dir, nome);
  fs.writeFileSync(arquivo, conteudo);
  return arquivo;
}

test("sobe o arquivo no caminho, no bucket e com o content-type certos", async () => {
  const epub = arquivoTemporario("livro.epub", "conteudo-do-epub");
  await comServidorFalso(200, async (recebidos) => {
    await subirParaStorage("acervo/abc/ecos-do-alem.epub", epub);
    assert.equal(recebidos.length, 1);
    const r = recebidos[0];
    assert.equal(r.metodo, "POST");
    // Bucket padrao "sambu" e cada segmento do caminho codificado.
    assert.equal(r.url, "/storage/v1/object/sambu/acervo/abc/ecos-do-alem.epub");
    assert.equal(r.authorization, "Bearer chave-de-teste");
    assert.equal(r.contentType, "application/epub+zip");
    // Sem upsert, republicar o mesmo livro falharia com "já existe".
    assert.equal(r.upsert, "true");
    assert.equal(r.corpo.toString(), "conteudo-do-epub");
  });
});

test("capa vai como imagem, e nao como download", async () => {
  const capa = arquivoTemporario("capa.png", "imagem");
  await comServidorFalso(200, async (recebidos) => {
    await subirParaStorage("acervo/abc/capa.png", capa);
    assert.equal(recebidos[0].contentType, "image/png");
  });
});

test("erro do storage vira excecao com o status e o corpo", async () => {
  const epub = arquivoTemporario("livro.epub", "x");
  await comServidorFalso(401, async () => {
    await assert.rejects(() => subirParaStorage("acervo/abc/livro.epub", epub), /401.*nao autorizado/s);
  });
});

test("extensao desconhecida nao sobe nada", async () => {
  const estranho = arquivoTemporario("arquivo.xyz", "x");
  await comServidorFalso(200, async (recebidos) => {
    await assert.rejects(() => subirParaStorage("acervo/abc/arquivo.xyz", estranho), /content-type/);
    assert.equal(recebidos.length, 0);
  });
});

test("tipoDoArquivo cobre os formatos que o site usa", () => {
  assert.equal(tipoDoArquivo("a.epub"), "application/epub+zip");
  assert.equal(tipoDoArquivo("a.JPG"), "image/jpeg");
  assert.equal(tipoDoArquivo("a.mp3"), "audio/mpeg");
  assert.equal(tipoDoArquivo("a.pdf"), null);
});
