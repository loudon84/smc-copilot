import { useTranslation } from "react-i18next";
import type { WorkError } from "../../../model/error";

type Props = {
  error: WorkError;
};

export function RunErrorPanel({ error }: Props) {
  return (
    <p className="hermes-page__error">
      {error.code}: {error.message}
    </p>
  );
}

export function RunErrorPanelSection({ error }: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h4>{t("workspaces.hermes.expertRuns.error", { defaultValue: "Error" })}</h4>
      <RunErrorPanel error={error} />
    </section>
  );
}
