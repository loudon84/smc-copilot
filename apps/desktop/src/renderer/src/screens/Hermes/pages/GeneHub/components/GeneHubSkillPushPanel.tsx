import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  GeneHubPullJob,
  GeneHubSkillSubmission,
} from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

export function GeneHubSkillPushPanel() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [skillPath, setSkillPath] = useState("");
  const [pushPending, setPushPending] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<GeneHubSkillSubmission[]>([]);
  const [pullJobs, setPullJobs] = useState<GeneHubPullJob[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (typeof window.hermesExperts === "undefined") return;
    setLoading(true);
    try {
      const [subRes, pullRes] = await Promise.all([
        window.hermesExperts.listGeneHubSubmissions(),
        window.hermesExperts.listGeneHubPullJobs(),
      ]);
      if (subRes.ok && subRes.data) setSubmissions(subRes.data);
      if (pullRes.ok && pullRes.data) setPullJobs(pullRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePush = async () => {
    if (typeof window.hermesExperts === "undefined" || !name.trim() || !skillPath.trim()) return;
    setPushPending(true);
    setPushMessage(null);
    try {
      const res = await window.hermesExperts.pushGeneHubSkill({
        name: name.trim(),
        version: version.trim() || undefined,
        skillPath: skillPath.trim(),
      });
      if (res.ok) {
        setPushMessage(
          t("workspaces.hermes.geneHub.pushSuccess", {
            defaultValue: "Submission created",
            id: res.data?.submissionId ?? "",
          }),
        );
        void load();
      } else {
        setPushMessage(res.error ?? "Push failed");
      }
    } finally {
      setPushPending(false);
    }
  };

  return (
    <div className="hermes-genehub-push-panel">
      <section className="hermes-workbench-card">
        <h3>
          <Upload size={16} /> {t("workspaces.hermes.geneHub.skillPush", { defaultValue: "Skill push" })}
        </h3>
        <label className="hermes-field">
          <span>{t("workspaces.hermes.geneHub.skillName", { defaultValue: "Skill name" })}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="hermes-field">
          <span>{t("workspaces.hermes.geneHub.skillVersion", { defaultValue: "Version" })}</span>
          <input value={version} onChange={(e) => setVersion(e.target.value)} />
        </label>
        <label className="hermes-field">
          <span>{t("workspaces.hermes.geneHub.skillPath", { defaultValue: "Local skill zip path" })}</span>
          <input value={skillPath} onChange={(e) => setSkillPath(e.target.value)} placeholder="C:\path\to\skill.zip" />
        </label>
        <button type="button" className="hermes-btn-primary" disabled={pushPending} onClick={() => void handlePush()}>
          {t("workspaces.hermes.geneHub.pushSubmit", { defaultValue: "Submit for review" })}
        </button>
        {pushMessage ? <p className="hermes-muted">{pushMessage}</p> : null}
      </section>

      <section className="hermes-workbench-card">
        <h3>{t("workspaces.hermes.geneHub.mySubmissions", { defaultValue: "My submissions" })}</h3>
        {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}
        <ul className="hermes-workbench-list">
          {submissions.map((s) => (
            <li key={s.submissionId}>
              <strong>{s.skillName}</strong> — {s.status}
            </li>
          ))}
          {!loading && submissions.length === 0 ? (
            <li className="hermes-muted">{t("workspaces.hermes.geneHub.noSubmissions", { defaultValue: "No submissions" })}</li>
          ) : null}
        </ul>
      </section>

      <section className="hermes-workbench-card">
        <h3>{t("workspaces.hermes.geneHub.pullJobs", { defaultValue: "Pull jobs" })}</h3>
        <ul className="hermes-workbench-list">
          {pullJobs.map((j) => (
            <li key={j.jobId}>
              <strong>{j.skillName ?? j.jobId}</strong> — {j.status}
            </li>
          ))}
          {!loading && pullJobs.length === 0 ? (
            <li className="hermes-muted">{t("workspaces.hermes.geneHub.noPullJobs", { defaultValue: "No pull jobs" })}</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
