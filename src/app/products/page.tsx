import { Suspense } from 'react';
import ProductsClient from './ProductsClient';
import { RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8 text-center flex flex-col items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-500">Načítání produktového katalogu...</p>
        </div>
      }
    >
      <ProductsClient />
    </Suspense>
  );
}
