import { PDFDocument } from "pdf-lib";

/**
 * Numără paginile dintr-un fișier PDF.
 * @param file - Fișierul PDF (File sau ArrayBuffer)
 * @returns Numărul de pagini
 */
export async function getPdfPageCount(
  file: File | ArrayBuffer
): Promise<number> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await PDFDocument.load(arrayBuffer);
  return pdf.getPageCount();
}
