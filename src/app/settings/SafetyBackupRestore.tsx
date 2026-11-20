'use client';
import { useState } from 'react';
import MaintenanceDialog from '@/components/MaintenanceDialog';
export default function SafetyBackupRestore() {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<string[]>([]); const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<{ count: number; skipped: number; token: string } | null>(null);
  const [message, setMessage] = useState('');
  async function request(apply = false) {
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/safety-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, mode: apply ? 'apply' : 'preview', token: preview?.token }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (apply) { setPreview(null); setMessage(`Obnoveno ${data.count} textů. Přeskočeno ${data.skipped} později změněných nebo chybějících produktů.`); } else setPreview(data); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Operace se nezdařila.'); } finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <button className="font-semibold text-indigo-700" type="button" onClick={async () => { setOpen(true); setBusy(true); setPreview(null); setMessage(''); try { const response = await fetch('/api/safety-backups'); const data = await response.json(); if (!response.ok) throw new Error(data.error); setFiles(data); } catch { setMessage('Zálohy se nepodařilo načíst.'); } finally { setBusy(false); } }}>Obnovit hromadnou změnu bezpečnostních textů</button>
    <MaintenanceDialog open={open} title="Obnova bezpečnostních textů" busy={busy} onClose={() => setOpen(false)}>
      <p className="text-sm text-slate-600">Obnoví se jen texty, které od hromadné změny nikdo neupravil. Před obnovou vznikne úplná databázová záloha. Výběr kategorie obnovených produktů bude vyžadovat nové potvrzení.</p>
      <label className="mt-4 block text-sm">Záloha<select disabled={busy} className="mt-1 w-full rounded-lg border p-2" value={filename} onChange={event => { setFilename(event.target.value); setPreview(null); }}><option value="">Vyberte zálohu</option>{files.map(file => <option key={file}>{file}</option>)}</select></label>
      <button type="button" disabled={!filename || busy} onClick={() => request()} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-40">Zobrazit náhled obnovy</button>
      {preview && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><p>K obnově: {preview.count}. Přeskočeno: {preview.skipped}.</p><button type="button" disabled={busy || !preview.count} onClick={() => request(true)} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40">Potvrdit obnovu textů</button></div>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </MaintenanceDialog>
  </section>;
}
