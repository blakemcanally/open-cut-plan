export interface IkeaItem {
  name: string;
  /** The IKEA GB article number. Other countries can use other numbers. */
  article: string;
  source: string;
  /** The IKEA assembly guide, when it was confirmed. */
  guide?: string;
  checked: string;
}

export const IKEA_CHECKED = "2026-09-29";

export const IKEA_RAIL_70: IkeaItem = {
  name: "EKET suspension rail, 70 cm",
  article: "80340048",
  source: "https://www.ikea.com/gb/en/p/eket-suspension-rail-70cm-80340048/",
  guide: "AA-1912543-9",
  checked: IKEA_CHECKED,
};

export const IKEA_RAIL_35: IkeaItem = {
  name: "EKET suspension rail, 35 cm",
  article: "00340047",
  source: "https://www.ikea.com/gb/en/p/eket-suspension-rail-35cm-00340047/",
  guide: "AA-1912543-9",
  checked: IKEA_CHECKED,
};

export const IKEA_LEGS: readonly IkeaItem[] = [
  { name: "EKET legs, black, 4-pack", article: "70574660", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-black-70574660/", guide: "AA-2425733-1", checked: IKEA_CHECKED },
  { name: "EKET legs, wood, 4-pack", article: "80474151", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-wood-80474151/", guide: "AA-2196566-3", checked: IKEA_CHECKED },
  { name: "EKET legs, silver, 4-pack", article: "70428904", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-metal-70428904/", checked: IKEA_CHECKED },
];

export const IKEA_FEET: IkeaItem = {
  name: "EKET adjustable feet, 4-pack",
  article: "70340044",
  source: "https://www.ikea.com/gb/en/p/eket-adjustable-feet-70340044/",
  guide: "AA-1909148-2",
  checked: IKEA_CHECKED,
};

/** The EKET rail listing asks for 5 cm between the top of the unit and the ceiling. */
export const RAIL_CLEARANCE_MM = 50;
