import { useTranslation } from "react-i18next";

type Props = {
  responseText: string;
};

export function RunResult({ responseText }: Props) {
  const { t } = useTranslation();
  return (
    <section className="hermes-run-detail__response">
      <h4>{t("workspaces.hermes.expertRuns.response", { defaultValue: "Response" })}</h4>
      <pre className="hermes-run-response-text">{responseText}</pre>
    </section>
  );
}
