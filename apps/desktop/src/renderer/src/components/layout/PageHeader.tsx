import { useI18n } from "../../components/useI18n";
import { resolveViewTitleKey, type View } from "../../types/desktop-shell";

export interface PageHeaderProps {
  view: View;
  activeProfile: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

function resolveHeaderTitle(view: View, t: (key: string) => string): string {
  if (view === "workspaces") {
    return "Portal";
  }
  const key = resolveViewTitleKey(view);
  const translated = t(key);
  return translated === key ? view : translated;
}

export function PageHeader({
  view,
  activeProfile,
  title,
  subtitle,
  actions,
}: PageHeaderProps): React.JSX.Element {
  const { t } = useI18n();
  const resolvedTitle = title ?? resolveHeaderTitle(view, t);
  return (
    <header className="page-header app-drag-region">
      <div className="page-header__leading no-drag">
        <h1 className="page-header__title">{resolvedTitle}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        <span className="page-header__profile">{activeProfile}</span>
      </div>
    </header>
  );
}
