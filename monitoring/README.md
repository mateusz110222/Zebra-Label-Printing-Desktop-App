# Centralny monitoring drukarek

## Uruchomienie

1. Użyj osobnego projektu Compose i świeżych wolumenów. Skopiuj .env.example do .env, ustaw pięć różnych haseł, adres PUBLIC_URL z HTTP i przypięty tag obrazu grafana/grafana. Przykład używa PUBLIC_URL=http://monitoring.example.com:8083/ oraz HTTP_PORT=8083. Sekcja LDAP używa tych samych nazw i znaczenia kluczy co aplikacja desktopowa.
2. W config/certs umieść tylko **company-enterprise-root.pem**, certyfikat CA używany przez serwer LDAP. Ustaw LDAP_CA_CERT_PATH=certs/company-enterprise-root.pem. Certyfikat służy wyłącznie do weryfikacji LDAPS; Nginx nie wymaga certyfikatu serwera ani klucza prywatnego. Ogranicz odczyt .env do administratorów. Firewall ma udostępniać port 8083 tylko zaufanym sieciom stanowisk i użytkowników.
3. Nie trzeba tworzyć stations.json ani generować tokenów w terminalu. Po uruchomieniu panelu otwórz **http://monitoring.example.com:8083/stations/** i zaloguj się kontem LDAP z dostępem IT. Tworzenie stanowisk opisano w sekcji „Stanowiska”.
4. Uruchom docker compose up -d --build z katalogu monitoring. Sprawdź docker compose ps -a oraz logi usług migrate i dashboards. Usługi migrate, dashboards i grafana-bootstrap powinny zakończyć się kodem 0. Dopiero potem uruchamia się docelowa Grafana. Przed ponowną inicjalizacją zatrzymaj panel poleceniem docker compose stop nginx grafana, a następnie wykonaj docker compose up -d --build. Nie uruchamiaj dwóch instancji Grafany na tym samym wolumenie jednocześnie. Grafana używa organizacji IT (ID 1) i Produkcja (ID 2).
5. Przed uruchomieniem synchronizacji z produkcyjnymi danymi wykonaj pilotaż na jednym stanowisku. Sprawdź dostęp do panelu i łączność LDAPS z firmowym AD, następnie porównaj dane z lokalną historią wydruków. Domyślny Compose wystawia HTTP na porcie 8083. Połączenie przeglądarki z panelem oraz przesyłanie tokenów i danych stanowisk nie są szyfrowane; połączenie usługi LDAP z AD nadal używa LDAPS z weryfikacją CA.
6. LDAP jest zawsze włączony; nie ma przełącznika LDAP_ENABLED. Podaj LDAP_URL (LDAPS z portem, np. 3269), LDAP_LOGIN_DOMAIN (z LDAP_DOMAIN jako wartością zastępczą), LDAP_SEARCH_BASE, limity czasu i ustawienia TLS tak jak w aplikacji. Loguj się krótkim loginem AD (sAMAccountName), bez dopisywania domeny. Nie potrzeba konta serwisowego LDAP ani hasła LDAP_BIND_PASSWORD. Konto użytkownika musi mieć prawo wyszukać własny wpis.

## Portainer

Na hoście Docker umieść zawartość tego katalogu w /opt/label-monitoring, wraz z .env i plikiem config/certs/company-enterprise-root.pem. Plik config/stations.json jest opcjonalny; stanowiska dodaje się w interfejsie. Gotowy plik compose.portainer.yaml jest w tym katalogu i używa ścieżek /opt/label-monitoring. Dla Portainer CE zbuduj obraz na tym samym hoście Docker:

```sh
cd /opt/label-monitoring
sudo docker build -t label-monitoring:local .
sudo docker compose --env-file .env -f compose.portainer.yaml config --quiet
```

W Portainerze wybierz środowisko Docker Standalone, Stacks → Add stack, nazwę label-monitoring i Web editor. Wklej compose.portainer.yaml, załaduj .env przez Load variables from .env file i wybierz Deploy the stack. Po uruchomieniu otwórz **http://monitoring.example.com:8083/**. W aplikacji desktopowej wpisz ten sam adres w Konfiguracja → Monitoring, zapisz ustawienia i uruchom aplikację ponownie. HTTP działa również przy wyłączonym trybie testowym.

Podczas aktualizacji najpierw zatrzymaj nginx i grafana, aby inicjalizacja nie uruchamiała drugiej Grafany na tym samym wolumenie. Zachowaj wolumeny pgdata i grafana.

## Uprawnienia i ustawienia LDAP

LDAP_IT_DEPARTMENTS sprawdza dokładne wartości pola **department**, bez rozróżniania wielkości liter, rozdzielone średnikiem lub przecinkiem. Nie są to nazwy grup AD. Wspólna lista IT w przykładowym .env aplikacji i monitoringu to:

```dotenv
LDAP_IT_DEPARTMENTS='IT'
```

