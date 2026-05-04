# FASE 4B — Kanalregister (Channel Documentation) — Test Specification

## Acceptance Criteria

| # | Criteria |
|---|---|
| AC1 | `Channel` persists all fields: `equipment_id`, `number`, `label`, `load`, `circuit_id` (optional cross-ref), `notes` |
| AC2 | `channel_count` on equipment create auto-generates N empty channels numbered 1–N; the field is **not** stored on the equipment record |
| AC3 | `GET /api/equipment/{id}/channels` always returns channels ordered by `number` ascending |
| AC4 | `POST /api/equipment/{id}/channels` with a duplicate `number` for the same equipment → **400** |
| AC5 | `PUT /api/channels/{id}` with a non-existent `circuit_id` → **404** |
| AC6 | Channel table rows have `data-testid="channel-row"` |
| AC7 | Empty channels (all fields null/empty) display `— ikke koblet —` in both the label **and** load columns |
| AC8 | When `circuit_id` is set, the circuit column renders as `<a href="/kurs/{circuit_id}">` showing the circuit designation |
| AC9 | Creating `dynalite` equipment pre-fills Antall kanaler = **12**; `shelly` pre-fills **4**; all other types leave it empty |
| AC10 | Inline editing: Enter saves, Escape cancels without persisting changes |
| AC11 | `DELETE /api/channels/{id}` removes the channel; equipment record is unaffected |

---

## Backend Tests (`tests/test_channels.py`)

| Test | What it checks |
|---|---|
| `test_create_channel` | POST → 200, all fields echoed back |
| `test_list_channels_empty` | Equipment with no channels → `[]` |
| `test_list_channels_sorted` | Channels inserted out-of-order; GET returns ascending by number |
| `test_update_channel_fields` | PUT updates label, load, notes |
| `test_update_channel_links_circuit` | PUT with valid `circuit_id` → 200, `circuit_id` set |
| `test_update_channel_invalid_circuit` | PUT with nonexistent `circuit_id` → 404 |
| `test_update_channel_unlinks_circuit` | PUT with `circuit_id: null` → 200, `circuit_id` becomes null |
| `test_delete_channel` | DELETE → 200; subsequent GET returns empty list |
| `test_duplicate_number_rejected` | POST same number twice for same equipment → second is 400 |
| `test_channel_auto_generated` | `channel_count=3` on equipment create → three channels numbered 1–3 |
| `test_auto_channels_ordered` | `channel_count=5` → GET returns numbers [1,2,3,4,5] in that order |
| `test_channel_count_not_in_response` | Equipment response has no `channel_count` field |
| `test_equipment_not_found_list` | GET channels for nonexistent equipment → 404 |
| `test_equipment_not_found_create` | POST channel for nonexistent equipment → 404 |
| `test_channel_not_found_update` | PUT nonexistent channel → 404 |
| `test_channel_not_found_delete` | DELETE nonexistent channel → 404 |

---

## Manual Smoke Test

Prerequisites: `uvicorn main:app --reload` on :8000, `npm run dev` on :5173.

| Step | Action | Expected |
|---|---|---|
| 1 | Create property → panel → circuit | All 200 |
| 2 | Open circuit detail, click Legg til utstyr | Dialog opens |
| 3 | Select type **Dynalite** | "Antall kanaler" field appears, pre-filled **12** |
| 4 | Change type to **Shelly** | Field updates to **4** |
| 5 | Change type to **Varmepumpe** | "Antall kanaler" field disappears |
| 6 | Change back to **Dynalite**, click Lagre | Equipment card appears with 12-row channel table |
| 7 | Inspect 12 rows | All rows grayed, label and load both show "— ikke koblet —" |
| 8 | Inspect DOM | Each `<tr>` in channel table has `data-testid="channel-row"` |
| 9 | Click **Rediger** on row 1, fill Etikett "Lys gruppe A", press **Escape** | Row reverts, Etikett is empty |
| 10 | Click Rediger on row 1 again, fill Etikett "Lys gruppe A", press **Enter** | Row saved, shows "Lys gruppe A" (not grayed) |
| 11 | Click Rediger on row 2, select a circuit from Tilknyttet kurs, click Lagre | Circuit column shows designation as blue link |
| 12 | Click the circuit link | Navigates to correct `/kurs/{id}` page |
| 13 | Click **Legg til kanal** | New row appears with number 13 (grayed) |
| 14 | Slett the extra row, confirm | Row disappears; 12 rows remain |
| 15 | `POST /api/equipment/{id}/channels {"number":1}` | **400** duplicate number |
| 16 | `PUT /api/channels/{id} {"circuit_id":99999}` | **404** circuit not found |

---

## Definition of Done

- [ ] All 16 backend tests in `tests/test_channels.py` pass
- [ ] All pre-existing tests (Phases 1–4) still pass
- [ ] All 11 acceptance criteria manually verified
- [ ] Code pushed to `feature/fase4`
