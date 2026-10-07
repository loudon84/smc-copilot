export function evaluateG7Prerequisites({ env, dirty }) {
  const enabled = env.SMC_REMOTE_EXPERT_G7 === "1";
  const backend = String(env.SMC_REMOTE_EXPERT_G7_BACKEND_URL ?? "").trim();
  const token = String(env.SMC_REMOTE_EXPERT_G7_TOKEN ?? "").trim();
  const orgId = String(env.SMC_REMOTE_EXPERT_G7_ORG_ID ?? "").trim();
  const userId = String(env.SMC_REMOTE_EXPERT_G7_USER_ID ?? "").trim();
  const agentRef = String(env.SMC_REMOTE_EXPERT_G7_AGENT_REF ?? "").trim();
  const designated = String(
    env.SMC_REMOTE_EXPERT_G7_DESIGNATED_TEST_EXPERT ?? "",
  ).trim();
  const envId = String(env.SMC_REMOTE_EXPERT_G7_ENV_ID ?? "").trim() || null;
  const k8sContext =
    String(env.SMC_REMOTE_EXPERT_G7_K8S_CONTEXT ?? "").trim() || null;
  const k8sNamespace =
    String(env.SMC_REMOTE_EXPERT_G7_K8S_NAMESPACE ?? "").trim() || null;

  if (
    !enabled ||
    !backend ||
    !token ||
    !orgId ||
    !userId ||
    !agentRef ||
    !designated
  ) {
    return {
      overall: "BLOCKED",
      errorCode: "G7_ENV_INCOMPLETE",
      ready: false,
      envId,
      k8sContext,
      k8sNamespace,
    };
  }
  if (dirty) {
    return {
      overall: "BLOCKED",
      errorCode: "G7_CONSUMER_DIRTY",
      ready: false,
      envId,
      k8sContext,
      k8sNamespace,
    };
  }
  if (designated !== agentRef) {
    return {
      overall: "BLOCKED",
      errorCode: "G7_EXPERT_NOT_DESIGNATED",
      ready: false,
      envId,
      k8sContext,
      k8sNamespace,
    };
  }
  return {
    overall: "READY",
    errorCode: null,
    ready: true,
    backend,
    token,
    orgId,
    userId,
    agentRef,
    designated,
    envId,
    k8sContext,
    k8sNamespace,
    permissionPrompt: String(
      env.SMC_REMOTE_EXPERT_G7_PERMISSION_PROMPT ?? "",
    ).trim(),
    longPrompt: String(env.SMC_REMOTE_EXPERT_G7_LONG_PROMPT ?? "").trim(),
    artifactPrompt: String(env.SMC_REMOTE_EXPERT_G7_ARTIFACT_PROMPT ?? "").trim(),
    localHermesUrl: String(
      env.SMC_REMOTE_EXPERT_G7_LOCAL_HERMES_URL ?? "",
    ).trim(),
  };
}
