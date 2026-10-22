"use client";

import { FolderPlus, Pencil, Plus } from "lucide-react";
import { DialogForm, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { MaterialKind } from "@/generated/prisma/enums";
import { createCategoryAction, createMaterialAction, updateMaterialAction } from "./actions";

type Opt = { value: string; label: string };

export type MaterialValues = {
  name: string;
  categoryId: string;
  unit: string;
  reorderLevel: string;
  defaultRate: string;
  brand: string;
  grade: string;
  size: string;
  colour: string;
  thickness: string;
  finish: string;
  notes: string;
};

const UNITS = ["bag", "kg", "tonne", "cft", "cum", "sqft", "rft", "nos", "box", "load", "litre", "metre", "set", "roll"];

function MaterialFields({ categories, values }: { categories: Opt[]; values?: Partial<MaterialValues> }) {
  return (
    <FormGrid>
      <TextField label="Material name" name="name" defaultValue={values?.name} required placeholder="e.g. Cement – UltraTech OPC 53" fieldClassName="sm:col-span-2" />
      <SelectField label="Category" name="categoryId" options={categories} defaultValue={values?.categoryId} placeholder="Choose…" required />
      <TextField label="Unit" name="unit" defaultValue={values?.unit ?? "bag"} required list="material-units" hint="bag, kg, tonne, cft, sqft, nos…" />
      <datalist id="material-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <TextField label="Reorder level" name="reorderLevel" defaultValue={values?.reorderLevel ?? "0"} inputMode="decimal" required help="When stock at a site falls to this level, you get a 'stock is low' alert. 0 = no alert." />
      <MoneyField label="Usual rate (per unit)" name="defaultRatePaise" defaultValue={values?.defaultRate} hint="Optional — filled in on new purchases." />
      <TextField label="Brand" name="brand" defaultValue={values?.brand} placeholder="Optional" />
      <TextField label="Grade / type" name="grade" defaultValue={values?.grade} placeholder="e.g. OPC 53, Fe 550D" />
      <TextField label="Size" name="size" defaultValue={values?.size} placeholder="e.g. 12 mm, 600×600" />
      <TextField label="Colour" name="colour" defaultValue={values?.colour} placeholder="Optional" />
      <TextField label="Thickness" name="thickness" defaultValue={values?.thickness} placeholder="e.g. 18 mm" />
      <TextField label="Finish" name="finish" defaultValue={values?.finish} placeholder="e.g. glossy" />
      <TextAreaField label="Notes" name="notes" defaultValue={values?.notes} rows={2} fieldClassName="sm:col-span-2" />
    </FormGrid>
  );
}

export function AddMaterialDialog({ categories }: { categories: Opt[] }) {
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Plus className="size-4" /> Add material
        </Button>
      }
      title="Add a material"
      action={createMaterialAction}
      submitLabel="Add material"
      wide
    >
      <MaterialFields categories={categories} />
    </DialogForm>
  );
}

export function EditMaterialDialog({ id, categories, values }: { id: string; categories: Opt[]; values: MaterialValues }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Pencil className="size-4" /> Edit
        </Button>
      }
      title={`Edit ${values.name}`}
      action={updateMaterialAction.bind(null, id)}
      submitLabel="Save"
      wide
    >
      <MaterialFields categories={categories} values={values} />
    </DialogForm>
  );
}

const KIND_LABEL: Record<MaterialKind, string> = {
  AGGREGATE: "Aggregates",
  CEMENT: "Cement",
  STEEL: "Steel",
  BRICK_BLOCK: "Bricks & blocks",
  STONE_GRANITE: "Stone & granite",
  TILES: "Tiles",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  PAINT: "Paint",
  WOOD: "Wood",
  HARDWARE: "Hardware",
  OTHER: "Other",
};

export function AddCategoryDialog() {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <FolderPlus className="size-4" /> Add category
        </Button>
      }
      title="Add a material category"
      action={createCategoryAction}
      submitLabel="Add category"
    >
      <TextField label="Category name" name="name" required placeholder="e.g. Waterproofing" />
      <SelectField label="Type" name="kind" defaultValue="OTHER" options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
    </DialogForm>
  );
}
