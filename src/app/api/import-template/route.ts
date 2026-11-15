import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth/current-user";
import { importDef, importTemplate, type ImportType } from "@/server/services/csv-import";

/** Empty spreadsheet (CSV) with the right headings, to fill in Excel. */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Please log in.", { status: 401 });
  const type = new URL(request.url).searchParams.get("type") ?? "";
  const def = importDef(type);
  if (!def || !can(user, def.permission)) return new Response("Not found.", { status: 404 });
  return new Response(importTemplate(type as ImportType), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sitecore-${type}-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
