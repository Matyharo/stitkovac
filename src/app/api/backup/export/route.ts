import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      orderBy: { sku: 'asc' },
    });

    // Map db fields to readable column headers
    const rows = products.map((p) => ({
      'Kód (SKU)': p.sku,
      'Název': p.name,
      'Popis': p.description || '',
      'Značka': p.brand || '',
      'Cena': p.price !== null && p.price !== undefined ? p.price : '',
      'Bezpečnostní text': p.safetyText || '',
      'Kontaktní údaje': p.contactText || '',
      'EAN': p.ean || '',
      'Poznámka': p.note || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog');

    // Define custom column widths to make it look premium when opened
    const colWidths = [
      { wch: 15 }, // SKU
      { wch: 45 }, // Název
      { wch: 50 }, // Popis
      { wch: 15 }, // Značka
      { wch: 10 }, // Cena
      { wch: 50 }, // Bezpečnostní text
      { wch: 40 }, // Kontaktní údaje
      { wch: 15 }, // EAN
      { wch: 30 }, // Poznámka
    ];
    worksheet['!cols'] = colWidths;

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=stitkovac_katalog_${dateStr}.xlsx`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting catalog:', error);
    return NextResponse.json(
      { error: error.message || 'Chyba při exportu katalogu.' },
      { status: 500 }
    );
  }
}
