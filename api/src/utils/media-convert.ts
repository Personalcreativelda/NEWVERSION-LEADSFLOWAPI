// Conversão de ficheiros para os canais da Meta com o ffmpeg do contentor (apk add ffmpeg no
// Dockerfile; FFMPEG_PATH para outro caminho).
// - Áudio: o app grava em WebM/OGG (Opus). O Instagram só aceita AAC/M4A, MP4 ou WAV e o
//   Messenger falha com WebM; o WhatsApp oficial só aceita OGG com Opus, AAC, MP4, MP3 ou AMR.
// - Imagens: o WhatsApp oficial só aceita JPEG e PNG; figurinhas só WebP 512×512.
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const TIMEOUT_MS = 30_000;

/** Formatos que o Instagram e o Messenger aceitam tal como estão */
export function isMetaFriendlyAudio(mimetype?: string | null): boolean {
  const m = String(mimetype || '').toLowerCase();
  return /audio\/(aac|mp4|m4a|x-m4a|wav|x-wav|wave|mpeg|mp3)/.test(m);
}

/** Corre o ffmpeg sobre `input` e devolve o ficheiro gerado (`outputArgs` vão antes da saída) */
export async function ffmpegConvert(input: Buffer, outExt: string, outputArgs: string[]): Promise<Buffer> {
  const id = crypto.randomBytes(8).toString('hex');
  const src = path.join(os.tmpdir(), `lf-media-${id}.in`);
  const out = path.join(os.tmpdir(), `lf-media-${id}.${outExt}`);
  await fs.writeFile(src, input);
  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', src,
        ...outputArgs,
        out,
      ]);
      let stderr = '';
      ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
      const timer = setTimeout(() => { ffmpeg.kill('SIGKILL'); reject(new Error('ffmpeg: tempo esgotado')); }, TIMEOUT_MS);
      ffmpeg.on('error', (err) => { clearTimeout(timer); reject(err); });
      ffmpeg.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg terminou com ${code}: ${stderr.trim().slice(0, 300)}`));
      });
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(src, { force: true }).catch(() => {});
    await fs.rm(out, { force: true }).catch(() => {});
  }
}

/** Converte qualquer áudio para M4A (AAC, mono, 44,1 kHz), pronto para a Meta */
export function convertToM4a(input: Buffer): Promise<Buffer> {
  return ffmpegConvert(input, 'm4a', ['-vn', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-ar', '44100', '-movflags', '+faststart']);
}

/** OGG com Opus: no WhatsApp chega como mensagem de voz (os outros formatos como ficheiro de áudio) */
export function convertToOggOpus(input: Buffer): Promise<Buffer> {
  return ffmpegConvert(input, 'ogg', ['-vn', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000']);
}

/** Primeira imagem de qualquer formato (WebP, GIF, HEIC…) em JPEG */
export function convertToJpeg(input: Buffer): Promise<Buffer> {
  return ffmpegConvert(input, 'jpg', ['-frames:v', '1', '-q:v', '3']);
}

/** Figurinha do WhatsApp: WebP 512×512 com fundo transparente (estática, até 100 KB) */
export function convertToStickerWebp(input: Buffer): Promise<Buffer> {
  return ffmpegConvert(input, 'webp', [
    '-frames:v', '1',
    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
    '-c:v', 'libwebp', '-quality', '75',
  ]);
}
