export interface LocalTask {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  source: string;
  status: string;
  target_profile_id?: string | null;
  hermes_run_id?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEventRecord {
  id: string;
  task_id: string;
  run_id?: string | null;
  event_type: string;
  message?: string | null;
  event_payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  task_id: string;
  action_type: string;
  risk_level: string;
  status: string;
  requested_by?: string | null;
  created_at: string;
}

export interface TaskWorkbenchSummary {
  profiles: Record<string, number>;
  tasks: Record<string, number>;
  approvals: Record<string, number>;
  team_sync: Record<string, string | boolean | number>;
}
