import { describe, it, expect } from 'vitest';
import { parseShoptetFeedFromBuffer } from '../importers/ShoptetFeedParser';
import * as XLSX from 'xlsx';

describe('ShoptetFeedParser', () => {
  it('parses valid XLSX feed buffer correctly', async () => {
    // Vytvoříme testovací excel workbook
    const testData = [
      {
        code: 'TEST-SKU-1',
        name: 'Depilační vosk medový 100ml',
        manufacturer: 'Italwax',
        price: 159.5,
        ean: '8032835164512',
        internalNote: 'INCI, Vyrobeno',
      },
      {
        code: 'TEST-SKU-2',
        name: 'Cukrová pasta 400g',
        manufacturer: 'Epill Body',
        price: 240,
        ean: '8594189000012',
        internalNote: 'Top produkt',
      },
      {
        code: '', // Neplatný bez SKU
        name: 'Neplatný produkt',
        manufacturer: '',
        price: 100,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export produktů');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await parseShoptetFeedFromBuffer(buffer);

    expect(result.success).toBe(true);
    expect(result.format).toBe('xlsx');
    expect(result.products).toHaveLength(2);

    expect(result.products[0]).toEqual({
      sku: 'TEST-SKU-1',
      name: 'Depilační vosk medový 100ml',
      brand: 'Italwax',
      price: 159.5,
      ean: '8032835164512',
      note: 'INCI, Vyrobeno',
      rawDescription: undefined,
    });

    expect(result.products[1].sku).toBe('TEST-SKU-2');
    expect(result.products[1].price).toBe(240);
  });

  it('parses valid XML Shoptet feed format correctly', async () => {
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<SHOP>
  <SHOPITEM>
    <CODE>XML-SKU-100</CODE>
    <NAME><![CDATA[Profesionální ohřívač vosku]]></NAME>
    <MANUFACTURER>Biemme</MANUFACTURER>
    <PRICE>890</PRICE>
    <EAN>8012345678901</EAN>
    <DESCRIPTION>Popis produktu</DESCRIPTION>
  </SHOPITEM>
  <SHOPITEM>
    <CODE>XML-SKU-200</CODE>
    <NAME>Dřevěné špachtle</NAME>
    <MANUFACTURER>Ebtesama</MANUFACTURER>
    <PRICE_VAT>45.50</PRICE_VAT>
  </SHOPITEM>
</SHOP>`;

    const buffer = Buffer.from(xmlContent, 'utf8');
    const result = await parseShoptetFeedFromBuffer(buffer);

    expect(result.success).toBe(true);
    expect(result.format).toBe('xml');
    expect(result.products).toHaveLength(2);

    expect(result.products[0].sku).toBe('XML-SKU-100');
    expect(result.products[0].name).toBe('Profesionální ohřívač vosku');
    expect(result.products[0].brand).toBe('Biemme');
    expect(result.products[0].price).toBe(890);
    expect(result.products[0].ean).toBe('8012345678901');

    expect(result.products[1].sku).toBe('XML-SKU-200');
    expect(result.products[1].name).toBe('Dřevěné špachtle');
    expect(result.products[1].price).toBe(45.5);
  });
});

