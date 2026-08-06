import type {
  SessionCatalogDraftItem,
  SessionCatalogItem,
  SessionCatalogStatus,
} from "@shared/session-catalog/session-catalog-contract";

export type SessionCatalogFiltersState = {
  profileId: string | "all";
  search: string;
  status: SessionCatalogStatus | "all";
  includeArchived: boolean;
  showDrafts: boolean;
};

export type SessionCatalogViewModel = {
  items: SessionCatalogItem[];
  drafts: SessionCatalogDraftItem[];
  loading: boolean;
  error: string | null;
  profilesUnavailable: string[];
  knownProfiles: string[];
};
