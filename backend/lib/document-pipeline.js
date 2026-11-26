// Turns an uploaded bill / warranty card into text or page images:
//   digital PDF -> text layer; scanned PDF -> rendered pages; images -> OCR;
//   handwriting or poor OCR -> images for the verified vision model.
import { PDFParse } from 'pdf-parse';

const PDF_MAGIC = Buffer.from('%PDF-');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const MIN_TEXT = 40;
const MAX_PAGES = 3;

let ocrWorker = null;

export function sniffFile(buffer, declaredMime = '', originalName = '') {
  const bytes = Buffer.from(buffer);
  if (bytes.subarray(0, 5).equals(PDF_MAGIC)) return { ext: '.pdf', mimeType: 'application/pdf' };
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) return { ext: '.png', mimeType: 'image/png' };
  if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) return { ext: '.jpg', mimeType: 'image/jpeg' };
  throw new Error('Unsupported file type. Upload a PDF, JPG, JPEG or PNG document.');
}

async function readPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first: MAX_PAGES });
    return String(result.text ?? '').replace(/\n{3,}/g, '\n\n').trim();
  } finally {
    await parser.destroy();
  }
}

async function renderPdfPages(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({ first: 2, scale: 1.4, imageBuffer: true, imageDataUrl: false });
    return (result.pages ?? []).map((page) => ({ buffer: Buffer.from(page.data), mimeType: 'image/png', pageNumber: page.pageNumber }));
  } finally {
    await parser.destroy();
  }
}

/** Shared Tesseract worker; language data may be pointed at a local directory with WEAVE_TESSERACT_LANG_PATH. */
async function getOcrWorker() {
  if (!ocrWorker) {
    const { createWorker } = await import('tesseract.js');
    const lang = process.env.WEAVE_OCR_LANG || 'eng';
    const options = process.env.WEAVE_TESSERACT_LANG_PATH ? { langPath: process.env.WEAVE_TESSERACT_LANG_PATH, gzip: true } : {};
    ocrWorker = createWorker(lang, 1, options);
  }
  return ocrWorker;
}

async function ocr(images) {
  const worker = await getOcrWorker();
  const results = [];
  for (const image of images.slice(0, 2)) {
    const { data } = await worker.recognize(image.buffer);
    results.push({ text: String(data?.text ?? ''), confidence: Number(data?.confidence ?? 0) });
  }
  const text = results.map((r) => r.text).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const confidence = results.length ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length : 0;
  return { text, confidence };
}

/** Prepare source material for AI extraction. Never fabricates text when OCR fails. */
export async function extractSource({ buffer, mimeType, kind = 'bill' }) {
  const file = sniffFile(buffer, mimeType);
  const warnings = [];
  if (file.mimeType === 'application/pdf') {
    const text = await readPdfText(buffer);
    if (text.length >= MIN_TEXT) return { method: 'pdf_text', text, images: [], warnings };
    warnings.push('This PDF has no usable text layer; rendering its pages for OCR.');
    const images = await renderPdfPages(buffer);
    if (!images.length) throw new Error('Could not render this PDF for OCR. It may be password-protected or damaged.');
    if (kind === 'handwritten') return { method: 'vision', text: '', images, warnings };
    let result;
    try {
      result = await ocr(images);
    } catch (error) {
      warnings.push(`Local OCR was unavailable (${error.message}); using the vision model instead.`);
      return { method: 'vision', text: '', images, warnings };
    }
    if (result.confidence >= 55 && result.text.length >= MIN_TEXT) return { method: 'ocr', text: result.text, images: [], warnings };
    warnings.push('OCR confidence was low; using the vision model to read the document.');
    return { method: 'vision', text: result.text, images, warnings };
  }

  const images = [{ buffer: Buffer.from(buffer), mimeType: file.mimeType, pageNumber: 1 }];
  if (kind === 'handwritten') return { method: 'vision', text: '', images, warnings };
  let result;
  try {
    result = await ocr(images);
  } catch (error) {
    warnings.push(`Local OCR was unavailable (${error.message}); using the vision model instead.`);
    return { method: 'vision', text: '', images, warnings };
  }
  if (result.confidence >= 55 && result.text.length >= MIN_TEXT) return { method: 'ocr', text: result.text, images: [], warnings };
  warnings.push('OCR confidence was low; using the vision model to read the document.');
  return { method: 'vision', text: result.text, images, warnings };
}
