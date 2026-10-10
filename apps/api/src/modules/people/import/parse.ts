// Spreadsheet parsing and row validation for student import (G-02, ADR-036, C-101). Pure
// functions: no database, no storage — unit-tested in parse.spec.ts.
import {
  type CustomField,
  IMPORT_MAX_ROWS,
  type ImportField,
  type ImportIssue,
  type ImportMapping,
  PersonNameSchema,
  PhoneSchema,
} from '@academybee/contracts';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export type FileType = 'csv' | 'xlsx';
export class UnreadableFileError extends Error {}

/** Uncompressed size and entry limits for XLSX (zip bombs, C-101). */
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;

/** Decide the file type from its bytes (never trust the name or the browser's type). */
export function detectType(bytes: Uint8Array): FileType {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
    return 'xlsx';
  // Text: no NUL bytes in the first 4 KB.
  if (!bytes.subarray(0, 4096).includes(0)) return 'csv';
  throw new UnreadableFileError('not csv or xlsx');
}

/** Rows of cell text (first sheet for XLSX); blank rows dropped. */
export async function parseRows(bytes: Uint8Array, type: FileType): Promise<string[][]> {
  const rows = type === 'csv' ? parseCsv(bytes) : await parseXlsx(bytes);
  return rows
    .map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some((c) => c !== ''));
}

function parseCsv(bytes: Uint8Array): string[][] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Spreadsheet programs on Windows often save CSV as Windows-1252.
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (parsed.errors.some((e) => e.type === 'Delimiter' && parsed.data.length === 0))
    throw new UnreadableFileError('csv');
  return parsed.data;
}

/** Sum of uncompressed sizes from the ZIP central directory, checked before inflating. */
function assertSafeZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new UnreadableFileError('zip');
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries > MAX_ZIP_ENTRIES) throw new UnreadableFileError('zip entries');
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new UnreadableFileError('zip directory');
    total += view.getUint32(offset + 24, true);
    if (total > MAX_UNZIPPED_BYTES) throw new UnreadableFileError('zip too large');
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  assertSafeZip(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new UnreadableFileError('xlsx');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > IMPORT_MAX_ROWS + 1) return;
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(row.cellCount, 200); c += 1)
      cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  });
  return rows;
}

/** A cell as text: dates as YYYY-MM-DD, formulas as their result (never re-evaluated). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return '';
    return '';
  }
  return String(value);
}

// ── Mapping ─────────────────────────────────────────────────────────────────────────────────

/**
 * Header words that suggest a field (matching keys, not UI text; the template's own headers
 * always match). English for now; Phase L adds the launch languages.
 */
const SYNONYMS: Record<(typeof BASE_FIELDS)[number], string[]> = {
  fullName: ['name', 'student name', 'full name', 'student', 'child name', 'name of student'],
  preferredName: ['preferred name', 'nickname', 'nick name', 'called'],
  dateOfBirth: ['date of birth', 'dob', 'birth date', 'birthday', 'd.o.b'],
  gender: ['gender', 'sex'],
  schoolName: ['school', 'school name'],
  grade: ['grade', 'class', 'std', 'standard', 'year'],
  admissionDate: ['admission date', 'date of admission', 'joined', 'joining date', 'doj'],
  parentName: [
    'parent',
    'parent name',
    'guardian',
    'guardian name',
    'father name',
    "father's name",
    'mother name',
    "mother's name",
  ],
  parentPhone: [
    'phone',
    'mobile',
    'contact',
    'whatsapp',
    'parent phone',
    'parent mobile',
    'phone number',
    'mobile number',
    'contact number',
  ],
  parentEmail: ['email', 'parent email', 'e-mail', 'mail'],
  parentRelationship: ['relationship', 'relation'],
  batch: ['batch', 'group', 'batch name', 'class name', 'section'],
};
const BASE_FIELDS = [
  'fullName',
  'preferredName',
  'dateOfBirth',
  'gender',
  'schoolName',
  'grade',
  'admissionDate',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentRelationship',
  'batch',
] as const;

