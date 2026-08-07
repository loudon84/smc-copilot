import { useState } from "react";
import {
  HERMES_RUNTIME_IMPLEMENTED_SECTIONS,
  type HermesRuntimeImplementedSection,
} from "./hermes-runtime-types";
import { HermesOverviewSection } from "./sections/HermesOverviewSection";
import { HermesInstallSection } from "./sections/HermesInstallSection";
import { HermesGatewaySection } from "./sections/HermesGatewaySection";
import { HermesDoctorSection } from "./sections/HermesDoctorSection";
import { HermesLogsSection } from "./sections/HermesLogsSection";
import { HermesConnectionSection } from "./sections/HermesConnectionSection";
import { useI18n } from "../../components/useI18n";
import "../../screens/SettingsDrawer/SettingsDrawer.css";

export interface HermesRuntimeSettingsProps {
  activeProfile: string;
}

function SectionBody({ section }: { section: HermesRuntimeImplementedSection }): React.JSX.Element {
  switch (section) {
    case "overview":
      return <HermesOverviewSection />;
    case "install":
      return <HermesInstallSection />;
    case "gateway":
      return <HermesGatewaySection />;
    case "doctor":
      return <HermesDoctorSection />;
    case "logs":
      return <HermesLogsSection />;
    case "connection":
      return <HermesConnectionSection />;
  }
}

export function HermesRuntimeSettings({
  activeProfile,
}: HermesRuntimeSettingsProps): React.JSX.Element {
  const { t } = useI18n();
  const [section, setSection] = useState<HermesRuntimeImplementedSection>("overview");

  return (
    <div className="settings-drawer-runtime">
      <nav className="settings-drawer-runtime-nav">
        {HERMES_RUNTIME_IMPLEMENTED_SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            className={`settings-drawer-runtime-nav-item${section === id ? " is-active" : ""}`}
            onClick={() => setSection(id)}
          >
            {t(`runtimeSettings.${id}`)}
          </button>
        ))}
      </nav>
      <div className="settings-drawer-runtime-content">
        <p className="settings-drawer-hint">
          {t("runtimeSettings.profileLabel", { profile: activeProfile })}
        </p>
        <SectionBody section={section} />
      </div>
    </div>
  );
}
