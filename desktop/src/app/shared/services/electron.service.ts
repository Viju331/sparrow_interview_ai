import { Injectable } from '@angular/core';
import { HotkeyBinding } from '../models/runtime.models';

interface OverlayState {
  isVisible: boolean;
  opacity: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
}

interface ElectronAPI {
  getVersion(): Promise<string>;
  isDev(): Promise<boolean>;
  minimize(): void;
  maximize(): void;
  close(): void;
  toggleOverlay(): void;
  setOverlayOpacity(value: number): void;
  setOverlayAlwaysOnTop(value: boolean): void;
  setOverlayClickThrough(value: boolean): void;
  setIgnoreMouseEvents(value: boolean, forward?: boolean): void;
  autoShowOverlay(): void;
  getOverlayState(): Promise<OverlayState>;
  captureRegion(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  applyHotkeys(bindings: HotkeyBinding[]): Promise<string[]>;
  onOverlayOpacityChanged(callback: (value: number) => void): () => void;
  onOverlayClickThroughChanged(callback: (value: boolean) => void): () => void;
  onShortcutTriggered(callback: (action: string) => void): () => void;
  enterOverlayMode(): void;
  exitOverlayMode(): void;
  stopSessionFromOverlay(): void;
  onSessionStopRequested(callback: () => void): () => void;
}

@Injectable({ providedIn: 'root' })
export class ElectronService {
  private get api(): ElectronAPI | undefined {
    return (window as any).electronAPI;
  }

  get isElectron(): boolean {
    return !!this.api;
  }

  minimize(): void {
    this.api?.minimize();
  }

  maximize(): void {
    this.api?.maximize();
  }

  close(): void {
    this.api?.close();
  }

  toggleOverlay(): void {
    this.api?.toggleOverlay();
  }

  setOverlayOpacity(value: number): void {
    this.api?.setOverlayOpacity(value);
  }

  setOverlayAlwaysOnTop(value: boolean): void {
    this.api?.setOverlayAlwaysOnTop(value);
  }

  setOverlayClickThrough(value: boolean): void {
    this.api?.setOverlayClickThrough(value);
  }

  setIgnoreMouseEvents(value: boolean, forward?: boolean): void {
    (this.api as any)?.setIgnoreMouseEvents(value, forward);
  }

  autoShowOverlay(): void {
    this.api?.autoShowOverlay();
  }

  enterOverlayMode(): void {
    this.api?.enterOverlayMode();
  }

  exitOverlayMode(): void {
    this.api?.exitOverlayMode();
  }

  stopSessionFromOverlay(): void {
    this.api?.stopSessionFromOverlay();
  }

  onSessionStopRequested(callback: () => void): () => void {
    return this.api?.onSessionStopRequested(callback) ?? (() => { });
  }

  captureRegion(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.api?.captureRegion() ?? Promise.resolve(null);
  }

  getOverlayState(): Promise<OverlayState> {
    return this.api?.getOverlayState() ?? Promise.resolve({
      isVisible: false,
      opacity: 0.9,
      alwaysOnTop: true,
      clickThrough: false,
    });
  }

  applyHotkeys(bindings: HotkeyBinding[]): Promise<string[]> {
    return this.api?.applyHotkeys(bindings) ?? Promise.resolve([]);
  }

  async getVersion(): Promise<string> {
    return (await this.api?.getVersion()) ?? '0.1.0';
  }

  onShortcutTriggered(callback: (action: string) => void): () => void {
    return this.api?.onShortcutTriggered(callback) ?? (() => { });
  }

  onOverlayClickThroughChanged(callback: (value: boolean) => void): () => void {
    return this.api?.onOverlayClickThroughChanged(callback) ?? (() => { });
  }
}
