"use server";

import { requireActionUser } from "@/server/auth/current-user";
import { globalSearch, type SearchResult } from "@/server/services/search";

export async function searchAction(query: string): Promise<SearchResult[]> {
  const user = await requireActionUser();
  if (typeof query !== "string") return [];
  return globalSearch(user, query);
}
