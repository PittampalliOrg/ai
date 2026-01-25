import { writeFile, mkdir, unlink, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";

// Storage directory - in production K8s, this is mounted as a PersistentVolume
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export interface PutBlobResult {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

export interface PutOptions {
  access?: "public" | "private";
  contentType?: string;
}

/**
 * Local file storage adapter that mimics @vercel/blob API
 * Files are stored in the local filesystem and served via /api/files/[...path]
 */
export async function put(
  filename: string,
  data: ArrayBuffer | Buffer | Blob | string,
  options: PutOptions = {}
): Promise<PutBlobResult> {
  // Ensure upload directory exists
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  // Generate unique filename to prevent collisions
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  const uniqueFilename = `${baseName}-${nanoid(8)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, uniqueFilename);

  // Convert data to Buffer
  let buffer: Buffer;
  if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (data instanceof Blob) {
    buffer = Buffer.from(await data.arrayBuffer());
  } else if (typeof data === "string") {
    buffer = Buffer.from(data);
  } else {
    buffer = data;
  }

  // Write file to disk
  await writeFile(filePath, buffer);

  // Determine content type
  const contentType = options.contentType || getMimeType(ext);

  // Build URLs - files served via /api/files/[filename]
  const pathname = `/files/${uniqueFilename}`;
  const url = `${BASE_URL}/api${pathname}`;
  const downloadUrl = `${url}?download=1`;

  return {
    url,
    downloadUrl,
    pathname,
    contentType,
    contentDisposition: `inline; filename="${filename}"`,
  };
}

/**
 * Delete a file from local storage
 */
export async function del(pathname: string): Promise<void> {
  const filename = pathname.replace(/^\/files\//, "");
  const filePath = path.join(UPLOAD_DIR, filename);

  if (existsSync(filePath)) {
    await unlink(filePath);
  }
}

/**
 * Read a file from local storage
 */
export async function read(pathname: string): Promise<Buffer | null> {
  const filename = pathname.replace(/^\/files\//, "");
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!existsSync(filePath)) {
    return null;
  }

  return readFile(filePath);
}

/**
 * Get file info from local storage
 */
export async function head(pathname: string): Promise<{
  size: number;
  contentType: string;
} | null> {
  const filename = pathname.replace(/^\/files\//, "");
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!existsSync(filePath)) {
    return null;
  }

  const stats = await stat(filePath);
  const ext = path.extname(filename);

  return {
    size: stats.size,
    contentType: getMimeType(ext),
  };
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".md": "text/markdown",
  };

  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}
