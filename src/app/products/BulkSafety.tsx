'use client';
import { useState } from 'react';
import { applyBulkSafetyAction, previewBulkSafetyAction } from '@/app/actions';

type Preview = Awaited<ReturnType<typeof previewBulkSafetyAction>>;
export default function BulkSafety({ onApplied }: { onApplied: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function run(apply: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      if (apply && preview && confirmed) {
        const result = await applyBulkSafetyAction(preview.token);
        setMessage(`Aktualizováno ${result.changed} produktů. Ostatní texty zůstaly zachované.${result.backup ? ` Záloha: prisma/safety-backups/${result.backup}` : ''}`);
        setPreview(null); setConfirmed(false); onApplied();
      } else {
        setPreview(await previewBulkSafetyAction()); setConfirmed(false);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Operace se nezdařila.'); setPreview(null); setConfirmed(false); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3" aria-label="Hromadné bezpečnostní texty">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Hromadně aktualizovat bezpečnostní texty</h2>
        <p className="text-sm text-slate-600">Celý katalog, bez ohledu na filtr. Uložené kategorie a pravidla z Excelu, bez AI. Nerozpoznané a ručně posuzované výrobky zůstanou beze změny.</p></div>
      <button disabled={busy} onClick={() => run(false)} className="rounded-lg bg-white border border-indigo-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Zpracovávám...' : 'Zobrazit náhled změn'}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {preview && <div className="space-y-3 text-sm">
      <p role="status">Celkem: {preview.total}. Změnit: <strong>{preview.changed}</strong>. Stejný text: {preview.unchanged}. Nerozpoznáno: {preview.unknown}. Vyžaduje posouzení: {preview.review}.</p>
      {preview.sample.length > 0 && <details><summary className="cursor-pointer font-semibold">Ukázka změn (max. 20 produktů)</summary>
        <div className="max-h-80 overflow-auto mt-2 space-y-3">{preview.sample.map(item => <article key={item.sku} className="rounded-lg bg-white p-3 border border-indigo-100">
          <h3 className="font-bold">{item.sku}: {item.name} ({item.code})</h3>
          <p className="mt-1 text-slate-500 whitespace-pre-wrap">Původní: {item.before || '(prázdný)'}</p>
          <p className="mt-1 whitespace-pre-wrap">Nový: {item.after}</p>
        </article>)}</div></details>}
      {preview.changed > 0 && <>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Souhlasím s přepsáním {preview.changed} textů podle náhledu. Před změnou se uloží záloha původních textů.</label>
        <button disabled={busy || !confirmed} onClick={() => run(true)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50">Aktualizovat {preview.changed} produktů</button>
      </>}
      <button disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }} className="ml-3 underline">Zavřít náhled</button>
    </div>}
  </section>;
}
