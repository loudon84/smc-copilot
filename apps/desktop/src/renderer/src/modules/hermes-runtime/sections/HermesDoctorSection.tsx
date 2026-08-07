import { useState } from "react";

export function HermesDoctorSection(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDoctor = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const report = await window.hermesAPI.runHermesDoctor();
      setResult(typeof report === "string" ? report : JSON.stringify(report, null, 2));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="settings-drawer-btn-success"
        onClick={() => void runDoctor()}
      >
        {busy ? "Running…" : "Run Doctor"}
      </button>
      {error ? (
        <pre className="settings-drawer-log-pre settings-drawer-text-error">{error}</pre>
      ) : null}
      {result ? <pre className="settings-drawer-log-pre is-tall">{result}</pre> : null}
    </>
  );
}
