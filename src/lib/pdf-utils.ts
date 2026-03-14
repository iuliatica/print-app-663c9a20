import {
  PDFDocument,
  PDFPage,
  PDFRawStream,
  PDFArray,
  PDFRef,
  PDFStream,
  PDFName,
  PDFDict,
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

/* ── helpers ─────────────────────────────────────────────── */

/** Decode a content stream to text */
function getStreamText(stream: PDFRawStream | PDFStream): string {
  try {
    if (stream instanceof PDFRawStream) {
      const decoded = decodePDFRawStream(stream);
      const bytes = decoded.decode();
      return new TextDecoder("latin1").decode(bytes);
    }
    const contents = (stream as PDFRawStream).contents;
    if (contents instanceof Uint8Array) {
      return new TextDecoder("latin1").decode(contents);
    }
    return "";
  } catch {
    return "";
  }
}

// Regex that matches PDF numbers: 0.5, .5, 1, 1.0, -0.3 etc.
const NUM = "[-]?\\d*\\.?\\d+";

/**
 * Verifică dacă un content-stream text conține operatori de culoare
 * care indică pagină color (nu grayscale).
 */
function contentStreamHasColor(text: string, resources?: PDFDict, context?: PDFDocument["context"]): boolean {
  // DeviceRGB fill/stroke: "r g b rg" or "r g b RG"
  const rgRegex = new RegExp(
    `(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(rg|RG)\\b`,
    "g"
  );
  let match: RegExpExecArray | null;
  while ((match = rgRegex.exec(text)) !== null) {
    const r = parseFloat(match[1]);
    const g = parseFloat(match[2]);
    const b = parseFloat(match[3]);
    if (r !== g || g !== b) {
      return true;
    }
  }

  // DeviceCMYK: "c m y k k" or "c m y k K"
  const cmykRegex = new RegExp(
    `(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(k|K)\\b`,
    "g"
  );
  while ((match = cmykRegex.exec(text)) !== null) {
    const c = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    if (c !== 0 || m !== 0 || y !== 0) {
      return true;
    }
  }

  // sc/SC and scn/SCN with 3+ args that aren't all equal (color in current space)
  const scRegex = new RegExp(
    `(${NUM})\\s+(${NUM})\\s+(${NUM})(?:\\s+${NUM})?\\s+(sc|SC|scn|SCN)\\b`,
    "g"
  );
  while ((match = scRegex.exec(text)) !== null) {
    const a = parseFloat(match[1]);
    const b = parseFloat(match[2]);
    const c = parseFloat(match[3]);
    if (a !== b || b !== c) {
      return true;
    }
  }

  // Check cs/CS operators that set a non-gray color space
  // This catches cases where color is set via a named color space
  if (resources && context) {
    const csRegex = /\/(\S+)\s+(cs|CS)\b/g;
    while ((match = csRegex.exec(text)) !== null) {
      const csName = match[1];
      // Built-in spaces
      if (csName === "DeviceRGB" || csName === "DeviceCMYK") return true;
      if (csName === "DeviceGray") continue;

      // Check named color spaces from resources
      try {
        const csDict = resources.get(PDFName.of("ColorSpace"));
        if (csDict) {
          const resolved = csDict instanceof PDFRef ? context.lookup(csDict) : csDict;
          if (resolved instanceof PDFDict) {
            const entry = resolved.get(PDFName.of(csName));
            if (entry) {
              const entryStr = entry.toString();
              if (entryStr.includes("DeviceRGB") || entryStr.includes("DeviceCMYK")) return true;
              // Resolve array-based color spaces like [/ICCBased <ref>]
              const entryResolved = entry instanceof PDFRef ? context.lookup(entry) : entry;
              if (entryResolved instanceof PDFArray && entryResolved.size() >= 2) {
                const first = entryResolved.get(0)?.toString() ?? "";
                if (first.includes("ICCBased")) {
                  const profileRef = entryResolved.get(1);
                  const profile = profileRef instanceof PDFRef ? context.lookup(profileRef) : profileRef;
                  if (profile instanceof PDFRawStream) {
                    const n = profile.dict.get(PDFName.of("N"));
                    const nVal = parseInt(n?.toString() ?? "", 10);
                    if (nVal >= 3) return true;
                  }
                }
                if (first.includes("DeviceRGB") || first.includes("DeviceCMYK")) return true;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return false;
}

/**
 * Resolve all content stream refs from a page's Contents entry.
 */
function getContentRefs(page: PDFPage): PDFRef[] {
  const refs: PDFRef[] = [];
  try {
    const contentsEntry = page.node.get(PDFName.of("Contents"));
    if (!contentsEntry) return refs;

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
  } catch {
    // ignore
  }
  return refs;
}

/**
 * Get the Resources dictionary for a page (handles both direct and indirect).
 */
function getResources(page: PDFPage): PDFDict | undefined {
  try {
    const res = page.node.get(PDFName.of("Resources"));
    if (!res) return undefined;
    if (res instanceof PDFDict) return res;
    if (res instanceof PDFRef) {
      const resolved = page.doc.context.lookup(res);
      if (resolved instanceof PDFDict) return resolved;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Check XObject resources for color content:
 * - Form XObjects: decode their content stream and scan for color operators
 * - Image XObjects: check their ColorSpace for non-gray
 */
function xobjectsHaveColor(
  resources: PDFDict,
  context: PDFDocument["context"],
  depth = 0
): boolean {
  if (depth > 3) return false; // prevent infinite recursion

  try {
    const xobjectDict = resources.get(PDFName.of("XObject"));
    if (!xobjectDict) return false;

    const resolved =
      xobjectDict instanceof PDFRef
        ? context.lookup(xobjectDict)
        : xobjectDict;
    if (!(resolved instanceof PDFDict)) return false;

    const entries = resolved.entries();
    for (const [, value] of entries) {
      const ref = value instanceof PDFRef ? value : null;
      const obj = ref ? context.lookup(ref) : value;

      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        const subtypeStr = subtype?.toString() ?? "";

        if (subtypeStr.includes("Form")) {
          // Form XObject — decode and scan its content stream
          const text = getStreamText(obj);
          if (contentStreamHasColor(text)) return true;

          // Also check the Form's own Resources for nested XObjects
          const formResources = dict.get(PDFName.of("Resources"));
          if (formResources instanceof PDFDict) {
            if (xobjectsHaveColor(formResources, context, depth + 1))
              return true;
          } else if (formResources instanceof PDFRef) {
            const fr = context.lookup(formResources);
            if (fr instanceof PDFDict) {
              if (xobjectsHaveColor(fr, context, depth + 1)) return true;
            }
          }
        } else if (subtypeStr.includes("Image")) {
          // Image XObject — check ColorSpace
          if (imageHasColor(dict, context)) return true;
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Check if an image's ColorSpace indicates color (not gray).
 */
function imageHasColor(
  imageDict: PDFDict,
  context: PDFDocument["context"]
): boolean {
  try {
    const cs = imageDict.get(PDFName.of("ColorSpace"));
    if (!cs) return false;

    const csStr = cs.toString();

    // Direct color spaces
    if (csStr.includes("DeviceRGB") || csStr.includes("DeviceCMYK"))
      return true;
    if (csStr.includes("DeviceGray")) return false;

    // ICCBased — check the N (number of components)
    // [/ICCBased <stream ref>] where stream has /N 3 (RGB) or /N 4 (CMYK)
    if (csStr.includes("ICCBased")) {
      // If it's an array like [/ICCBased <ref>]
      if (cs instanceof PDFArray && cs.size() >= 2) {
        const profileRef = cs.get(1);
        const profile = profileRef instanceof PDFRef
          ? context.lookup(profileRef)
          : profileRef;
        if (profile instanceof PDFRawStream) {
          const n = profile.dict.get(PDFName.of("N"));
          const nStr = n?.toString() ?? "";
          const nVal = parseInt(nStr, 10);
          // N=1 is gray, N=3 is RGB, N=4 is CMYK
          if (nVal >= 3) return true;
        }
      }
      return false;
    }

    // Indexed color space [/Indexed base hival lookup]
    if (cs instanceof PDFArray && cs.size() >= 2) {
      const first = cs.get(0);
      if (first?.toString().includes("Indexed")) {
        const base = cs.get(1);
        const baseStr = base?.toString() ?? "";
        if (baseStr.includes("DeviceRGB") || baseStr.includes("DeviceCMYK"))
          return true;
        if (baseStr.includes("ICCBased") && base instanceof PDFRef) {
          const profile = context.lookup(base);
          if (profile instanceof PDFRawStream) {
            const n = profile.dict.get(PDFName.of("N"));
            const nVal = parseInt(n?.toString() ?? "", 10);
            if (nVal >= 3) return true;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Analizează fiecare pagină a unui PDF și determină care sunt color vs alb-negru.
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
      // 1. Scan page content streams for color operators
      const refs = getContentRefs(page);
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

      // 2. Check XObject resources (images, form xobjects)
      if (!isColor) {
        const resources = getResources(page);
        if (resources) {
          isColor = xobjectsHaveColor(resources, pdf.context);
        }
      }
    } catch {
      // Conservative fallback: not color unless we can prove it
      isColor = false;
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
