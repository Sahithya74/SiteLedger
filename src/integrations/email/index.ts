import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email (used only for verification and "forgot password" codes).
 * Configure an SMTP account in .env — for Gmail use smtp.gmail.com, port 465
 * and an App Password (Google Account → Security → App passwords).
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function transport(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export type EmailMessage = { to: string; subject: string; text: string };

/**
 * Sends an email. Without SMTP settings, development machines print the
 * message in the server console instead; production refuses.
 */
export async function sendEmail(message: EmailMessage): Promise<"sent" | "logged"> {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[email not configured — shown here instead]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
      return "logged";
    }
    throw new Error("Email is not set up.");
  }
  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return "sent";
}
