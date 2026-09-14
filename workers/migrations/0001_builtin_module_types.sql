-- De innebygde modultypene.
--
-- Delt av alle organisasjoner, og derfor organization_id IS NULL. På
-- Python-siden ble disse skrevet av en oppstartsfunksjon; en Worker har
-- ingen oppstart å henge det på, og en «så jeg dette før?»-sjekk per
-- forespørsel ville blitt en spørring i hver eneste modulvisning.
--
-- Som migrasjon skjer det én gang, det står i en diff, og en ny type
-- senere blir en ny migrasjon — som er nettopp det som gikk galt i den
-- første Python-versjonen, der seedingen returnerte tidlig dersom
-- tabellen hadde rader, og en ny type derfor aldri nådde et eksisterende
-- oppsett.
--
-- Hver rad står for seg med WHERE NOT EXISTS i stedet for INSERT OR
-- IGNORE. Den unike indeksen ligger på (organization_id, key), og SQL
-- regner NULL-er som forskjellige — så OR IGNORE ville ikke stoppet
-- noe som helst her.

INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'breaker', 'Automatsikring', '#2563eb', 'LS', 1, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'breaker' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'rcd', 'Jordfeilbryter', '#ca8a04', 'JF', 0, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'rcd' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'rcd_breaker', 'Kombibryter', '#16a34a', 'KO', 1, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'rcd_breaker' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'shelly', 'Shelly', '#ea580c', 'SH', 0, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'shelly' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'dynalite', 'Dynalite', '#9333ea', 'DY', 0, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'dynalite' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'surge_protection', 'Overspenningsvern', '#dc2626', 'OV', 0, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'surge_protection' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'main_switch', 'Hovedbryter (OV50)', '#374151', 'OV', 0, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'main_switch' AND is_builtin = 1
);
--> statement-breakpoint
INSERT INTO moduletypedefinition
  (organization_id, key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin)
SELECT NULL, 'other', 'Annet', '#6b7280', '—', 0, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM moduletypedefinition WHERE key = 'other' AND is_builtin = 1
);
