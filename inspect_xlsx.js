const XLSX = require('xlsx');
const path = require('path');

const files = [
  {
    name: 'TenderHack_Контракты_20260313.xlsx',
    label: 'Contracts (Контракты)',
  },
  {
    name: 'TenderHack_СТЕ_20260313.xlsx',
    label: 'STE (СТЕ - Standardized Commodity Units)',
  },
];

const BASE_DIR = path.join(__dirname);

for (const file of files) {
  const filePath = path.join(BASE_DIR, file.name);
  console.log('='.repeat(80));
  console.log(`FILE: ${file.label}`);
  console.log(`Path: ${filePath}`);
  console.log('='.repeat(80));

  const workbook = XLSX.readFile(filePath);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: "${sheetName}" ---`);

    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const totalRows = range.e.r; // 0-indexed, so this is the last row index
    const totalDataRows = totalRows; // row 0 is header, so data rows = totalRows

    console.log(`Total rows (including header): ${totalRows + 1}`);
    console.log(`Data rows (excluding header):  ${totalDataRows}`);

    // Read as array of arrays to inspect raw structure
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rawData.length === 0) {
      console.log('(empty sheet)');
      continue;
    }

    // Headers (first row)
    const headers = rawData[0];
    console.log(`\nColumn count: ${headers.length}`);
    console.log('\nColumn Headers:');
    headers.forEach((h, i) => {
      const colLetter = XLSX.utils.encode_col(i);
      console.log(`  [${colLetter}] ${JSON.stringify(h)}`);
    });

    // First 5 data rows
    const previewRows = rawData.slice(1, 6);
    console.log(`\nFirst ${previewRows.length} data rows:`);
    previewRows.forEach((row, rowIdx) => {
      console.log(`\n  Row ${rowIdx + 1}:`);
      headers.forEach((h, colIdx) => {
        const val = row[colIdx];
        if (val !== '' && val !== undefined && val !== null) {
          console.log(`    ${JSON.stringify(h)}: ${JSON.stringify(val)}`);
        }
      });
    });
  }

  console.log('');
}
