// Norwegian UI strings
// All user-facing text lives here – keep code in English

export const t = {
  // Navigation
  nav: {
    properties: "Eiendommer",
    panel: "Sikringsskap",
    circuit: "Kurs",
    connectionPoint: "Koblingspunkt",
    equipment: "Fastmontert utstyr",
  },

  // Properties
  property: {
    title: "Eiendommer",
    add: "Legg til eiendom",
    name: "Navn",
    address: "Adresse",
    panels: "Sikringsskap",
    noProperties: "Ingen eiendommer registrert",
  },

  // Panel
  panel: {
    title: "Sikringsskap",
    add: "Legg til skap",
    name: "Navn",
    location: "Plassering",
    rows: "Antall skinnerader",
    modulesPerRow: "Moduler per skinne",
    notes: "Kommentar",
    configure: "Konfigurer skap",
    mockup: "Skemontasje",
    rail: "Skinne",
    emptySlots: "ledige",
    addModule: "Legg til modul",
    editModule: "Rediger modul",
    deleteModule: "Slett modul",
  },

  module: {
    type: "Type",
    ampere: "Ampere",
    label: "Etikett",
    circuit: "Kursbetegnelse",
    width: "Bredde (moduler)",
    noCircuit: "Ingen kurs (kobles fritt)",
    typeRequired: "Type er påkrevd",
  },

  // Module types
  moduleType: {
    breaker: "Automatsikring",
    rcd: "Jordfeilbryter",
    rcd_breaker: "Kombibryter (LS+JF)",
    shelly: "Shelly",
    dynalite: "Dynalite",
    surge_protection: "Overspenningsvern",
    other: "Annet",
  },

  // Circuit
  circuit: {
    title: "Kurs",
    add: "Legg til kurs",
    edit: "Rediger kurs",
    designation: "Kursbetegnelse",
    name: "Navn",
    room: "Rom",
    cableType: "Kabeltype",
    crossSection: "Tverrsnitt (mm²)",
    conductorCount: "Antall leder",
    lengthM: "Lengde (m)",
    notes: "Kommentar",
    connectionPoints: "Koblingspunkter",
    equipment: "Fastmontert utstyr",
    changelog: "Endringslogg",
    noCircuits: "Ingen kurser registrert enda.",
    designationRequired: "Kursbetegnelse er påkrevd",
    nameRequired: "Navn er påkrevd",
    cannotDeleteHasConnectionPoints: "Kan ikke slette kurs som har koblingspunkter. Slett koblingspunktene først.",
    deleteError: "Kunne ikke slette kurs.",
  },

  // Connection point
  connectionPoint: {
    title: "Koblingspunkt",
    add: "Legg til koblingspunkt",
    edit: "Rediger koblingspunkt",
    type: "Type",
    location: "Plassering",
    notes: "Kommentar",
    files: "Filer og bilder",
    typeRequired: "Type er påkrevd",
    locationRequired: "Plassering er påkrevd",
    noConnectionPoints: "Ingen koblingspunkter registrert",
    cannotDeleteHasFiles: "Kan ikke slette koblingspunkt som har filer. Slett filene først.",
    deleteError: "Kunne ikke slette koblingspunkt.",
    types: {
      junction_box: "Koblingsboks",
      outlet: "Stikkontakt",
      light: "Lampe/armatur",
      switch: "Bryter",
      motor: "Motor",
      other: "Annet",
    },
  },

  // Equipment
  equipment: {
    title: "Fastmontert utstyr",
    add: "Legg til utstyr",
    type: "Type",
    brand: "Merke",
    model: "Modell",
    watt: "Effekt (W)",
    notes: "Kommentar",
    types: {
      floor_heating: "Varmekabler",
      ev_charger: "Elbillader",
      heat_pump: "Varmepumpe",
      boiler: "Varmtvannsbereder",
      other: "Annet",
    },
  },

  // Files
  files: {
    upload: "Last opp fil",
    uploadHint: "Slipp filer her eller klikk for å velge",
    acceptedTypes: "JPG, PNG, PDF opptil 20 MB",
    invalidType: "Filtype ikke støttet. Kun JPG, PNG og PDF er tillatt.",
    tooLarge: "Filen er for stor. Maks 20 MB",
    uploadError: "Filopplasting feilet",
    deleteConfirm: "Er du sikker på at du vil slette filen?",
  },

  // Changelog
  changelog: {
    title: "Endringslogg",
    add: "Registrer endring",
    changedBy: "Utført av",
    description: "Beskrivelse",
    changedAt: "Tidspunkt",
    noEntries: "Ingen endringer registrert",
    changedByRequired: "Utført av er påkrevd",
    descriptionRequired: "Beskrivelse er påkrevd",
  },

  // Common
  common: {
    save: "Lagre",
    cancel: "Avbryt",
    delete: "Slett",
    edit: "Rediger",
    close: "Lukk",
    back: "Tilbake",
    loading: "Laster...",
    confirmDelete: "Er du sikker på at du vil slette?",
    noData: "Ingen data",
    exportPdf: "Eksporter PDF",
    ampere: "Ampere",
    yes: "Ja",
    no: "Nei",
  },
}
