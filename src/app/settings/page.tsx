import { assertAuthenticated } from '@/lib/auth';
import SettingsClient from './SettingsClient';
export default async function SettingsPage() {
  const user = await assertAuthenticated();
  if (user.role !== 'admin') return <div className="p-8"><h1 className="text-2xl font-bold">Nastavení</h1><p className="mt-3">Správu aplikace zajišťuje administrátor.</p></div>;
  return <SettingsClient />;
}
