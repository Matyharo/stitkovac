<!-- BEGIN:nextjs-agent-rules -->
# Next.js & Project Rules for AI Coding Agents

Tento projekt je webová aplikace pro tisk produktových etiket na A4 archy postavená na Next.js (App Router), React 19, Prisma (SQLite), Vitest a Tailwind CSS v4.

---

## 🛠️ Vývojové a sestavovací příkazy
- Spuštění dev serveru: `npm run dev`
- Produkční build: `npm run build`
- Spuštění unit testů (Vitest): `npm test`
- Typová kontrola (TypeScript): `npx tsc --noEmit`
- Kontrola linteru (ESLint): `npm run lint`
- Generování Prisma klienta: `npx prisma generate`
- Migrace/aktualizace databáze: `npx prisma db push`
- Naplnění databáze ukázkovými daty (Seeding): `npx prisma db seed`
- Otevření databázového prohlížeče (Prisma Studio): `npx prisma studio`

---

## 📐 Kódovací standardy a konvence
- **Typová bezpečnost:** Vždy pište plně typovaný TypeScript kód, nepoužívejte explicitní `any` tam, kde je možné typ určit.
- **Server Actions:** Veškerá komunikace s databází a backend logika probíhá přes Server Actions v `src/app/actions.ts`.
- **Klientské komponenty:** Všechny interaktivní komponenty v Next.js musí začínat direktivou `'use client'`.
- **Generování PDF:** Generování PDF probíhá výhradně na straně klienta v `src/lib/pdfGenerator.ts` v kombinaci se standardizovanými výpočty rozvržení (v milimetrech).
- **Diakritika:** Znaky s diakritikou se nesmí tisknout systémovým písmem Helvetica (diakritika by byla poškozena), ale vždy se musí použít načtené Roboto písmo.
<!-- END:nextjs-agent-rules -->
