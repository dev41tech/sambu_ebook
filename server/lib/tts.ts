import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { all, one, run, type EbookRow } from "./db";

ffmpeg.setFfmpegPath(ffmpegPath.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
const tmpRoot = path.resolve(__dirname, "..", "..", "data", "tmp");
fs.mkdirSync(exportsDir, { recursive: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const activeAudioJobs = new Set<string>();

// Nenhum job de audiobook sobrevive a um restart do processo (roda só em memória).
// Se o servidor reiniciar no meio de uma geração, o registro fica travado em
// "generating" para sempre, sem erro e sem botão de tentar de novo na tela. Ao
// subir, qualquer ebook nesse estado é órfão — marca como erro para liberar o retry.
async function recoverStaleAudioJobs() {
  const stale = await all<{ id: string }>("SELECT id FROM ebooks WHERE audio_status = 'generating'");
  for (const { id } of stale) {
    await run("UPDATE ebooks SET audio_status = 'error', audio_error = $1 WHERE id = $2", [
      "Geração interrompida por um reinício do servidor. Clique para tentar novamente.",
      id,
    ]);
    const workDir = path.join(tmpRoot, id);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
void recoverStaleAudioJobs().catch((err) => {
  console.error("[tts] falha ao liberar audiobooks travados no boot:", err);
});

function getEbook(id: string): Promise<EbookRow | undefined> {
  return one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [id]);
}

async function synthesize(text: string, outPath: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error(
      "ELEVENLABS_API_KEY ou ELEVENLABS_VOICE_ID não configurados no .env."
    );
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha na ElevenLabs (${res.status}): ${body.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
}

function concatMp3(parts: string[], outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    parts.forEach((p) => command.input(p));
    const listFile = outPath + ".txt";
    fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .save(outPath)
      .on("end", () => {
        fs.unlinkSync(listFile);
        resolve();
      })
      .on("error", (err) => reject(err));
  });
}

// Divide textos longos em blocos menores para respeitar limites da API por requisição.
function chunkText(text: string, maxLen = 2200): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function runAudioJob(ebookId: string) {
  const workDir = path.join(tmpRoot, ebookId);
  try {
    fs.mkdirSync(workDir, { recursive: true });
    const ebook = await getEbook(ebookId);
    if (!ebook) throw new Error("Ebook não encontrado.");
    const chapters = await all<{ title: string; content: string }>(
      "SELECT title, content FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC",
      [ebookId]
    );

    const segments: string[] = [];
    if (ebook.intro) segments.push(ebook.intro);
    for (const c of chapters) {
      segments.push(`${c.title}. ${c.content}`);
    }
    if (ebook.conclusion) segments.push(ebook.conclusion);

    const allChunks = segments.flatMap((s) => chunkText(s));
    const partFiles: string[] = [];
    for (let i = 0; i < allChunks.length; i++) {
      const partPath = path.join(workDir, `part-${String(i).padStart(3, "0")}.mp3`);
      await synthesize(allChunks[i], partPath);
      partFiles.push(partPath);
    }

    const outPath = path.join(exportsDir, `${ebookId}.mp3`);
    await concatMp3(partFiles, outPath);

    await run("UPDATE ebooks SET audio_status = 'ready', audio_path = $1, audio_error = NULL WHERE id = $2", [
      outPath,
      ebookId,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao gerar o audiobook.";
    await run("UPDATE ebooks SET audio_status = 'error', audio_error = $1 WHERE id = $2", [message, ebookId]);
  } finally {
    activeAudioJobs.delete(ebookId);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function startAudiobookGeneration(ebookId: string) {
  if (activeAudioJobs.has(ebookId)) return;
  activeAudioJobs.add(ebookId);
  await run("UPDATE ebooks SET audio_status = 'generating', audio_error = NULL WHERE id = $1", [ebookId]);
  void runAudioJob(ebookId);
}
