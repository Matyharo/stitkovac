# Štítkovač Spoko - Generátor produktových štítků

Interní webová aplikace pro e-shopy, která usnadňuje nahrávání produktových dat z Excelu/CSV, správu katalogu, správu šablon štítků a přesné generování tiskových PDF na archy A4 (3 sloupce × 7 řad).

Aplikace je plně lokalizována do češtiny a připravena pro tisk na etikety typu **Spoko S060630380** (nebo ekvivalenty Avery L7160) s rozměrem **63,5 × 38,1 mm**.

## Technologický stoh

*   **Framework:** Next.js (App Router, React 19, TypeScript)
*   **Styling:** Tailwind CSS v4
*   **Databáze:** SQLite (lokální soubor)
*   **ORM:** Prisma
*   **Import dat:** SheetJS (xlsx)
*   **Generování PDF:** pdf-lib (klientské vykreslování s českou diakritikou)

---

## Rychlý start (Instalace a spuštění)

Pro spuštění aplikace na lokálním počítači postupujte podle následujících kroků:

### 1. Klonování/přejití do složky projektu
Ujistěte se, že se nacházíte v kořenovém adresáři projektu.

### 2. Instalace závislostí
Spusťte instalaci všech balíčků:
```bash
npm install
```

### 3. Příprava databáze
Inicializujte SQLite databázi a vygenerujte Prisma klienta:
```bash
npx prisma db push
```
Tento příkaz vytvoří soubor databáze `prisma/dev.db` a nastaví tabulky `Product`, `LabelTemplate` a `PrintJob`.

### 4. Spuštění vývojového serveru
Spusťte Next.js aplikaci:
```bash
npm run dev
```

Aplikace bude dostupná na adrese: [http://localhost:3000](http://localhost:3000).

---

## Hlavní funkce a průvodce používáním

### 1. Import produktů z tabulky
1. V levém menu přejděte na **Import produktů**.
2. Nahrajte soubor `.xlsx` (Excel) nebo `.csv`.
3. Systém načte sloupce a nabídne **Mapování sloupců**. Díky zabudované heuristice se pole jako Kód (SKU), Název, Cena nebo Značka automaticky spárují, pokud mají podobné názvy.
4. Zkontrolujte v **Náhledu**, zda se data správně napárovala (např. zda se cena správně převedla na číslo).
5. Klikněte na **Uložit do databáze**. Pokud produkt s daným SKU již existuje, aktualizuje se (upsert), jinak se vytvoří nový.

### 2. Správa katalogu produktů
V sekci **Správa produktů** můžete:
* Vyhledávat produkty okamžitě podle SKU, názvu nebo značky.
* Upravovat jednotlivé produkty (název, cenu, bezpečnostní varování, kontakt na distributora či interní poznámky).
* Přidávat nové položky ručně pomocí formuláře.
* Mazat nepoužívané produkty.

### 3. Tisk štítků (Arch A4)
1. Přejděte do sekce **Tisk štítků**.
2. Zvolte šablonu (výchozí je *Spoko S060630380*).
3. Pomocí vyhledávacího pole vyhledejte a přidejte produkty, které chcete vytisknout.
4. Zadejte počet štítků (množství) pro každý produkt.
5. **Startovní pozice:** Na zobrazeném 3x7 archu klikněte na libovolnou pozici (1 až 21). Pokud máte napůl spotřebovaný arch štítků, např. s 3 vyloupnutými štítky, klikněte na pozici **4**. Tisk začne přesně na 4. pozici a první 3 pozice zůstanou prázdné.
6. Klikněte na **Vygenerovat tiskové PDF**.
7. Po úspěšném vygenerování se objeví zelené tlačítko **Otevřít PDF v tiskovém náhledu**. PDF se otevře v nové záložce, odkud ho můžete ihned vytisknout na Vaší tiskárně (při tisku z prohlížeče nezapomeňte nastavit měřítko tisku na **100 %** nebo **Skutečná velikost**, nikoli *Přizpůsobit stránce*).

### 4. Šablony vzhledu a kalibrace tiskárny
Každá tiskárna může mít drobnou mechanickou odchylku při podávání papíru (např. posunutý tisk o 1 mm nahoru). V sekci **Šablony vzhledu** můžete:
* Zapínat/vypínat zobrazení jednotlivých polí (např. tisknout bez EAN nebo bez loga značky).
* Měnit velikost písma jednotlivých ostatních částí (např. zvětšit cenu).
* **Kalibrovat tisk:** Upravovat v milimetrech `levý okraj`, `horní okraj`, `vodorovnou mezeru` nebo `svislou mezeru`. Hodnoty se ihned projeví na nově vygenerovaných PDF!

### 5. Nastavení a údržba
V sekci **Nastavení** můžete:
* **Nahrát ukázková data:** Jedním kliknutím nahrajete 5 testovacích produktů s popisy a cenami, abyste si mohli aplikaci ihned vyzkoušet bez nahrávání vlastních souborů.
* **Vyčistit katalog:** Kompletně smaže všechny produkty z SQLite databáze.
* **Shoptet API:** Předpřipravené rozhraní pro budoucí napojení e-shopu přes API klíč.

---

## Architektura integrace a Shoptet API
Aplikace striktně odděluje parsování souborů a importy od zbytku logiky. V adresáři `src/lib/importers/` naleznete:
1. `ProductImporter.ts`: Společné TypeScript rozhraní pro všechny importéry.
2. `CsvImporter.ts`: Implementace SheetJS pro CSV soubory.
3. `XlsxImporter.ts`: Implementace SheetJS pro XLSX/XLS soubory.
4. `ShoptetApiImporter.ts`: Prázdná implementace (placeholder) připravená na přímé napojení Shoptet API.

Aplikace zpracovává výstupy z těchto importérů unifikovaně přes mapovací obrazovku, takže zavedení nového Shoptet API importeru neovlivní žádnou jinou část kódu.

---

## Technická dokumentace
Komplexní přehled o architektuře, databázovém schématu, kalibraci tiskových archů a rozšiřování aplikace naleznete v samostatném souboru [DOCUMENTATION.md](file:///c:/Users/ferst/Desktop/Stitkovac/DOCUMENTATION.md).
