import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Sidebar from '@/components/Sidebar';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
});

export const metadata: Metadata = {
  title: 'Generátor produktových štítků',
  description: 'Interní aplikace pro tisk samolepicích produktových štítků',
  authors: [{ name: 'Ing. Matouš Ferstl' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full overflow-hidden flex bg-slate-50 text-slate-900 font-sans">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50/50">
          {children}
        </main>
      </body>
    </html>
  );
}
