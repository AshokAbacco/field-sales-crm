import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';

/**
 * Image storage.
 *  - Cloudflare R2 (S3-compatible) when R2_* env vars are set → returns a public URL (R2_PUBLIC_URL/key)
 *  - Local disk fallback (UPLOAD_DIR) → returns /uploads/<key>, served by the API to authorised users only
 * Keys contain a random part so public URLs cannot be guessed.
 */
const R2 = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
  endpoint: process.env.R2_ENDPOINT, // optional override (testing / jurisdiction endpoints)
};
export const r2Enabled = Boolean(R2.accountId && R2.accessKey && R2.secretKey && R2.bucket && R2.publicUrl);

let client = null;
const s3 = () =>
  (client ||= new S3Client({
    region: 'auto',
    endpoint: R2.endpoint || `https://${R2.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(R2.endpoint),
    credentials: { accessKeyId: R2.accessKey, secretAccessKey: R2.secretKey },
  }));

export const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Store an image buffer. `prefix` like "odometer/2026-10/<userId>". Returns the URL to save in the DB. */
export async function saveImage(buffer, mimetype, prefix) {
  const ext = IMAGE_TYPES[mimetype];
  if (!ext) throw Object.assign(new Error('Only JPG, PNG or WebP images are allowed'), { status: 400 });
  const key = `${prefix.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  if (r2Enabled) {
    await s3().send(
      new PutObjectCommand({ Bucket: R2.bucket, Key: key, Body: buffer, ContentType: mimetype, CacheControl: 'public, max-age=31536000, immutable' }),
    );
    return `${R2.publicUrl}/${key}`;
  }
  const file = path.resolve(config.uploadDir, key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, buffer);
  return `/uploads/${key}`;
}

/** Best-effort delete (used when a save fails after upload) */
export async function removeImage(url) {
  try {
    if (!url) return;
    if (r2Enabled && url.startsWith(R2.publicUrl + '/')) {
      await s3().send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: url.slice(R2.publicUrl.length + 1) }));
    } else if (url.startsWith('/uploads/')) {
      await fs.promises.unlink(path.resolve(config.uploadDir, url.replace('/uploads/', '')));
    }
  } catch {
    /* ignore */
  }
}
