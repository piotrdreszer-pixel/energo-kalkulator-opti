# Roadmap

## Oszczędności z dostępnych danych
- [x] Usunięcie wspólnej blokady niepełnych pól w kalkulatorze, zestawieniu, PDF i asystencie; brakujące liczby bez wkładu do kosztów, bez zmiany zapisanych danych. Wdrożono funkcje asystenta i podsumowania faktur.
- [x] 226 testów automatycznych; przeglądarka po zalogowaniu: pusta cena i opłata mocowa PO, PRZED 5100 zł / PO 0 zł / oszczędność 5100 zł, zapis, odświeżenie, karta PPE i zestawienie bez komunikatu o brakach; projekt testowy usunięty. Rozmowy AI i pobrania PDF nie testowano w przeglądarce.

## Podsumowanie danych z faktur
- [x] Auto-otwarcie po odczycie paczki, lista PPE / szczegóły, statusy dokumentów, nieodczytane jawnie.
- [x] Komunikat o lukach (miesiące), przycisk asystenta, „Okres uzupełniony szacunkiem”, z faktur / szacunek / łącznie.
- [x] „Zastosuj do PRZED” (porównanie, ochrona ręcznych, nadpisanie bez sumowania), „Przejdź do analizy”, wejście z formularza PPE.
- [x] Zastosowanie podsumowania do PRZED przez asystenta tym samym mechanizmem serwerowym.
- [x] Przeglądarka: paczka dwóch obrazów faktur z rzeczywistym odczytem, automatyczne podsumowanie, jawne zatwierdzenie, trzy PPE, identyczny zapis przyciskiem/czatem, ponowienie, ręczne konflikty, nieaktualny podgląd, duplikat, korekta, błąd odczytu, szacunek i zastąpienie, cofnięcie i ponowne otwarcie.
- [ ] Test wyłączonych uprawnień: zablokowany brakiem wskazanego konta z wyłączonymi funkcjami i zakazem zmiany uprawnień. Sprawdzono odmowę 401 bez logowania; nie udaje ona testu wyłączonej flagi.
- [x] Wspólny atomowy zapis serwerowy: aktualność podglądu, tylko zatwierdzone źródła, konkretne konflikty ręczne, historia i cofnięcie; PO bez zmian.
- [x] Zalogowane widoki podsumowania, importu i formularza bez błędów aplikacji; rzeczywiste daty i oddzielne pokrycie sprzedaży/dystrybucji w silniku; projekt testowy i jego pliki usunięte.

## Asystent: zmiana pól i porównanie taryf
- [x] Reguły: taryfa+moc razem, dostępność dla OSD, warunki zmiany grupy, strefy wg znaczenia, brak stawki ≠ 0, najtańszy/remis (testy).
- [x] Operacje zapisu w bazie: taryfa+moc+stawki PO, pola PRZED, wybór PPE do zestawienia — z historią (polecenie, wynik przed/po) i cofaniem.
- [ ] Zmiana zaznaczeń importu przez asystenta (przez istniejący mechanizm ponownej edycji).
- [x] Narzędzia asystenta (taryfa+moc PO, porównanie, PRZED, zestawienie) i scalanie z niezapisanym formularzem.
- [x] Przycisk „Porównaj taryfy” (tabela w odpowiedzi asystenta).
- [x] Test w przeglądarce: porównanie, taryfa+moc z roboczą zmianą, cofnięcie, ochrona ręcznych korekt.
- [ ] Test w przeglądarce: ograniczenia uprawnień (wymaga konta testowego z wyłączonymi funkcjami).

## Układ Asystenta AI
- [x] Panel obok treści na szerokich ekranach, nakładany na mniejszych; brak nadmiaru szerokości.
- [x] Zawijanie kart PPE, akcji i wszystkich kroków formularza.
- [x] Sprawdzenie wskazanych szerokości, powiększeń i długich treści; zrzuty.

## Stabilizacja ostatniego wdrożenia
- [x] Spójny wynik po zapisie: odczyt, przeliczenie, odpowiedź i karta.
- [x] Szacunki zużycia wyłącznie PRZED; osobna zgoda na każdy koszt.
- [x] Dawna blokada niepełnego PO — zastąpiona liczeniem z dostępnych danych na polecenie użytkownika.
- [x] Pełny test przeglądarkowy na osobnym projekcie, cofanie, ponowne otwarcie, zastępowanie i PDF.

