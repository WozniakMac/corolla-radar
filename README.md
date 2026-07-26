# Corolla Radar

Prywatny radar zakupowy dla Toyoty Corolli Touring Sports. MVP prezentuje ranking 0–100, filtry, historię publikacji i uzasadnienie wyniku.

Widok „Leasing” przelicza orientacyjny harmonogram i realny koszt po odliczeniu
VAT dla profilu JDG na ryczałcie. Rozróżnia FV 23% od VAT-marża, użytek mieszany
od wyłącznie firmowego oraz sprzedaż zagraniczną NP z prawem do odliczenia od
sprzedaży zwolnionej. Parametry kalkulatora są zapisywane lokalnie w przeglądarce.
Domyślny scenariusz zakłada firmowy wykup po cenie z harmonogramu. Przy wykupie
prywatnym kalkulator stosuje prognozowaną cenę rynkową; umowną cenę 1% można
wybrać tylko jako pisemnie potwierdzony wyjątek. Dodatkowy budżet uwzględnia
OC/AC/NNW, GAP oraz serwis przez cały okres umowy; paliwo, opony i nieplanowane
naprawy pozostają poza kalkulacją.

## Uruchomienie

```bash
nvm use
npm install
npm run dev
```

Frontend działa pod `http://127.0.0.1:5173`, a API Express pod `http://127.0.0.1:4174`.

## Struktura

- `src/components` — komponenty interfejsu React;
- `src/hooks` — komunikacja frontendu z API;
- `src/scoring.ts` — deterministyczne reguły rankingu;
- `server/index.ts` — API Express i kolejka importu;
- `server/parser.ts` — pobieranie i ekstrakcja ofert;
- `server/store.ts` — trwały magazyn JSON w `data/store.json`.
- `data/snapshots` — skompresowane, pełne HTML-e odwiedzonych ofert.

Formatowanie całego projektu: `npm run format`. Kontrola bez zmian: `npm run format:check`.
Pełna kontrola typów frontendu i backendu: `npm run typecheck`.

## Pobieranie ofert

Jednorazowy skan wszystkich źródeł: `npm run scan`. Pojedyncze źródło, np. `npm run scan -- otomoto` albo `npm run scan -- pewneauto`.

Adaptery używają dynamicznej paginacji bez domyślnego limitu stron ani ofert. Przechodzą dalej, dopóki kolejna strona zawiera nowe URL-e; zatrzymują się na pustej lub powtórzonej stronie albo na odpowiedzi 404. Opcjonalne zmienne `SCAN_MAX_PAGES`, `SCAN_DISCOVERY_LIMIT` i `SCAN_CANDIDATE_LIMIT` mogą działać jako awaryjne bezpieczniki; wartość `0` oznacza brak limitu.

Obsługiwane adaptery: Toyota Pewne Auto, OTOMOTO i OLX. Każdy cykl najpierw wykrywa wszystkie dostępne bezpośrednie URL-e, potem otwiera i weryfikuje każdego kandydata.

Każda otwarta strona oferty jest zapisywana w całości jako skompresowany snapshot HTML — także wtedy, gdy oferta zostanie odrzucona przez bieżący parser. Po zmianie reguł ekstrakcji można ponownie przeliczyć wszystkie najnowsze snapshoty bez łączenia się z portalami:

```bash
npm run reprocess
```

To samo udostępnia `POST /api/snapshots/reprocess`. Snapshoty są identyfikowane skrótem treści, więc identyczny HTML nie zajmuje ponownie miejsca. Retencję można ograniczyć przez `SNAPSHOT_RETENTION_DAYS` i `SNAPSHOT_VERSIONS_PER_URL`. Wartość `0` wyłącza dane ograniczenie; najnowszy snapshot każdego URL-u jest zawsze zachowywany.

Automatyczny harmonogram można włączyć zmiennymi z `.env.example`:

```bash
ENABLE_SCHEDULED_SCAN=true SCAN_INTERVAL_MINUTES=360 npm run server
```

Portale mogą zmieniać HTML, regulaminy i zabezpieczenia. Błędy adapterów są widoczne przez `GET /api/sources` i w panelu źródeł. Aplikacja nie obchodzi CAPTCHA ani logowania.

Oferty Toyota Pewne Auto z numerem rejestracyjnym, VIN-em i datą pierwszej rejestracji są kolejno sprawdzane w usłudze Historia Pojazdu, ale tylko gdy znajdują się w aktualnym top 10 rankingu. Worker przed każdym zapytaniem przelicza ranking. Działa tylko przy `ENABLE_CEPIK=true`, domyślnie nie częściej niż raz na 300 sekund, nie ponawia zakończonego VIN-u i nie obchodzi CAPTCHA. Wynik oraz oś czasu są zapisywane przy samochodzie; ręczne ponowienie udostępnia `POST /api/cars/:id/cepik` i również czeka, aż auto znajdzie się w top 10.

