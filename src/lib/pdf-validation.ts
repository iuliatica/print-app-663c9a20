const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const MIN_PDF_LENGTH = 4;

/**
 * Verifică dacă buffer-ul începe cu magic bytes-ul PDF (%PDF).
 */
export function isPdfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < MIN_PDF_LENGTH) return false;
  const view = new Uint8Array(buffer);
  return PDF_MAGIC.every((byte, i) => view[i] === byte);
}

/**
 * Verifică tipul MIME (din header Content-Type sau file.type).
 */
export function isPdfMime(type: string | null): boolean {
  if (!type) return false;
  const normalized = type.toLowerCase().trim();
  return normalized === "application/pdf";
}

/**
 * Validare completă: tip MIME + magic bytes.
 * Aruncă dacă fișierul nu este un PDF valid.
 */
export async function assertPdfFile(file: File): Promise<void> {
  if (!isPdfMime(file.type)) {
    throw new Error(`Fișierul "${file.name}" nu este un PDF (tip: ${file.type || "necunoscut"}).`);
  }
  const buffer = await file.arrayBuffer();
  if (!isPdfBuffer(buffer)) {
    throw new Error(`Fișierul "${file.name}" nu pare a fi un PDF valid (conținut invalid).`);
  }
}
