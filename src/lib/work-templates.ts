/**
 * The standard building work breakdown (spec §7). "Add standard stages"
 * loads these into a project; every name can be edited afterwards.
 * `after` lists the items that normally have to finish first.
 */
export type TemplatePhase = {
  name: string;
  items: { name: string; after?: string[] }[];
};

export const STANDARD_STAGES: TemplatePhase[] = [
  {
    name: "Foundation",
    items: [
      { name: "Excavation" },
      { name: "PCC", after: ["Excavation"] },
      { name: "Footing", after: ["PCC"] },
      { name: "Reinforcement", after: ["Footing"] },
      { name: "Concrete", after: ["Reinforcement"] },
    ],
  },
  {
    name: "Structure",
    items: [
      { name: "Columns", after: ["Concrete"] },
      { name: "Beams", after: ["Columns"] },
      { name: "Slab", after: ["Beams"] },
    ],
  },
  {
    name: "Masonry",
    items: [{ name: "Brickwork", after: ["Slab"] }, { name: "Blockwork", after: ["Slab"] }],
  },
  {
    name: "Finishing",
    items: [
      { name: "Plastering", after: ["Brickwork"] },
      { name: "Electrical" },
      { name: "Plumbing" },
      { name: "Flooring", after: ["Plastering"] },
      { name: "Granite", after: ["Plastering"] },
      { name: "Doors" },
      { name: "Windows" },
      { name: "Painting", after: ["Plastering"] },
    ],
  },
];
