export interface CatalogListing {
  store: string;
  /** null when no price was found for this store. */
  priceUsd: number | null;
  source: string;
  /** The date the listing was read, as YYYY-MM-DD. */
  checked: string;
}

export interface CatalogSize {
  id: string;
  /** The nominal size, for example "4 × 8 ft". */
  label: string;
  lengthIn: number;
  widthIn: number;
  lengthMm: number;
  widthMm: number;
  listings: readonly CatalogListing[];
}

export interface CatalogMaterial {
  id: string;
  family: string;
  name: string;
  nominal: string;
  thicknessIn: number;
  thicknessMm: number;
  grained: boolean;
  notes: string;
  /** Largest first. */
  sizes: readonly CatalogSize[];
}
