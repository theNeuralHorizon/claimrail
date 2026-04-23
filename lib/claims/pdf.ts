/**
 * Minimal PDF 1.4 generator. Text-only, single page, fixed-width Courier
 * font. Zero external deps — the PDF format is just a byte-counted
 * xref table wrapped around a handful of objects.
 *
 * Why do it ourselves: pulling in `pdfkit` or `pdf-lib` adds MBs and a
 * runtime that's awkward under edge runtimes. A claim letter is plain
 * text. This generates a valid, letter-sized PDF that Acrobat, Preview,
 * and every browser render identically.
 *
 * Format reference: Adobe PDF Reference 1.7 (section 7 — basic structure).
 */

const PAGE_WIDTH = 612; // 8.5in × 72
const PAGE_HEIGHT = 792; // 11in × 72
const MARGIN_LEFT = 54; // 0.75in
const MARGIN_TOP = 54;
const LINE_HEIGHT = 13;
const MAX_LINE_CHARS = 84; // Courier 10pt @ 504pt line width

function escapePdfString(s: string): string {
  // Escape PDF string literal special chars.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(/(\s+)/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + w).length > maxChars) {
      if (cur) out.push(cur.trimEnd());
      cur = w.trimStart();
      if (cur.length > maxChars) {
        // Hard break a single very long token.
        while (cur.length > maxChars) {
          out.push(cur.slice(0, maxChars));
          cur = cur.slice(maxChars);
        }
      }
    } else {
      cur += w;
    }
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out;
}

export function renderClaimPdf(input: {
  subject: string;
  body: string;
  period: string;
  vendorName: string;
}): Buffer {
  // Build the body stream as a sequence of "Tj" operations, one per line.
  // ASCII-only — we strip non-printables at the boundary, since PDF literal
  // strings with Courier can't render arbitrary Unicode without a font program.
  const rawLines = (input.subject + '\n\n' + input.body)
    .split(/\r?\n/)
    .flatMap((l) => wrapLine(l.replace(/[^\x20-\x7e]/g, ' '), MAX_LINE_CHARS));

  const linesPerPage = Math.floor((PAGE_HEIGHT - 2 * MARGIN_TOP) / LINE_HEIGHT);
  const pages: string[][] = [];
  for (let i = 0; i < rawLines.length; i += linesPerPage) {
    pages.push(rawLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['(empty claim body)']);

  // Build page content streams.
  const streams = pages.map((pageLines) => {
    let content = `BT\n/F1 10 Tf\n${MARGIN_LEFT} ${PAGE_HEIGHT - MARGIN_TOP} Td\n`;
    pageLines.forEach((line, idx) => {
      const escaped = escapePdfString(line);
      if (idx === 0) {
        content += `(${escaped}) Tj\n`;
      } else {
        content += `0 -${LINE_HEIGHT} Td (${escaped}) Tj\n`;
      }
    });
    content += 'ET\n';
    return content;
  });

  // Assemble objects.
  // Object IDs:
  //   1 — Catalog
  //   2 — Pages
  //   3..3+pages-1 — Page objects
  //   3+pages..3+2*pages-1 — Content streams
  //   3+2*pages — Font
  const totalObjects = 3 + 2 * pages.length;
  const pageObjIds = Array.from({ length: pages.length }, (_, i) => 3 + i);
  const contentObjIds = Array.from({ length: pages.length }, (_, i) => 3 + pages.length + i);
  const fontObjId = totalObjects;

  const objects: Array<{ id: number; body: string }> = [];

  objects.push({
    id: 1,
    body: `<< /Type /Catalog /Pages 2 0 R >>`,
  });
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [ ${pageObjIds.map((id) => `${id} 0 R`).join(' ')} ] /Count ${pages.length} >>`,
  });
  pageObjIds.forEach((id, i) => {
    objects.push({
      id,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjIds[i]} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`,
    });
  });
  contentObjIds.forEach((id, i) => {
    const stream = streams[i];
    objects.push({
      id,
      body: `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
    });
  });
  objects.push({
    id: fontObjId,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`,
  });

  // Serialize with a running byte offset so we can build the xref table.
  const encoder = Buffer.from;
  let body = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  const offsets: Record<number, number> = {};
  objects
    .sort((a, b) => a.id - b.id)
    .forEach((obj) => {
      offsets[obj.id] = Buffer.byteLength(body, 'latin1');
      body += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
    });
  const xrefStart = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i += 1) {
    const off = offsets[i] ?? 0;
    body += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // The binary-signature comment at the top uses latin1; keep everything in
  // latin1 to preserve byte offsets.
  return encoder(body, 'latin1');
}

export function claimPdfFilename(period: string, vendorName: string): string {
  const safeVendor = vendorName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64);
  return `claimrail-${safeVendor}-${period}.pdf`;
}
