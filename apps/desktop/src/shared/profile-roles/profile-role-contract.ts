export interface ProfileRoleSpecRecord {
  id: string;
  profile_id: string;
  role_key: string;
  role_name: string;
  role_source_repo: string;
  role_source_paths_json: string;
  role_summary: string | null;
  role_manifest_path: string;
  soul_path: string;
  memory_path: string | null;
  source_checksum: string;
  installed_at: string;
  updated_at: string;
}

export interface ProfileRoleSpecSummary {
  id: string;
  profileId: string;
  profileName: string;
  roleKey: string;
  roleName: string;
  roleSourceRepo: string;
  sourcePaths: string[];
  roleSummary: string | null;
  roleManifestPath: string;
  soulPath: string;
  memoryPath: string | null;
  sourceChecksum: string;
  installedAt: string;
  updatedAt: string;
}

export interface RoleLibraryRef {
  repo: string;
  branch?: string;
  localDir?: string;
}

export interface SyncRoleLibraryResult {
  ok: boolean;
  localPath: string;
  commit?: string;
  error?: string;
}

export interface InstallExpertPresetInput {
  overwrite?: boolean;
  /** 优先 team_v1.4；省略时默认加载 team_v1.4 再回退 v1 */
  presetVersion?: string;
}

export interface InstallExpertPresetResult {
  ok: boolean;
  importedCount: number;
  partialSuccess: boolean;
  errors: Array<{ profileName: string; errorCode: string; message: string }>;
}

export interface ExpertPresetPortConflict {
  profileName: string;
  port: number;
  usedByProfileName: string;
}

export interface ExpertPresetPreviewResult {
  canInstall: boolean;
  totalProfiles: number;
  existingWithoutOverwrite: string[];
  portConflicts: ExpertPresetPortConflict[];
  invalidProfiles: Array<{ profileName: string; message: string }>;
}

export interface RecompileProfileRoleInput {
  profileId: string;
}

export interface RecompileProfileRoleResult {
  ok: boolean;
  checksum?: string;
  error?: string;
}

export interface ProfileRoleAPI {
  syncLibrary(ref?: RoleLibraryRef): Promise<SyncRoleLibraryResult>;
  previewExpertPreset(input?: InstallExpertPresetInput): Promise<ExpertPresetPreviewResult>;
  installPreset(input?: InstallExpertPresetInput): Promise<InstallExpertPresetResult>;
  listSpecs(): Promise<ProfileRoleSpecSummary[]>;
  getSpec(profileId: string): Promise<ProfileRoleSpecSummary | null>;
  recompile(profileId: string): Promise<RecompileProfileRoleResult>;
}