Niepełne oferty trafiają do trwałej kolejki widocznej w aplikacji. OpenAI nigdy nie uruchamia się automatycznie: użytkownik może przetworzyć jedną ofertę albo wszystkie oczekujące. Zakończony URL nie jest przetwarzany ponownie podczas kolejnych skanów; wymaga użycia przycisku „Przetwórz ponownie”. Worker wywołuje bezpośrednio OpenAI Responses API i wymusza odpowiedź zgodną ze ścisłym schematem JSON. Wynik o pewności poniżej 0,8 jest ignorowany i nigdy nie może nadpisać jawnej informacji o sedanie, hatchbacku, SUV-ie ani Corolli Cross.

Widok „Doradca TOP 10” uruchamia osobną, ręczną analizę zakupową. Backend
odtwarza ranking z bieżących filtrów przesłanych przez interfejs i wymaga
dokładnie dziesięciu kwalifikujących się aut. OpenAI otrzymuje wyłącznie ten
zamknięty zestaw wraz z punktacją, dowodami, historią cen, aktywnymi
publikacjami i dostępnym podsumowaniem CEPiK. Przed uruchomieniem modelu
aplikacja ponownie pobiera wszystkie aktywne strony wybranych aut oraz do
czterech zdjęć każdego egzemplarza. Obrazy są przekazywane do Responses API
jako wejścia obrazowe, z jednoznacznym przypisaniem pliku do `carId`;
tymczasowe pliki są usuwane po analizie. Liczbę zdjęć można ustawić przez
`PURCHASE_ANALYSIS_IMAGES_PER_CAR` w zakresie 1–6. Ścisły schemat oraz walidacja
po odpowiedzi zabraniają pominięcia, podmiany i duplikowania `carId`. Wynik
zawiera jednego niezależnie rekomendowanego zwycięzcę oraz ocenę każdego auta
bez zmiany składu ani kolejności TOP 10 radaru, osobną ocenę zdjęć, ryzyka, plan
weryfikacji i — gdy dane na to pozwalają — cel negocjacyjny. Interfejs
pokazuje faktyczną liczbę odświeżonych stron i obejrzanych zdjęć, więc częściowa
inspekcja nie jest przedstawiana jako pełna. Analiza nie uruchamia się
automatycznie i wymaga `OPENAI_API_KEY`.

Podczas analizy zakupowej model ma również narzędzie Computer Use połączone z
osobną instancją Chromium uruchomioną przez Playwright w trybie headless. Model
może klikać, przewijać i oglądać aktualne strony ogłoszeń, a po każdej serii
akcji otrzymuje nowy zrzut ekranu. Przeglądarka działa bez rozszerzeń, dostępu do
lokalnych plików i odziedziczonych zmiennych środowiskowych. Nawigacja głównej
ramki jest ograniczona do dokładnych adresów ogłoszeń przygotowanego TOP 10,
żądania modyfikujące i pobieranie plików są blokowane, a treść stron jest
traktowana jako niezaufana. Ustawiony przez `OPENAI_MODEL` model musi obsługiwać
narzędzie `computer`. Pętla przeglądarkowa korzysta z `previous_response_id` i
`store: true`, aby nie przesyłać ponownie całej historii zrzutów przy każdym
kroku; zwykłe wywołania bez przeglądarki pozostają przy `store: false`.

Publiczny obraz dla `linux/amd64` i `linux/arm64` jest dostępny jako `ghcr.io/wozniakmac/corolla-radar:latest`. Przed `docker compose up -d` ustaw `OPENAI_API_KEY` oraz prywatny `NTFY_URL` w pliku `.env` obok `compose.yaml`. Kontener łączy się bezpośrednio z OpenAI Responses API i nie instaluje Codex CLI, nie potrzebuje `codex login`, `CODEX_HOME`, repozytorium Git ani bubblewrapa. Domyślny model to `gpt-5.6-sol`; można go zmienić przez `OPENAI_MODEL`, a poziom rozumowania przez `OPENAI_REASONING_EFFORT`. Bez klucza skan nadal działa, ale API odrzuci ręczne uruchomienie analizy z czytelnym błędem. Nie publikuj klucza ani adresu topicu ntfy w repozytorium.

Warstwa runtime bazuje na oficjalnym obrazie Playwright `v1.61.1-noble`,
zgodnym z wersją biblioteki przypiętą w projekcie. Build sprawdza, czy
oczekiwany executable Chromium rzeczywiście istnieje w `/ms-playwright`.
Chromium działa domyślnie z `CHROMIUM_SANDBOX=false`, ponieważ typowe hosty
kontenerowe blokują wymagane user namespaces. Sandbox można włączyć przez
`CHROMIUM_SANDBOX=true` dopiero na hoście skonfigurowanym zgodnie z wymaganiami
Playwrighta.

