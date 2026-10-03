import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { HttpError } from './http.js';

/** Shared CSV / Excel reading for importers (leads, places) */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export const cellValue = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text);
    if (v.result != null) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink) return String(v.text || v.hyperlink).replace(/^mailto:/, '');
  }
  return v;
};

export async function readSheet(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') return parseCsv(file.buffer.toString('utf8'));
  if (!name.endsWith('.xlsx')) throw new HttpError(400, 'Upload a .csv or .xlsx file (old .xls is not supported – re-save as .xlsx)');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.read(Readable.from(file.buffer));
  } catch {
    throw new HttpError(400, 'Could not read the Excel file. Please re-save it as .xlsx and try again.');
  }
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let i = 1; i <= Math.max(r.cellCount, ws.columnCount); i++) vals.push(cellValue(r.getCell(i).value));
    if (vals.some((v) => String(v).trim() !== '')) rows.push(vals);
  });
  return rows;
}

/** Accepts Date, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, Excel serial numbers */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? undefined : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    return isNaN(d) ? undefined : d;
  }
  return undefined;
}

export const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);


export const normHeader = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Map header row → column index using each column's header, key and aliases */
export function mapColumns(headerRow, columns) {
  const header = headerRow.map(normHeader);
  const idx = {};
  for (const col of columns) {
    const names = [normHeader(col.header), normHeader(col.key), ...col.aliases];
    const i = header.findIndex((h) => names.includes(h) || names.includes(h.replace(/\s*\*$/, '')));
    if (i >= 0) idx[col.key] = i;
  }
  return idx;
}

/** Build a CSV or styled XLSX template response */
export async function sendTemplate(res, format, name, columns, helpRows = []) {
  const headers = columns.map((c) => (c.required ? `${c.header} *` : c.header));
  const example = columns.map((c) => c.example ?? '');
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = headers.map((h) => ({ header: h, width: Math.max(14, h.length + 4) }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    ws.addRow(example);
    if (helpRows.length) {
      const help = wb.addWorksheet('Allowed values');
      help.columns = [{ header: 'Field', width: 22 }, { header: 'Allowed values', width: 80 }];
      help.getRow(1).font = { bold: true };
      helpRows.forEach((r) => help.addRow(r));
    }
    await wb.xlsx.write(res);
    return res.end();
  }
  const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send('\uFEFF' + [headers, example].map((r) => r.map(esc).join(',')).join('\n') + '\n');
}
