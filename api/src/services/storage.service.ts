import type { Express } from 'express';
import type { Pool } from 'pg';

export interface PresignedUploadResult {
  presignedUrl: string;
  publicUrl: string;
  key: string;
}

// ── Retention configuration ───────────────────────────────────────────────────

/** Days to keep files per folder type. null = permanent (never deleted). */
export const RETENTION_DAYS: Record<string, number | null> = {
  'inbox-attachments': parseInt(process.env.FILE_RETENTION_DAYS || '60'),
  'email-attachments': parseInt(process.env.FILE_RETENTION_DAYS || '60'),
  'campaign-assets':   parseInt(process.env.CAMPAIGN_RETENTION_DAYS || '90'),
  'profile-images':    null,  // permanent
  'company-logos':     null,  // permanent
  'system-assets':     null,  // permanent
  'avatars':           null,  // permanent (legacy name)
  'campaigns':         parseInt(process.env.CAMPAIGN_RETENTION_DAYS || '90'), // legacy name
};

/** Folder types that are subject to automatic expiration. */
export const TEMPORARY_FOLDERS = new Set([
  'inbox-attachments',
  'email-attachments',
  'campaign-assets',
  'campaigns',
]);

export function getRetentionDays(folderType: string): number | null {
  return RETENTION_DAYS[folderType] ?? 60;
}

export function isTemporaryFolder(folderType: string): boolean {
  return TEMPORARY_FOLDERS.has(folderType);
}

// ── recordFileAttachment helper ───────────────────────────────────────────────

export interface RecordAttachmentOptions {
  pool: Pool;
  userId: string;
  publicUrl: string;
  storageKey: string;
  bucket: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  folderType: string;
  messageId?: string | null;
  campaignId?: string | null;
}

export async function recordFileAttachment(opts: RecordAttachmentOptions): Promise<void> {
  const { pool, userId, publicUrl, storageKey, bucket, fileName, mimeType, sizeBytes, folderType, messageId, campaignId } = opts;
  const isTemp = isTemporaryFolder(folderType);
  const days   = isTemp ? getRetentionDays(folderType) : null;
  const expiresAt = isTemp && days ? `NOW() + INTERVAL '${days} days'` : 'NULL';

  try {
    await pool.query(
      `INSERT INTO file_attachments
         (user_id, message_id, campaign_id, bucket, storage_key, public_url,
          file_name, mime_type, size_bytes, folder_type, is_temporary, retention_days, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,${expiresAt})
       ON CONFLICT DO NOTHING`,
      [userId, messageId ?? null, campaignId ?? null, bucket, storageKey, publicUrl,
       fileName, mimeType, sizeBytes, folderType, isTemp, days ?? null]
    );
  } catch {
    // Non-fatal — file was uploaded; just couldn't record metadata
  }
}

interface StorageService {
  uploadFile(file: Express.Multer.File, folder: string, userId?: string): Promise<string>;
  uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder: string, userId?: string): Promise<string>;
  deleteFile(url: string): Promise<void>;
  getPresignedUploadUrl?(filename: string, contentType: string, folder: string, userId?: string): Promise<PresignedUploadResult>;
}

class MinIOStorage implements StorageService {
  // ... existing fields ...
  private client: any;
  private bucket: string;
  private endpoint: string;
  private useSSL: boolean;

