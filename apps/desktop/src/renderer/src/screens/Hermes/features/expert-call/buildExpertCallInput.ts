import type {
  CallCatalogSkillInput,
  ExpertCatalogKind,
  RemoteRunContext,
} from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import { buildPageContextFromStorage } from "../context-bridge/buildPageContext";

export function buildExpertCallInput(input: {
  slug: string;
  catalogKind: ExpertCatalogKind;
  skillName: string;
  prompt: string;
  includeContext?: boolean;
  context?: RemoteRunContext;
}): CallCatalogSkillInput {
  const context =
    input.context ?? (input.includeContext !== false ? buildPageContextFromStorage() : undefined);

  return {
    slug: input.slug,
    catalogKind: input.catalogKind,
    skillName: input.skillName,
    prompt: input.prompt,
    context,
  };
}
