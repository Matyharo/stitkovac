'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div role="alert" className="m-8 rounded-xl border border-rose-200 bg-white p-6"><h1 className="font-bold text-slate-900">Stránku se nepodařilo načíst</h1><p className="mt-2 text-sm text-slate-500">Vaše uložená data zůstala zachovaná. Zkuste načtení zopakovat.</p><button type="button" onClick={reset} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white">Zkusit znovu</button></div>;
}