const norm = (v: string) =>
  v
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_*:.()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Suggest which column fills which field: exact template headers first, then synonyms; custom
 * fields by their label. Each column is used once.
 */
export function suggestMapping(
  headers: string[],
  templateHeaders: Record<string, string>,
  customFields: CustomField[],
): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<number>();
  const take = (field: ImportField, matches: (h: string) => boolean) => {
    if (mapping[field] !== undefined) return;
    const index = headers.findIndex((h, i) => !used.has(i) && matches(norm(h)));
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  };
  for (const [field, label] of Object.entries(templateHeaders))
    take(field as ImportField, (h) => h === norm(label));
  for (const f of customFields.filter((x) => !x.archived))
    take(`custom:${f.key}`, (h) => h === norm(f.label));
  for (const field of BASE_FIELDS) take(field, (h) => SYNONYMS[field].some((w) => norm(w) === h));
  return mapping;
}

// ── Validation ──────────────────────────────────────────────────────────────────────────────

export type ParsedStudent = {
  fullName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: 'FEMALE' | 'MALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
  schoolName: string | null;
  grade: string | null;
  admissionDate: string | null;
  parent: {
    fullName: string;
    phone: string | null;
    email: string | null;
    relationship: 'MOTHER' | 'FATHER' | 'GUARDIAN' | 'GRANDPARENT' | 'OTHER';
  } | null;
  batchId: string | null;
  customFields: Record<string, string | number | null>;
};
export type RowIssue = { field: string; issue: ImportIssue };

const GENDERS: Record<string, ParsedStudent['gender']> = {
  f: 'FEMALE',
  female: 'FEMALE',
  girl: 'FEMALE',
  m: 'MALE',
  male: 'MALE',
  boy: 'MALE',
  other: 'OTHER',
  o: 'OTHER',
  'prefer not to say': 'PREFER_NOT_TO_SAY',
};
const RELATIONSHIPS: Record<string, NonNullable<ParsedStudent['parent']>['relationship']> = {
  mother: 'MOTHER',
  mom: 'MOTHER',
  mum: 'MOTHER',
  amma: 'MOTHER',
  father: 'FATHER',
  dad: 'FATHER',
  appa: 'FATHER',
  guardian: 'GUARDIAN',
  grandparent: 'GRANDPARENT',
  grandmother: 'GRANDPARENT',
  grandfather: 'GRANDPARENT',
  other: 'OTHER',
};

/** A value that isn't a date. */
export const INVALID_DATE: unique symbol = Symbol('invalid date');

/** `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` or `DD.MM.YYYY` (Indian order) → `YYYY-MM-DD`. */
export function parseDate(value: string): string | null | typeof INVALID_DATE {
  if (!value) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return INVALID_DATE;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    y < 1900
  )
    return INVALID_DATE;
  return date.toISOString().slice(0, 10);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS: Partial<Record<string, number>> = {
  preferredName: 60,
  schoolName: 120,
  grade: 40,
  parentName: 120,
};

/**
 * One row → a student (and parent) or issues. Uses the same rules as the API (contracts schemas),
 * so an imported student is exactly what Add Student would accept (ADR-036).
 */
