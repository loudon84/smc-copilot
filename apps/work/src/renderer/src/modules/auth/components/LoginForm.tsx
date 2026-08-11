/**
 * Work Login form — Portal Auth email/password (Phase 5 Login only).
 * Uses inline labels to avoid registering auth i18n across all locales.
 */
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export interface LoginFormProps {
  account: string;
  password: string;
  onAccountChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  error: string | null;
  busy: boolean;
  disabled?: boolean;
}

export function LoginForm({
  account,
  password,
  onAccountChange,
  onPasswordChange,
  onSubmit,
  error,
  busy,
  disabled,
}: LoginFormProps): React.JSX.Element {
  const [showPassword, setShowPassword] = useState(false);
  const [accountTouched, setAccountTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const accountInvalid = accountTouched && account.trim().length === 0;
  const passwordInvalid =
    passwordTouched && password.length > 0 && password.length < 4;
  const formDisabled = disabled || busy;

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setAccountTouched(true);
    setPasswordTouched(true);
    if (!account.trim() || password.length < 4) {
      return;
    }
    onSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit} className="login-form" noValidate>
      {error ? <div className="login-error-banner">{error}</div> : null}

      <div className="login-field">
        <label htmlFor="login-account" className="login-field-label">
          Account
        </label>
        <div className="login-input-wrap">
          <input
            id="login-account"
            type="text"
            className={`login-field-input${accountInvalid ? " login-field-input--invalid" : ""}`}
            value={account}
            onChange={(e) => onAccountChange(e.target.value)}
            onBlur={() => setAccountTouched(true)}
            autoComplete="username"
            required
            disabled={formDisabled}
            placeholder="email or username"
          />
        </div>
        {accountInvalid ? (
          <p className="login-field-error">Account is required</p>
        ) : null}
      </div>

      <div className="login-field">
        <label htmlFor="login-password" className="login-field-label">
          Password
        </label>
        <div className="login-input-wrap login-input-wrap--password">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            className={`login-field-input${passwordInvalid ? " login-field-input--invalid" : ""}`}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            autoComplete="current-password"
            required
            minLength={4}
            disabled={formDisabled}
          />
          <button
            type="button"
            className="login-password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={formDisabled}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff size={16} aria-hidden />
            ) : (
              <Eye size={16} aria-hidden />
            )}
          </button>
        </div>
        {passwordInvalid ? (
          <p className="login-field-error">Password is too short</p>
        ) : null}
      </div>

      <button type="submit" disabled={formDisabled} className="login-submit-btn">
        {busy ? <Loader2 className="login-submit-spinner" aria-hidden /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
