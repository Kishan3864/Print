import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config, paths } from '../config.js';
import { randomHex, formatBytes } from './util.js';
import { shopFeatures } from '../services/billing.js';

export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'cdr', 'ai', 'psd', 'eps', 'svg', 'zip', 'rar', '7z', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'heic', 'webp'];
export const ACCEPT_ATTR = ALLOWED_EXT.map((e) => '.' + e).join(',');
export const LOGO_EXT = ['png', 'jpg', 'jpeg', 'webp'];
const INLINE_IMAGE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function extOf(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}
export const isPreviewableImage = (name) => Boolean(INLINE_IMAGE[extOf(name)]);

function shopDir(shopId) {
  const dir = path.join(paths.uploads, String(Number(shopId)));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const STORED_RE = /^[a-f0-9]{32}\.[a-z0-9]{1,5}$/;

/** Absolute path of a stored order file row ({shop_id, stored_name}) or null when the name looks wrong. */
export function storedFilePath(row) {
  if (!row || !STORED_RE.test(row.stored_name || '')) return null;
  return path.join(paths.uploads, String(Number(row.shop_id)), row.stored_name);
}

export function removeStoredFile(row) {
  const p = storedFilePath(row);
  if (p) fs.rmSync(p, { force: true });
}

/** Removes files multer already wrote (used when a request is rejected after upload). */
export function discardUploads(req) {
  const list = Array.isArray(req.files) ? req.files : req.file ? [req.file] : Object.values(req.files || {}).flat();
  for (const f of list) if (f?.path) fs.rm(f.path, { force: true }, () => {});
}

function badType(name) {
  const err = new Error('BAD_TYPE');
  err.code = 'BAD_TYPE';
  err.filename = name;
  return err;
}

function makeUploader({ field, dest, exts, limits }) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      try {
        cb(null, dest(req));
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      cb(null, `${randomHex(16)}.${extOf(file.originalname) || 'bin'}`);
    },
  });
  const upload = multer({
    storage,
    defParamCharset: 'utf8',
    limits: (req) => {
      const l = limits(req);
      return { fileSize: l.bytes, files: l.files, fields: 40, fieldSize: 64 * 1024, parts: l.files + 40, fieldNestingDepth: 0 };
    },
    fileFilter(req, file, cb) {
      if (exts.includes(extOf(file.originalname))) cb(null, true);
      else cb(badType(file.originalname));
    },
  });
  const mw = upload.array(field, 10);
  // Never fails the request: sets req.uploadError (friendly text) and req.files ([] on error).
  // Mount it as route middleware so Express catches anything the next handler throws.
  return (req, res, next) => {
    if (req.uploadRefused || lowOnDisk()) {
      // Refuse before writing anything; drain the body so the reply is not cut off.
      req.files = [];
      req.body = req.body || {};
      req.uploadError = req.uploadRefused || 'Uploads are paused for a moment. Please try again later.';
      req.on('end', () => next());
      req.on('error', () => next());
      return req.resume();
    }
    mw(req, res, (err) => {
      if (err) {
        discardUploads(req);
        req.files = [];
        req.uploadError = uploadErrorMessage(err, limits(req));
      }
      req.files = (req.files || []).filter((f) => f.size > 0 || (fs.rmSync(f.path, { force: true }), false));
      req.body = req.body || {};
      next();
    });
  };
}

/** True when the data disk has less than config.minFreeBytes left (checked at most every 30 s). */
let diskCheck = { at: 0, low: false };
function lowOnDisk() {
  if (Date.now() - diskCheck.at < 30 * 1000) return diskCheck.low;
  let low = false;
  try {
    const s = fs.statfsSync(paths.uploads);
    low = s.bavail * s.bsize < config.limits.minFreeBytes;
    if (low) console.error('[upload] free disk space below MIN_FREE_DISK_MB – refusing uploads');
  } catch {
    /* statfs unsupported: never block */
  }
  diskCheck = { at: Date.now(), low };
  return low;
}

export function uploadErrorMessage(err, l = {}) {
  switch (err.code) {
    case 'BAD_TYPE':
      return `“${String(err.filename || 'This file').slice(0, 80)}” is not an allowed file type.`;
    case 'LIMIT_FILE_SIZE':
      return `Each file must be ${formatBytes(l.bytes)} or smaller.`;
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return `You can upload up to ${l.files} file${l.files === 1 ? '' : 's'}.`;
    case 'LIMIT_FIELD_NESTING':
    case 'LIMIT_FIELD_COUNT':
    case 'LIMIT_PART_COUNT':
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_KEY':
      return 'Upload failed. Please try again.';
    default:
      console.error('[upload]', err);
      return 'Upload failed. Please try again.';
  }
}

/** Limits for customer order files and shop proofs. `req.uploadShop` must be set by the route. */
export const fileLimits = (req) => {
  if (req.uploadShop?.is_demo) return { files: config.limits.demoFiles, bytes: config.limits.demoFileBytes };
  const f = shopFeatures(req.uploadShop);
  return { files: Math.min(f.files, config.limits.orderFiles), bytes: Math.min(f.fileMB * 1024 * 1024, config.limits.orderFileBytes) };
};

/** Customer files on the order form: field "files". Set req.uploadShop before using. */
export const orderFilesUpload = makeUploader({
  field: 'files',
  dest: (req) => shopDir(req.uploadShop.id),
  exts: ALLOWED_EXT,
  limits: fileLimits,
});

/** Shop proof upload: field "proof", one file. Set req.uploadShop before using. */
export const proofUpload = makeUploader({
  field: 'proof',
  dest: (req) => shopDir(req.uploadShop.id),
  exts: ALLOWED_EXT,
  limits: (req) => ({ files: 1, bytes: fileLimits(req).bytes }),
});

/** Shop logo upload: field "logo", one png/jpg/webp up to 2 MB, stored in DATA_DIR/logos. */
export const logoUpload = makeUploader({
  field: 'logo',
  dest: () => paths.logos,
  exts: LOGO_EXT,
  limits: () => ({ files: 1, bytes: config.limits.logoBytes }),
});

/**
 * Sends a stored order file. Attachment download by default; `inline` only for
 * jpg/png/webp (proof previews). Returns false when the file is gone.
 */
export function sendStoredFile(res, row, { inline = false } = {}) {
  const abs = storedFilePath(row);
  if (!abs || row.deleted_at || !fs.existsSync(abs)) return false;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  const mime = INLINE_IMAGE[extOf(row.original_name)];
  if (inline && mime) {
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(abs);
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(abs, row.original_name);
  }
  return true;
}
