import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/utils/tailwind";
import {
  readRootWorkThemeId,
  resolveModuleTheme,
  type ModuleTheme,
} from "./resolve-module-theme";
import "../../styles/business-module-ui.css";

export type BusinessModuleUISurfaceProps = {
  module: "knowledge" | "autotask" | "email" | "crm" | string;
  children: ReactNode;
  className?: string;
};

export function BusinessModuleUISurface({
  module,
  children,
  className,
}: BusinessModuleUISurfaceProps): ReactElement {
  const [theme, setTheme] = useState<ModuleTheme>("dark");

  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      try {
        setTheme(resolveModuleTheme(readRootWorkThemeId(root)));
      } catch {
        setTheme("dark");
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      data-business-module-ui="true"
      data-business-module={module}
      data-module-theme={theme}
      className={cn("work-business-module-ui", className)}
    >
      {children}
    </div>
  );
}
