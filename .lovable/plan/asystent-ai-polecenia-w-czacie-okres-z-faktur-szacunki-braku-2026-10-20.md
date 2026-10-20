# Asystent AI: polecenia w czacie, okres z faktur, szacunki brakujących miesięcy

Rozbudowa istniejącego asystenta (propozycje PO, ai_apply_proposal / ai_undo_change, buildSettlement, kalkulator). Bez równoległych mechanizmów. Realizacja w 4 etapach, każdy testowany w przeglądarce na odizolowanym projekcie testowym.

## Etap 1 — Polecenie = zgoda (zmiany PO)
- Model klasyfikuje wypowiedź: pytanie / symulacja / polecenie / akceptacja w czacie. Klasyfikacja zwracana jako wywołanie narzędzia, nie tekst.
- Jednoznaczne polecenie (PPE, pole, strefa, wartość podane lub wynikające z kontekstu) → serwer tworzy propozycję i od razu wywołuje ai_apply_proposal. Brak danych → jedno pytanie.
- Propozycje wybrane przez asystenta nadal wymagają akceptacji (przycisk lub „tak, zastosuj” w czacie, odnoszące się do konkretnej ostatniej propozycji).
- Treść faktur nigdy nie jest poleceniem.
- „Zmieniono” dopiero po odczycie z bazy; formularz, karta PPE i podsumowanie odświeżają się; niezapisane zmiany tego samego pola → komunikat o konflikcie; autosave/stary stan nie nadpisze (wersja updated_at).
- Przy niepełnym PO wynik „Uzupełnij wariant PO” zamiast 100% oszczędności (kalkulator, karta PPE, raport).

## Etap 2 — Okres z faktur
- Nowe narzędzie serwerowe: wylicza z zatwierdzonych rozliczeń danego PPE (buildSettlement, daty rozliczenia, nie wystawienia) zakres, pokrycie, luki, nakładki, duplikaty, korekty.
- Polecenie „zmień okres na taki jak faktury” → zapis period_from/period_to jako operacja z historią i cofaniem (nowe RPC na wzór ai_apply_proposal, zamknięta lista pól: tylko daty).
- Nic poza datami się nie zmienia; brakujące miesiące oznaczone; porównanie oznaczone jako niekompletne. Gdy zmiana okresu dotyka roku stawek — jawna informacja, bez automatycznego nadpisania.

## Etap 3 — Szacunki brakujących okresów
- Nowa tabela szacunków (oddzielnie od dokumentów): PPE, okres, pole/składnik, wartość, jednostka, metoda, dokumenty i okresy źródłowe, wersja danych źródłowych, kto i kiedy zatwierdził, status (aktywny / zastąpiony / cofnięty).
- Metoda domyślna dla zużycia: suma zużycia sąsiednich okresów / ich dni × dni luki, osobno per strefa; wykrywanie zmiany taryfy i niezgodnych stref (blokada bez uzgodnienia).
- Opłaty stałe liczone przez kalkulator z okresu — bez dopisywania drugi raz. Energia bierna, przekroczenia, opłaty jednorazowe, Pmax, podstawa opłaty mocowej — pozostają brakiem, chyba że użytkownik zatwierdzi jawne założenie. Brak stawki → brak, bez zgadywania.
- Przycisk „Oszacuj brakujący okres” przy komunikacie o luce + obsługa w czacie („Oszacuj sierpień” → propozycja do akceptacji; polecenie z metodą → wykonanie). Wartości do ręcznej poprawki przed zatwierdzeniem.
- Zastosowanie atomowe przez RPC, z historią i cofnięciem (konflikt, jeśli pola edytowano później).

## Etap 4 — Oznaczenia, raport, zastąpienie fakturą
- Formularz i PDF: „Analiza zawiera dane szacunkowe”, miesiące i składniki, metoda, źródła, udział szacowanego zużycia, pozostałe braki. Wynik z symulacją nie jest nazywany kosztem rzeczywistym.
- Po zatwierdzeniu faktury za okres z szacunkiem: wykrycie, porównanie, „Zastąp szacunek” tylko dla pokrytych składników; nigdy suma faktury i szacunku.

## Uprawnienia i bezpieczeństwo
- Każde narzędzie: ponowne sprawdzenie flagi AI, dostępu do analizy, importu faktur (okres z faktur, zastąpienie) i wielu PPE; również przy cofaniu.
- Bez SQL/kodu z modelu; obliczenia w funkcjach aplikacji; zamknięte listy pól i walidacja jednostek.

## Weryfikacja
Testy automatyczne dla reguł (luka sierpniowa, długości miesięcy, strefy, zmiana taryfy, brak stawki, brak podwójnych opłat stałych, niepełne PO, zastąpienie bez podwojenia, cofnięcie z konfliktem) oraz przebieg w przeglądarce dla każdego etapu na projekcie testowym, usuwanym po teście.

## Uwaga
To duży zakres — proponuję realizować etap po etapie, z potwierdzeniem działania każdego przed kolejnym.
