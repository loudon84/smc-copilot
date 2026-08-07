export type HostFormFillArtifact = {
  type: "host.form.fill";
  formType: string;
  action: string;
  confidence?: number;
  fields: Record<string, unknown>;
  subTables?: Record<string, unknown[]>;
};
