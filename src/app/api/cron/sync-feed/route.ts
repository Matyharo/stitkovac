import { NextRequest, NextResponse } from 'next/server';
import { getFeedConfig, syncProductsFromFeed } from '@/lib/feedSync';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
  try {
    const config = await getFeedConfig();
    const searchParams = request.nextUrl.searchParams;
    const secretParam = searchParams.get('secret');
    const authHeader = request.headers.get('authorization');
    const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    const providedSecret = secretParam || bearerSecret;

    // Pokud je nastaven tajný klíč a neshoduje se, vrátíme 401
    if (config.cronSecret && providedSecret !== config.cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Neautorizovaný přístup. Zadejte platný tajný klíč (secret).',
        },
        { status: 401 }
      );
    }

    const result = await syncProductsFromFeed();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Neočekávaná chyba při zpracování cron požadavku.',
      },
      { status: 500 }
    );
  }
}

