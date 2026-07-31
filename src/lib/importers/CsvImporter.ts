import { ProductImporter, ImportResult } from './ProductImporter';
import * as XLSX from 'xlsx';

export class CsvImporter implements ProductImporter {
  name = 'CSV Importer';

  async parse(file: File): Promise<ImportResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            resolve({ headers: [], rows: [], success: false, error: 'Nepodařilo se načíst obsah souboru.' });
            return;
          }

          // Use SheetJS to read. It auto-detects csv delimiter and encoding.
          const workbook = XLSX.read(data, { type: 'array', codepage: 65001 /* UTF-8 */ });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          if (!worksheet) {
            resolve({ headers: [], rows: [], success: false, error: 'Soubor neobsahuje žádné listy.' });
            return;
          }

          // sheet_to_json with header: 1 returns an array of arrays representing rows
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
          
          if (rawRows.length === 0) {
            resolve({ headers: [], rows: [], success: true });
            return;
          }

          // Read headers from first row
          const headers = (rawRows[0] as unknown[]).map(h => String(h || '').trim()).filter(h => h.length > 0);
          const rows: Record<string, string>[] = [];

          for (let i = 1; i < rawRows.length; i++) {
            const rawRow = rawRows[i];
            if (!rawRow || rawRow.length === 0) continue;
            
            const row: Record<string, string> = {};
            let hasData = false;
            
            headers.forEach((header, index) => {
              const val = rawRow[index];
              const stringVal = val !== undefined && val !== null ? String(val).trim() : '';
              row[header] = stringVal;
              if (stringVal) hasData = true;
            });

            if (hasData) {
              rows.push(row);
            }
          }

          resolve({ headers, rows, success: true });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Neočekávaná chyba při zpracování CSV souboru.';
          resolve({
            headers: [],
            rows: [],
            success: false,
            error: errorMessage,
          });
        }
      };
      reader.onerror = () => {
        resolve({ headers: [], rows: [], success: false, error: 'Chyba při čtení souboru ze systému.' });
      };
      reader.readAsArrayBuffer(file);
    });
  }
}