LDAP_IT_GROUP_DN opcjonalnie dopuszcza dodatkową, bezpośrednią grupę AD przez pełny DN, tak samo jak aplikacja. Użytkownik pasujący do działu lub grupy trafia wyłącznie do organizacji IT z rolą Editor. Może tam tworzyć, edytować i zapisywać pulpity oraz ma dostęp do pełnej historii. Pozostali poprawnie uwierzytelnieni użytkownicy LDAP trafiają wyłącznie do Produkcji z rolą Viewer. Po aktualizacji wyloguj się z Grafany i zaloguj ponownie, żeby odświeżyć rolę. LDAP_UR_DEPARTMENTS dotyczy wyłącznie konfiguracji drukarek w aplikacji desktopowej. MYSQL_CA_CERT_PATH, PARTS_CONFIG_URL i PARTS_CONFIG_FILE również pozostają konfiguracją aplikacji, nie serwera monitoringu.

Grafana nie obsługuje osobno pomijania nazwy hosta przy zachowaniu weryfikacji CA. Dlatego prywatna usługa ldap przenosi połączenie do AD przez LDAPS, stosując LDAP_TLS_REJECT_UNAUTHORIZED, LDAP_TLS_SKIP_HOSTNAME_VERIFICATION, LDAP_TLS_ALLOW_LEGACY_SERVER_CERT, LDAP_CA_CERT_PATH oraz oba limity czasu. Odcinek Grafana–ldap jest dostępny wyłącznie w osobnej sieci Docker; port LDAP nie jest publikowany na hoście. Przy LDAP_TLS_REJECT_UNAUTHORIZED=true i LDAP_TLS_SKIP_HOSTNAME_VERIFICATION=true łańcuch CA nadal jest sprawdzany.

Lokalne logowanie i Basic Auth w docelowym panelu są wyłączone. Hasło GRAFANA_ADMIN_PASSWORD służy tylko do inicjalizacji przez niepublikowaną usługę grafana-bootstrap, która kończy pracę przed uruchomieniem panelu. Inicjalizacja unieważnia stare sesje konta technicznego admin. Zmiana tego hasła na istniejącym wolumenie wymaga osobnego zresetowania hasła Grafany; sama zmienna nie zmienia już zapisanego hasła.

| Klucz                  | Znaczenie                                                                   |
| ---------------------- | --------------------------------------------------------------------------- |
| POSTGRES_PASSWORD      | Hasło administratora lokalnej bazy monitoringu.                             |
| INGEST_DB_PASSWORD     | Hasło konta monitor_ingest, używanego przez API do zapisu danych stanowisk. |
| IT_DB_PASSWORD         | Hasło konta monitor_it, z odczytem pełnych danych IT.                       |
| PRODUCTION_DB_PASSWORD | Hasło konta monitor_production, z odczytem ograniczonych widoków Produkcji. |
| GRAFANA_ADMIN_PASSWORD | Hasło techniczne inicjalizacji, niezwiązane z hasłem AD pracownika.         |
| GRAFANA_IMAGE          | Przypięty obraz Docker Grafany.                                             |
| PUBLIC_URL             | Pełny adres HTTP panelu, np. http://monitoring.example.com:8083/.                     |
| HTTP_PORT              | Port hosta (domyślnie 8083) przekierowany na port HTTP 80 kontenera Nginx.  |

