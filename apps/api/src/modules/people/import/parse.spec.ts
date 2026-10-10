import type { CustomField } from '@academybee/contracts';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  csvCell,
  detectType,
  INVALID_DATE,
  parseDate,
  parseRows,
  studentKey,
  suggestMapping,
  UnreadableFileError,
  validateRow,
} from './parse.js';

const text = (s: string) => new TextEncoder().encode(s);
const TEMPLATE = {
  fullName: 'Student name',
  parentPhone: 'Parent mobile',
  dateOfBirth: 'Date of birth',
};
const BELT: CustomField = {
  id: '019a0000-0000-7000-8000-000000000001',
  key: 'belt',
  label: 'Belt colour',
  type: 'SELECT',
  options: [{ value: 'opt_1', label: 'White' }],
  required: false,
  sortOrder: 0,
  archived: false,
};
const ctx = {
  customFields: [BELT],
  batches: new Map([['evening juniors', 'b1']]),
  today: '2026-10-10',
};

describe('import parsing (G-02, C-101)', () => {
  it('detects CSV and XLSX from the bytes, not the name', () => {
    expect(detectType(text('name\nAarav'))).toBe('csv');
    expect(detectType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe('xlsx');
    expect(() => detectType(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0]))).toThrow(
      UnreadableFileError,
    );
  });

  it('reads CSV with a BOM, quotes and blank lines; Windows-1252 too', async () => {
    const rows = await parseRows(text('﻿Name,Phone\n"Rao, Kiran",9840011111\n\n'), 'csv');
    expect(rows).toEqual([
      ['Name', 'Phone'],
      ['Rao, Kiran', '9840011111'],
    ]);
    const latin = new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x52, 0xe9, 0x6d, 0x79]); // "Name\nRémy"
    expect((await parseRows(latin, 'csv'))[1]).toEqual(['Rémy']);
  });

  it('reads XLSX: dates as YYYY-MM-DD and formulas as their values', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Students');
    sheet.addRow(['Name', 'DOB', 'Fee']);
    sheet.addRow(['Aarav', new Date(Date.UTC(2016, 3, 2)), { formula: '1+1', result: 2 }]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    expect(await parseRows(bytes, 'xlsx')).toEqual([
      ['Name', 'DOB', 'Fee'],
      ['Aarav', '2016-04-02', '2'],
    ]);
  });

  it('refuses a broken or oversized zip before inflating it', async () => {
    await expect(
      parseRows(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]), 'xlsx'),
    ).rejects.toThrow(UnreadableFileError);
  });

  it('suggests columns from template headers, synonyms and custom field labels', () => {
    const mapping = suggestMapping(
      ['Student Name', 'Mobile', 'D.O.B', 'Belt colour', 'Father Name', 'Batch'],
      TEMPLATE,
      [BELT],
    );
    expect(mapping).toMatchObject({
      fullName: 0,
      parentPhone: 1,
      dateOfBirth: 2,
      'custom:belt': 3,
      parentName: 4,
      batch: 5,
    });
  });

  it('parses Indian date order and refuses impossible dates', () => {
    expect(parseDate('02/04/2016')).toBe('2016-04-02');
    expect(parseDate('2016-04-02')).toBe('2016-04-02');
    expect(parseDate('31/02/2016')).toBe(INVALID_DATE);
    expect(parseDate('yesterday')).toBe(INVALID_DATE);
    expect(parseDate('')).toBeNull();
  });

  it('validates a row with the same rules as Add Student, issue by issue', () => {
    const mapping = {
      fullName: 0,
      dateOfBirth: 1,
      parentName: 2,
      parentPhone: 3,
      batch: 4,
      'custom:belt': 5,
    };
    const ok = validateRow(
      ['ആദിത്യ', '02/04/2016', 'Lakshmi', '98400 11111', 'Evening Juniors', 'white'],
      mapping,
      ctx,
    );
    expect(ok.issues).toEqual([]);
    expect(ok.student).toMatchObject({
      fullName: 'ആദിത്യ',
      dateOfBirth: '2016-04-02',
      parent: { fullName: 'Lakshmi', phone: '+919840011111', relationship: 'GUARDIAN' },
      batchId: 'b1',
      customFields: { belt: 'opt_1' },
    });
    const bad = validateRow(['', '2030-01-01', '', '12345', 'Nope', 'Black'], mapping, ctx);
    expect(bad.student).toBeNull();
    expect(bad.issues.map((i) => `${i.field}:${i.issue}`).sort()).toEqual([
      'batch:unknown_batch',
      'custom:belt:invalid_value',
      'dateOfBirth:invalid_date',
      'fullName:required',
      'parentName:required',
      'parentPhone:invalid_phone',
    ]);
  });

  it('dedupes by name and date of birth, else name and parent phone', () => {
    expect(
      studentKey({ fullName: ' Aarav  Sharma', dateOfBirth: '2016-04-02', parentPhone: null }),
    ).toBe(studentKey({ fullName: 'aarav sharma', dateOfBirth: '2016-04-02', parentPhone: '+91' }));
    expect(
      studentKey({ fullName: 'Aarav', dateOfBirth: null, parentPhone: '+919800000001' }),
    ).not.toBe(studentKey({ fullName: 'Aarav', dateOfBirth: null, parentPhone: '+919800000002' }));
  });

  it('keeps report cells that a spreadsheet would run as formulas as text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98400')).toBe("'+91 98400");
    expect(csvCell('Rao, Kiran')).toBe('"Rao, Kiran"');
    expect(csvCell('plain')).toBe('plain');
  });
});
