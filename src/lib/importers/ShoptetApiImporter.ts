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
    try {
      // Example call: fetch(`https://api.shoptet.cz/v1/products?eshopId=${eshopId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } })
      // For now, return a placeholder error or dummy data if needed
      console.log('Fetching from Shoptet with keys:', { apiKey, eshopId });
      
      // We can return a dummy success to demonstrate how it will look when integrated
      return {
        headers: ['Kód', 'Název produktu', 'Značka', 'Cena', 'Bezpečnostní text', 'Kontakt', 'EAN', 'Poznámka'],
        rows: [
          {
            'Kód': 'SH-001',
            'Název produktu': 'Shoptet Produkt A',
            'Značka': 'Shoptet Brand',
            'Cena': '299',
            'Bezpečnostní text': 'Uchovávejte mimo dosah dětí.',
            'Kontakt': 'Shoptet Distributor s.r.o.',
            'EAN': '8590000000012',
            'Poznámka': 'Importováno z API'
          }
        ],
        success: true
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chyba připojení';
      return {
        headers: [],
        rows: [],
        success: false,
        error: `Chyba API: ${msg}`
      };
    }
  }
}
