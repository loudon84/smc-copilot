import type { AuthEndpointConfig } from "../../../../../shared/auth/auth-contract";
import { useI18n } from "../../../components/useI18n";

export interface EndpointConfigPanelProps {
  value: AuthEndpointConfig;
  onChange: (value: AuthEndpointConfig) => void;
  disabled?: boolean;
}

export function EndpointConfigPanel({
  value,
  onChange,
  disabled,
}: EndpointConfigPanelProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <fieldset className="login-form" disabled={disabled}>
      <div className="login-field">
        <label htmlFor="endpoint-backend-url" className="login-field-label">
          {t("auth.backendUrl")}
        </label>
        <input
          id="endpoint-backend-url"
          type="url"
          className="login-field-input"
          value={value.backendUrl}
          onChange={(e) => onChange({ ...value, backendUrl: e.target.value })}
          placeholder="http://127.0.0.1:8000"
          autoComplete="off"
        />
      </div>
      <div className="login-field">
        <label htmlFor="endpoint-auth-prefix" className="login-field-label">
          {t("auth.authPrefix")}
        </label>
        <input
          id="endpoint-auth-prefix"
          className="login-field-input"
          value={value.authPrefix}
          onChange={(e) => onChange({ ...value, authPrefix: e.target.value })}
          placeholder="/api/v1/auth"
          autoComplete="off"
        />
      </div>
      <div className="login-field">
        <label htmlFor="endpoint-portal-url" className="login-field-label">
          {t("auth.aiosHomeUrl")}
        </label>
        <input
          id="endpoint-portal-url"
          type="url"
          className="login-field-input"
          value={value.aiosHomeUrl}
          onChange={(e) => onChange({ ...value, aiosHomeUrl: e.target.value })}
          placeholder="http://127.0.0.1:3000"
          autoComplete="off"
        />
      </div>
    </fieldset>
  );
}
