import { Sparkles } from "lucide-react";
import { useI18n } from "../../../components/useI18n";

export function LoginBrandPanel(): React.JSX.Element {
  const { t } = useI18n();

  return (
    <aside className="login-brand-panel hidden flex-col justify-center px-10 lg:flex lg:w-[42%] xl:px-14">
      <div
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-bright)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
        aria-hidden
      >
        <Sparkles size={28} strokeWidth={1.75} />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] xl:text-3xl">
        {t("auth.brandTitle")}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        {t("auth.brandSubtitle")}
      </p>
    </aside>
  );
}
