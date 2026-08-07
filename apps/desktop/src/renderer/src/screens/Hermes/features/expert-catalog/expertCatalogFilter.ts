import type { ExpertCatalogQuery } from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import type { WorkExpert } from "../../model/expert";

export function filterExperts(items: WorkExpert[], query?: ExpertCatalogQuery): WorkExpert[] {
  let result = items;
  if (query?.category && query.category !== "all") {
    result = result.filter((e) => e.category === query.category);
  }
  if (query?.keyword?.trim()) {
    const q = query.keyword.trim().toLowerCase();
    result = result.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  return result;
}
