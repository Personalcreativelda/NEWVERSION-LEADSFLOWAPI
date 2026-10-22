import { Router, Request, Response } from 'express';
import { getStorageService } from '../services/storage.service';
import { isServableKey } from '../utils/storage-urls';

const router = Router();

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Ficheiros guardados (avatares, anexos, áudios, imagens de campanhas) servidos pela
 * API, para o endereço do armazenamento nunca aparecer ao utilizador. Público como os
 * URLs do MinIO que substitui (tags <img>/<audio> e o WhatsApp não enviam login), mas
 * só serve chaves no formato criado pela própria API (ver utils/storage-urls.ts).
 */
router.get('/*', async (req: Request, res: Response) => {
  const key = decodeURIComponent(req.path.replace(/^\//, ''));
  if (!isServableKey(key)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const storage = getStorageService();
    const stream = storage.getFileStream ? await storage.getFileStream(`/${process.env.MINIO_BUCKET || 'leadflow-avatars'}/${key}`) : null;
    if (!stream) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = key.split('.').pop()?.toLowerCase() || '';
    res.setHeader('Content-Type', MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop()?.replace(/^\d+_/, '')}"`);
    }

    stream.on('error', (err: any) => {
      if (!res.headersSent) {
        res.status(err?.code === 'NoSuchKey' ? 404 : 500).json({ error: 'File not available' });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  } catch (error: any) {
    const notFound = error?.code === 'NoSuchKey' || error?.code === 'NotFound';
    if (!notFound) console.error('[Files] Error serving file:', error?.message || error);
    if (!res.headersSent) res.status(notFound ? 404 : 500).json({ error: 'File not available' });
  }
});

export default router;
