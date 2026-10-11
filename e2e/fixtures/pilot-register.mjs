#!/usr/bin/env node
// A synthetic academy register for the import journey (G-02). Not real people: invented Indian
// names, made as messy as registers kept in Excel usually are. A real, anonymised register from a
// pilot academy (A10) is still needed before 7P (docs/plans/phase-4.md, C-111).
//
//   node e2e/fixtures/pilot-register.mjs     → pilot-register.csv (committed) + pilot-register.xlsx
//
// The .xlsx is generated, not committed (no binaries in the repository, CLAUDE.md §16); the E2E
// spec builds it before use. Both files hold the same rows; in the .xlsx some dates are real date
// cells and some mobiles are numbers, as Excel stores them.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HEADERS = [
  'S.No',
  'Name of the Student',
  'D.O.B',
  'Gender',
  'Std',
  'School',
  'Father/Mother Name',
  'Relation',
  'Mobile No.',
  'Email ID',
];

// [name, dob, gender, std, school, parent, relation, mobile, email]
const VALID = [
  [
    'Aditi Ramesh',
    '14/03/2014',
    'F',
    '5',
    'DAV Public School',
    'Ramesh Krishnan',
    'Father',
    '98401 22311',
    '',
  ],
  [
    'Arjun Venkat',
    '02-11-2013',
    'M',
    '6',
    'Chettinad Vidyashram',
    'Venkatesh S',
    'Father',
    '+91 98402 33422',
    'venkat.s@example.in',
  ],
  [
    'Meenakshi Sundaram',
    '2015-07-21',
    'Female',
    '4',
    'PSBB',
    'Sundaram P',
    'father',
    '094440 55533',
    '',
  ],
  [
    'Rohan Gupta',
    '09.01.2012',
    'Male',
    '7',
    'Kendriya Vidyalaya',
    'Sunita Gupta',
    'Mother',
    '919884066644',
    'sunita.gupta@example.in',
  ],
  [
    'Kavya Nair',
    '5-Jun-2015',
    'F',
    '4',
    'Bhavan Vidyalaya',
    'Lakshmi Nair',
    'Mother',
    '(+91) 97910-77755',
    '',
  ],
  [
    'Ishaan Reddy',
    '23/08/2013',
    'M',
    '6',
    'Vels Global',
    'Srinivas Reddy',
    'Dad',
    '9791088866',
    'srinivas.r@example.in',
  ],
  [
    'Saanvi Iyer',
    '17 April 2014',
    'Girl',
    '5',
    'Sishya',
    'Gayathri Iyer',
    'Amma',
    '98843 99977',
    '',
  ],
  [
    'Vihaan Malhotra',
    '30/12/2012',
    'Boy',
    '7',
    'DPS',
    'Neha Malhotra',
    'Mother',
    '+919600111222',
    'neha.m@example.in',
  ],
  [
    'Ananya Krishnan',
    '11/02/2016',
    'F',
    '3',
    'Vidya Mandir',
    'Ramesh Krishnan',
    'Father',
    '98401 22311',
    '',
  ],
  [
    'Pranav Subramanian',
    '08-05-2014',
    'M',
    '5',
    'PSBB',
    'Subramanian K',
    'Father',
    '9600222333',
    '',
  ],
  [
    'Diya Chatterjee',
    '19/09/2013',
    'F',
    '6',
    'St. Michael’s',
    'Rupa Chatterjee',
    'Mother',
    '096002 33444',
    'rupa.c@example.in',
  ],
  [
    'Aryan Mehta',
    '2012-03-04',
    'M',
    '8',
    'Kendriya Vidyalaya',
    'Hitesh Mehta',
    'Father',
    '+91 96003 44555',
    '',
  ],
  [
    'Nila Murugan',
    '25/11/2015',
    'F',
    '4',
    'Govt. Higher Sec. School',
    'Murugan R',
    'Appa',
    '9600455666',
    '',
  ],
  [
    'Kabir Thomas',
    '01/01/2014',
    'M',
    '5',
    'Don Bosco',
    'Mary Thomas',
    'Mother',
    '98410 56677',
    'mary.thomas@example.in',
  ],
  [
    'Tanvi Joshi',
    '13-Oct-2013',
    'F',
    '6',
    'DAV Public School',
    'Prakash Joshi',
    'Father',
    '9841067788',
    '',
  ],
  ['Siddharth Rao', '27/06/2012', 'M', '7', 'Sishya', 'Anitha Rao', 'Mother', '98410 78899', ''],
  [
    'Lakshmi Priya',
    '06/04/2015',
    'F',
    '4',
    'Bhavan Vidyalaya',
    'Senthil Kumar',
    'Father',
    '919841089900',
    'senthil.k@example.in',
  ],
  [
    'Mohammed Faiz',
    '14/02/2013',
    'M',
    '6',
    'Crescent School',
    'Abdul Rahman',
    'Father',
    '9841090011',
    '',
  ],
  [
    'Zara Sheikh',
    '22/07/2014',
    'F',
    '5',
    'Crescent School',
    'Abdul Rahman',
    'Father',
    '9841090011',
    '',
  ],
  [
    'Harini Balaji',
    '03.03.2016',
    'F',
    '3',
    'Vidya Mandir',
    'Balaji N',
    'Father',
    '+91 99400 11223',
    '',
  ],
  [
    'Adithya Varma',
    '18/10/2012',
    'M',
    '8',
    'Chettinad Vidyashram',
    'Varma K',
    'Guardian',
    '9940022334',
    '',
  ],
  [
    'Riya Desai',
    '09/09/2014',
    'F',
    '5',
    'DPS',
    'Pooja Desai',
    'Mother',
    '99400 33445',
    'pooja.desai@example.in',
  ],
  ['Karthik Raja', '29/01/2013', 'M', '6', 'Velammal', 'Raja M', 'Father', '099400 44556', ''],
  [
    'Sneha Pillai',
    '15-Aug-2014',
    'F',
    '5',
    'Bhavan Vidyalaya',
    'Anil Pillai',
    'Father',
    '9940055667',
    '',
  ],
  [
    'Yash Agarwal',
    '21/12/2011',
    'M',
    '8',
    'Kendriya Vidyalaya',
    'Rekha Agarwal',
    'Mother',
    '99400 66778',
    '',
  ],
  [
    'Divya Shankar',
    '07/07/2015',
    'F',
    '4',
    'PSBB',
    'Shankar V',
    'Father',
    '+919940077889',
    'shankar.v@example.in',
  ],
  ['Rahul Dsouza', '12/05/2013', 'M', '6', 'Don Bosco', 'Grace Dsouza', 'Mother', '9940088990', ''],
  [
    'Pooja Kumari',
    '28/02/2014',
    'F',
    '5',
    'Govt. Higher Sec. School',
    'Ravi Kumar',
    'Father',
    '99401 00112',
    '',
  ],
  [
    'Aakash Singh',
    '16-03-2012',
    'M',
    '7',
    'DAV Public School',
    'Manpreet Singh',
    'Father',
    '8939011223',
    '',
  ],
  [
    'Swetha Natarajan',
    '04/11/2015',
    'F',
    '4',
    'Sishya',
    'Natarajan G',
    'Father',
    '89390 22334',
    'natarajan.g@example.in',
  ],
  [
    'Gautham Menon',
    '26/06/2013',
    'M',
    '6',
    'Vels Global',
    'Sreeja Menon',
    'Mother',
    '+91 89390 33445',
    '',
  ],
  [
    'Fathima Begum',
    '10/10/2014',
    'F',
    '5',
    'Crescent School',
    'Shabana Begum',
    'Mother',
    '8939044556',
    '',
  ],
  [
    'Nikhil Bose',
    '31/08/2012',
    'M',
    '7',
    'St. Michael’s',
    'Arup Bose',
    'Father',
    '089390 55667',
    '',
  ],
  [
    'Shreya Kulkarni',
    '19-Jan-2016',
    'F',
    '3',
    'Vidya Mandir',
    'Vinay Kulkarni',
    'Father',
    '8939066778',
    '',
  ],
  [
    'Dhruv Saxena',
    '05/05/2013',
    'M',
    '6',
    'DPS',
    'Kavita Saxena',
    'Mother',
    '89390 77889',
    'kavita.s@example.in',
  ],
  [
    'Janani Ravi',
    '24/12/2014',
    'F',
    '5',
    'Velammal',
    'Ravi Chandran',
    'Father',
    '919939088990',
    '',
  ],
  [
    'Arnav Kapoor',
    '13/04/2012',
    'M',
    '8',
    'Kendriya Vidyalaya',
    'Ritu Kapoor',
    'Mother',
    '7550111223',
    '',
  ],
  [
    'Preethi Selvam',
    '08/08/2015',
    'F',
    '4',
    'Govt. Higher Sec. School',
    'Selvam A',
    'Father',
    '75501 22334',
    '',
  ],
  [
    'அருண் குமார்',
    '20/02/2014',
    'M',
    '5',
    'Govt. Higher Sec. School',
    'குமார் எஸ்',
    'Father',
    '7550133445',
    '',
  ],
  [
    'अनन्या शर्मा',
    '11/11/2013',
    'F',
    '6',
    'Kendriya Vidyalaya',
    'सुनील शर्मा',
    'Father',
    '+91 75501 44556',
    '',
  ],
];

