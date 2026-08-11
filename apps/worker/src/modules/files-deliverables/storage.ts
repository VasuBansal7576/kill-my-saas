export interface StoredObjectMetadata {
  byteSize: number;
  mediaType: string;
  checksumSha256: string;
}

export interface PrivateFileStore {
  readonly configured: boolean;
  putQuarantine(storageKey: string, body: ReadableStream | null, expected: StoredObjectMetadata): Promise<void>;
  inspect(storageKey: string): Promise<StoredObjectMetadata | null>;
  read(storageKey: string): Promise<Uint8Array | null>;
  putBundle(storageKey: string, contents: Uint8Array): Promise<void>;
  download(storageKey: string, filename: string, mediaType: string): Promise<Response | null>;
}

export class StorageUnavailableError extends Error {
  readonly code = "r2_not_configured";
}

export class StorageValidationError extends Error {
  constructor(readonly code: "checksum_mismatch" | "media_type_mismatch" | "size_mismatch", message: string) {
    super(message);
  }
}

export class R2PrivateFileStore implements PrivateFileStore {
  readonly configured: boolean;

  constructor(private readonly bucket?: R2Bucket) {
    this.configured = Boolean(bucket);
  }

  async putQuarantine(storageKey: string, body: ReadableStream | null, expected: StoredObjectMetadata): Promise<void> {
    const bucket = this.requireBucket();
    if (!body) throw new StorageValidationError("size_mismatch", "The upload body is empty.");
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    if (bytes.byteLength !== expected.byteSize) {
      throw new StorageValidationError("size_mismatch", "The uploaded byte size does not match the authorized size.");
    }
    const checksum = await sha256Hex(bytes);
    if (checksum !== expected.checksumSha256) {
      throw new StorageValidationError("checksum_mismatch", "The uploaded checksum does not match the authorized file.");
    }
    if (!magicBytesMatch(bytes, expected.mediaType)) {
      throw new StorageValidationError("media_type_mismatch", "The uploaded bytes do not match the declared file type.");
    }
    await bucket.put(storageKey, bytes, {
      httpMetadata: { contentType: expected.mediaType },
      customMetadata: { checksumSha256: checksum },
    });
  }

  async inspect(storageKey: string): Promise<StoredObjectMetadata | null> {
    const object = await this.requireBucket().head(storageKey);
    if (!object) return null;
    return {
      byteSize: object.size,
      mediaType: object.httpMetadata?.contentType ?? "application/octet-stream",
      checksumSha256: object.customMetadata?.checksumSha256 ?? "",
    };
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    const object = await this.requireBucket().get(storageKey);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  async putBundle(storageKey: string, contents: Uint8Array): Promise<void> {
    await this.requireBucket().put(storageKey, contents, {
      httpMetadata: { contentType: "application/zip", contentDisposition: "attachment" },
    });
  }

  async download(storageKey: string, filename: string, mediaType: string): Promise<Response | null> {
    const object = await this.requireBucket().get(storageKey);
    if (!object) return null;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", mediaType);
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("cache-control", "private, no-store");
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  }

  private requireBucket(): R2Bucket {
    if (!this.bucket) throw new StorageUnavailableError("Cloudflare R2 is not configured.");
    return this.bucket;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function magicBytesMatch(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (mediaType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mediaType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mediaType === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);
  if (mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  return false;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}
