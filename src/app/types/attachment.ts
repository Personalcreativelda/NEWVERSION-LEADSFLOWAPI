export type AttachmentStatus =
  | 'idle'
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'canceled';

export type AttachmentFileType = 'image' | 'video' | 'audio' | 'document';

export interface AttachmentItem {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  fileType: AttachmentFileType;
  /** Object URL for local preview — must be revoked when removed */
  previewUrl?: string;
  uploadProgress: number;
  status: AttachmentStatus;
  /** Returned by the backend after a successful upload */
  uploadedUrl?: string;
  uploadedMediaType?: 'image' | 'video' | 'audio' | 'document';
  error?: string;
}
