import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Hide a column below a screen size so tables stay readable on phones. */
const HIDE = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const;

export type Column<T> = {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "right";
  hide?: keyof typeof HIDE;
  className?: string;
};

/**
 * Server-rendered table used across the app. Columns are plain functions,
 * so it is only used from server components.
 */
export function SimpleTable<T>({
  rows,
  columns,
  rowKey,
  rowClassName,
  footer,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** Footer cells, one per column (null for empty). */
  footer?: (React.ReactNode | null)[];
  className?: string;
}) {
  const cellClass = (c: Column<T>) => cn(c.hide && HIDE[c.hide], c.align === "right" && "text-right", c.className);
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((c, i) => (
              <TableHead key={i} className={cellClass(c)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((c, i) => (
                <TableCell key={i} className={cn("py-2.5 align-top", cellClass(c))}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {footer && (
          <TableFooter>
            <TableRow>
              {columns.map((c, i) => (
                <TableCell key={i} className={cn("font-semibold", cellClass(c))}>
                  {footer[i] ?? null}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

/** Two-line cell: main text plus a muted line underneath. */
export function Cell2({ main, sub, className }: { main: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="font-medium">{main}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
