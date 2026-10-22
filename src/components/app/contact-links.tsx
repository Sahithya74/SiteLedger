import { MessageCircle, Phone } from "lucide-react";
import { formatPhone, telLink, whatsappLink } from "@/lib/contact";

/** Phone number with one-tap Call and WhatsApp buttons. */
export function ContactLinks({ phone, message }: { phone: string | null | undefined; message?: string }) {
  const tel = telLink(phone);
  const wa = whatsappLink(phone, message);
  if (!tel) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular">{formatPhone(phone)}</span>
      <a href={tel} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-muted" aria-label={`Call ${formatPhone(phone)}`}>
        <Phone className="size-3" /> Call
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-muted"
          aria-label="Open WhatsApp chat"
        >
          <MessageCircle className="size-3" /> WhatsApp
        </a>
      )}
    </span>
  );
}
