<!-- BEGIN:nextjs-agent-rules -->
# Next.js & Project Rules for AI Coding Agents

Tento projekt je webová aplikace pro tisk produktových etiket na A4 archy postavená na Next.js (App Router), React 19, Prisma (SQLite), lokální Ollamě (`qwen3:4b`), Vitest a Tailwind CSS v4.

---

## 🛠️ Vývojové a sestavovací příkazy
- Spuštění dev serveru: `npm run dev`
- Produkční build: `npm run build`
- Spuštění unit testů (Vitest – běží offline): `npm test`
- Spuštění živých testů proti lokální Ollamě: `$env:RUN_LIVE_OLLAMA_TESTS="1"; npx vitest run src/lib/__tests__/safetyLiveOllama.test.ts`
- Typová kontrola (TypeScript): `npx tsc --noEmit`
- Kontrola linteru (ESLint): `npm run lint`
- Generování Prisma klienta: `npx prisma generate`
- Migrace/aktualizace databáze: `npx prisma db push`
- Naplnění databáze ukázkovými daty (Seeding): `npx prisma db seed`
- Otevření databázového prohlížeče (Prisma Studio): `npx prisma studio`

---

## 📐 Kódovací standardy a konvence
- **Typová bezpečnost:** Vždy pište plně typovaný TypeScript kód, nepoužívejte explicitní `any` tam, kde je možné typ určit.
- **Server Actions:** Veškerá komunikace s databází, synchronizace feedu a volání lokální Ollamy probíhá přes Server Actions v `src/app/actions.ts`.
- **Klientské komponenty:** Všechny interaktivní komponenty v Next.js musí začínat direktivou `'use client'`.
- **Zdroj bezpečnostních textů (AI Asistent):** Soubor `data/safety/Depilujeme_bezpecnostni_texty.xlsx` je jediným ručně udržovaným zdrojem šablon a bezpečnostních textů (načítán přes `src/lib/safetyTemplates.ts`). Nikdy nevytvářejte duplicitní seznam textů v kódu a neumisťujte Excel do `public/`.
- **Lokální Ollama:** Volání modelu probíhá výhradně na serveru v `src/lib/safetyClassifier.ts` pomocí serverových proměnných `OLLAMA_BASE_URL` a `OLLAMA_MODEL` (nikdy s prefixem `NEXT_PUBLIC_`).
- **Generování PDF a přetečení:** Generování PDF probíhá na straně klienta v `src/lib/pdfGenerator.ts` v kombinaci s výpočty rozvržení v milimetrech a detekcí přetečení textu (`detectSafetyTextOverflows`).
- **Diakritika:** Znaky s diakritikou se nesmí tisknout systémovým písmem Helvetica (diakritika by byla poškozena), ale vždy se musí použít načtené Roboto písmo (`public/fonts/Roboto-*.ttf`).
- **Citlivé údaje a veřejný repozitář:** Nikdy necommitujte `.env`, databázové soubory `*.db` ani privátní URL odkazy s autentizačními hashi (např. `SHOPTET_FEED_URL`) přímo do zdrojového kódu.
<!-- END:nextjs-agent-rules -->
