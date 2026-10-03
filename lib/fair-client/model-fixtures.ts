export type FairFixtureMode = "free" | "starter" | "advanced";
export type FairPhotoPresentation = "left" | "right" | "bottom";
export type FairAudienceThresholdFixture = "below" | "public";
export type FairAudienceResponseFixture = "success" | "error";
export type FairAudienceQuestionCountFixture = 1 | 5;

export type FairModelCapabilitiesFixture = {
  ratingMode: "none" | "overall" | "dimensions";
  canSubmitInterest: boolean;
  canRequestTestDrive: boolean;
  hasAudienceQuestions: boolean;
  hasSurvey: boolean;
  isSponsored: boolean;
};

export type FairModelSpecificationFixture = {
  id: string;
  label: string;
  value: string;
  shortLabel: string;
  isHighlight: boolean;
  icon: "power" | "torque" | "acceleration" | "speed";
};

export type FairPublicModelFixture = {
  id: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventName: string;
  exhibitorName: string;
  brandName: string;
  modelSlug: string;
  displayName: string;
  priceText: string;
  description: string;
  photoUrl?: string;
  photoPresentation: FairPhotoPresentation;
  specificationGroups: Array<{
    id: string;
    label: string;
    items: FairModelSpecificationFixture[];
  }>;
  capabilities: FairModelCapabilitiesFixture;
};

export type FairAudienceAnswerFixture = {
  id: string;
  label: string;
};

export type FairAudienceQuestionFixture = {
  id: string;
  prompt: string;
  answers: FairAudienceAnswerFixture[];
  resultPercentagesByAnswer: Record<string, number[]>;
};

export type FairAudienceFixture = {
  threshold: FairAudienceThresholdFixture;
  response: FairAudienceResponseFixture;
  questions: FairAudienceQuestionFixture[];
};

const capabilitiesByMode = {
  free: {
    ratingMode: "none",
    canSubmitInterest: false,
    canRequestTestDrive: false,
    hasAudienceQuestions: false,
    hasSurvey: false,
    isSponsored: false,
  },
  starter: {
    ratingMode: "overall",
    canSubmitInterest: true,
    canRequestTestDrive: false,
    hasAudienceQuestions: true,
    hasSurvey: false,
    isSponsored: false,
  },
  advanced: {
    ratingMode: "dimensions",
    canSubmitInterest: true,
    canRequestTestDrive: true,
    hasAudienceQuestions: true,
    hasSurvey: true,
    isSponsored: true,
  },
} as const satisfies Record<FairFixtureMode, FairModelCapabilitiesFixture>;

const specifications: FairModelSpecificationFixture[] = [
  {
    id: "power",
    label: "Snaga",
    shortLabel: "Snaga",
    value: "294 kW (400 KS)",
    isHighlight: true,
    icon: "power",
  },
  {
    id: "torque",
    label: "Obrtni moment",
    shortLabel: "Obrtni moment",
    value: "500 Nm",
    isHighlight: true,
    icon: "torque",
  },
  {
    id: "acceleration",
    label: "Ubrzanje 0-100 km/h",
    shortLabel: "0-100 km/h",
    value: "3,8 s",
    isHighlight: true,
    icon: "acceleration",
  },
  {
    id: "speed",
    label: "Maksimalna brzina",
    shortLabel: "Maks. brzina",
    value: "250 km/h",
    isHighlight: true,
    icon: "speed",
  },
];

const audienceQuestions: FairAudienceQuestionFixture[] = [
  {
    id: "strongest-impression",
    prompt: "Šta na ovom modelu ostavlja najsnažniji prvi utisak?",
    answers: [
      { id: "design", label: "Dizajn" },
      { id: "performance", label: "Performanse" },
      { id: "practicality", label: "Praktičnost" },
    ],
    resultPercentagesByAnswer: {
      design: [49, 33, 18],
      performance: [46, 36, 18],
      practicality: [46, 33, 21],
    },
  },
  {
    id: "showroom-detail",
    prompt: "Koji detalj biste prvo pogledali uživo?",
    answers: [
      { id: "interior", label: "Enterijer" },
      { id: "wheels", label: "Felne i kočnice" },
      { id: "engine", label: "Motorni prostor" },
    ],
    resultPercentagesByAnswer: {
      interior: [44, 31, 25],
      wheels: [41, 35, 24],
      engine: [41, 31, 28],
    },
  },
  {
    id: "daily-role",
    prompt: "U kojoj ulozi vam ovaj model ima najviše smisla?",
    answers: [
      { id: "daily", label: "Svakodnevna vožnja" },
      { id: "weekend", label: "Vikend automobil" },
      { id: "long-trip", label: "Duže putovanje" },
    ],
    resultPercentagesByAnswer: {
      daily: [48, 32, 20],
      weekend: [45, 35, 20],
      "long-trip": [45, 32, 23],
    },
  },
  {
    id: "priority",
    prompt: "Šta bi najviše uticalo na vašu odluku?",
    answers: [
      { id: "price", label: "Cena i uslovi" },
      { id: "drive", label: "Probna vožnja" },
      { id: "equipment", label: "Paket opreme" },
    ],
    resultPercentagesByAnswer: {
      price: [43, 34, 23],
      drive: [40, 37, 23],
      equipment: [40, 34, 26],
    },
  },
  {
    id: "one-word",
    prompt: "Koja reč najbolje opisuje RS 3 Sportback?",
    answers: [
      { id: "precise", label: "Precizan" },
      { id: "exciting", label: "Uzbudljiv" },
      { id: "versatile", label: "Svestran" },
    ],
    resultPercentagesByAnswer: {
      precise: [42, 38, 20],
      exciting: [39, 41, 20],
      versatile: [39, 38, 23],
    },
  },
];

export function readFairAudienceFixture(input: {
  questionCount: FairAudienceQuestionCountFixture;
  threshold: FairAudienceThresholdFixture;
  response: FairAudienceResponseFixture;
}): FairAudienceFixture {
  return {
    threshold: input.threshold,
    response: input.response,
    questions: audienceQuestions.slice(0, input.questionCount),
  };
}

export function readFairModelFixture(input: {
  eventSlug: string;
  modelSlug: string;
  mode: FairFixtureMode;
  withPhoto: boolean;
  photoPresentation: FairPhotoPresentation;
}): FairPublicModelFixture | null {
  if (
    input.eventSlug !== "auto-moto-fest-2026" ||
    input.modelSlug !== "audi-rs-3-sportback"
  ) {
    return null;
  }

  return {
    id: "fixture-model-audi-rs-3-sportback",
    eventId: "fixture-event-auto-moto-fest-2026",
    eventSlug: input.eventSlug,
    eventTitle: "Sajam automobila",
    eventName: "Auto Moto Fest",
    exhibitorName: "Audi",
    brandName: "Audi",
    modelSlug: input.modelSlug,
    displayName: "RS 3 Sportback",
    priceText: "Cena na upit",
    description: "Kompaktni sportski model sa petoro vrata i naglaskom na svakodnevnu upotrebljivost.",
    ...(input.withPhoto
      ? { photoUrl: "/fair/auto-moto-fest-2026/audi-rs-3-showroom.png" }
      : {}),
    photoPresentation: input.photoPresentation,
    specificationGroups: [
      {
        id: "performance",
        label: "Performanse",
        items: specifications,
      },
    ],
    capabilities: capabilitiesByMode[input.mode],
  };
}
