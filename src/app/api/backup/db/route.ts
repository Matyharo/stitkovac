import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Soubor databáze nebyl nalezen.' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(dbPath);
    const dateStr = new Date().toISOString().split('T')[0];
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename=stitkovac_db_backup_${dateStr}.db`,
      },
    });
  } catch (error: any) {
    console.error('Error creating database backup:', error);
    return NextResponse.json(
      { error: error.message || 'Chyba při stahování zálohy databáze.' },
      { status: 500 }
    );
  }
}
