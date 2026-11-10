import * as XLSX from 'xlsx';
import { stripHtmlToPlainText } from '../safetyClassifier';

export interface FeedProductItem {
  sku: string;
  name: string;
  brand?: string;
  price?: number;
  ean?: string;
  note?: string;
  description?: string;
  rawDescription?: string;
}

export interface ParseFeedResult {
  success: boolean;
  products: FeedProductItem[];
  error?: string;
  format?: 'xlsx' | 'xml' | 'unknown';
}

/**
 * Parsuje Shoptet feed - automaticky detekuje zda jde o XLSX/XLS soubor nebo XML feed.
 */
export async function parseShoptetFeedFromBuffer(buffer: ArrayBuffer | Buffer): Promise<ParseFeedResult> {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  
  // Zkontrolujeme, zda buffer začíná XML tagem
  const prefix = bytes.subarray(0, 200).toString('utf8').trim();
  const isXml = prefix.startsWith('<?xml') || prefix.includes('<SHOP>') || prefix.includes('<SHOPITEM>');

  if (isXml) {
    try {
      const xmlText = bytes.toString('utf8');
      const products = parseShoptetXml(xmlText);
      return {
        success: true,
        products,
        format: 'xml',
      };
    } catch (err: unknown) {
      return {
        success: false,
        products: [],
        error: `Chyba při parsování XML feedu: ${err instanceof Error ? err.message : String(err)}`,
        format: 'xml',
      };
    }
  }

  // Zpracujeme jako XLSX / XLS / CSV pomocí SheetJS
  try {
    const workbook = XLSX.read(bytes, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
      return {
        success: false,
        products: [],
        error: 'Soubor feedu neobsahuje žádný platný list.',
        format: 'xlsx',
      };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const products: FeedProductItem[] = [];

    for (const row of rawRows) {
      // Hledání kódu/SKU
      const rawCode = row['code'] ?? row['CODE'] ?? row['kód'] ?? row['Kód'] ?? row['sku'] ?? row['SKU'];
      const sku = rawCode !== undefined && rawCode !== null ? String(rawCode).trim() : '';

      // Hledání názvu
      const rawName = row['name'] ?? row['NAME'] ?? row['název'] ?? row['Název'] ?? row['title'];
      const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';

      if (!sku || !name) {
        continue; // Přeskočíme řádky bez SKU nebo názvu
      }

      // Hledání značky / výrobce
      const rawBrand = row['manufacturer'] ?? row['MANUFACTURER'] ?? row['výrobce'] ?? row['Výrobce'] ?? row['brand'] ?? row['Brand'];
      const brand = rawBrand !== undefined && rawBrand !== null ? String(rawBrand).trim() : undefined;

      // Hledání ceny (priorita: price, pak pricelist:2:price, pak standardní)
      let price: number | undefined = undefined;
      const rawPrice = row['price'] ?? row['PRICE'] ?? row['cena'] ?? row['Cena'] ?? row['pricelist:2:price'];
      if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
        const cleanPriceStr = String(rawPrice).replace(/\s+/g, '').replace(',', '.');
        const parsedPrice = parseFloat(cleanPriceStr);
        if (!isNaN(parsedPrice)) {
          price = Math.round(parsedPrice * 100) / 100;
        }
      }

      // Hledání EAN
      const rawEan = row['ean'] ?? row['EAN'] ?? row['Ean'];
      const ean = rawEan !== undefined && rawEan !== null ? String(rawEan).trim() : undefined;

      // Hledání interní poznámky / popisu
      const rawNote = row['internalNote'] ?? row['INTERNAL_NOTE'] ?? row['interniPoznamka'] ?? row['note'];
      const note = rawNote !== undefined && rawNote !== null ? String(rawNote).trim() : undefined;

      const rawDescriptionVal =
        row['shortDescription'] ??
        row['SHORT_DESCRIPTION'] ??
        row['kratkyPopis'] ??
        row['description'] ??
        row['DESCRIPTION'] ??
        row['popis'] ??
        row['Popis'];
      const rawDescriptionStr =
        rawDescriptionVal !== undefined && rawDescriptionVal !== null ? String(rawDescriptionVal).trim() : '';
      const cleanedDescription = rawDescriptionStr ? stripHtmlToPlainText(rawDescriptionStr, 4000) : undefined;

      products.push({
        sku,
        name,
        brand: brand || undefined,
        price,
        ean: ean || undefined,
        note: note || undefined,
        description: cleanedDescription || undefined,
        rawDescription: cleanedDescription || undefined,
      });
    }

    return {
      success: true,
      products,
      format: 'xlsx',
    };
  } catch (err: unknown) {
    return {
      success: false,
      products: [],
      error: `Chyba při zpracování tabulky z feedu: ${err instanceof Error ? err.message : String(err)}`,
      format: 'xlsx',
    };
  }
}