export function validateRow(
  cells: string[],
  mapping: ImportMapping,
  ctx: { customFields: CustomField[]; batches: Map<string, string>; today: string },
): { student: ParsedStudent | null; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const get = (field: ImportField) => {
    const i = mapping[field];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };
  const tooLong = (field: string, value: string) => {
    const max = LIMITS[field];
    if (max && [...value].length > max) issues.push({ field, issue: 'too_long' });
  };

  const name = PersonNameSchema.safeParse(get('fullName'));
  if (!get('fullName')) issues.push({ field: 'fullName', issue: 'required' });
  else if (!name.success) issues.push({ field: 'fullName', issue: 'invalid_value' });

  for (const f of ['preferredName', 'schoolName', 'grade', 'parentName'] as const)
    tooLong(f, get(f));

  const dob = parseDate(get('dateOfBirth'));
  if (dob === INVALID_DATE || (dob && dob > ctx.today))
    issues.push({ field: 'dateOfBirth', issue: 'invalid_date' });
  const admission = parseDate(get('admissionDate'));
  if (admission === INVALID_DATE) issues.push({ field: 'admissionDate', issue: 'invalid_date' });

  const genderRaw = get('gender').toLowerCase();
  const gender = genderRaw ? (GENDERS[genderRaw] ?? 'invalid') : null;
  if (gender === 'invalid') issues.push({ field: 'gender', issue: 'invalid_gender' });

  const phoneRaw = get('parentPhone');
  const phone = phoneRaw ? PhoneSchema.safeParse(phoneRaw) : null;
  if (phone && !phone.success) issues.push({ field: 'parentPhone', issue: 'invalid_phone' });
  const email = get('parentEmail').toLowerCase();
  if (email && !EMAIL.test(email)) issues.push({ field: 'parentEmail', issue: 'invalid_email' });
  const relRaw = get('parentRelationship').toLowerCase();
  const relationship = relRaw ? (RELATIONSHIPS[relRaw] ?? 'invalid') : 'GUARDIAN';
  if (relationship === 'invalid')
    issues.push({ field: 'parentRelationship', issue: 'invalid_relationship' });
  const parentName = get('parentName');
  if ((phoneRaw || email) && !parentName) issues.push({ field: 'parentName', issue: 'required' });

  const batchName = get('batch');
  const batchId = batchName ? (ctx.batches.get(norm(batchName)) ?? null) : null;
  if (batchName && !batchId) issues.push({ field: 'batch', issue: 'unknown_batch' });

  const customFields: Record<string, string | number | null> = {};
  for (const f of ctx.customFields.filter((x) => !x.archived)) {
    const raw = get(`custom:${f.key}`);
    if (!raw) {
      if (f.required) issues.push({ field: `custom:${f.key}`, issue: 'required' });
      continue;
    }
    if (f.type === 'NUMBER') {
      const n = Number(raw.replace(/,/g, ''));
      if (Number.isFinite(n)) customFields[f.key] = n;
      else issues.push({ field: `custom:${f.key}`, issue: 'invalid_value' });
    } else if (f.type === 'DATE') {
      const d = parseDate(raw);
      if (typeof d === 'string') customFields[f.key] = d;
      else issues.push({ field: `custom:${f.key}`, issue: 'invalid_date' });
    } else if (f.type === 'SELECT') {
      const option = f.options.find((o) => norm(o.label) === norm(raw) || o.value === raw);
      if (option) customFields[f.key] = option.value;
      else issues.push({ field: `custom:${f.key}`, issue: 'invalid_value' });
    } else if ([...raw].length > 200) issues.push({ field: `custom:${f.key}`, issue: 'too_long' });
    else customFields[f.key] = raw;
  }

  if (issues.length || !name.success) return { student: null, issues };
  return {
    student: {
      fullName: name.data,
      preferredName: get('preferredName') || null,
      dateOfBirth: dob === INVALID_DATE ? null : dob,
      gender: gender as ParsedStudent['gender'],
      schoolName: get('schoolName') || null,
      grade: get('grade') || null,
      admissionDate: admission === INVALID_DATE ? null : admission,
      parent: parentName
        ? {
            fullName: parentName.normalize('NFC'),
            phone: phone?.success ? phone.data : null,
            email: email || null,
            relationship: relationship as NonNullable<ParsedStudent['parent']>['relationship'],
          }
        : null,
      batchId,
      customFields,
    },
    issues,
  };
}

/** Dedupe key (G-02): name + date of birth, else name + parent phone, else name alone. */
export function studentKey(s: {
  fullName: string;
  dateOfBirth: string | null;
  parentPhone: string | null;
}): string {
  const name = norm(s.fullName.normalize('NFC'));
  if (s.dateOfBirth) return `${name}|dob:${s.dateOfBirth}`;
  if (s.parentPhone) return `${name}|phone:${s.parentPhone}`;
  return `${name}|-`;
}

/** Text that a spreadsheet would run as a formula is prefixed so it stays text (CSV injection). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export { norm as normaliseHeader };
