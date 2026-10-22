import { cn } from "@/lib/utils";
import { formatINR, formatINRShort, type Paise } from "@/lib/money";

type MoneyProps = {
  paise: Paise | null | undefined;
  /** ₹2.8 Cr / ₹90 L style. The exact amount is shown on hover. */
  short?: boolean;
  /** Hide paise (".00"). */
  wholeRupees?: boolean;
  /** Colour negative amounts red. */
  colorNegative?: boolean;
  className?: string;
};

/** Displays an amount in Indian format: ₹1,25,000.00 */
export function Money({ paise, short, wholeRupees, colorNegative, className }: MoneyProps) {
  if (paise === null || paise === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const full = formatINR(paise);
  const text = short ? formatINRShort(paise) : formatINR(paise, { paise: !wholeRupees });
  return (
    <span
      className={cn("tabular whitespace-nowrap", colorNegative && paise < 0n && "text-red-700", className)}
      title={short || wholeRupees ? full : undefined}
    >
      {text}
    </span>
  );
}
