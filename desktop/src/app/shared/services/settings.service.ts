import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppSettings, HotkeyBinding } from '../models/runtime.models';
import { ElectronService } from './electron.service';
import { AppStateService } from './app-state.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsKey = 'sparrow.appSettings';

  readonly defaultHotkeys: HotkeyBinding[] = [
    { action: 'Generate Answer', description: 'Trigger AI answer from detected question', keys: 'Ctrl + Enter', category: 'Session', isEnabled: true },
    { action: 'Screen Capture', description: 'Capture screen for OCR analysis', keys: 'Ctrl + Shift + Enter', category: 'Session', isEnabled: true },
    { action: 'AI Chat', description: 'Focus the manual follow-up input', keys: 'Ctrl + Alt + Enter', category: 'Session', isEnabled: true },
    { action: 'Toggle Overlay', description: 'Show or hide the floating overlay', keys: 'Ctrl + \\', category: 'Overlay', isEnabled: true },
    { action: 'Opacity Down', description: 'Decrease overlay transparency', keys: 'Ctrl + [', category: 'Overlay', isEnabled: true },
    { action: 'Opacity Up', description: 'Increase overlay transparency', keys: 'Ctrl + ]', category: 'Overlay', isEnabled: true },
    { action: 'Reset Context', description: 'Clear current question and answer context', keys: 'Ctrl + R', category: 'Overlay', isEnabled: true },
    { action: 'Delete Screenshot', description: 'Remove last captured screenshot', keys: 'Ctrl + Backspace', category: 'Screen', isEnabled: true },
  ];

  readonly defaultSettings: AppSettings = {
    language: 'en',
    overlayAlwaysOnTop: true,
    autoDetectQuestions: true,
    aiProvider: 'gemini',
    apiKey: '',
    transcriptionEngine: 'audioCapture',

    ocrProvider: 'local',
    audioDeviceId: '',
    enableSystemAudio: false,
    hotkeys: this.defaultHotkeys.map((binding) => ({ ...binding })),
  };

  constructor(private readonly electron: ElectronService, private readonly http: HttpClient, private readonly appState: AppStateService) {
    this.applyToElectron(this.getSettings());
    this.loadFromBackend();
  }

  getSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(this.settingsKey);
      if (!raw) {
        return this.cloneDefaults();
      }

      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      // Migrate: 'local' is no longer a valid AI provider — upgrade to 'gemini'
      if (parsed.aiProvider === 'local') parsed.aiProvider = 'gemini';
      if (parsed.transcriptionEngine === 'browser-speech') parsed.transcriptionEngine = 'audioCapture';
      return {
        ...this.cloneDefaults(),
        ...parsed,
        hotkeys: (parsed.hotkeys ?? this.defaultHotkeys).map((binding) => ({
          ...binding,
          isEnabled: binding.isEnabled ?? true,
        })),
      };
    } catch {
      return this.cloneDefaults();
    }
  }

  saveSettings(settings: AppSettings): string[] {
    const conflicts = this.validateHotkeys(settings.hotkeys);
    if (conflicts.length > 0) {
      return conflicts;
    }

    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    this.applyToElectron(settings);
    this.syncToBackend(settings);
    return [];
  }

  resetSettings(): AppSettings {
    const defaults = this.cloneDefaults();
    localStorage.setItem(this.settingsKey, JSON.stringify(defaults));
    this.applyToElectron(defaults);
    this.syncToBackend(defaults);
    return defaults;
  }

  private loadFromBackend(): void {
    const userId = this.appState.currentUserId;
    if (!userId) return;

    this.http.get<Record<string, any>>(`${environment.apiUrl}/api/users/${userId}/settings`).subscribe({
      next: (remoteSettings) => {
        if (!remoteSettings || Object.keys(remoteSettings).length === 0) return;
        const current = this.getSettings();
        let changed = false;
        for (const [key, value] of Object.entries(remoteSettings)) {
          if (key in current && JSON.stringify((current as any)[key]) !== JSON.stringify(value)) {
            (current as any)[key] = value;
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem(this.settingsKey, JSON.stringify(current));
          this.applyToElectron(current);
        }
      },
      error: () => { /* Fall back to localStorage silently */ },
    });
  }

  private syncToBackend(settings: AppSettings): void {
    const userId = this.appState.currentUserId;
    if (!userId) return;

    const keysToSync: (keyof AppSettings)[] = ['language', 'aiProvider', 'transcriptionEngine', 'ocrProvider', 'audioDeviceId', 'enableSystemAudio'];
    for (const key of keysToSync) {
      const value = settings[key];
      this.http.put(`${environment.apiUrl}/api/users/${userId}/settings/${key}`, JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      }).subscribe({ error: () => { /* Non-critical: localStorage is the primary store */ } });
    }
  }

  captureHotkey(event: KeyboardEvent): string {
    event.preventDefault();
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    const key = this.normalizeKey(event.key);
    if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key);
    }

    return parts.join(' + ');
  }

  private validateHotkeys(hotkeys: HotkeyBinding[]): string[] {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];

    for (const binding of hotkeys.filter((item) => item.isEnabled && item.keys.trim())) {
      const normalized = binding.keys.trim().toLowerCase();
      if (seen.has(normalized)) {
        conflicts.push(`${binding.action} conflicts with ${seen.get(normalized)}`);
      } else {
        seen.set(normalized, binding.action);
      }
    }

    return conflicts;
  }

  private applyToElectron(settings: AppSettings): void {
    this.electron.applyHotkeys(settings.hotkeys);
    this.electron.setOverlayAlwaysOnTop(settings.overlayAlwaysOnTop);
  }

  private normalizeKey(key: string): string {
    const lowered = key.toLowerCase();
    return ({
      enter: 'Enter',
      escape: 'Escape',
      backspace: 'Backspace',
      '[': '[',
      ']': ']',
      '\\': '\\',
      ' ': 'Space',
    } as Record<string, string>)[lowered] ?? (key.length === 1 ? key.toUpperCase() : key);
  }

  private cloneDefaults(): AppSettings {
    return {
      ...this.defaultSettings,
      hotkeys: this.defaultHotkeys.map((binding) => ({ ...binding })),
    };
  }
}