## Asystent AI
- [x] Etap A: przełącznik dostępu, panel rozmowy (tylko odczyt), kontekst, limity, rejestr użycia.
- [x] Odbiór Etapu A na żywo — czeka na włączenie przełącznika „Asystent AI” na koncie testowym przez administratora.
- [x] Etap B: propozycje zmian PO z podglądem z kalkulatora.
- [x] Etap C: „Zastosuj do PO”, historia i „Cofnij zmianę”.
- [x] Polecenia w czacie: polecenie z wartością zapisuje od razu, akceptacja w czacie, pytania/symulacje bez zapisu (serwer sprawdza).
- [x] Test poleceń w przeglądarce — czeka na włączenie „Asystent AI” na koncie testowym.
- [x] Dawny komunikat „Uzupełnij wariant PO” — zastąpiony liczeniem z dostępnych danych.
- [x] Okres analizy z zatwierdzonych faktur (zakres, pokrycie, luki) z historią i cofaniem.
- [x] Szacunki brakujących miesięcy (osobna tabela, metoda dobowa per strefa, akceptacja).
- [x] Oznaczenia szacunków w formularzu i PDF; zastąpienie szacunku fakturą.

## Regresje uprawnień
- [x] Odtworzenie i naprawa transakcyjnego usuwania z kolejką sprzątania plików.
- [x] Ukrycie niedostępnych akcji i sprawdzenie egzekwowania aktualnych flag.
- [x] Sesje testowe, cztery kombinacje, odebranie dostępu i nieuprawnione żądania.

## Dostęp do funkcji
- [x] Trwałe uprawnienia, historia zmian i zabezpieczenia operacji.
- [x] Przełączniki administratora oraz ograniczenia importu i wielu PPE.
- [x] Testy reguł i sprawdzenie działania w aplikacji.

## Zakończone
- [x] Zbiorcze rozliczanie wielu faktur na PPE („Rozliczenia z faktur”).
- [x] Auto-wybór roku stawek (PRZED i PO) na podstawie okresu analizy; gdy okres nachodzi na dwa lata (np. 2025/2026) — wybór roku pozostaje ręczny.
- [x] Import faktur: ponowna edycja zatwierdzonego importu, dopasowanie taryfy, zużycie wielostrefowe.

## Symulacja pełnego roku (asystent AI) — ZROBIONE 2026-10-24
- `supabase/functions/_shared/year-simulation.ts`: planYearSimulation — średnia dobowa z zatwierdzonego okresu × brakujące dni, per strefa, luki wewnętrzne + przedłużenia, szacunki miesięczne (faktura zastępuje swój miesiąc), 1 koszt na jawną zgodę, PO nigdy nietknięte.
- Narzędzie `symuluj_okres` w ai-assistant (podgląd + propozycja, zapis po akceptacji); migracje 0018 (RPC/guard) i 0019 (kind check).
- `planReplaceEstimates` obsługuje wiele szacunków miesięcznych na pole (pokryty zastępowany, reszta zostaje).
- Testy: 217 automatycznych OK; przeglądarka: pełna rozmowa (dopytanie o rok → podgląd → zastosowanie → readback 12,0862 MWh, PRZED 6543,10 zł, PO bez zmian), cofnięcie kartą (powrót do 5 MWh/31.05, szacunki undone). Projekt testowy usunięty.
- Ograniczenie znane: doszacowanie kosztu PO zastosowaniu symulacji wymaga ponownej symulacji (nie doszacowuje w miejscu).

## Zmiany mocy umownej w symulacji — ZROBIONE 2026-10-24
- Historia mocy (różne moce w nienakładających się okresach) nie blokuje szacunku zużycia; blokują tylko sprzeczne moce w nakładających się okresach (invoice-settlement).
- Symulacja pyta o moc dla brakujących miesięcy (propozycja: ostatnia znana), po akceptacji kontynuuje tę samą propozycję; moc zapisywana jako jawny wariant uproszczony z notką, bez uśredniania i bez cofania historii z faktur.
- Migracja 0020: contracted_power_before_kw dozwolone w kind year_simulation; narzędzie symuluj_okres z parametrem moc_zalozona i kontrolą jawnej odpowiedzi.
- Poprawka karty propozycji: przy niepełnym PO brak „NaN%” — komunikat „Nie można wyznaczyć oszczędności — uzupełnij wariant PO”.
- Testy: 224 automatyczne OK; przeglądarka: historia 1100→1050 kW bez blokady zużycia, pytanie o moc, akceptacja 1050 kW, zapis (okres do 31.12.2025, 12,0862 MWh, moc 1050 kW), cofnięcie kartą (powrót 5 MWh/1100 kW/31.05). Projekt testowy usunięty.
