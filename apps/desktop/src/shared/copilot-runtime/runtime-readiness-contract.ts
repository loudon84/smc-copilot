/**
 * PRD v1.4 domain readiness (service / execution / maintenance / expertMcp).
 */
export interface RuntimeDomainReadinessView {
  ready: boolean;
  checks?: Record<string, string>;
  status?: string | null;
  chatReady?: boolean | null;
  taskReady?: boolean | null;
}

export interface RuntimeReadinessView {
  service: RuntimeDomainReadinessView;
  execution: RuntimeDomainReadinessView;
  maintenance: RuntimeDomainReadinessView;
  expertMcp: RuntimeDomainReadinessView;
}
