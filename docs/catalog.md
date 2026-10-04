# Catalogue of sheet goods

The catalogue is a list of common sheet goods and their sheet sizes. It has hardwood plywood, Baltic birch,
construction plywood, underlayment, OSB, MDF, melamine, particleboard, hardboard, and pegboard. The web app and the CLI
use it to add materials and stock to a project. The catalogue is a list to choose from. It does not tell what you own.

## The data

The data is in [`packages/core/src/catalog/data.ts`](../packages/core/src/catalog/data.ts). It has 33 materials and
64 sheet sizes.

| Item | Fields |
|---|---|
| Material | `id`, `family`, `name` (for example `Birch plywood 3/4"`), `nominal` (the thickness that the store gives), `thicknessIn` and `thicknessMm` (the actual thickness), `grained`, `notes`, and `sizes`. |
| Sheet size | `id`, `label` (the nominal size, for example `4 × 8 ft`), `lengthIn`, `widthIn`, `lengthMm`, `widthMm` (the actual size), and `listings`. |
| Listing | `store`, `priceUsd` (or `null` when no price was found), `source` (the address of the page), and `checked` (the date of the check). |

The ids do not change. The id of a size starts with the id of its material, for example `birch-ply-3-4-4x8`. The sizes
of a material go from the largest to the smallest.

## Where the data comes from

- The materials, sizes, and prices come from the Home Depot and Lowe's web sites. We collected them one time, on
  2026-10-04. Some prices come from the summaries of search results, not from the pages, so a price can be wrong.
- Home Depot and Lowe's do not sell Baltic birch. Its sizes come from specialty sellers. It has no prices.
- The app and the CLI do not read the store web sites. The pages change, and the terms of the sites can forbid it.

## Prices

- The prices are approximate, and they get old. Each price has its store and its date. Check the price before you buy.
- The typical price of a size is the lowest price of its listings.
- Stock from the catalogue gets the typical price as its cost only when the project currency is USD. In other
  currencies, the stock has no cost.

## Thickness and size

- The thickness is the actual thickness from the store listing, not the nominal thickness. The notes tell when the
  thickness is not checked, for example when it comes from a similar product.
- When the stores give different actual sizes for one nominal size, the catalogue uses the Home Depot size. The notes
  give the other size.

## Add from the catalogue

- A catalogue material becomes a normal material in the project, with the catalogue name, the actual thickness in the
  project units, and the grain. A sheet size becomes normal sheet stock, with unlimited quantity. The file does not
  record the catalogue, so the file format does not change.
- The app uses a project material when it has the catalogue id or the catalogue name (without case) and the same
  thickness. It does not add a second material.
- The app uses a sheet of that material and size when the project has one. It does not add a second stock item.
- The new ids come from the catalogue ids: `birch-ply-3-4` and `birch-ply-3-4-4x8`. When an id is in use, the app
  adds a number, as in `birch-ply-3-4-2`.

See [web-app.md](web-app.md#stock) and [cli.md](cli.md#catalogue).

## Suggested sheet

The app and the CLI add a suggested sheet for a material that has no enabled stock. The Design tab adds it for the
materials of a new design. **Add stock** on the Layout, Parts, and Stock tabs adds it, and so does
`stock add --suggested` in the CLI.

- When the catalogue has a material with the same id, or the same name (without case), the sheet is its largest size.
  The cost is the typical price when the project currency is USD.
- Otherwise, the sheet is 96" × 48" (2440 × 1220 mm), with no cost. The app does not guess a price.
- The sheet has unlimited quantity.

## Update the catalogue

1. Edit `packages/core/src/catalog/data.ts`. Do not change an id that exists, because scripts can use it.
2. Give each listing its store, the address of the page, and the date of the check. Use `null` as the price when
   the page has no price. Do not guess a price.
3. Give the length before the width, and give each size in inches and in millimetres.
4. Run `npm test -w @opencutplan/core`. The data test checks that the ids are unique, that each length is not less
   than its width, that the sizes are positive, that the inches and the millimetres agree, and that each listing has a
   store, a source, and a date.
