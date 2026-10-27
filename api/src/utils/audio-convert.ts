// Conversão de áudio para os canais da Meta. O app grava em WebM/OGG (Opus), que o
// Instagram não aceita (só AAC/M4A, MP4 ou WAV); o Messenger também falha com WebM.
// Usa o ffmpeg do contentor (apk add ffmpeg no Dockerfile; FFMPEG_PATH para outro caminho).
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

/** Converte qualquer áudio para M4A (AAC, mono, 44,1 kHz), pronto para a Meta */
export async function convertToM4a(input: Buffer): Promise<Buffer> {
  const id = crypto.randomBytes(8).toString('hex');
  const src = path.join(os.tmpdir(), `lf-audio-${id}.in`);
  const out = path.join(os.tmpdir(), `lf-audio-${id}.m4a`);
  await fs.writeFile(src, input);
  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', src,
        '-vn', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-ar', '44100',
        '-movflags', '+faststart',
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
