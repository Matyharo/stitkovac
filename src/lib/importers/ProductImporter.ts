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

/**
 * Heuristic search to auto-map CSV/Excel headers to product fields.
 */
export function findBestHeader(headersList: string[], keywords: string[]): string {
  for (const keyword of keywords) {
    const match = headersList.find(
      (h) => h.toLowerCase() === keyword || h.toLowerCase().includes(keyword)
    );
    if (match) return match;
  }
  return '';
}
