import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../../env";

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
  readonly code = "storage_not_configured";
}

export class StorageValidationError extends Error {
  constructor(readonly code: "checksum_mismatch" | "media_type_mismatch" | "size_mismatch", message: string) {
    super(message);
  }
}

type StorageConfiguration = Pick<Env,
  | "FILES_ACCESS_KEY_ID"
  | "FILES_BUCKET"
  | "FILES_ENDPOINT_URL"
  | "FILES_REGION"
  | "FILES_SECRET_ACCESS_KEY"
>;

export function storageIsConfigured(configuration: StorageConfiguration): boolean {
  return Boolean(
    configuration.FILES_ACCESS_KEY_ID
    && configuration.FILES_BUCKET
    && configuration.FILES_ENDPOINT_URL
    && configuration.FILES_REGION
    && configuration.FILES_SECRET_ACCESS_KEY,
  );
}

export class NeonS3PrivateFileStore implements PrivateFileStore {
  readonly configured: boolean;
  private readonly client?: S3Client;

  constructor(private readonly configuration: StorageConfiguration) {
    this.configured = storageIsConfigured(configuration);
    if (this.configured) {
      this.client = new S3Client({
        region: configuration.FILES_REGION,
        endpoint: configuration.FILES_ENDPOINT_URL,
        credentials: {
          accessKeyId: configuration.FILES_ACCESS_KEY_ID!,
          secretAccessKey: configuration.FILES_SECRET_ACCESS_KEY!,
        },
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
      });
    }
  }

  async putQuarantine(storageKey: string, body: ReadableStream | null, expected: StoredObjectMetadata): Promise<void> {
    const { bucket, client } = this.requireStorage();
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
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: bytes,
      ContentType: expected.mediaType,
      Metadata: { checksumsha256: checksum },
    }));
  }

  async inspect(storageKey: string): Promise<StoredObjectMetadata | null> {
    const { bucket, client } = this.requireStorage();
    try {
      const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
      return {
        byteSize: object.ContentLength ?? 0,
        mediaType: object.ContentType ?? "application/octet-stream",
        checksumSha256: object.Metadata?.checksumsha256 ?? "",
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    const object = await this.get(storageKey);
    return object?.bytes ?? null;
  }

  async putBundle(storageKey: string, contents: Uint8Array): Promise<void> {
    const { bucket, client } = this.requireStorage();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: contents,
      ContentType: "application/zip",
      ContentDisposition: "attachment",
    }));
  }

  async download(storageKey: string, filename: string, mediaType: string): Promise<Response | null> {
    const object = await this.get(storageKey);
    if (!object) return null;
    const headers = new Headers();
    headers.set("content-type", mediaType);
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("cache-control", "private, no-store");
    if (object.etag) headers.set("etag", object.etag);
    return new Response(Uint8Array.from(object.bytes).buffer, { headers });
  }

  private requireStorage(): { bucket: string; client: S3Client } {
    if (!this.client || !this.configuration.FILES_BUCKET) {
      throw new StorageUnavailableError("Private object storage is not configured.");
    }
    return { bucket: this.configuration.FILES_BUCKET, client: this.client };
  }

  private async get(storageKey: string): Promise<{ bytes: Uint8Array; etag?: string } | null> {
    const { bucket, client } = this.requireStorage();
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
      if (!object.Body) return null;
      return {
        bytes: await object.Body.transformToByteArray(),
        ...(object.ETag ? { etag: object.ETag } : {}),
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === "NoSuchKey" || candidate.name === "NotFound";
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
