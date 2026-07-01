'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Package,
  Printer,
  Palette,
  Settings,
  Tag,
  LogOut
} from 'lucide-react';
import { logout } from '@/app/actions';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirm(false);
    const res = await logout();
    if (res.success) {
      router.push('/login');
      router.refresh();
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Import produktů', href: '/import', icon: FileSpreadsheet },
    { name: 'Správa produktů', href: '/products', icon: Package },
    { name: 'Tisk štítků', href: '/print', icon: Printer },
    { name: 'Šablony vzhledu', href: '/templates', icon: Palette },
    { name: 'Nastavení', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 h-screen sticky top-0 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0 z-30">
      {/* Brand Header */}
      <Link href="/" className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/40 gap-3 hover:bg-slate-950/60 transition-colors group">
        <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-md shadow-indigo-600/20 transition-transform group-hover:scale-105">
          <Tag className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide bg-gradient-to-r from-indigo-200 via-indigo-100 to-white bg-clip-text text-transparent transition-colors group-hover:text-indigo-100">
            Generátor štítků
          </h1>
          <p className="text-[10px] text-slate-400 font-medium">Interní e-shop systém</p>
        </div>
      </Link>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-indigo-200 rounded-r-md" />
              )}
              <Icon className={`w-4 h-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                isActive ? 'text-indigo-200' : 'text-slate-400 group-hover:text-slate-300'
              }`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleLogout}
          type="button"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Odhlásit se
        </button>
      </div>

      {/* App Version Info Footer */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500 bg-slate-950/20 text-center font-medium space-y-0.5">
        <div>Verze 1.0.0</div>
        <div className="text-slate-400">Vytvořil: Ing. Matouš Ferstl</div>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800 text-left">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <LogOut className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Odhlásit se?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Opravdu se chcete odhlásit ze systému Generátor štítků? Budete muset znovu zadat své přihlašovací údaje.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="text-sm font-semibold text-slate-500 px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Storno
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Odhlásit se
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