// The same students again, written differently (phone and date formats): duplicates in the file.
const DUPLICATES = [
  [
    'Aditi Ramesh',
    '2014-03-14',
    'F',
    '5',
    'DAV Public School',
    'Ramesh Krishnan',
    'Father',
    '+91 98401 22311',
    '',
  ],
  [
    'Kavya Nair',
    '05/06/2015',
    'F',
    '4',
    'Bhavan Vidyalaya',
    'Lakshmi Nair',
    'Mother',
    '9791077755',
    '',
  ],
  [
    'Mohammed Faiz',
    '14-Feb-2013',
    'M',
    '6',
    'Crescent School',
    'Abdul Rahman',
    'Father',
    '098410 90011',
    '',
  ],
];

// Rows with problems the preview must explain in words.
const PROBLEMS = [
  ['Bhavya Srinivasan', '12/03/2014', 'F', '5', 'PSBB', 'Srinivasan T', 'Father', '98400 1234', ''], // 9 digits
  ['Charan Teja', '31/02/2013', 'M', '6', 'Vels Global', 'Teja Rao', 'Father', '9884012121', ''], // no 31 Feb
  ['Esha Bhatt', '01/01/2031', 'F', '1', 'DPS', 'Mehul Bhatt', 'Father', '9884023232', ''], // future
  ['', '14/05/2014', 'M', '5', 'Don Bosco', 'Joseph Antony', 'Father', '9884034343', ''], // no name
  [
    'Gokul Prasad',
    '17/09/2013',
    'M',
    '6',
    'Sishya',
    'Prasad R',
    'Father',
    '9884045454',
    'prasad.r@gmail',
  ], // email
];

