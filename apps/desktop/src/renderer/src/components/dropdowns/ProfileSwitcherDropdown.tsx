/**
 * Profile Switcher Dropdown — anchored panel with portal dropdown-menu styles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User, Check, Settings, Plus, Loader2 } from "lucide-react";
import { useI18n } from "../useI18n";
import {
  AnchoredDropdown,
  computeAnchoredPosition,
  type AnchorBounds,
} from "./dropdown-shared";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

interface Profile {
  id: string;
  name: string;
  displayName: string;
  icon?: string;
  description?: string;
  isActive?: boolean;
  isRunning?: boolean;
}

export interface ProfileSwitcherDropdownProps {
  anchorBounds: AnchorBounds;
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onManageProfiles: () => void;
  onCreateProfile: () => void;
  currentProfile: string;
  profiles?: Profile[];
}

export function ProfileSwitcherDropdown({
  anchorBounds,
  onClose,
  onSelectProfile,
  onManageProfiles,
  onCreateProfile,
  currentProfile,
  profiles: initialProfiles,
}: ProfileSwitcherDropdownProps): React.JSX.Element {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles ?? []);
  const [loading, setLoading] = useState(!initialProfiles);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (initialProfiles || loadedRef.current) return;
    loadedRef.current = true;

    async function loadProfiles(): Promise<void> {
      try {
        setLoading(true);
        const result = await window.hermesAPI.listProfiles?.();
        if (result) {
          setProfiles(
            result.map((p: { name: string; displayName?: string }) => ({
              id: p.name,
              name: p.name,
              displayName: p.displayName || p.name,
              isActive: p.name === currentProfile,
            })),
          );
        }
      } catch (err) {
        console.error("[ProfileSwitcher] Failed to load profiles:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadProfiles();
  }, [initialProfiles, currentProfile]);

  const handleSelect = useCallback(
    (profileId: string) => {
      if (profileId !== currentProfile) {
        onSelectProfile(profileId);
      }
      onClose();
    },
    [currentProfile, onSelectProfile, onClose],
  );

  const position = useMemo(
    () =>
      computeAnchoredPosition(anchorBounds, {
        width: 280,
        estimatedHeight: Math.min(profiles.length * 36 + 120, 400),
      }),
    [anchorBounds, profiles.length],
  );

  return (
    <AnchoredDropdown
      anchorBounds={anchorBounds}
      position={position}
      maxHeight={400}
      onClose={onClose}
    >
      <DropdownMenuLabel className="border-b border-[var(--border-bright)]">
        {t("navigation.switchProfile", { defaultValue: "Switch Profile" })}
      </DropdownMenuLabel>

      <div className="max-h-64 overflow-y-auto py-1">
        {loading ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-text)]" />
            {t("common.loading", { defaultValue: "Loading…" })}
          </div>
        ) : profiles.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
            {t("navigation.noProfiles", { defaultValue: "No profiles found" })}
          </p>
        ) : (
          profiles.map((profile) => {
            const active = profile.id === currentProfile || profile.isActive;
            return (
              <DropdownMenuItem
                key={profile.id}
                selected={active}
                onClick={() => handleSelect(profile.id)}
                className="gap-2"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-muted)]",
                  )}
                >
                  <User size={16} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{profile.displayName}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {profile.isRunning
                      ? t("navigation.profileRunning", { defaultValue: "Running" })
                      : t("navigation.profileStopped", { defaultValue: "Stopped" })}
                  </span>
                </span>
                {active ? <Check className="h-4 w-4 shrink-0 text-[var(--accent-text)]" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
      </div>

      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          onCreateProfile();
          onClose();
        }}
      >
        <Plus size={16} className="text-[var(--text-muted)]" />
        {t("navigation.createProfile", { defaultValue: "Create New Profile" })}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          onManageProfiles();
          onClose();
        }}
      >
        <Settings size={16} className="text-[var(--text-muted)]" />
        {t("navigation.manageSettings", { defaultValue: "Settings" })}
      </DropdownMenuItem>
    </AnchoredDropdown>
  );
}

export default ProfileSwitcherDropdown;
