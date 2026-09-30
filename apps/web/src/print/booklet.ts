export type BookletSection = "title" | "shopping" | "sheets" | "sequence" | "assembly";

export const BOOKLET_SECTIONS: readonly BookletSection[] = ["title", "shopping", "sheets", "sequence", "assembly"];

export const BOOKLET_LABELS: Readonly<Record<BookletSection, string>> = {
  title: "Title page",
  shopping: "Shopping list",
  sheets: "Sheet diagrams",
  sequence: "Cut sequence",
  assembly: "Assembly steps",
};
