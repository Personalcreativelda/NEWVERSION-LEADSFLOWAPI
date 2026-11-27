// /api/admin/backups — cópias de segurança da base de dados (só administradores)
//   GET    /                  estado (armazenamento, chave, automáticas) + lista
//   POST   /                  criar uma cópia agora (em segundo plano: 202; o GET mostra busy/last)
//   GET    /:name/download    { url } temporário (10 min) para descarregar
//   DELETE /:name             apagar uma cópia
//   POST   /restore           restaurar { name } ou ficheiro enviado (multipart "file"); { confirm: "RESTAURAR", password }
import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import {
  BackupError, backupBusy, backupStatus, createBackup, deleteBackup, downloadUrl, lastResult, listBackups, restoreBackup,
  startInBackground,
} from '../services/backup.service';
import { activityService } from '../services/activity.service';

const router = Router();
router.use(requireAuth, requireAdmin);

// Ficheiros enviados para importar: em disco (podem ser grandes), apagados no fim do restauro
const upload = multer({ dest: tmpdir(), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

const fail = (res: any, err: any, where: string) => {
  const status = err instanceof BackupError ? err.status : 500;
  console.error(`[Backup] ${where}:`, err?.message);
  res.status(status).json({ error: status === 500 && !(err instanceof BackupError) ? 'Não foi possível concluir' : err.message });
};

// Registo na atividade (quem criou, descarregou, apagou ou restaurou)
const LABELS: Record<string, string> = {
  backup_created: 'Criou uma cópia de segurança', backup_downloaded: 'Descarregou uma cópia de segurança',
  backup_deleted: 'Apagou uma cópia de segurança', backup_restored: 'Restaurou a base de dados',
};
const log = (req: AuthenticatedRequest, type: string, metadata: Record<string, unknown> = {}) =>
  void activityService.logActivity({ userId: req.user!.id, type, description: LABELS[type] || type, metadata }).catch(() => {});

router.get('/', async (_req, res) => {
  try {
    res.json({ status: backupStatus(), busy: backupBusy(), last: await lastResult(), backups: await listBackups() });
  } catch (err: any) {
    fail(res, err, 'listar');
  }
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    // Em segundo plano: o painel acompanha pelo GET (busy / last)
    startInBackground('backup', async () => {
      const info = await createBackup('manual');
      log(req, 'backup_created', { name: info.name });
      return { name: info.name, message: info.offsite ? 'Cópia criada e guardada fora do servidor' : 'Cópia criada' };
    });
    res.status(202).json({ started: true });
  } catch (err: any) {
    fail(res, err, 'criar');
  }
});

router.get('/:name/download', async (req: AuthenticatedRequest, res) => {
  try {
    const url = await downloadUrl(String(req.params.name));
    log(req, 'backup_downloaded', { name: req.params.name });
    res.json({ url });
  } catch (err: any) {
    fail(res, err, 'descarregar');
  }
});

router.delete('/:name', async (req: AuthenticatedRequest, res) => {
  try {
    await deleteBackup(String(req.params.name));
    log(req, 'backup_deleted', { name: req.params.name });
    res.json({ ok: true });
  } catch (err: any) {
    fail(res, err, 'apagar');
  }
});

/** Restaurar substitui TODOS os dados: escrever RESTAURAR e, se a conta tiver palavra-passe, confirmá-la */
router.post('/restore', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const uploaded = (req as any).file?.path as string | undefined;
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'RESTAURAR') {
      throw new BackupError('Escreva RESTAURAR para confirmar');
    }
    const u = (await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id])).rows[0];
    if (u?.password_hash) {
      const ok = await bcrypt.compare(String(req.body?.password || ''), u.password_hash).catch(() => false);
      if (!ok) throw new BackupError('Palavra-passe incorreta', 401);
    }
    if (!uploaded && !req.body?.name) throw new BackupError('Escolha a cópia a restaurar');

    const source = uploaded ? 'ficheiro enviado' : String(req.body.name);
    const userId = req.user!.id;
    startInBackground('restore', async () => {
      const result = await restoreBackup(uploaded ? { uploadedPath: uploaded } : { name: String(req.body.name) });
      log(req, 'backup_restored', { source, safety_backup: result.safety_backup });
      console.warn(`[Backup] Base de dados restaurada por ${userId} (${source})`);
      return { name: result.safety_backup, message: 'Base de dados restaurada' };
    }, () => {
      // Reinicia a API: as migrações correm de novo sobre os dados restaurados e nada fica em cache
      if (process.env.NODE_ENV === 'production') setTimeout(() => process.exit(0), 1500).unref?.();
    });
    res.status(202).json({ started: true });
  } catch (err: any) {
    if (uploaded) await fs.rm(uploaded, { force: true }).catch(() => {});
    fail(res, err, 'restaurar');
  }
});

export default router;
