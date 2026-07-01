# CLAUDE.md - Příkazy a pravidla pro AI asistenty

Tento projekt je webová aplikace pro tisk štítků postavená na Next.js (App Router), Prisma (SQLite) a Tailwind CSS.

## Vývojové a sestavovací příkazy
*   Spuštění dev serveru: `npm run dev`
*   Produkční build: `npm run build`
*   Spuštění produkčního serveru: `npm start`
*   Typová kontrola (TypeScript): `npx tsc --noEmit`
*   Generování Prisma klienta: `npx prisma generate`
*   Migrace/aktualizace databáze: `npx prisma db push`
*   Otevření databázového prohlížeče (Prisma Studio): `npx prisma studio`

## Kódovací standardy a konvence
*   **Typová bezpečnost:** Vždy pište plně typovaný TypeScript kód, nepoužívejte `any` tam, kde je možné typ určit.
*   **Server Actions:** Veškerá komunikace s databází a backend logika musí jít přes Server Actions v `src/app/actions.ts`.
*   **Klientské komponenty:** Všechny interaktivní komponenty v Next.js musí začínat direktivou `'use client'`.
*   **Generování PDF:** Generování PDF probíhá výhradně na straně klienta v `src/lib/pdfGenerator.ts` v kombinaci se standardizovanými výpočty rozvržení (v milimetrech).
*   **Diakritika:** Znaky s diakritikou se nesmí tisknout systémovým písmem Helvetica (diakritika by byla poškozena), ale vždy se musí použít načtené Roboto písmo.
