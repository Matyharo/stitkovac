import { describe, it, expect } from 'vitest';
import { findBestHeader } from '../importers/ProductImporter';
import { ShoptetApiImporter } from '../importers/ShoptetApiImporter';

describe('ProductImporter Heuristics', () => {
  it('finds exact match header for SKU', () => {
    const headers = ['Kód produktu', 'Název', 'Cena', 'SKU'];
    const result = findBestHeader(headers, ['sku', 'kód', 'kod']);
    expect(result).toBe('SKU');
  });

  it('finds fuzzy/partial match header for product name', () => {
    const headers = ['ID', 'Název zboží', 'Cena s DPH'];
    const result = findBestHeader(headers, ['name', 'název', 'nazev']);
    expect(result).toBe('Název zboží');
  });

  it('returns empty string if no keyword matches', () => {
    const headers = ['ColA', 'ColB', 'ColC'];
    const result = findBestHeader(headers, ['ean', 'bar code']);
    expect(result).toBe('');
  });

  it('handles case-insensitive matching correctly', () => {
    const headers = ['PRODUCT_NAME', 'PRICE_EUR', 'VÝROBCE'];
    const brand = findBestHeader(headers, ['brand', 'výrobce', 'vyrobce']);
    expect(brand).toBe('VÝROBCE');
  });
});

describe('ShoptetApiImporter', () => {
  it('returns appropriate response for parse without active file', async () => {
    const importer = new ShoptetApiImporter();
    const result = await importer.parse();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Shoptet API');
  });

  it('simulates API data fetching successfully', async () => {
    const importer = new ShoptetApiImporter();
    const result = await importer.fetchFromApi('test-key', '12345');
    expect(result.success).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]['Kód']).toBe('SH-001');
  });
});
