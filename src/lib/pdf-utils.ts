import {
  PDFDocument,
  PDFPage,
  PDFRawStream,
  PDFArray,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";

/**
 * Numără paginile dintr-un fișier PDF.
 */
export async function getPdfPageCount(
  file: File | ArrayBuffer
): Promise<number> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return pdf.getPageCount();
}

/**
 * Rezultatul scanării color per fișier PDF.
 */
export interface PdfColorAnalysis {
  totalPages: number;
  colorPages: number;
  bwPages: number;
  /** Index-urile (0-based) ale paginilor color */
  colorPageIndices: number[];
}

/**
 * Extrage textul dintr-un content stream (PDFRawStream sau PDFStream).
 */
function getStreamText(stream: PDFRawStream | PDFStream): string {
  try {
    if (stream instanceof PDFRawStream) {
      const decoded = decodePDFRawStream(stream);
      // decoded.decode() returns Uint8Array
      const bytes = decoded.decode();
      return new TextDecoder("latin1").decode(bytes);
    }
    // For other stream types, try to get contents
    const contents = (stream as PDFRawStream).contents;
    if (contents instanceof Uint8Array) {
      return new TextDecoder("latin1").decode(contents);
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Verifică dacă un string de content-stream conține operatori de culoare
 * care indică DeviceRGB sau DeviceCMYK (= pagină color).
 *
 * Operatori PDF relevanți:
 * - rg / RG  → setează fill/stroke color în DeviceRGB
 * - k / K    → setează fill/stroke color în DeviceCMYK
 * - cs / CS  → setează color space (dacă e DeviceRGB sau DeviceCMYK)
 * - sc / SC / scn / SCN → setează culoare în spațiul curent
 *
 * O pagină este considerată color dacă:
 * 1. Folosește rg/RG cu valori care NU sunt gri (r≠g sau g≠b)
 * 2. Folosește k/K (CMYK) cu c,m,y care nu sunt toate 0
 * 3. Folosește cs/CS cu DeviceRGB sau DeviceCMYK
 */
function contentStreamHasColor(text: string): boolean {
  // Check for DeviceRGB fill: "r g b rg" where not all equal (not gray)
  const rgRegex =
    /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(rg|RG)\b/g;
  let match: RegExpExecArray | null;
  while ((match = rgRegex.exec(text)) !== null) {
    const r = parseFloat(match[1]);
    const g = parseFloat(match[2]);
    const b = parseFloat(match[3]);
    // If r, g, b are NOT all equal → it's a color (not grayscale)
    if (r !== g || g !== b) {
      return true;
    }
  }

  // Check for DeviceCMYK: "c m y k k" or "c m y k K"
  const cmykRegex =
    /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(k|K)\b/g;
  while ((match = cmykRegex.exec(text)) !== null) {
    const c = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    // If c, m, y are NOT all 0 → it's color (pure black in CMYK is 0,0,0,1)
    if (c !== 0 || m !== 0 || y !== 0) {
      return true;
    }
  }

  // Check for explicit color space setting
  const csRegex = /\/(DeviceRGB|DeviceCMYK)\s+(cs|CS)\b/g;
  if (csRegex.test(text)) {
    return true;
  }

  return false;
}

/**
 * Verifică dacă Resources-urile paginii conțin color space-uri non-gray.
 */
function pageResourcesHaveColor(page: PDFPage): boolean {
  try {
    const resources = page.node.get(page.doc.context.obj("Resources") as any);
    if (!resources) return false;
    const resourcesStr = resources?.toString() ?? "";
    // Quick heuristic: if Resources reference DeviceRGB or DeviceCMYK
    if (
      resourcesStr.includes("DeviceRGB") ||
      resourcesStr.includes("DeviceCMYK")
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Analizează fiecare pagină a unui PDF și determină care sunt color vs alb-negru.
 *
 * Scanează content stream-ul fiecărei pagini pentru operatori de culoare:
 * - DeviceRGB (rg/RG) cu valori non-gri → COLOR
 * - DeviceCMYK (k/K) cu c,m,y nenule → COLOR
 * - DeviceGray sau fără operatori de culoare → ALB-NEGRU
 */
export async function analyzePdfColors(
  file: File | ArrayBuffer
): Promise<PdfColorAnalysis> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdf.getPageCount();
  const colorPageIndices: number[] = [];

  for (let i = 0; i < totalPages; i++) {
    const page = pdf.getPage(i);
    let isColor = false;

    try {
      // Get page content streams
      const contentsEntry = page.node.get(
        page.doc.context.obj("Contents") as any
      );

      if (contentsEntry) {
        const refs: PDFRef[] = [];

        if (contentsEntry instanceof PDFRef) {
          refs.push(contentsEntry);
        } else if (contentsEntry instanceof PDFArray) {
          for (let j = 0; j < contentsEntry.size(); j++) {
            const item = contentsEntry.get(j);
            if (item instanceof PDFRef) {
              refs.push(item);
            }
          }
        }

        for (const ref of refs) {
          const stream = pdf.context.lookup(ref);
          if (stream instanceof PDFRawStream) {
            const text = getStreamText(stream);
            if (contentStreamHasColor(text)) {
              isColor = true;
              break;
            }
          }
        }
      }
    } catch {
      // If we can't parse the content stream, be conservative: mark as color
      // only if resources suggest color
      isColor = pageResourcesHaveColor(page);
    }

    if (isColor) {
      colorPageIndices.push(i);
    }
  }

  return {
    totalPages,
    colorPages: colorPageIndices.length,
    bwPages: totalPages - colorPageIndices.length,
    colorPageIndices,
  };
}
