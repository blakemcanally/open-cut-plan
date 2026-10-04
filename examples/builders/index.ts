import type { ProjectInput } from "../../packages/core/src/index.ts";
import { eketWallIn } from "./eket-wall-in.ts";
import { kallax2x4Mm } from "./kallax-2x4-mm.ts";
import { kallax4x2CombinedMm } from "./kallax-4x2-combined-mm.ts";
import { livingRoomShelf } from "./living-room-shelf.ts";
import { simpleBookcaseMm } from "./simple-bookcase-mm.ts";

export const EXAMPLES: Readonly<Record<string, () => ProjectInput>> = {
  "living-room-shelf": livingRoomShelf,
  "simple-bookcase-mm": simpleBookcaseMm,
  "kallax-2x4-mm": kallax2x4Mm,
  "kallax-4x2-combined-mm": kallax4x2CombinedMm,
  "eket-wall-in": eketWallIn,
};
