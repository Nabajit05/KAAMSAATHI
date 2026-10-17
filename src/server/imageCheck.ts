import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000; // bounds decoder memory
const FORMAT_TO_MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export type VerifiedImage = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  sha256: string;
  hadLocation: boolean;
  /** Bounded copy for AI reading: auto-rotated, metadata removed, text kept legible. */
  derivative: Buffer;
};

/** Magic-byte sniffing, independent of the declared type or filename. */
export function sniffMime(buf: Buffer): VerifiedImage["mime"] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export class ImageRejected extends Error {}

/** True when IFD0 of an EXIF block contains the GPS IFD pointer (tag 0x8825). */
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
    return false; // malformed EXIF: treat as no GPS, derivative is stripped anyway
  }
}

/**
 * Verifies an uploaded image and prepares the processing copy. The original
 * bytes are never modified; only the derivative drops metadata.
 */
export async function verifyImage(buf: Buffer, declared: string): Promise<VerifiedImage> {
  if (buf.length === 0 || buf.length > MAX_BYTES) throw new ImageRejected("size");
  const sniffed = sniffMime(buf);
  if (!sniffed || sniffed !== declared) throw new ImageRejected("type");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new ImageRejected("decode");
  }
  const fmt = meta.format as keyof typeof FORMAT_TO_MIME | undefined;
  if (!fmt || FORMAT_TO_MIME[fmt] !== sniffed) throw new ImageRejected("type");
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) throw new ImageRejected("dimensions");
  if ((meta.pages ?? 1) > 1) throw new ImageRejected("animated");

  // We only detect location metadata to disclose it; it is never trusted as proof.
  const hadLocation = !!meta.exif && exifHasGps(meta.exif);

  // Long edge up to 2400px keeps small payout text readable; no upscaling.
  const derivative = await sharp(buf, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer(); // sharp drops EXIF/XMP/GPS unless withMetadata() is called

  return {
    mime: sniffed,
    width: meta.width,
    height: meta.height,
    sha256: createHash("sha256").update(buf).digest("hex"),
    hadLocation,
    derivative,
  };
}
