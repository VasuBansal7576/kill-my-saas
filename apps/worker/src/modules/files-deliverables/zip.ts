export interface ZipEntry {
  path: string;
  contents: Uint8Array;
  modifiedAt?: Date;
}

/** Creates a standards-compliant, uncompressed ZIP without a runtime dependency. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const files = entries.map((entry) => encodeEntry(entry));
  const localSize = files.reduce((sum, file) => sum + file.local.byteLength, 0);
  const centralSize = files.reduce((sum, file) => sum + file.central.byteLength, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  let offset = 0;
  let localOffset = 0;
  for (const file of files) {
    writeU32(file.central, 42, localOffset);
    output.set(file.local, offset);
    offset += file.local.byteLength;
    localOffset += file.local.byteLength;
  }
  for (const file of files) {
    output.set(file.central, offset);
    offset += file.central.byteLength;
  }
  const view = output.subarray(offset);
  writeU32(view, 0, 0x06054b50);
  writeU16(view, 8, files.length);
  writeU16(view, 10, files.length);
  writeU32(view, 12, centralSize);
  writeU32(view, 16, localSize);
  return output;
}

function encodeEntry(entry: ZipEntry) {
  const name = new TextEncoder().encode(safePath(entry.path));
  const checksum = crc32(entry.contents);
  const [date, time] = dosDateTime(entry.modifiedAt ?? new Date());
  const local = new Uint8Array(30 + name.byteLength + entry.contents.byteLength);
  writeU32(local, 0, 0x04034b50);
  writeU16(local, 4, 20);
  writeU16(local, 6, 0x0800);
  writeU16(local, 10, time);
  writeU16(local, 12, date);
  writeU32(local, 14, checksum);
  writeU32(local, 18, entry.contents.byteLength);
  writeU32(local, 22, entry.contents.byteLength);
  writeU16(local, 26, name.byteLength);
  local.set(name, 30);
  local.set(entry.contents, 30 + name.byteLength);

  const central = new Uint8Array(46 + name.byteLength);
  writeU32(central, 0, 0x02014b50);
  writeU16(central, 4, 20);
  writeU16(central, 6, 20);
  writeU16(central, 8, 0x0800);
  writeU16(central, 12, time);
  writeU16(central, 14, date);
  writeU32(central, 16, checksum);
  writeU32(central, 20, entry.contents.byteLength);
  writeU32(central, 24, entry.contents.byteLength);
  writeU16(central, 28, name.byteLength);
  central.set(name, 46);
  return { local, central };
}

export function safePath(value: string): string {
  return value.normalize("NFKC").replaceAll("\\", "/").split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => [...part].map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || '<>:"|?*'.includes(character) ? "_" : character;
    }).join("").slice(0, 120))
    .join("/") || "file";
}

function dosDateTime(value: Date): [number, number] {
  const year = Math.max(1980, value.getUTCFullYear());
  return [((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(), (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2)];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0, true);
}
