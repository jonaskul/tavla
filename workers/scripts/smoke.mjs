#!/usr/bin/env node
/**
 * Sjekker en utrullet Tavla for måtene den kan være stille feilkonfigurert på.
 *
 *     npm run smoke -- https://tavla.digibygg.io
 *
 * Trygg mot produksjon: den sender ingen e-post, oppretter ingen data,
 * logger ingen inn, og bruker ikke opp innloggingens rate-grense.
 *
 * Alt her er feil som ser helt friske ut utenfra. En cookie uten Secure
 * logger deg fortsatt inn — over ukryptert forbindelse. En app som svarer
 * uinnlogget virker fortsatt — for alle. En manglende SPA-fallback ryker
 * bare når noen oppdaterer siden på en underside, som aldri er den siden
 * man tester for hånd.
 *
 * Ren Node, ingen avhengigheter.
 */

const PASS = "OK  ";
const FAIL = "FEIL";
const WARN = "OBS ";

const rows = [];
const add = (status, title, detail = "") => rows.push({ status, title, detail });

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base) {
  console.log("Bruk: npm run smoke -- https://tavla.digibygg.io");
  process.exit(2);
}

/** Aldri kaste: en vert som ikke svarer er et funn, ikke et krasj. */
async function get(path, init = {}) {
  try {
    return await fetch(`${base}${path}`, { redirect: "follow", ...init });
  } catch (error) {
    return { failed: String(error) };
  }
}

async function checkHealth() {
  const res = await get("/api/health");
  if (res.failed) return add(FAIL, "API-et svarer", res.failed);
  if (res.status === 200) add(PASS, "API-et svarer på /api/health");
  else add(FAIL, "API-et svarer på /api/health", `fikk HTTP ${res.status}`);
}

async function checkSameOrigin() {
  const res = await get("/api/health");
  if (!res.failed && res.status === 200) add(PASS, "API-et ligger under samme opphav");
  else {
    add(WARN, "API-et ligger under samme opphav",
      "Ikke nådd på /api under samme vert. Da er frontenden og API-et\n" +
      "ulike opphav, og sesjonscookien kan ikke bli på SameSite=Lax.");
  }
}

async function checkRequiresAuth() {
  const res = await get("/api/properties");
  if (res.failed) return add(FAIL, "Uinnlogget får 401 på data", res.failed);
  if (res.status === 401) add(PASS, "Uinnlogget får 401 på data");
  else if (res.status === 200) {
    add(FAIL, "Uinnlogget får 401 på data",
      "Fikk 200. Autentiseringen er ute av drift, og appen er åpen for alle.");
  } else add(WARN, "Uinnlogget får 401 på data", `fikk HTTP ${res.status}`);
}

async function checkSigninReachable() {
  // En adresse under et reservert domene avvises av valideringen før noe
  // forsøkes sendt, så sjekken koster ingenting. Ber man om en ekte kode,
  // sendes den — og ti i timen per IP betyr at to kjøringer mot
  // produksjon kan låse den som ruller ut ute av sin egen app.
  const res = await get("/api/auth/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ugyldig@ugyldig.invalid" }),
  });
  if (res.failed) return add(FAIL, "Innlogging svarer og validerer", res.failed);
  if (res.status === 422) add(PASS, "Innlogging svarer og validerer");
  else if (res.status === 404) {
    add(FAIL, "Innlogging svarer og validerer", "/api/auth/request-code finnes ikke");
  } else if (res.status === 200) {
    add(FAIL, "Innlogging svarer og validerer",
      "Ventet 422 for en ugyldig adresse, fikk 200 — altså ble det\n" +
      "forsøkt sendt en ekte e-post. Kjør ikke denne igjen før det er\n" +
      "rettet: rate-grensen er ti i timen.");
  } else add(WARN, "Innlogging svarer og validerer", `fikk HTTP ${res.status}`);
}

async function checkHeaders() {
  const res = await get("/");
  if (res.failed) return add(FAIL, "Sikkerhetsheadere", res.failed);

  if ((res.headers.get("x-content-type-options") ?? "").toLowerCase() === "nosniff") {
    add(PASS, "nosniff er satt");
  } else {
    add(WARN, "nosniff er satt",
      "Uten den gjetter nettleseren innholdstype fra bytene, og en\n" +
      "opplasting som utgir seg for å være et bilde blir tolket som det\n" +
      "den egentlig er. Settes i frontend/public/_headers.");
  }

  if (base.startsWith("https://")) add(PASS, "Serveres over HTTPS");
  else {
    add(FAIL, "Serveres over HTTPS",
      "Sesjonscookien settes med Secure og sendes da aldri over http.\n" +
      "Innlogging vil ikke fungere i det hele tatt.");
  }
}

async function checkDeepLink() {
  const res = await get("/anlegg/1");
  if (res.failed) return add(FAIL, "Dyplenker serverer appen", res.failed);
  const body = res.status === 200 ? await res.text() : "";
  if (res.status === 200 && body.includes('<div id="root"')) {
    add(PASS, "Dyplenker serverer appen");
  } else {
    add(FAIL, "Dyplenker serverer appen",
      `/anlegg/1 ga HTTP ${res.status}. Uten SPA-fallback virker navigasjon\n` +
      "inne i appen, men en oppdatering av siden gir 404. Settes med\n" +
      'not_found_handling = "single-page-application" i wrangler.toml.');
  }
}

console.log(`\nSjekker ${base}\n`);

await checkHealth();
await checkSameOrigin();
await checkRequiresAuth();
await checkSigninReachable();
await checkHeaders();
await checkDeepLink();

for (const { status, title, detail } of rows) {
  console.log(`  [${status}] ${title}`);
  for (const line of detail ? detail.split("\n") : []) console.log(`         ${line}`);
}

const failures = rows.filter((row) => row.status === FAIL).length;
const warnings = rows.filter((row) => row.status === WARN).length;

console.log();
console.log(`  ${rows.length - failures - warnings} ok, ${warnings} å se på, ${failures} feil`);
console.log();
console.log("  Merk: dette sier ingenting om e-postlevering, som er det som");
console.log("  faktisk avgjør om noen kommer seg inn. Logg inn selv én gang,");
console.log("  og sjekk at koden lander i innboksen — ikke i søppelposten.");
console.log();

process.exit(failures > 0 ? 1 : 0);
