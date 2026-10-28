import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Clock } from './clock.js';

export interface StoredDocumentMeta {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface DocumentStore {
  save(buffer: Buffer, originalFilename: string): Promise<StoredDocumentMeta>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  generateSignedDownloadToken(documentId: string, expiresInMinutes?: number): string;
  verifySignedDownloadToken(documentId: string, token: string): boolean;
}

export class LocalEncryptedDocumentStore implements DocumentStore {
  private baseDir: string;
  private encryptionKey: Buffer;
  private signingSecret: string;

  constructor(options?: { baseDir?: string; keyHex?: string; signingSecret?: string }) {
    this.baseDir = options?.baseDir || process.env.STORAGE_DIR || './.data/storage';
    const keyHex = options?.keyHex || process.env.STORAGE_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.encryptionKey = Buffer.from(keyHex.slice(0, 64), 'hex');
    this.signingSecret = options?.signingSecret || process.env.DOWNLOAD_SIGNING_SECRET || 'dev-download-signing-key-fdr-vault';
  }

  private async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(buffer: Buffer, originalFilename: string): Promise<StoredDocumentMeta> {
    await this.ensureDir();

    // 1. Compute SHA-256 of plain content
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 2. Encrypt with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Packed format: [12-byte IV][16-byte Auth Tag][Encrypted Data]
    const packed = Buffer.concat([iv, tag, encrypted]);

    const ext = path.extname(originalFilename) || '.bin';
    const fileId = crypto.randomUUID();
    const storageKey = `${fileId}${ext}.enc`;
    const targetPath = path.join(this.baseDir, storageKey);

    await fs.writeFile(targetPath, packed);

    return {
      storageKey,
      sha256,
      sizeBytes: buffer.length,
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, storageKey);
    const packed = await fs.readFile(filePath);

    if (packed.length < 28) {
      throw new Error('Encrypted file payload is invalid or truncated');
    }

    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const filePath = path.join(this.baseDir, storageKey);
      await fs.unlink(filePath);
    } catch {
      // Ignored if file does not exist
    }
  }

  generateSignedDownloadToken(documentId: string, expiresInMinutes: number = 15): string {
    const expiresAt = Clock.now().getTime() + expiresInMinutes * 60 * 1000;
    const data = `${documentId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', this.signingSecret).update(data).digest('hex');
    return Buffer.from(JSON.stringify({ documentId, expiresAt, signature })).toString('base64url');
  }

  verifySignedDownloadToken(documentId: string, token: string): boolean {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
      if (decoded.documentId !== documentId) return false;
      if (Clock.now().getTime() > decoded.expiresAt) return false;

      const data = `${decoded.documentId}:${decoded.expiresAt}`;
      const expected = crypto.createHmac('sha256', this.signingSecret).update(data).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(decoded.signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

export const documentStore = new LocalEncryptedDocumentStore();
