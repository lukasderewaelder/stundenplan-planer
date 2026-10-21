'use strict';
/* =====================================================================
   STUNDENPLANER – ENGINE
   Dieser Skriptteil läuft im Hauptfenster UND im Web Worker (Solver).
   Abschnitte:
     1. DATENMODELL   – Konstanten, Regelkatalog, Normalisierung, Beispieldaten
     2. VALIDIERUNG   – Kompilieren (mit Personal-Einheiten für „Fachlehrkraft automatisch“), Planzustand mit Transaktionen,
                        Regelfunktionen H01–H16 / W01–W17, Vollbewertung, Machbarkeitscheck
     3. SOLVER        – loeseUnterricht(): EINE Suche über Zeit, Raum und Fachlehrkraft (Startpersonal, Konstruktion mit Verdrängung,
                        Simulated Annealing mit Kempe-Ketten, Personalzügen und Ruin & Recreate), Diagnose;
                        GESAMTBERECHNUNG loeseStundenplan(): a) Fachlehrkräfte + Unterricht, b) Co-Lehrkräfte blockweise,
                        c) Aufsichten immer neu, d) Endvalidierung (einzige Quelle der Zahl „harte Fehler“)
     4. SELBSTTEST    – Tests je Regel mit kleinen Beispielplänen
     5. DIENSTE       – Aufsichten in echten Uhrzeiten: Teilung nur nach Staffelung (Zeitraster), Ausgleich Ist − Soll (bei Gleichstand Personal → Co → Lehrkraft), harte Ausschlüsse
     6. SELBSTTEST GESAMTBERECHNUNG
   ===================================================================== */