  constructor() {
    const Client = require('minio').Client;

    this.endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000');
    this.useSSL = process.env.MINIO_USE_SSL === 'true';
    this.bucket = process.env.MINIO_BUCKET || 'leadflow-avatars';

    // Support alternative environment variable names (Coolify/Docker compatibility)
    const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO || '';
    const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO || '';

    this.client = new Client({
      endPoint: this.endpoint,
      port: port,
      useSSL: this.useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });

    this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, process.env.MINIO_REGION || 'us-east-1');
      }
      // Allow browser direct uploads (presigned PUT) from any origin
      try {
        await this.client.setBucketCors(this.bucket, [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 86400,
          },
        ]);
      } catch {
        // Older SDK versions may not support setBucketCors — non-fatal
      }
      await this.applyLifecyclePolicy();
    } catch (error) {
      console.error('[MinIO] Error ensuring bucket:', error);
    }
  }

  private async applyLifecyclePolicy() {
    const inboxDays    = RETENTION_DAYS['inbox-attachments'] ?? 60;
    const emailDays    = RETENTION_DAYS['email-attachments'] ?? 60;
    const campaignDays = RETENTION_DAYS['campaign-assets']   ?? 90;

    const rules = [
      {
        ID: 'expire-inbox-attachments',
        Status: 'Enabled',
        Filter: { Prefix: 'inbox-attachments/' },
        Expiration: { Days: inboxDays },
      },
      {
        ID: 'expire-email-attachments',
        Status: 'Enabled',
        Filter: { Prefix: 'email-attachments/' },
        Expiration: { Days: emailDays },
      },
      {
        ID: 'expire-campaign-assets',
        Status: 'Enabled',
        Filter: { Prefix: 'campaign-assets/' },
        Expiration: { Days: campaignDays },
      },
    ];

    try {
      await this.client.setBucketLifecycle(this.bucket, { Rule: rules });
      console.log(`[MinIO] Lifecycle policy applied — inbox/email: ${inboxDays}d, campaigns: ${campaignDays}d`);
    } catch {
      // Non-fatal: older MinIO versions or insufficient permissions
      console.warn('[MinIO] Could not apply lifecycle policy (non-fatal)');
    }
  }

  async uploadFile(file: Express.Multer.File, folder: string, userId?: string): Promise<string> {
    return this.uploadBuffer(file.buffer, file.originalname, file.mimetype, folder, userId);
  }

  async uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder: string, userId?: string): Promise<string> {
    try {
      const timestamp = Date.now();
      const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

      let fileName: string;
      if (userId) {
        const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
        fileName = `${folder}/users/${sanitizedUserId}/${timestamp}_${sanitizedName}`;
      } else {
        fileName = `${folder}/${timestamp}_${sanitizedName}`;
      }

      const metadata = {
        'Content-Type': mimetype,
        'X-Upload-Time': new Date().toISOString(),
      };

      await this.client.putObject(this.bucket, fileName, buffer, buffer.length, metadata);

      const publicUrl = process.env.MINIO_PUBLIC_URL;
      let url: string;

      if (publicUrl) {
        let baseUrl = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = `https://${baseUrl}`;
        }
        url = `${baseUrl}/${this.bucket}/${fileName}`;
      } else {
        const protocol = this.useSSL ? 'https' : 'http';
        const port = parseInt(process.env.MINIO_PORT || '9000');
        const needsPort = (protocol === 'https' && port !== 443) || (protocol === 'http' && port !== 80);
        const portStr = needsPort ? `:${port}` : '';
        url = `${protocol}://${this.endpoint}${portStr}/${this.bucket}/${fileName}`;
      }

      return url;
    } catch (error) {
      console.error('[MinIO] Upload failed:', error);
      const base64 = buffer.toString('base64');
      return `data:${mimetype};base64,${base64}`;
    }
  }

  async getPresignedUploadUrl(filename: string, _contentType: string, folder: string, userId?: string): Promise<PresignedUploadResult> {
    const timestamp = Date.now();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const sanitizedUserId = userId ? userId.replace(/[^a-zA-Z0-9]/g, '_') : 'anon';
    const key = `${folder}/users/${sanitizedUserId}/${timestamp}_${sanitizedName}`;

    // Presigned PUT valid for 15 minutes
    const presignedUrl: string = await this.client.presignedPutObject(this.bucket, key, 15 * 60);

    // Public URL for serving the file after upload
    const publicBase = process.env.MINIO_PUBLIC_URL
      ? process.env.MINIO_PUBLIC_URL.replace(/\/$/, '')
      : `${this.useSSL ? 'https' : 'http'}://${this.endpoint}`;
    const publicUrl = `${publicBase}/${this.bucket}/${key}`;

    return { presignedUrl, publicUrl, key };
  }

  async deleteFile(url: string): Promise<void> {
    try {
      const urlParts = url.split(`/${this.bucket}/`);
      if (urlParts.length < 2) return;
      const fileName = urlParts[1];
      await this.client.removeObject(this.bucket, fileName);
    } catch (error) {
      console.error('[MinIO] Error deleting file:', error);
    }
  }
}

class Base64Storage implements StorageService {
  async uploadFile(file: Express.Multer.File, folder: string, userId?: string): Promise<string> {
    return this.uploadBuffer(file.buffer, file.originalname, file.mimetype, folder, userId);
  }

  async uploadBuffer(buffer: Buffer, _filename: string, mimetype: string, _folder: string, _userId?: string): Promise<string> {
    const base64 = buffer.toString('base64');
    return `data:${mimetype};base64,${base64}`;
  }

  async deleteFile(_url: string): Promise<void> { }
}

// Factory function to get the appropriate storage service
export function getStorageService(): StorageService {
  // Support alternative environment variable names (Coolify/Docker compatibility)
  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO;
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO;

  const useMinIO = Boolean(
    process.env.MINIO_ENDPOINT &&
    accessKey &&
    secretKey
  );

  if (useMinIO) {
    console.log('[Storage] Using MinIO S3 storage');
    console.log('[Storage] - Endpoint:', process.env.MINIO_ENDPOINT);
    console.log('[Storage] - Bucket:', process.env.MINIO_BUCKET || 'leadflow-avatars');
    return new MinIOStorage();
  } else {
    console.log('[Storage] Using Base64 database storage (MinIO not configured)');
    console.log('[Storage] - Missing:', [
      !process.env.MINIO_ENDPOINT && 'MINIO_ENDPOINT',
      !accessKey && 'MINIO_ACCESS_KEY/SERVICE_USER_MINIO',
      !secretKey && 'MINIO_SECRET_KEY/SERVICE_PASSWORD_MINIO',
    ].filter(Boolean).join(', '));
    return new Base64Storage();
  }
}

export type { StorageService };
