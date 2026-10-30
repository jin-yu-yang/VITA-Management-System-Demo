// The only entry point of the second committed browser vendor bundle,
// `src/vendor/pdf-lib.mjs`: pdf-lib and its font engine for the draft
// Form 13614-C (spec 2026-10-04 §7.3). It is kept apart from
// `tools/vendor-entry.mjs`, which stays Supabase-only, and the application
// loads it with a dynamic `import()` only when the draft is asked for.
// `src/draft-pdf.mjs` never imports it: the builder takes these as arguments.
export { PDFDocument, StandardFonts, rgb } from "pdf-lib";
// The editing copy's partial flatten and its /V text (src/draft-pdf.mjs).
export {
  PDFName, PDFBool, PDFHexString, pushGraphicsState, popGraphicsState, translate, drawObject, rotateInPlace,
} from "pdf-lib";
export { default as fontkit } from "@pdf-lib/fontkit";
