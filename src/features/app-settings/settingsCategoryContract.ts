import type { AppSettings } from "./appSettings";

export type SettingsVisibilityPredicate = (
  settingId: string,
  panelId: string,
  parentSettingId?: string,
) => boolean;

export interface SettingsCategoryBaseProps {
  panelOpen: boolean;
  isSettingVisible: SettingsVisibilityPredicate;
}

export interface SettingsCategoryProps<TSettings extends object> extends SettingsCategoryBaseProps {
  settings: Readonly<TSettings>;
}

export interface SettingsCategoryEmits {
  toggle: [];
  "update-settings": [patch: Partial<AppSettings>];
}
