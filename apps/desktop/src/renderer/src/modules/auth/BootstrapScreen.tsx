import { Loader2 } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import "./styles/login.css";

export type BootstrapScreenState =
  | "checking-session"
  | "bootstrapping"
  | "awaiting-config-confirm";

export interface BootstrapScreenProps {
  state: BootstrapScreenState;
}

export function BootstrapScreen({ state }: BootstrapScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const label =
    state === "checking-session"
      ? t("auth.checkingSession")
      : state === "awaiting-config-confirm"
        ? t("auth.awaitingConfigConfirm")
        : t("auth.bootstrap");
  return (
    <div className="login-bootstrap-screen">
      <Loader2 className="login-bootstrap-spinner" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
