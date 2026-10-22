"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/action-types";

export type FormAction = (state: ActionResult<unknown>, formData: FormData) => Promise<ActionResult<unknown>>;

const INITIAL: ActionResult<unknown> = { ok: true };

/**
 * Wires a form to a server action.
 * - Keeps what the person typed when the server rejects the form
 *   (React would otherwise reset the form after every submission).
 * - Shows a toast on success and calls `onSuccess`.
 */
export function useActionForm(
  action: FormAction,
  options: { successMessage?: string; onSuccess?: (state: ActionResult<unknown>) => void } = {},
) {
  const [state, dispatch, pending] = useActionState(action, INITIAL);
  const submitted = useRef(false);
  const { successMessage, onSuccess } = options;

  useEffect(() => {
    if (!submitted.current) return;
    submitted.current = false;
    if (state.ok) {
      const message = state.message ?? successMessage;
      if (message) toast.success(message);
      onSuccess?.(state);
    } else if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) {
      toast.error(state.error);
    }
  }, [state, successMessage, onSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    submitted.current = true;
    startTransition(() => dispatch(formData));
  }

  const fieldErrors = state.ok ? {} : (state.fieldErrors ?? {});
  return { state, pending, onSubmit, fieldErrors, formError: state.ok ? null : state.error };
}

/** Banner for a form-level error message. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

export function HelpTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="More information">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm">{children}</TooltipContent>
    </Tooltip>
  );
}

type FieldProps = {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (props: { id: string; name: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
};

/**
 * Field errors from the nearest DialogForm / ActionForm, so fields can be
 * written declaratively (even from server components) without wiring errors by hand.
 */
const FormErrorsContext = createContext<Record<string, string>>({});

/** Label + control + hint + error, with accessible wiring. */
export function Field({ label, name, error: errorProp, hint, help, required, className, children }: FieldProps) {
  const id = useId();
  const contextErrors = useContext(FormErrorsContext);
  const error = errorProp ?? contextErrors[name];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {/* Screen readers already announce "required" from the input itself. */}
          {required && (
            <span aria-hidden="true" className="text-red-600">
              {" "}
              *
            </span>
          )}
        </Label>
        {help && <HelpTip>{help}</HelpTip>}
      </div>
      {children({ id, name, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<React.ComponentProps<typeof Input>, "name" | "children"> & {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  fieldClassName?: string;
};

export function TextField({ label, name, error, hint, help, required, fieldClassName, ...input }: TextFieldProps) {
  return (
    <Field label={label} name={name} error={error} hint={hint} help={help} required={required} className={fieldClassName}>
      {(p) => <Input {...p} {...input} required={required} className={cn("h-10", input.className)} />}
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  help,
  required,
  fieldClassName,
  ...textarea
}: Omit<React.ComponentProps<typeof Textarea>, "name"> & {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  fieldClassName?: string;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint} help={help} required={required} className={fieldClassName}>
      {(p) => <Textarea {...p} {...textarea} required={required} />}
    </Field>
  );
}

/** Rupee amount input. Accepts "1,25,000.50"; the server parses it exactly. */
export function MoneyField({
  label,
  name,
  error,
  hint,
  help,
  required,
  defaultValue,
  fieldClassName,
  ...rest
}: Omit<React.ComponentProps<"input">, "name" | "type"> & {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  fieldClassName?: string;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint} help={help} required={required} className={fieldClassName}>
      {(p) => (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₹</span>
          <Input
            {...p}
            {...rest}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={rest.placeholder ?? "0"}
            defaultValue={defaultValue}
            required={required}
            className="tabular h-10 pl-7"
          />
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  help,
  required,
  options,
  placeholder,
  fieldClassName,
  ...select
}: Omit<React.ComponentProps<"select">, "name"> & {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
  fieldClassName?: string;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint} help={help} required={required} className={fieldClassName}>
      {(p) => (
        <NativeSelect {...p} {...select} required={required}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

/** A plain <select> styled like the other inputs (native pickers work best on phones). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50",
        className,
      )}
    />
  );
}

export function SubmitButton({
  pending,
  children,
  pendingText = "Saving…",
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean; pendingText?: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

/** Lays out fields in a responsive grid. */
export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border bg-card p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {description && <p className="mb-4 text-sm text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ready-made forms. Children are ordinary fields; their errors appear
// automatically. When the server asks for confirmation (a field error whose
// value is "needs-confirmation", e.g. a payment larger than what is pending),
// the form shows the warning and a "save anyway" tick box.
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmationNeeded({ fieldErrors, message }: { fieldErrors: Record<string, string>; message: string | null }) {
  const keys = Object.entries(fieldErrors)
    .filter(([, v]) => v === "needs-confirmation")
    .map(([k]) => k);
  if (keys.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>{message}</p>
      {keys.map((k) => (
        <label key={k} className="flex items-center gap-2 font-medium">
          <input type="checkbox" name={k} value="true" className="size-4 accent-amber-700" required />
          Yes, the details are correct — save it anyway
        </label>
      ))}
    </div>
  );
}

function FormBody({
  fieldErrors,
  formError,
  children,
}: {
  fieldErrors: Record<string, string>;
  formError: string | null;
  children: React.ReactNode;
}) {
  const needsConfirm = Object.values(fieldErrors).includes("needs-confirmation");
  const realFieldErrors = Object.values(fieldErrors).some((v) => v !== "needs-confirmation");
  return (
    <FormErrorsContext value={fieldErrors}>
      {needsConfirm ? (
        <ConfirmationNeeded fieldErrors={fieldErrors} message={formError} />
      ) : (
        <FormError message={realFieldErrors ? "Please check the fields marked in red." : formError} />
      )}
      {children}
    </FormErrorsContext>
  );
}

/** A button that opens a dialog containing a form bound to a server action. */
export function DialogForm({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  successMessage,
  wide,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action: FormAction;
  submitLabel?: string;
  successMessage?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { onSubmit, pending, fieldErrors, formError } = useActionForm(action, {
    successMessage,
    onSuccess: () => {
      setOpen(false);
      setFormKey((k) => k + 1);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn("max-h-[92dvh] overflow-y-auto", wide && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormBody fieldErrors={fieldErrors} formError={formError}>
            {children}
          </FormBody>
          <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A full-page form bound to a server action (usually redirects on success). */
export function ActionForm({
  action,
  submitLabel = "Save",
  successMessage,
  cancelHref,
  resetOnSuccess,
  className,
  children,
}: {
  action: FormAction;
  submitLabel?: string;
  successMessage?: string;
  cancelHref?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [formKey, setFormKey] = useState(0);
  const { onSubmit, pending, fieldErrors, formError } = useActionForm(action, {
    successMessage,
    onSuccess: resetOnSuccess ? () => setFormKey((k) => k + 1) : undefined,
  });
  return (
    <form key={formKey} onSubmit={onSubmit} className={cn("flex max-w-4xl flex-col gap-5", className)}>
      <FormBody fieldErrors={fieldErrors} formError={formError}>
        {children}
      </FormBody>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        {cancelHref && (
          <Button asChild variant="outline" size="lg">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
