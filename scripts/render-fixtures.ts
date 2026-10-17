/**
 * Renders the fictional sample documents to PNG so they can be shown in the
 * demo and sent to a live extraction call. Run: npm run fixtures
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_DOCS, WATERMARK, type SampleDoc } from "../src/fixtures/documents.ts";

const W = 720;
const ROW_H = 64;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function svgFor(doc: SampleDoc): string {
  const visible = doc.croppedAfter !== undefined ? doc.rows.slice(0, doc.croppedAfter + 1) : doc.rows;
  const partial = doc.croppedAfter !== undefined ? doc.rows[doc.croppedAfter + 1] : undefined;
  const H = 200 + visible.length * ROW_H + (partial ? 30 : 40);
  const rows = visible
    .map((r, i) => {
      const y = 170 + i * ROW_H;
      const weight = r.strong ? 700 : 400;
      const fill = r.muted ? "#5B6B68" : "#172B2A";
      const size = r.strong ? 30 : 26;
      return `<text x="40" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(r.text)}</text>
      <line x1="40" x2="${W - 40}" y1="${y + 22}" y2="${y + 22}" stroke="#E3E8E6"/>`;
    })
    .join("\n");
  // A cropped screenshot shows only the top half of the next line.
  const cut = partial
    ? `<clipPath id="c"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
       <text clip-path="url(#c)" x="40" y="${H + 8}" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#172B2A">${esc(partial.text)}</text>`
    : "";
  const marks = Array.from({ length: Math.ceil(H / 220) + 1 }, (_, i) =>
    `<text x="${W / 2}" y="${120 + i * 220}" text-anchor="middle" transform="rotate(-18 ${W / 2} ${120 + i * 220})" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#B45309" fill-opacity="0.13">${WATERMARK}</text>`,
  ).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <rect width="${W}" height="110" fill="#EEF3F1"/>
  <text x="40" y="52" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#0F665D">${esc(doc.title)}</text>
  <text x="40" y="90" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#B45309">${WATERMARK}</text>
  ${rows}
  ${cut}
  ${marks}
</svg>`;
}

const outDir = join(import.meta.dirname, "..", "public", "demo");
mkdirSync(outDir, { recursive: true });
for (const doc of Object.values(SAMPLE_DOCS)) {
  const out = join(outDir, doc.filename);
  await sharp(Buffer.from(svgFor(doc))).png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out);
}
