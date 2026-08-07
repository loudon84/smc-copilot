import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 4. */
export const attachmentClient = {
  get: (attachmentId: string) =>
    runtimeFetch({ path: `/api/v1/attachments/${encodeURIComponent(attachmentId)}` }),
  getContent: (attachmentId: string) =>
    runtimeFetch({
      path: `/api/v1/attachments/${encodeURIComponent(attachmentId)}/content`,
      parseJson: false,
    }),
};