/**
 * Jednoduchý, robustní parser pro standardní Shoptet XML feed (<SHOPITEM>...</SHOPITEM>)
 */
function parseShoptetXml(xml: string): FeedProductItem[] {
  const products: FeedProductItem[] = [];
  const itemRegex = /<SHOPITEM>([\s\S]*?)<\/SHOPITEM>/gi;
  let match: RegExpExecArray | null;

  const extractTag = (itemStr: string, tagName: string): string => {
    // Zvládne <TAG>text</TAG> i <TAG><![CDATA[text]]></TAG>
    const tagRegex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const m = tagRegex.exec(itemStr);
    if (!m || !m[1]) return '';
    let val = m[1].trim();
    if (val.startsWith('<![CDATA[') && val.endsWith(']]>')) {
      val = val.substring(9, val.length - 3).trim();
    }
    return val;
  };

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemBlock = match[1];
    const sku = extractTag(itemBlock, 'CODE');
    const name = extractTag(itemBlock, 'NAME');
    if (!sku || !name) continue;

    const brand = extractTag(itemBlock, 'MANUFACTURER') || undefined;
    const rawPrice = extractTag(itemBlock, 'PRICE_VAT') || extractTag(itemBlock, 'PRICE');
    let price: number | undefined = undefined;
    if (rawPrice) {
      const num = parseFloat(rawPrice.replace(/\s+/g, '').replace(',', '.'));
      if (!isNaN(num)) price = Math.round(num * 100) / 100;
    }

    const ean = extractTag(itemBlock, 'EAN') || undefined;
    const rawDescXml = extractTag(itemBlock, 'SHORT_DESCRIPTION') || extractTag(itemBlock, 'DESCRIPTION') || '';
    const description = rawDescXml ? stripHtmlToPlainText(rawDescXml, 4000) || undefined : undefined;

    products.push({
      sku,
      name,
      brand,
      price,
      ean,
      description,
      rawDescription: description,
    });
  }

  return products;
}

/**
 * Stáhne feed z URL a vrátí naparsované produkty
 */
export async function fetchAndParseShoptetFeed(feedUrl: string): Promise<ParseFeedResult> {
  try {
    // Pokud má Shoptet exportní URL parametr stripTags=1, Shoptet odstraní značky <script>,
    // ale ponechá uvnitř surový JavaScript kód. Stažením bez stripTags=1 získáme čisté HTML,
    // ze kterého stripHtmlToPlainText bezpečně odstraní celé <script> a <style> bloky.
    const effectiveUrl = feedUrl.replace(/([?&])stripTags=1(&|$)/i, '$1').replace(/[?&]$/, '');

    const response = await fetch(effectiveUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Stitkovac-Sync/1.0',
        'Accept': '*/*',
      },
      // Cache vypneme pro aktuální data
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        success: false,
        products: [],
        error: `HTTP chyba při stahování feedu: ${response.status} ${response.statusText}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    return await parseShoptetFeedFromBuffer(arrayBuffer);
  } catch (err: unknown) {
    return {
      success: false,
      products: [],
      error: `Nepodařilo se připojit k feedu: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