Jeśli ruch wychodzi przez firmowe proxy przechwytujące TLS, zamontuj jego
certyfikat CA w kontenerze i ustaw `NODE_EXTRA_CA_CERTS` na ścieżkę wewnątrz
kontenera. Compose przekazuje również `HTTPS_PROXY`, `HTTP_PROXY` i `NO_PROXY`.
Przykładowe mapowanie to
`./company-ca.pem:/etc/ssl/certs/company-ca.pem:ro` oraz
`NODE_EXTRA_CA_CERTS=/etc/ssl/certs/company-ca.pem`. Nie wyłączaj weryfikacji
TLS.

Panel nie ma warstwy logowania i jest przeznaczony do uruchamiania wyłącznie w
prywatnej, zaufanej sieci. Nie wystawiaj portu `4174` bezpośrednio do Internetu.

Na Unraid ustaw mapowanie `/app/data` na trwały katalog aplikacji oraz port kontenera `4174`. Minimalne uruchomienie bez Compose:

```bash
docker run -d \
  --name corolla-radar \
  --restart unless-stopped \
  --env-file .env \
  -p 4174:4174 \
  -v /mnt/user/appdata/corolla-radar:/app/data \
  -e ENABLE_SCHEDULED_SCAN=true \
  -e SCAN_INTERVAL_MINUTES=240 \
  -e APP_PUBLIC_URL=http://192.168.2.47:4174 \
  ghcr.io/wozniakmac/corolla-radar:latest
```

Kontener działa jako nieuprzywilejowany użytkownik `node` (UID 1000). Katalog
podmontowany jako `/app/data` musi umożliwiać temu użytkownikowi zapis.

## Baza miejscowości

Aplikacja zawiera lokalny indeks 47 930 polskich miast, wsi i innych miejscowości zamieszkanych z paczki GeoNames `PL.zip` (feature class `P`). Dane GeoNames są udostępniane na licencji [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Rejestr nazw można porównywać z państwowym katalogiem [GUS TERYT/SIMC](https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pobieranie.aspx); SIMC nie dostarcza jednak współrzędnych wymaganych do obliczenia odległości.

Aktualizacja indeksu: pobierz bieżący `PL.zip` z GeoNames i wykonaj `node scripts/build-geonames.mjs /ścieżka/PL.zip`. Odległość jest przybliżeniem drogowym: dystans po wielkim kole jest mnożony przez współczynnik 1,18.

## Docker / Unraid

```bash
docker compose up -d --build
```

Panel będzie dostępny na porcie `4174`. Katalog `./data` jest montowany jako trwały wolumen i przechowuje bazę, snapshoty pełnych stron oraz poprzedni skład TOP 10. Kontener wykonuje pierwszy skan po uruchomieniu, a następne co 240 minut.

Przy każdym uruchomieniu entrypoint nadaje użytkownikowi aplikacji prawa do
zamontowanego `/app/data`, a następnie uruchamia proces jako nieuprzywilejowany
użytkownik `node`. Dzięki temu istniejący bind mount `./data` działa również
wtedy, gdy jego pliki zostały wcześniej utworzone przez roota lub użytkownika o
innym UID. Jeśli system plików hosta blokuje zmianę właściciela, kontener
zatrzyma się z czytelnym komunikatem zamiast uruchomić panel bez możliwości
zapisu.

Po każdym skanie aplikacja porównuje aktualne TOP 10 z poprzednim. Zmiana składu, kolejności, łącznej punktacji lub którejkolwiek składowej oceny generuje jedno zbiorcze powiadomienie ntfy. Zawiera ono listę dziesięciu aut, aktualne punkty, zmianę pozycji (`↑`, `↓`, `→` lub `NOWE`), przyczynę zmiany punktów, bezpośredni link do ogłoszenia oraz link do szczegółów auta w aplikacji. Dla auta występującego na kilku portalach wybierana jest najtańsza aktywna publikacja. Pierwszy skan tylko ustala punkt odniesienia. Zapisane filtry ograniczają ranking używany w powiadomieniu. Adres tematu konfiguruje `NTFY_URL`, a bazowy adres aplikacji dla linków — `APP_PUBLIC_URL` (domyślnie `http://192.168.2.47:4174`).

Każde auto z kompletnymi danymi podstawowymi przechowuje ostatnie 100 zmian punktacji. Historia w szczegółach auta pokazuje poprzedni i nowy wynik każdej składowej oraz konkretne przesłanki, które pojawiły się, zniknęły albo zmieniły wartość. Zapis powstaje po skanie, ponownym przetworzeniu snapshotów oraz po uzupełnieniu danych przez CEPiK lub OpenAI; identyczny wynik nie tworzy duplikatu.

Deduplication scala publikacje tylko po identycznym VIN lub identycznym znormalizowanym URL-u. Podobna cena, przebieg i rocznik nie wystarczają do scalenia.

## Ważne

Dane demonstracyjne służą do prezentacji interfejsu. Adaptery portali powinny działać w backendzie i respektować regulaminy, robots.txt oraz limity źródeł. Nie należy omijać CAPTCHA ani zabezpieczeń antybotowych.
