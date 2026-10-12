import { SANJIVANI_LOGO_URL } from "@/components/brand-logos";

/** Plain number for spreadsheet cells — never a formatted currency string. */
export const num = (v: unknown, digits = 2) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
};

/** ISO-ish date for spreadsheets (yyyy-mm-dd), stable across locales. */
export const csvDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};

/** Render the LBGS badge to a PNG data URL so it can be embedded in Excel. */
function lbgsBadgePng(): string {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 240;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Unable to create the Excel logo");
  ctx.fillStyle = "#1e3a5f";
  ctx.beginPath();
  ctx.roundRect(0, 0, 240, 240, 36);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 68px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LBGS", 120, 124);
  return c.toDataURL("image/png");
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function prettyHeader(key: string) {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function logoWatermark(logos: string[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create the Excel watermark");
  ctx.globalAlpha = 0.08;
  await Promise.all(logos.map(async (source, index) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(280 / image.width, 200 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, 240 + index * 480 - width / 2, 240 - height / 2, width, height);
  }));
  return canvas.toDataURL("image/png");
}

/**
 * Build + download a branded Excel (.xlsx) workbook from flat row objects.
 * Header block carries both the LBGS and Sanjivani logos. The Excel library
 * is loaded on demand so it stays out of every page's initial bundle.
 */
export async function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "LBGS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 6 }] });

  const headers = rows.length ? Object.keys(rows[0]) : ["No data"];
  const colCount = Math.max(headers.length, 4);

  // Logos only above the table; no report title, date, or record-count text.
  for (let r = 1; r <= 4; r++) ws.getRow(r).height = 22;

  const lbgs = lbgsBadgePng();
  const lbgsId = wb.addImage({ base64: lbgs, extension: "png" });
  ws.addImage(lbgsId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 72, height: 72 } });
  const sanj = await fetchAsBase64(SANJIVANI_LOGO_URL);
  if (!sanj) throw new Error("Unable to load the Sanjivani logo. Please try exporting again.");
  const sanjId = wb.addImage({ base64: sanj, extension: "png" });
  ws.addImage(sanjId, { tl: { col: colCount - 1.3, row: 0.15 }, ext: { width: 110, height: 74 } });
  const watermarkId = wb.addImage({ base64: await logoWatermark([lbgs, sanj]), extension: "png" });
  ws.addBackgroundImage(watermarkId);

  // Table header on row 6.
  const headerRow = ws.getRow(6);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = prettyHeader(h);
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFC9A227" } } };
  });
  headerRow.height = 24;

  rows.forEach((row, ri) => {
    const r = ws.getRow(7 + ri);
    headers.forEach((h, ci) => {
      const v = row[h];
      const cell = r.getCell(ci + 1);
      cell.value = v == null ? "" : (v as any);
      cell.font = { name: "Arial", size: 10 };
      if (typeof v === "number") cell.numFmt = Number.isInteger(v) ? '#,##0;(#,##0);"-"' : '#,##0.00;(#,##0.00);"-"';
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  });

  // Auto-fit widths (first column min width leaves room for the LBGS logo).
  for (let i = 1; i <= colCount; i++) {
    const h = headers[i - 1] ?? "";
    let w = prettyHeader(h).length;
    for (const row of rows.slice(0, 500)) w = Math.max(w, String(row[h] ?? "").length);
    ws.getColumn(i).width = Math.min(Math.max(w + 2, i === 1 || i === colCount ? 16 : 10), 50);
  }
  if (rows.length) ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.(csv|xlsx)$/i, "")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
