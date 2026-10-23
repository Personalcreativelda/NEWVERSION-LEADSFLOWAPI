// Nenhuma resposta JSON da API leva segredos de canais para o browser: qualquer campo
// `credentials` / `channel_credentials` perde os tokens e palavras-passe e passa a dizer
// só quais estão definidos (has_access_token: true…). Ver utils/secret-box.ts.
import type { Request, Response, NextFunction } from 'express';
import { publicCredentials } from '../utils/secret-box';

const CREDENTIAL_KEYS = new Set(['credentials', 'channel_credentials']);
const MAX_DEPTH = 4;

function redact(value: any, depth: number): any {
  if (depth > MAX_DEPTH || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  // Só objetos simples (não Buffer, Date…)
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  let out: any = null;
  for (const [k, v] of Object.entries(value)) {
    let next = v;
    if (CREDENTIAL_KEYS.has(k)) {
      let creds: any = v;
      if (typeof creds === 'string') {
        try { creds = JSON.parse(creds); } catch { creds = {}; }
      }
      next = publicCredentials(creds);
    } else if (v && typeof v === 'object') {
      next = redact(v, depth + 1);
    }
    if (next !== v) {
      out = out || { ...value };
      out[k] = next;
    }
  }
  return out || value;
}

export function redactCredentials(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: any) => json(redact(body, 0));
  next();
}
