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
 * Unele browsere/sisteme pot trimite tipul gol sau generic pentru PDF-uri valide.
 */
export function isPdfMime(type: string | null): boolean {
  if (!type) return false;
  const normalized = type.toLowerCase().trim();
  return normalized === "application/pdf" || normalized === "application/x-pdf";
}

/**
 * Validare completă: preferă semnătura reală a fișierului (%PDF).
 * MIME-ul este folosit doar ca semnal suplimentar, nu ca blocaj strict.
 */
export async function assertPdfFile(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  if (!isPdfBuffer(buffer)) {
    throw new Error(`Fișierul "${file.name}" nu pare a fi un PDF valid (conținut invalid).`);
  }

  const hasPdfMime = isPdfMime(file.type);
  const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
  if (!hasPdfMime && !hasPdfExtension) {
    throw new Error(`Fișierul "${file.name}" nu este un PDF valid.`);
  }
}
