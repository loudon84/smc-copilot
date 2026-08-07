import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 4. */
export const artifactClient = {
  get: (artifactId: string) =>
    runtimeFetch({ path: `/api/v1/artifacts/${encodeURIComponent(artifactId)}` }),
  getContent: (artifactId: string) =>
    runtimeFetch({
      path: `/api/v1/artifacts/${encodeURIComponent(artifactId)}/content`,
      parseJson: false,
    }),
};
