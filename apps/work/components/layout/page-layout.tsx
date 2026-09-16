import { useLocation } from "@tanstack/react-router";
import ToggleTheme from "@/components/toggle-theme";
import { AppHeader } from "./app-header";
import { getPageTitle } from "./data/sidebar-data";
import { GlobalSearch } from "./global-search";

export function PageLayout({ children }: { children: React.ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const title = getPageTitle(pathname);

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={title}>
        <GlobalSearch />
        <ToggleTheme />
      </AppHeader>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}
