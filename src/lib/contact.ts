/**
 * Phone helpers. WhatsApp links open the app with a ready message — no
 * WhatsApp API or account integration is needed.
 */

/** "098400 12345" / "+91 98400-12345" → "919840012345" (digits only, with country code). */
export function internationalDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits.length >= 8 ? digits : null;
}

export function telLink(phone: string | null | undefined): string | null {
  const d = internationalDigits(phone);
  return d ? `tel:+${d}` : null;
}

export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const d = internationalDigits(phone);
  if (!d) return null;
  return `https://wa.me/${d}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Shows Indian mobile numbers as "98400 12345". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = internationalDigits(phone);
  if (d && d.length === 12 && d.startsWith("91")) return `${d.slice(2, 7)} ${d.slice(7)}`;
  return phone;
}
