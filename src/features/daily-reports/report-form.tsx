"use client";

import { useRouter } from "next/navigation";
import { ActionForm, FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { WEATHER } from "@/lib/labels";
import { saveDailyReportAction } from "./actions";

type Opt = { value: string; label: string };

export type DailyReportValues = {
  projectId: string;
  siteId: string;
  date: string;
  weather: string;
  weatherNote: string;
  labourPresent: string;
  engineersPresent: string;
  workCompleted: string;
  materialsReceived: string;
  materialsUsed: string;
  equipmentUsed: string;
  issues: string;
  safetyObservations: string;
  notes: string;
};

/**
 * Daily site report. Changing the project or date reloads the page so the
 * report is pre-filled from that day's attendance, stock and equipment entries.
 */
export function DailyReportForm({ projects, sites, values, existing, maxDate }: { projects: Opt[]; sites: Opt[]; values: DailyReportValues; existing: boolean; maxDate: string }) {
  const router = useRouter();
  const reload = (projectId: string, date: string) => router.replace(`/daily-reports/new?project=${projectId}&date=${date}`);
  return (
    <ActionForm action={saveDailyReportAction} submitLabel={existing ? "Update report" : "Submit report"} cancelHref="/daily-reports">
      {existing && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">A report already exists for this site and day — saving will update it.</p>
      )}
      <FormSection title="Site and day">
        <FormGrid>
          <SelectField label="Project" name="projectId" value={values.projectId} onChange={(e) => reload(e.target.value, values.date)} options={projects} placeholder="Choose…" required />
          {sites.length > 1 ? (
            <SelectField label="Site" name="siteId" defaultValue={values.siteId} options={sites} required />
          ) : (
            <input type="hidden" name="siteId" value={values.siteId} />
          )}
          <TextField label="Date" name="date" type="date" value={values.date} max={maxDate} onChange={(e) => e.target.value && reload(values.projectId, e.target.value)} required />
          <SelectField label="Weather" name="weather" defaultValue={values.weather} options={Object.entries(WEATHER).map(([value, label]) => ({ value, label }))} />
          <TextField label="Weather note" name="weatherNote" defaultValue={values.weatherNote} placeholder="e.g. Rain after 3 pm, work stopped" />
          <TextField label="Workers present" name="labourPresent" type="number" min={0} defaultValue={values.labourPresent} required hint="Filled from today's attendance" />
          <TextField label="Engineers present" name="engineersPresent" type="number" min={0} defaultValue={values.engineersPresent} />
        </FormGrid>
      </FormSection>
      <FormSection title="Work" description="Lines starting with • were filled from today's work updates — edit freely.">
        <div className="flex flex-col gap-4">
          <TextAreaField label="Work done today" name="workCompleted" rows={5} defaultValue={values.workCompleted} required />
          <TextAreaField label="Problems / delays" name="issues" rows={2} defaultValue={values.issues} />
          <TextAreaField label="Safety observations" name="safetyObservations" rows={2} defaultValue={values.safetyObservations} />
        </div>
      </FormSection>
      <FormSection title="Materials and equipment" description="Filled from today's stock and equipment entries.">
        <FormGrid>
          <TextAreaField label="Material received" name="materialsReceived" rows={3} defaultValue={values.materialsReceived} />
          <TextAreaField label="Material used" name="materialsUsed" rows={3} defaultValue={values.materialsUsed} />
          <TextAreaField label="Equipment used" name="equipmentUsed" rows={2} defaultValue={values.equipmentUsed} />
          <TextAreaField label="Other notes" name="notes" rows={2} defaultValue={values.notes} />
        </FormGrid>
      </FormSection>
    </ActionForm>
  );
}
