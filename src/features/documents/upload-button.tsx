"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const MAX_SIDE = 2000;

/** Shrinks big phone photos before upload (saves data on site connections). */
async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function UploadButton({
  entityType,
  entityId,
  projectId,
  kind = "OTHER",
  camera,
}: {
  entityType: string;
  entityId: string;
  projectId?: string | null;
  kind?: string;
  camera?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const original of Array.from(files)) {
      const file = await compressImage(original);
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", entityType);
      form.set("entityId", entityId);
      if (projectId) form.set("projectId", projectId);
      form.set("kind", file.type.startsWith("image/") ? "PHOTO" : kind);
      form.set("title", original.name);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (res.ok) done++;
      else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(`${original.name}: ${body.error ?? "could not be uploaded"}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (done) {
      toast.success(done === 1 ? "File attached." : `${done} files attached.`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => upload(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Attach file
      </Button>
      {camera && (
        <>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" /> Take photo
          </Button>
        </>
      )}
    </div>
  );
}
