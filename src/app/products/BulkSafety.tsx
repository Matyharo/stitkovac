'use client';
import { useState } from 'react';
import { ShieldCheck, LoaderCircle } from 'lucide-react';
import MaintenanceDialog from '@/components/MaintenanceDialog';
import { applyBulkSafetyAction, previewBulkSafetyAction } from '@/app/actions';

type Preview = Awaited<ReturnType<typeof previewBulkSafetyAction>>;
export default function BulkSafety({ onApplied }: { onApplied: () => void }) {
  const [open, setOpen] = useState(false);
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
        setMessage(`Aktualizováno ${result.changed} produktů. Ostatní texty zůstaly zachované.${result.backup ? ` Záloha byla automaticky uložena.` : ''}`);
        setPreview(null); setConfirmed(false); onApplied();
      } else {
        setPreview(await previewBulkSafetyAction()); setConfirmed(false);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Operace se nezdařila.'); setPreview(null); setConfirmed(false); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => { setOpen(true); setPreview(null); setConfirmed(false); run(false); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700">
      <ShieldCheck className="h-4 w-4" />Aktualizovat bezp. texty
    </button>
    <MaintenanceDialog open={open} title="Hromadná aktualizace bezpečnostních textů" busy={busy} onClose={() => setOpen(false)}>
    <p className="text-slate-500 leading-relaxed">Aktualizace celého katalogu podle potvrzených kategorií a pravidel. Nerozpoznané výrobky zůstanou beze změny.</p>
    {busy && <p role="status" className="flex items-center gap-2 text-indigo-700"><LoaderCircle className="h-4 w-4 animate-spin" />Zpracovávám...</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {preview && <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2" role="status">{[
        ['K aktualizaci', preview.changed], ['Beze změny', preview.unchanged], ['Nerozpoznáno', preview.unknown], ['K posouzení', preview.review],
      ].map(([label, count]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">{label}</span><strong className="text-xl text-slate-900">{count}</strong></div>)}</div>
      <p className="text-xs text-slate-400">Celkem {preview.total} produktů. Aktuální filtr seznamu se nepoužívá.</p>
      {preview.sample.length > 0 && <details><summary className="cursor-pointer font-semibold">Ukázka změn (max. 20 produktů)</summary>
        <div className="max-h-64 overflow-auto mt-2 space-y-3">{preview.sample.map(item => <article key={item.sku} className="rounded-lg bg-white p-3 border border-indigo-100">
          <h3 className="font-bold">{item.sku}: {item.name} ({item.code})</h3>
          <p className="mt-1 text-slate-500 whitespace-pre-wrap">Původní: {item.before || '(prázdný)'}</p>
          <p className="mt-1 whitespace-pre-wrap">Nový: {item.after}</p>
        </article>)}</div></details>}
      {preview.changed > 0 && <>
        <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-slate-600 leading-relaxed"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Souhlasím s přepsáním {preview.changed} textů podle náhledu. Před změnou se uloží záloha původních textů.</label>
        <button type="button" disabled={busy || !confirmed} onClick={() => run(true)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50">Aktualizovat {preview.changed} produktů</button>
      </>}

    </div>}
    {error && <button type="button" disabled={busy} onClick={() => run(false)} className="font-semibold text-indigo-700 underline">Načíst nový náhled</button>}
    </MaintenanceDialog>
  </>;
}
