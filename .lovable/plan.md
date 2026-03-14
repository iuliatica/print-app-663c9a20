

## Problem Analysis

The current `analyzePdfColors()` in `src/lib/pdf-utils.ts` has several bugs causing incorrect color page detection:

1. **Broken page dictionary lookup**: `page.doc.context.obj("Contents")` creates a new object instead of looking up the dictionary key. Should use `PDFName.of("Contents")` from pdf-lib.
2. **Incomplete number regex**: `\d+\.?\d*` misses numbers like `.5` or `0.333` patterns common in PDF streams.
3. **False-positive CS check**: Just detecting `/DeviceRGB cs` marks a page as color even if only gray values are used in that space.
4. **Missing XObject analysis**: Color images and Form XObjects referenced via `Do` operator are completely ignored — this is where most color content lives (embedded images, vector graphics in forms).
5. **Missing image color space detection**: Images with `/DeviceRGB` or `/ICCBased` color spaces in page Resources are not checked.

## Plan

**Single file change: `src/lib/pdf-utils.ts`**

- Fix `PDFName.of("Contents")` for correct dictionary key lookup
- Fix number regex to `[-]?\d*\.?\d+` to catch all PDF number formats  
- Remove the aggressive `/DeviceRGB cs` false-positive check
- Add recursive XObject content stream scanning: when a `Do` operator references a Form XObject, decode and scan that stream too
- Add image resource color space detection: check if images in `/Resources/XObject` use `/DeviceRGB`, `/DeviceCMYK`, or `/ICCBased` (non-gray) color spaces
- Keep the conservative fallback (pageResourcesHaveColor) for error cases but make it smarter by ignoring DeviceGray ICC profiles

