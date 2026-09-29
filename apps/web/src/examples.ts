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
];
