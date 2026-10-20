# Asystent AI w analizach energii

Zakres jest duży, dlatego wdrożenie w trzech etapach. Każdy etap kończy się testami i weryfikacją na kontach testowych.

## Etap A — dostęp, panel i rozmowa (tylko odczyt)
- Trzeci przełącznik „Asystent AI” w edycji użytkownika, domyślnie wyłączony dla wszystkich (także admina i właściciela). Historia zmian jak dla pozostałych flag.
- Przycisk „Asystent AI” w analizie i w formularzu PPE; wysuwany panel po prawej (na telefonie pełny ekran), formularz dalej edytowalny.
- Nagłówek: klient → projekt → analiza → PPE; w analizie wybór „Wszystkie PPE” (tylko przy dostępie do wielu PPE).
- Przyciski kontekstowe: „Omów wariant”, „Sprawdź dane”, „Sprawdź założenia PO”, „Wyjaśnij wynik” — otwierają panel z gotowym pytaniem, bez automatycznego wysyłania.
- Kontekst budowany w aplikacji: zapisane i robocze (niezapisane, wyraźnie oznaczone) dane PRZED/PO, okres, OSD, taryfy, moce, strefy, stawki z rokiem i źródłem, ręczne korekty, zatwierdzone dane faktur (gdy dostęp do importu), wyniki istniejącego kalkulatora, wykryte braki i konflikty. Bez ponownego czytania PDF.
- Serwer weryfikuje flagę i dostęp do analizy przed wywołaniem modelu, ponownie pobiera zapisane dane z bazy (nie ufa wersji z przeglądarki poza „roboczą”), dokumenty traktuje jako dane.
- Rozmowy zapisywane per użytkownik i analiza, z oznaczeniem PPE; tylko autor ma do nich dostęp; odebranie flagi lub dostępu blokuje odczyt.
- Limity: długość wiadomości, liczba żądań na godzinę, rozmiar kontekstu; rejestr użycia widoczny dla admina.
- Błąd AI pokazuje komunikat i „Ponów”; kalkulator działa niezależnie.

## Etap B — propozycje zmian PO (podgląd)
- Model zwraca propozycję w ścisłym formacie; serwer dopuszcza tylko listę pól PO: ceny energii PO w strefach, moc umowna PO, opłata handlowa PO, wybrane opłaty stałe PO.
- Podgląd przeliczany istniejącym kalkulatorem na kopii danych: PPE, pola, wartość obecna i proponowana, jednostka, założenie, wynik przed/po, brakujące dane. Przy niekompletnych danych bez kwoty oszczędności.
- Rozróżnienie: koszty z faktur / przeliczenie stawkami / symulacja. Obniżenie mocy zawsze jako symulacja. Zmiana taryfy tylko omawiana.

## Etap C — „Zastosuj do PO” i „Cofnij zmianę”
- Ponowne sprawdzenie uprawnień i odcisku danych PPE; przy zmianie — nowy podgląd.
- Zapis tylko zatwierdzonych pól jednego PPE, jawne pokazanie zastępowanych ręcznych korekt, brak automatycznego pobierania stawek, idempotencja (jedna operacja na propozycję), odczyt kontrolny z bazy, odświeżenie formularza.
- Niezapisane zmiany formularza: wybór „Zapisz najpierw” albo „Zostań przy podglądzie”.
- Historia operacji (użytkownik, data, PPE, przed/po, id propozycji, założenie). Cofnięcie przywraca wartości tylko gdy pola nie zmieniły się później; inaczej pokazuje konflikt.
- Po zmianie danych wcześniejsze propozycje oznaczane jako nieaktualne.

## Szczegóły techniczne
- Flaga `ai_assistant` w `user_feature_access` + `has_feature_access`; `featureRules` rozszerzone.
- Tabele: `ai_conversations`, `ai_messages`, `ai_proposals` (status, fingerprint, pola), `ai_applied_changes` (before/after, undone_at), `ai_usage_log`. RLS: tylko autor + aktualna flaga + `can_access` do analizy; admin widzi tylko usage.
- Edge function `ai-assistant` (czat strumieniowany) i RPC `apply_ai_proposal` / `undo_ai_change` (transakcyjne, whitelist pól, porównanie fingerprintu).
- Model: domyślny `openai/gpt-6-astra` przez Lovable AI Gateway (Responses, streaming); obliczenia wyłącznie `calculateEnergyCosts`.
- Testy jednostkowe: whitelist pól, fingerprint/nieaktualność, cofnięcie z konfliktem, flagi dostępu; Playwright na kontach testowych.

Proponuję zacząć od Etapu A, potem B i C w kolejnych krokach.
