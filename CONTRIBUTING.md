# Příspěvky a vývojové konvence (Contributing Guidelines)

Děkujeme za zájem o rozvoj projektu **Štítkovač**! Tento dokument popisuje základy vývoje, konvence kódu a postup při podávání příspěvků.

---

## 🛠️ Vývojové prostředí a požadavky

- **Node.js**: 20.x nebo vyšší
- **Nástroj pro balíčky**: `npm`
- **Databáze**: SQLite (spravováno přes Prisma ORM)

### Lokální příprava projektu

1. **Klonování a instalace závislostí:**
   ```bash
   git clone https://github.com/Matyharo/stitkovac.git
   cd stitkovac
   npm install
   ```

2. **Inicializace databáze:**
   ```bash
   npx prisma db push
   ```

3. **Spuštění vývojového serveru:**
   ```bash
   npm run dev
   ```

---

## 🧪 Kontrola kvality kódu

Před vytvořením Pull Requestu se prosím ujistěte, že všechny automatizované kontroly procházejí bez chyb:

- **TypeScript typová kontrola:** `npx tsc --noEmit`
- **ESLint kontrola:** `npm run lint`
- **Unit testy:** `npm test`
- **Produkční build:** `npm run build`

---

## 📐 Konvence vývoje

1. **TypeScript strict mode**: Veškerý nový kód musí být striktně typován. Vyhýbejte se použití explicitního `any`.
2. **Commit zprávy**: Doporučujeme konvenci Conventional Commits (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`).
3. **Komponenty a UI**: Využívejte Tailwind CSS v4 a ikony z knihovny `lucide-react`.

---

## 📄 Licence

Odesláním příspěvku souhlasíte s tím, že Váš kód bude licencován pod [MIT Licencí](LICENSE).