/** Expected preview counts on an academy that has none of these students yet. */
export const EXPECTED = {
  rows: VALID.length + DUPLICATES.length + PROBLEMS.length,
  valid: VALID.length,
  problems: DUPLICATES.length + PROBLEMS.length,
};

/** Data rows in file order, with blank rows mixed in (spreadsheets always have some). */
export function rows() {
  const all = [...VALID.slice(0, 15), ...DUPLICATES.slice(0, 1), ...VALID.slice(15, 30)];
  all.push(
    ...PROBLEMS.slice(0, 3),
    ...DUPLICATES.slice(1),
    ...VALID.slice(30),
    ...PROBLEMS.slice(3),
  );
  const out = [];
  all.forEach((r, i) => {
    out.push([String(i + 1), ...r]);
    if (i === 9 || i === 24 || i === 40) out.push([]); // blank rows
  });
  out.push([], []); // trailing blank rows
  return out;
}

function csvCell(v) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csv() {
  return `${[HEADERS, ...rows()].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** The same register as an Excel workbook: DD/MM/YYYY dates as date cells, plain mobiles as numbers. */
export async function xlsx() {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students 2026-27');
  sheet.addRow(HEADERS);
  for (const r of rows()) {
    if (r.length === 0) {
      sheet.addRow([]);
      continue;
    }
    const cells = [...r];
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[2]);
    if (dmy) {
      const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
      // Excel keeps an impossible date (31/02) as text; only real dates become date cells.
      if (date.getUTCDate() === Number(dmy[1])) cells[2] = date;
    }
    if (/^[6-9]\d{9}$/.test(cells[8])) cells[8] = Number(cells[8]);
    cells[0] = Number(cells[0]);
    sheet.addRow(cells);
  }
  sheet.getColumn(3).numFmt = 'dd/mm/yyyy';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, 'pilot-register.csv'), csv());
  writeFileSync(join(here, 'pilot-register.xlsx'), await xlsx());
  process.stdout.write(
    `pilot-register.csv / .xlsx: ${EXPECTED.rows} rows (${EXPECTED.valid} valid).` + '\n',
  );
}
