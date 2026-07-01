export interface ImportResult {
  headers: string[];
  rows: Record<string, string>[]; // Raw rows from the file, e.g. { "Název": "Produkt A", "Kód": "SKU-1" }
  success: boolean;
  error?: string;
}

export interface ProductImporter {
  name: string;
  parse(file: File): Promise<ImportResult>;
}
