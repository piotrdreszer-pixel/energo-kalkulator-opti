# Asystent AI: zmiana pól przez czat i porównywanie taryf

## Zakres
Rozbudowa istniejącego asystenta (te same propozycje, historia, cofanie). Bez nowych uprawnień i bez dostępu modelu do bazy.

## Etap 1 — Jawny zestaw operacji
- Nowe rodzaje operacji: `tariff_po` / `tariff_przed` (taryfa + moc + zależne stawki razem), `field` (zamknięta lista pól liczbowych, list i checkboxów PRZED/PO), `report_selection` (wybór PPE do zestawienia, tylko z dostępem do wielu PPE), `import_selection` (zaznaczenia pozycji importu — przeliczenie przez istniejący `planReapply`, bez podwajania sum, z ochroną ręcznych korekt).
- PRZED zmieniany tylko przy wyraźnym poleceniu; nigdy oba warianty bez dyspozycji.
- Klasyfikacja: pytanie → odpowiedź; symulacja/porównanie → podgląd; jednoznaczne polecenie → zapis od razu; akceptacja → zastosowanie bieżącej propozycji.

## Etap 2 — Taryfa i moc jedną operacją
- Walidacja docelowego zestawu (nowa taryfa + nowa moc), dostępność taryfy u OSD (widoczność taryf), limity mocy; przejście C→B tylko z adnotacją o wymaganych warunkach przyłączenia (napięcie) — bez założenia, że moc wystarcza.
- Stawki dobierane tym samym mechanizmem co formularz (operator, taryfa, rok/okres, sezon, strefy). Ręczne korekty niepasujące do nowej taryfy → konflikt z pytaniem, bez cichego nadpisania. Brak stawki ≠ zero.
- Zużycie w nowych strefach nie jest wymyślane: pola oznaczone „do uzupełnienia”, wynik jako niepełne PO.

## Etap 3 — Niezapisane zmiany formularza
- Polecenie zastępuje roboczą wartość tylko tego pola; pozostałe niezapisane zmiany zostają w formularzu i nie są zapisywane.
- Konflikt z inną sesją (zmieniona wersja wiersza) → bez nadpisania, prośba o rozstrzygnięcie.
- Kolejność: zapis → odczyt potwierdzony → odświeżenie pól i podsumowania → przeliczenie → odpowiedź „Zmieniono”.

## Etap 4 — Porównanie taryf
- Przycisk „Porównaj taryfy” przy taryfie PO + polecenia w czacie (jedno PPE, wskazana moc, wszystkie PPE analizy).
- Obliczenia na kopiach danych istniejącym kalkulatorem; kandydaci: taryfy OSD dostępne w bazie dla okresu, z kompletem stawek.
- Te same założenia (okres, zużycie, moc, składniki, ceny energii); zmiana mocy jako osobny scenariusz.
- Strefy mapowane wg znaczenia, nie numeru; brak profilu → ograniczenie lub symulacja na jawnych, zaakceptowanych założeniach (oznaczona jako szacunkowa). Bez równego podziału bez zgody.
- Tabela: taryfa, moc, rok i źródło stawek, koszt PO, różnica vs obecne PO, oszczędność vs PRZED (tylko gdy kompletne), status danych, warunki.
- „Zastosuj najtańszy wariant” → aktualny, jednoznaczny wariant; sprawdzenie, że dane i stawki się nie zmieniły.
- Wiele PPE: liczone osobno, suma tylko w obrębie tej analizy i wybranych PPE.

## Etap 5 — Historia, testy, weryfikacja
- Historia: polecenie, stare/nowe wartości, źródła stawek, wynik przed/po, cofnięcie powiązanych zmian razem.
- Testy automatyczne reguł (walidacja taryfy+mocy, konflikt korekt, brak stawki, mapowanie stref, porównanie bez zapisu, nieaktualna propozycja).
- Test w przeglądarce na osobnym projekcie testowym: wszystkie punkty z sekcji 10; raport z podziałem na: wdrożone / sprawdzone w przeglądarce / tylko testy automatyczne.

## Szczegóły techniczne
- Migracja: rozszerzenie `ai_proposals.kind` i `ai_allowed_fields`, `ai_apply_proposal`/`ai_undo_change` dla nowych rodzajów (atomowy zapis grupy pól + `rates_source_*`, `value_sources`), kolumny na polecenie i wynik przed/po w `ai_applied_changes`.
- Wspólny moduł `_shared/rates-pick` używany przez formularz i edge function; `_shared/tariff-compare` (czysty, testowany).
- Formularz: scalanie potwierdzonych pól z zachowaniem „brudnych” innych pól.
- Serwer rechecks: `ai_assistant`, dostęp do grupy, `invoice_import`, `multi_ppe` dla każdej operacji.

Wdrażanie etapami 1→5; po każdym etapie build i testy.
