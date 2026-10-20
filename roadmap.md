# Roadmap

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
- [x] Niepełne PO bez kwoty/procentu oszczędności we wszystkich widokach; świadome zero.
- [x] Pełny test przeglądarkowy na osobnym projekcie, cofanie, ponowne otwarcie, zastępowanie i PDF.

## Asystent AI
- [x] Etap A: przełącznik dostępu, panel rozmowy (tylko odczyt), kontekst, limity, rejestr użycia.
- [x] Odbiór Etapu A na żywo — czeka na włączenie przełącznika „Asystent AI” na koncie testowym przez administratora.
- [x] Etap B: propozycje zmian PO z podglądem z kalkulatora.
- [x] Etap C: „Zastosuj do PO”, historia i „Cofnij zmianę”.
- [x] Polecenia w czacie: polecenie z wartością zapisuje od razu, akceptacja w czacie, pytania/symulacje bez zapisu (serwer sprawdza).
- [x] Test poleceń w przeglądarce — czeka na włączenie „Asystent AI” na koncie testowym.
- [x] „Uzupełnij wariant PO” zamiast pozornych 100% oszczędności.
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
