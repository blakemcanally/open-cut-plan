import eketWall from "../../../examples/eket-wall-in.cutplan.json?raw";
import kallax from "../../../examples/kallax-2x4-mm.cutplan.json?raw";
import kallaxCombined from "../../../examples/kallax-4x2-combined-mm.cutplan.json?raw";
import livingRoomShelf from "../../../examples/living-room-shelf.cutplan.json?raw";
import simpleBookcase from "../../../examples/simple-bookcase-mm.cutplan.json?raw";

export interface Example {
  slug: string;
  title: string;
  text: string;
}

export const EXAMPLES: readonly Example[] = [
  { slug: "living-room-shelf", title: "Living-room shelf (inches, baltic birch)", text: livingRoomShelf },
  { slug: "simple-bookcase-mm", title: "Simple bookcase (millimetres)", text: simpleBookcase },
  { slug: "kallax-2x4-mm", title: "KALLAX-style 2x4 unit (millimetres, design)", text: kallax },
  { slug: "kallax-4x2-combined-mm", title: "KALLAX-style 4x2 unit with combined cells (millimetres, design)", text: kallaxCombined },
  { slug: "eket-wall-in", title: "EKET-style units on the wall rail (inches, design)", text: eketWall },
];
