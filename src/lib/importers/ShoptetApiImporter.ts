import { ProductImporter, ImportResult } from './ProductImporter';

export class ShoptetApiImporter implements ProductImporter {
  name = 'Shoptet API';

  async parse(): Promise<ImportResult> {
    // API Importer doesn't parse local files, but we implement the interface.
    // In a real environment, we would fetch products from the Shoptet API.
    return {
      headers: [],
      rows: [],
      success: false,
      error: 'Integrace se Shoptet API není v této verzi naimplementována. Nastavte API klíč v Nastavení a kontaktujte administrátora.',
    };
  }

  // Future method for Shoptet API fetching
  async fetchFromApi(apiKey: string, eshopId: string): Promise<ImportResult> {
    void apiKey; void eshopId;
    return { headers: [], rows: [], success: false, error: 'Shoptet API zatím není implementováno. Použijte XML/XLSX feed.' };
  }
}
