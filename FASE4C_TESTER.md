# FASE 4C – Testerprotokoll

## Hva er nytt i fase 4C

Tre fokuserte endringer:

1. **Kanaltype og effekt på kanaler** – `channel_type` (relé/dimmer) og `watt` felter på kanaler, med totalsum under kanalregisteret
2. **Ledigmarkering av moduler** – `is_vacant` boolsk felt på moduler; ledig modul vises grå med tekst "Ledig"; kan ikke kombineres med `circuit_id`
3. **Ny modultype `main_switch`** – Norsk: "Hovedbryter (OV50)"; antrasitt farge (`#374151`); CSS-klasse `module-main_switch`; forkortelse "OV"; kan ha ampere; kan ikke ha `circuit_id`

---

## Backend-tester (automatiserte)

```bash
python -m pytest tests/ -q
```

Forventet: **98 passed**

---

## API-steg for manuell verifisering

### Trinn 1 – Opprett en eiendom og et sikringsskap

```bash
PROP=$(curl -s -X POST http://localhost:8000/api/properties \
  -H "Content-Type: application/json" \
  -d '{"name":"Testbolig","address":"Testveien 1"}')
PROP_ID=$(echo $PROP | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

PANEL=$(curl -s -X POST "http://localhost:8000/api/properties/$PROP_ID/panels" \
  -H "Content-Type: application/json" \
  -d '{"name":"Hovedtavle","location":"Gang","rows":2,"modules_per_row":12}')
PANEL_ID=$(echo $PANEL | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

---

### Trinn 2 – Opprett en Dynalite-enhet med kanaler

```bash
CIRCUIT=$(curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/circuits" \
  -H "Content-Type: application/json" \
  -d '{"designation":"B01","name":"Lys stue","room":"Stue"}')
CIRCUIT_ID=$(echo $CIRCUIT | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

EQ=$(curl -s -X POST "http://localhost:8000/api/circuits/$CIRCUIT_ID/equipment" \
  -H "Content-Type: application/json" \
  -d '{"type":"dynalite","brand":"Philips","channel_count":4}')
EQ_ID=$(echo $EQ | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

Forventet: 4 kanaler opprettes automatisk med `channel_type: "relay"` og `watt: null`.

```bash
curl -s "http://localhost:8000/api/equipment/$EQ_ID/channels" | python3 -m json.tool
```

---

### Trinn 3 – Oppdater kanaltype og effekt

```bash
CHANNELS=$(curl -s "http://localhost:8000/api/equipment/$EQ_ID/channels")
CH1=$(echo $CHANNELS | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
CH2=$(echo $CHANNELS | python3 -c "import sys,json; print(json.load(sys.stdin)[1]['id'])")

curl -s -X PUT "http://localhost:8000/api/channels/$CH1" \
  -H "Content-Type: application/json" \
  -d '{"label":"Lys stue","channel_type":"relay","watt":300}' | python3 -m json.tool

curl -s -X PUT "http://localhost:8000/api/channels/$CH2" \
  -H "Content-Type: application/json" \
  -d '{"label":"Dimmer gang","channel_type":"dimmer","watt":150}' | python3 -m json.tool
```

Forventet: kanalene returnerer `channel_type: "relay"` / `"dimmer"` og korrekte watt-verdier.

---

### Trinn 4 – Ugyldig kanaltype avvises

```bash
curl -s -X PUT "http://localhost:8000/api/channels/$CH1" \
  -H "Content-Type: application/json" \
  -d '{"channel_type":"ugyldig"}' | python3 -m json.tool
```

Forventet: HTTP 422

---

### Trinn 5 – Opprett Hovedbryter-modul

```bash
curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/modules" \
  -H "Content-Type: application/json" \
  -d '{"row":0,"position":0,"width":2,"type":"main_switch","ampere":50}' | python3 -m json.tool
```

Forventet: HTTP 200, `type: "main_switch"`, `ampere: 50`, `circuit_id: null`

---

### Trinn 6 – Hovedbryter med circuit_id avvises

```bash
curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/modules" \
  -H "Content-Type: application/json" \
  -d "{\"row\":0,\"position\":4,\"width\":2,\"type\":\"main_switch\",\"circuit_id\":$CIRCUIT_ID}" \
  | python3 -m json.tool
```

Forventet: HTTP 400

---

### Trinn 7 – Opprett ledig modul

```bash
curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/modules" \
  -H "Content-Type: application/json" \
  -d '{"row":0,"position":6,"width":1,"type":"other","is_vacant":true}' | python3 -m json.tool
```

Forventet: HTTP 200, `is_vacant: true`

---

### Trinn 8 – Ledig modul med circuit_id avvises

```bash
curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/modules" \
  -H "Content-Type: application/json" \
  -d "{\"row\":0,\"position\":8,\"width\":1,\"type\":\"breaker\",\"is_vacant\":true,\"circuit_id\":$CIRCUIT_ID}" \
  | python3 -m json.tool
```

Forventet: HTTP 400

---

### Trinn 9 – Ledig modul blokkerer fortsatt overlapp

```bash
curl -s -X POST "http://localhost:8000/api/panels/$PANEL_ID/modules" \
  -H "Content-Type: application/json" \
  -d '{"row":0,"position":6,"width":1,"type":"breaker"}' | python3 -m json.tool
```

Forventet: HTTP 409 (overlapp med ledig modul i posisjon 6)

---

## UI-sjekkliste

| # | Steg | Forventet |
|---|------|-----------|
| 1 | Åpne sikringsskapet, klikk "Legg til modul" | Modaldialog med typeliste |
| 2 | Velg type "Hovedbryter (OV50)" | Ampere-felt vises, kurs-felt vises ikke |
| 3 | Lagre modul | Modulen vises antrasitt med "OV" og ampere |
| 4 | Klikk ny modul, huk av "Merk som ledig" | Kurs-felt forsvinner |
| 5 | Lagre ledig modul | Modulen vises grå med tekst "Ledig", CSS-klasse `module-vacant` |
| 6 | Åpne utstyr med kanaler | Kanalregisteret viser kolonnene: Nr, Etikett, Last, Tilknyttet kurs, Kanaltype, W, Kommentar |
| 7 | Klikk "Rediger" på en kanal | Inline redigering med `channel_type` som select (Relé/Dimmer) og `watt` som tallinndata |
| 8 | Sett kanaltype = Dimmer, W = 200, trykk Enter | Kanalen viser "Dimmer" og "200 W" i tabellen |
| 9 | Sett W-verdier på alle kanaler | Under tabellen vises "Total effekt: X W" |
| 10 | Slett watt-verdi (tøm feltet), lagre | "—" vises i W-kolonnen, totalsummen oppdateres |
