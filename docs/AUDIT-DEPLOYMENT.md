# Opravy technického auditu a bezpečné nasazení

Tato verze mění autentizaci a databázové schéma. Pouhé nahrazení souborů nebo `git apply` bez migrace nestačí. Běžící instalace se sama nezmění. Změny nejprve ověřte na kopii databáze. Databáze, .env a tajné klíče nepatří do Gitu.

## Co se změnilo

- Aktualizované závislosti včetně Next.js a SheetJS; žádný `audit fix --force` při nasazení.
- Hesla scrypt, kompatibilní přihlášení starými hesly a automatický přepočet starého hashe. Nová hesla 12 až 256 znaků. Žádné automatické vytvoření účtu se známým heslem. Trvalé omezení počtu pokusů na účet.
- Relace v databázi. Odhlášení, smazání účtu a změna hesla relace ruší. Po nasazení se všichni jednou přihlásí znovu.
- Kontrola oprávnění na samotných serverových operacích a zálohách. Administrátorské nastavení není nabízeno běžným uživatelům.
- Databázová záloha používá VACUUM INTO skutečně používané databáze včetně WAL, nikoli kopii hardcoded dev.db. Soubor má privátní oprávnění.
- Verzované migrace a samostatné dočasné databáze všech testů.
- Feed pouze přes HTTPS, povolené hostitele, veřejné DNS adresy a připnutou cílovou adresu. Limity velikosti, času a přesměrování. Zámek souběžných synchronizací, transakční import a schválení, kontrola souběžné editace a GTIN kontrolní číslice.
- Cron pouze POST s Authorization: Bearer; starý výchozí klíč a klíč v URL nejsou přijímány. Příkaz v aplikaci je nutné znovu zkopírovat.
- Validace formulářů a importů, správné sloupce CSV/XLSX s prázdnou hlavičkou, odmítnutí duplicitních SKU. Nepodporované Shoptet API hlásí skutečný stav.
- AI má časový limit i na tělo odpovědi a limit velikosti odpovědi, nejvýše jeden současný požadavek. Příliš velký katalog přechází na ruční výběr. Zkrácení názvu je návrh ke schválení, kontroluje čísla a délku.
- PDF export je ve formuláři blokován při zjištěném přetečení bezpečnostního textu, limity počtu štítků, uvolňování blob URL. Nová historie ukládá obsah výrobků, šablonu i velikosti písma. Staré záznamy nemají zpětně doplnitelný snapshot.
- Stránkování katalogu na serveru, ochrana před přepsáním novějšího výsledku hledání, mobilní navigace a chybová stránka.
- Historie posledních 20 importů kategorií s možností načíst starou verzi do náhledu. Obnova je sloučení podle kódu, nemaže novější kategorie. NEURCENO nelze převést na automaticky schvalovanou kategorii.

## Doporučený postup na Dellu

1. Připravte samostatný checkout nové verze a nejprve proveďte `npm ci`. Zachovejte stávající .env mimo Git. DATABASE_URL musí být absolutní cesta ke správné produkční databázi.
2. Zastavte `stitkovac`: `sudo systemctl stop stitkovac`. Před změnou si uložte cestu původního checkoutu, jeho commit a konfiguraci služby. Nekopírujte běžící databázi samotným `cp`.
3. V novém checkoutu s produkční .env spusťte `npx prisma generate` a `npm run db:deploy`. Skript nejprve zálohuje existující databázi, u posledního schématu bez migrací označí baseline a aplikuje změny. Pokud rozpoznání selže, nepoužívejte reset ani ruční vymazání databáze.
4. Zkontrolujte zálohu a `DATABASE_URL`. Spusťte `npm run build`. Až úspěšný build dovoluje spustit službu.
5. Ověřte `sudo systemctl start stitkovac`, `systemctl status stitkovac`, `curl --fail http://127.0.0.1:3000/api/health`, přihlášení, seznam výrobků, náhled a tisk PDF, návrh bezpečnostního textu a testovací import. Cron nově používá POST a hlavičku Bearer.
6. Nikdy na existující produkci nespouštějte seed. Pro novou prázdnou instalaci vyžaduje seed vlastní BASIC_AUTH_PASSWORD; žádné známé heslo neexistuje.

Pro první zkoušku použijte kopii databáze vytvořenou SQLite zálohou, jiný DATABASE_URL a jiný port. Neprovádějte paralelní testovací importy do stejné produkční databáze.

## Zálohování a obnova

`npm run backup` vytvoří konzistentní soubor a ponechá 30 posledních automatických záloh. BACKUP_DIRECTORY může být mimo checkout. OFFSITE_BACKUP_DIRECTORY je volitelný již připojený zabezpečený vzdálený adresář; bez jeho konfigurace jsou zálohy pouze na stejném disku. Zálohy obsahují celý katalog, nastavení a přihlašovací údaje a musí mít omezený přístup. Nemají být ve veřejném webovém adresáři.

Přiložené jednotky v deploy/ lze po kontrole cest instalovat do /etc/systemd/system a zapnout timer. Je nutné ověřit skutečné spuštění a kopii mimo Dell. Samotné přidání souborů do repozitáře timer neinstaluje.

Obnovu provádějte se zastavenou aplikací. Nejprve zazálohujte aktuální databázi, prověřte `PRAGMA integrity_check` vybrané zálohy a její datum. Pak obnovte odpovídající verzi databáze a aplikace společně. Před nahrazením DB přesuňte stranou i případné soubory -wal a -shm; nesmí zůstat u obnoveného souboru. Zachovejte vlastníka maty a oprávnění 600. Ověřte zdraví, přihlášení, počet produktů a tisk. Zálohy před migrací ani JSON zálohy hromadných změn automatická retence nemaže.

## Co musí být ověřeno přímo v provozu

- HTTPS pro skutečný způsob přístupu. Aktuální LAN HTTP adresa přenáší přihlašování bez TLS; pro přístup zvenčí použijte existující Tailscale a HTTPS endpoint nebo reverzní proxy s certifikátem. Nevystavujte port 3000 ani Ollamu přímo do internetu.
- Externí monitor musí pravidelně kontrolovat /api/health a posílat upozornění nezávisle na Dellu. Endpoint ověřuje aplikaci a DB, nikoli tiskárnu nebo dostupnost Ollamy.
- Skutečně nastavit zálohu mimo Dell a provést zkušební obnovu.
- Zjistit příčinu fyzického vypínání, ověřit napájení, chlazení a BIOS. Aplikace nedokáže zaručit zapnutí vypnutého notebooku.
- Vizuálně otestovat tisk na používané tiskárně v měřítku 100 %, dvojité šablony, diakritiku, nejdelší texty a mobilní formuláře. Automatický build nenahrazuje kontrolu fyzického výtisku.

## Další samostatná práce

Zůstává postupné rozdělení zbývajících velkých komponent, které je vhodné provádět odděleně od bezpečnostních změn. Sdílený dialog nyní řeší Escape, Tab a vracení fokusu. Přímý editor kategorií a obnova hromadných změn jsou v Nastavení. Režim Ruční posouzení vyřadí kategorii z hromadného přiřazování; nemaže již přiřazené texty. PDF generátor sám odmítá oříznutí bezpečnostního a kontaktního textu. Zkracování názvu chrání čísla, ale sémantiku variant musí nadále potvrdit člověk. Konečné ověření těchto změn vyžaduje také uživatelský průchod nové verze a kontrolu fyzického výtisku.
