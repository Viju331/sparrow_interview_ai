import { Component, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings, HotkeyBinding } from '../../shared/models/runtime.models';
import { SettingsService } from '../../shared/services/settings.service';
import { AudioCaptureService, AudioDeviceInfo } from '../../shared/services/audio-capture.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="settings">
      <div class="settings-header">
        <div>
          <h1 class="settings-title">Settings</h1>
          <p class="settings-subtitle">Manage session behavior, OCR/transcription defaults, and live Electron hotkeys.</p>
        </div>
        <div class="settings-actions">
          <button class="reset-btn" (click)="resetDefaults()">Reset</button>
          <button class="sparrow-btn-accent" (click)="save()">Save Changes</button>
        </div>
      </div>

      @if (errorMessage()) {
        <div class="settings-error">{{ errorMessage() }}</div>
      }

      @if (successMessage()) {
        <div class="settings-success">{{ successMessage() }}</div>
      }

      <div class="settings-tabs">
        <button class="tab" [class.tab--active]="activeTab() === 'general'" (click)="activeTab.set('general')">General</button>
        <button class="tab" [class.tab--active]="activeTab() === 'hotkeys'" (click)="activeTab.set('hotkeys')">Hotkeys</button>
        <button class="tab" [class.tab--active]="activeTab() === 'ai'" (click)="activeTab.set('ai')">AI / Runtime</button>
      </div>

      @if (activeTab() === 'general') {
        <div class="settings-section">
          <div class="setting-row">
            <div>
              <span class="setting-label">Language</span>
              <span class="setting-desc">Default language for transcription and generated answers.</span>
            </div>
            <select class="sparrow-input setting-select" [(ngModel)]="draft.language">
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="hi">Hindi</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">Overlay Always on Top</span>
              <span class="setting-desc">Apply immediately to the floating overlay window.</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [(ngModel)]="draft.overlayAlwaysOnTop" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">Auto-detect Questions</span>
              <span class="setting-desc">Detect likely interview questions from final transcript and OCR text.</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [(ngModel)]="draft.autoDetectQuestions" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      }

      @if (activeTab() === 'ai') {
        <div class="settings-section">
          <p class="capture-hint">Provider credentials are read from backend configuration or environment variables. These desktop settings choose which configured provider path to use.</p>

          <div class="setting-row">
            <div>
              <span class="setting-label">Answer Provider</span>
              <span class="setting-desc">Choose between the local fallback and the backend OpenAI provider.</span>
            </div>
            <select class="sparrow-input setting-select" [(ngModel)]="draft.aiProvider">
              <option value="local">Local Runtime</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">Transcription Engine</span>
              <span class="setting-desc">Use browser speech locally or send microphone chunks to the backend OpenAI transcription path.</span>
            </div>
            <select class="sparrow-input setting-select" [(ngModel)]="draft.transcriptionEngine">
              <option value="browser-speech">Browser Speech</option>
              <option value="openai-transcribe">OpenAI Transcribe</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">OCR Provider</span>
              <span class="setting-desc">Pick local OCR, OpenAI vision OCR, or Azure AI Vision OCR for screen analysis.</span>
            </div>
            <select class="sparrow-input setting-select" [(ngModel)]="draft.ocrProvider">
              <option value="local">Local OCR</option>
              <option value="openai-vision">OpenAI Vision</option>
              <option value="azure-vision">Azure AI Vision</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">Audio Input Device</span>
              <span class="setting-desc">Select the microphone, wired earphone, or Bluetooth headset to use for transcription.</span>
            </div>
            <select class="sparrow-input setting-select" [(ngModel)]="draft.audioDeviceId">
              <option value="">System Default</option>
              @for (device of audioDevices(); track device.deviceId) {
                <option [value]="device.deviceId">{{ device.label }}</option>
              }
            </select>
          </div>

          <div class="setting-row">
            <div>
              <span class="setting-label">Capture System Audio</span>
              <span class="setting-desc">Also capture system/tab audio alongside the microphone (useful for hearing interviewer audio played through speakers).</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [(ngModel)]="draft.enableSystemAudio" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      }

      @if (activeTab() === 'hotkeys') {
        <div class="settings-section">
          @for (category of categories; track category) {
            <div class="hotkey-category">
              <h2 class="section-title">{{ category }}</h2>
              <div class="hotkey-list">
                @for (binding of getByCategory(category); track binding.action) {
                  <div class="hotkey-row">
                    <div class="hotkey-info">
                      <span class="hotkey-action">{{ binding.action }}</span>
                      <span class="hotkey-desc">{{ binding.description }}</span>
                    </div>
                    <label class="hotkey-enabled">
                      <input type="checkbox" [(ngModel)]="binding.isEnabled" />
                      Enabled
                    </label>
                    <input
                      class="sparrow-input hotkey-input"
                      [value]="binding.keys"
                      (focus)="capturingAction.set(binding.action)"
                      (blur)="capturingAction.set(null)"
                      (keydown)="captureHotkey($event, binding)"
                      readonly
                    />
                  </div>
                }
              </div>
            </div>
          }

          @if (capturingAction()) {
            <p class="capture-hint">Press the new key combination for {{ capturingAction() }}.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .settings {
      max-width: 980px;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .settings-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .settings-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-sparrow-text);
      margin: 0;
    }

    .settings-subtitle {
      margin: 0.35rem 0 0;
      color: var(--color-sparrow-text-muted);
      font-size: 0.85rem;
      max-width: 560px;
      line-height: 1.5;
    }

    .settings-actions {
      display: flex;
      gap: 0.5rem;
    }

    .settings-tabs {
      display: flex;
      gap: 0.35rem;
      border-bottom: 1px solid var(--color-sparrow-border);
    }

    .tab {
      padding: 0.7rem 1rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--color-sparrow-text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }

    .tab--active {
      color: var(--color-sparrow-text);
      border-bottom-color: var(--color-sparrow-primary);
    }

    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .setting-row,
    .hotkey-row {
      display: grid;
      grid-template-columns: minmax(240px, 1.3fr) auto minmax(180px, 220px);
      gap: 1rem;
      align-items: center;
      padding: 1rem;
      background-color: var(--color-sparrow-surface);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 14px;
    }

    .setting-label,
    .hotkey-action {
      display: block;
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
    }

    .setting-desc,
    .hotkey-desc {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.76rem;
      color: var(--color-sparrow-text-muted);
      line-height: 1.45;
    }

    .setting-select,
    .hotkey-input {
      width: 100%;
    }

    .hotkey-enabled {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--color-sparrow-text-muted);
    }

    .capture-hint {
      margin: 0;
      color: var(--color-sparrow-accent);
      font-size: 0.8rem;
    }

    .reset-btn {
      background: transparent;
      border: 1px solid var(--color-sparrow-border);
      color: var(--color-sparrow-text-muted);
      padding: 0.65rem 1rem;
      border-radius: 10px;
      cursor: pointer;
    }

    .settings-error,
    .settings-success {
      padding: 0.8rem 1rem;
      border-radius: 12px;
      font-size: 0.82rem;
    }

    .settings-error {
      background-color: rgba(239, 68, 68, 0.14);
      border: 1px solid rgba(239, 68, 68, 0.28);
      color: #fecaca;
    }

    .settings-success {
      background-color: rgba(34, 197, 94, 0.14);
      border: 1px solid rgba(34, 197, 94, 0.28);
      color: #bbf7d0;
    }

    .toggle {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
    }

    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      inset: 0;
      background-color: var(--color-sparrow-border);
      border-radius: 999px;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 18px;
      width: 18px;
      left: 3px;
      top: 3px;
      background: #fff;
      border-radius: 50%;
      transition: all 0.2s ease;
    }

    .toggle input:checked + .toggle-slider {
      background-color: var(--color-sparrow-accent);
    }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(20px);
    }

    @media (max-width: 820px) {
      .settings-header {
        flex-direction: column;
      }

      .setting-row,
      .hotkey-row {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  activeTab = signal<'hotkeys' | 'general' | 'ai'>('general');
  capturingAction = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  audioDevices = signal<AudioDeviceInfo[]>([]);
  draft!: AppSettings;

  constructor(
    private readonly settings: SettingsService,
    private readonly audioCapture: AudioCaptureService
  ) {
    this.draft = this.settings.getSettings();
  }

  async ngOnInit(): Promise<void> {
    try {
      const devices = await this.audioCapture.getAudioDevices();
      this.audioDevices.set(devices.filter(d => d.kind === 'audioinput'));
    } catch {
      // Device enumeration not available
    }
  }

  get categories(): string[] {
    return [...new Set(this.draft.hotkeys.map((binding) => binding.category))];
  }

  getByCategory(category: string): HotkeyBinding[] {
    return this.draft.hotkeys.filter((binding) => binding.category === category);
  }

  captureHotkey(event: KeyboardEvent, binding: HotkeyBinding): void {
    const captured = this.settings.captureHotkey(event);
    if (!captured) {
      return;
    }

    binding.keys = captured;
    this.capturingAction.set(binding.action);
  }

  save(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const conflicts = this.settings.saveSettings(this.draft);
    if (conflicts.length > 0) {
      this.errorMessage.set(conflicts.join('. '));
      return;
    }

    this.successMessage.set('Settings saved and applied to the desktop app.');
  }

  resetDefaults(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.draft = this.settings.resetSettings();
    this.successMessage.set('Settings reset to defaults.');
  }
}