Przechowuj pięć różnych, losowych haseł w lokalnym .env; nie wpisuj ich do .env.example ani repozytorium. Nie dodawaj końcowych znaków `\` do linii .env ani `\` przed dwukropkiem adresu LDAPS. To zwykły plik dotenv, nie zapis tekstu JSON.

## Stanowiska

1. Zaloguj się kontem LDAP z działu IT i otwórz **Stanowiska** z dashboardu IT albo bezpośrednio **http://monitoring.example.com:8083/stations/**. Panel wykorzystuje tę samą sesję Grafany. Użytkownicy Produkcji nie mogą odczytywać ani zmieniać rejestru stanowisk.
2. Wpisz nazwę i stały identyfikator stanowiska (np. audi-linia-01) i wybierz **Dodaj i wygeneruj token**. Identyfikator może mieć 1–64 litery ASCII, cyfry, myślniki lub podkreślenia.
3. Wybierz **Kopiuj konfigurację**. Token jest pokazywany tylko raz i pozostaje w otwartym formularzu do jego ukrycia lub opuszczenia strony. Serwer zapisuje wyłącznie skrót; token nie trafia do localStorage ani sessionStorage.
4. W aplikacji drukującej otwórz **Konfiguracja → Monitoring → Wklej konfigurację stanowiska**, wklej JSON, wybierz **Zastosuj do formularza**, następnie **Zapisz** i uruchom aplikację ponownie. Możesz też wpisać adres, identyfikator i token w osobnych polach. Ta funkcja wklejania wymaga aktualnej wersji aplikacji.
5. **Zmień token** natychmiast unieważnia poprzedni token; nową konfigurację trzeba zapisać na stanowisku. **Zablokuj** odcina nowe żądania synchronizacji. **Nowy token i odblokuj** przywraca dostęp z nowym tokenem. Żadna z tych operacji nie usuwa historii wydruków.

Zmiany są zapisywane w PostgreSQL, bez restartu API, a dziennik zmian zawiera login IT, czas, identyfikator i rodzaj operacji. Lista nie zwraca tokenów ani ich skrótów. Kopia bazy obejmuje rejestr stanowisk i historię zmian.

Istniejący config/stations.json nadal może służyć do pierwszego importu starych identyfikatorów i skrótów. Podczas startu API importuje wyłącznie brakujące wpisy, więc restart nie przywróci starego tokena ani nie cofnie blokady. Po imporcie zarządzaj tymi wpisami w panelu. Dla stanowisk testowych zachowane jest synthetic=true; zmiana tokena również zachowuje tryb testowy.

## Pulpity techniczne IT

W Grafanie otwórz **Dashboards → Diagnostyka techniczna**. Pulpity są dostępne w organizacji IT i można je edytować. Pulpity techniczne powstają przy pierwszej instalacji tej wersji. Ponowna inicjalizacja zachowuje ich zapisane edycje.

- **Telemetria stanowisk** pokazuje stan rejestru, brak pierwszego zgłoszenia, wiek ostatniego kontaktu i pomiaru drukarki, synchronizację, wersje oraz historię zmian rejestru. Łączność, pomiar i synchronizacja opisują stan bieżący. Zakres czasu wpływa na historię operacji.
- **Potwierdzenia i liczniki** pokazuje pokrycie pomiarami, brakujące i powtórzone potwierdzenia oraz rozbieżności licznika etykiet. ID zdarzenia prowadzi do pełnego wpisu audytu. Kreska oznacza brak danych dla danej miary.
- **Obciążenie i błędy druku** zestawia zwykłe wydruki i dodruki, liczbę nieudanych zleceń oraz wyniki według stanowiska, numeru części i formatu.

## Aktualizacja istniejącego wdrożenia przez Portainer

Skopiuj aktualną zawartość katalogu monitoring na serwer do /opt/label-monitoring, zachowując .env i zawartość config. Pliki schema.sql, nginx.conf, Dockerfile, compose.portainer.yaml, skrypty oraz pliki stations.* muszą pochodzić z tej samej wersji. Zatrzymaj stack w Portainerze. Na hoście Docker zbuduj ponownie obraz:

```sh
cd /opt/label-monitoring
sudo docker build -t label-monitoring:local .
```

W Portainerze otwórz Editor istniejącego stacka, zastąp Compose aktualnym compose.portainer.yaml i wybierz Update the stack, zachowując obecne zmienne środowiskowe. Lokalnego obrazu label-monitoring:local nie pobieraj z rejestru. Zachowaj wolumeny PostgreSQL i Grafany. Usługa migrate utworzy nowe tabele; dotychczasowa historia pozostanie zachowana. Następnie wejdź na /stations/.

Pierwszy start z nowym układem zastąpi zawartość trzech wbudowanych pulpitów pod dotychczasowymi adresami. Jeśli były wcześniej modyfikowane, wyeksportuj ich JSON przed aktualizacją. Kolejne uruchomienia tej wersji zachowują edycje zapisane w Grafanie. Znacznik `label-monitoring-layout-2` na pulpitach wskazuje, że aktualizacja układu została już zastosowana.

Brak konfiguracji monitoringu w aplikacji oznacza wyłączoną synchronizację. Podłącz najpierw jedno stanowisko, porównaj wyniki z lokalną historią, następnie sprawdź uzupełnienie po przerwie w sieci. Ponowne wysłanie tej samej partii nie tworzy duplikatów.

## Kopia zapasowa

Kopię danych wykonuj na hoście Docker w ograniczonym katalogu. Zachowaj też konfigurację Compose, certyfikat CA i sekrety w firmowym magazynie.

```sh
docker compose exec -T postgres pg_dump -U monitoring_admin -d monitoring -Fc > monitoring.dump
```

Aby odtworzyć, zatrzymaj API, przygotuj świeży wolumen PostgreSQL i uruchom postgres oraz migrate, aby utworzyć role. Odtwórz kopię na tej instancji i dopiero potem uruchom resztę usług. Poniższe polecenie zastępuje obiekty bazy monitoring na docelowej instancji.

```sh
docker compose exec -T postgres pg_restore -U monitoring_admin -d monitoring --clean --if-exists --exit-on-error < monitoring.dump
```

Wykonuj polecenia z przekierowaniem binarnym w powłoce, która zachowuje bajty, np. na linuksowym hoście Docker. Przy odtwarzaniu starszej kopii stanowiska mają już zapisane kursory wysyłki. Aby dosłać brakujące zdarzenia, ustaw przy odtworzeniu inny adres serwera w monitoring.json lub usuń wyłącznie klucz metadanych synchronizacji z lokalnego SQLite przy zamkniętej aplikacji. Ponowny import deduplikuje wpisy w PostgreSQL.
