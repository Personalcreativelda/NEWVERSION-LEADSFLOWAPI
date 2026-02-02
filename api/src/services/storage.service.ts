import type { Express } from 'express';

interface StorageService {
  uploadFile(file: Express.Multer.File, folder: string, userId?: string): Promise<string>;
  uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder: string, userId?: string): Promise<string>;
  deleteFile(url: string): Promise<void>;
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
    } catch (error) {
      console.error('[MinIO] Error ensuring bucket:', error);
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
