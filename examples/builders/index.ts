import type { ProjectInput } from "../../packages/core/src/index.ts";
import { livingRoomShelf } from "./living-room-shelf.ts";
import { simpleBookcaseMm } from "./simple-bookcase-mm.ts";

export const EXAMPLES: Readonly<Record<string, () => ProjectInput>> = {
  "living-room-shelf": livingRoomShelf,
  "simple-bookcase-mm": simpleBookcaseMm,
};
