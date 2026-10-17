import "server-only";
import { createHash } from "node:crypto";

/**
 * Pure-JS image verification so it runs on Cloudflare Workers (no native
 * decoders). We check the real file signature, parse dimensions from the
 * container headers, reject animations, and build the AI-processing copy by
 * removing metadata blocks (EXIF, XMP, text chunks). The original bytes are
 * never modified.
 */

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;

type Mime = "image/jpeg" | "image/png" | "image/webp";

export type VerifiedImage = {
  mime: Mime;
  width: number;
  height: number;
  sha256: string;
  hadLocation: boolean;
  /** Same format as the original with metadata removed; used only for AI reading. */
  derivative: Buffer;
};

export class ImageRejected extends Error {}

/** Magic-byte sniffing, independent of the declared type or filename. */
export function sniffMime(buf: Buffer): Mime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** True when IFD0 of an EXIF/TIFF block contains the GPS IFD pointer (tag 0x8825). */
export function exifHasGps(exif: Buffer): boolean {
  try {
    const base = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? 6 : 0;
    const order = exif.subarray(base, base + 2).toString("latin1");
    if (order !== "II" && order !== "MM") return false;
    const le = order === "II";
    const u16 = (o: number) => (le ? exif.readUInt16LE(base + o) : exif.readUInt16BE(base + o));
    const u32 = (o: number) => (le ? exif.readUInt32LE(base + o) : exif.readUInt32BE(base + o));
    const ifd0 = u32(4);
    const count = u16(ifd0);
    for (let i = 0; i < count && i < 512; i++) {
      if (u16(ifd0 + 2 + i * 12) === 0x8825) return true;
    }
    return false;
  } catch {
    return false;
  }
}

interface Parsed {
  width: number;
  height: number;
  animated: boolean;
  hadLocation: boolean;
  stripped: Buffer;
}

function parseJpeg(buf: Buffer): Parsed {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let hadLocation = false;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new ImageRejected("decode");
    const marker = buf[i + 1];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // start of scan: rest is image data
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new ImageRejected("decode");
    const seg = buf.subarray(i, i + 2 + len);
    const payload = buf.subarray(i + 4, i + 2 + len);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && payload.length >= 5) {
      height = payload.readUInt16BE(1);
      width = payload.readUInt16BE(3);
    }
    if (marker === 0xe1 && payload.subarray(0, 6).toString("latin1") === "Exif\0\0") hadLocation ||= exifHasGps(payload);
    // Drop APP1 (EXIF/XMP), APP13 (IPTC) and comments from the processing copy.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(seg);
    i += 2 + len;
  }
  return { width, height, animated: false, hadLocation, stripped: Buffer.concat(out) };
}

function parsePng(buf: Buffer): Parsed {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let width = 0;
  let height = 0;
  let animated = false;
  let hadLocation = false;
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > buf.length) throw new ImageRejected("decode");
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "acTL") animated = true;
    if (type === "eXIf") hadLocation ||= exifHasGps(data);
    if (!["eXIf", "tEXt", "iTXt", "zTXt", "tIME"].includes(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return { width, height, animated, hadLocation, stripped: Buffer.concat(out) };
}

function parseWebp(buf: Buffer): Parsed {
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let animated = false;
  let hadLocation = false;
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.subarray(i, i + 4).toString("latin1");
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) throw new ImageRejected("decode");
    const data = buf.subarray(i + 8, i + 8 + len);
    let chunk = buf.subarray(i, Math.min(end, buf.length));
    if (type === "VP8X") {
      animated = (data[0] & 0x02) !== 0;
      width = 1 + data.readUIntLE(4, 3);
      height = 1 + data.readUIntLE(7, 3);
      chunk = Buffer.from(chunk);
      chunk[8] = chunk[8] & ~0x0c; // clear EXIF and XMP flags
    } else if (type === "VP8 " && !width) {
      width = data.readUInt16LE(6) & 0x3fff;
      height = data.readUInt16LE(8) & 0x3fff;
    } else if (type === "VP8L" && !width) {
      const b = data.readUInt32LE(1);
      width = (b & 0x3fff) + 1;
      height = ((b >> 14) & 0x3fff) + 1;
    }
    if (type === "ANIM" || type === "ANMF") animated = true;
    if (type === "EXIF") hadLocation ||= exifHasGps(data);
    if (type !== "EXIF" && type !== "XMP ") chunks.push(chunk);
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return { width, height, animated, hadLocation, stripped: Buffer.concat([header, body]) };
}

export async function verifyImage(buf: Buffer, declared: string): Promise<VerifiedImage> {
  if (buf.length === 0 || buf.length > MAX_BYTES) throw new ImageRejected("size");
  const sniffed = sniffMime(buf);
  if (!sniffed || sniffed !== declared) throw new ImageRejected("type");
  let parsed: Parsed;
  try {
    parsed = sniffed === "image/jpeg" ? parseJpeg(buf) : sniffed === "image/png" ? parsePng(buf) : parseWebp(buf);
  } catch (e) {
    if (e instanceof ImageRejected) throw e;
    throw new ImageRejected("decode");
  }
  const { width, height } = parsed;
  if (!width || !height) throw new ImageRejected("decode");
  if (width < 64 || height < 64) throw new ImageRejected("dimensions");
  if (width * height > MAX_PIXELS) throw new ImageRejected("dimensions");
  if (parsed.animated) throw new ImageRejected("animated");
  return {
    mime: sniffed,
    width,
    height,
    sha256: createHash("sha256").update(buf).digest("hex"),
    hadLocation: parsed.hadLocation,
    derivative: parsed.stripped,
  };
}
