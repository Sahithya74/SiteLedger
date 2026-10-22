"use client";

import { useState, useTransition } from "react";
import { BellPlus, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { DialogForm, FormGrid, NativeSelect, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/contact";
import { DELIVERY_CHANNEL } from "@/lib/labels";
import { createReminderAction, recordDeliveryAction, sendTaskReminderAction } from "./actions";

type Opt = { value: string; label: string };
const channels = Object.entries(DELIVERY_CHANNEL).map(([value, label]) => ({ value, label }));

export function NewReminderDialog({ engineers, projects, defaultEngineerId, defaultProjectId }: { engineers: Opt[]; projects: Opt[]; defaultEngineerId?: string; defaultProjectId?: string }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <BellPlus className="size-4" /> New reminder
        </Button>
      }
      title="New reminder"
      description="Keep track of something to tell an engineer or to follow up. You pass it on yourself — by WhatsApp, a call or in person — and mark it sent."
      action={createReminderAction}
      submitLabel="Save reminder"
      wide
    >
      <FormGrid>
        <SelectField label="For engineer" name="engineerId" options={engineers} defaultValue={defaultEngineerId ?? ""} placeholder="Nobody in particular" />
        <SelectField label="Project" name="projectId" options={projects} defaultValue={defaultProjectId ?? ""} placeholder="Company-wide" />
        <TextField label="Reminder" name="title" required placeholder="e.g. Check slab shuttering before pour" fieldClassName="sm:col-span-2" />
        <TextAreaField label="Message to send" name="message" rows={3} required fieldClassName="sm:col-span-2" />
        <TextField label="Due by" name="dueDate" type="date" />
        <SelectField
          label="Importance"
          name="severity"
          defaultValue="INFO"
          options={[
            { value: "INFO", label: "Normal" },
            { value: "WARNING", label: "Important" },
            { value: "CRITICAL", label: "Urgent" },
          ]}
        />
      </FormGrid>
    </DialogForm>
  );
}

export function MarkSentDialog({ id, phone, message }: { id: string; phone: string | null; message: string }) {
  const wa = whatsappLink(phone, message);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {wa && (
        <Button asChild size="sm" variant="outline">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        </Button>
      )}
      <DialogForm trigger={<Button size="sm">Mark sent</Button>} title="Reminder passed on" action={recordDeliveryAction} submitLabel="Save">
        <input type="hidden" name="id" value={id} />
        <SelectField label="How" name="channel" options={channels} defaultValue={wa ? "WHATSAPP" : "PHONE_CALL"} required />
        <TextField label="Note (optional)" name="note" placeholder="e.g. Said he will finish by evening" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="resolve" defaultChecked className="size-4 accent-stone-800" />
          Done — no need to remind again
        </label>
      </DialogForm>
    </div>
  );
}

/** WhatsApp the engineer, then record how they were reminded. */
export function TaskReminderActions({ taskId, phone, message, sentToday }: { taskId: string; phone: string | null; message: string; sentToday: boolean }) {
  const [channel, setChannel] = useState(phone ? "WHATSAPP" : "PHONE_CALL");
  const [pending, start] = useTransition();
  const wa = whatsappLink(phone, message);
  if (sentToday) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
        <Check className="size-4" /> Reminded today
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {wa && (
        <Button asChild size="sm" variant="outline">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        </Button>
      )}
      <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} className="h-8 w-32 text-sm" aria-label="How was the reminder given">
        {channels.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTaskReminderAction(taskId, channel);
            if (r.ok) toast.success(r.message ?? "Saved.");
            else toast.error(r.error);
          })
        }
      >
        Mark reminded
      </Button>
    </div>
  );
}
