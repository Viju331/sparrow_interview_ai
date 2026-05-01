import { Component } from '@angular/core';
import { ElectronService } from '../../shared/services/electron.service';

@Component({
  selector: 'app-titlebar',
  standalone: true,
  template: `
    <div class="titlebar">
      <div class="titlebar-drag">
        <div class="titlebar-brand">
          <svg class="titlebar-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span class="titlebar-name">SparrowInterviewAI</span>
          <span class="titlebar-tagline">Think Faster. Answer Smarter.</span>
        </div>
      </div>

      @if (electron.isElectron) {
        <div class="titlebar-controls">
          <button class="titlebar-btn" (click)="electron.minimize()" title="Minimize">
            <svg viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg>
          </button>
          <button class="titlebar-btn" (click)="electron.maximize()" title="Maximize">
            <svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          </button>
          <button class="titlebar-btn titlebar-btn--close" (click)="electron.close()" title="Close">
            <svg viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 40px;
      background-color: var(--color-sparrow-bg);
      border-bottom: 1px solid var(--color-sparrow-border);
      padding: 0 0.75rem;
      user-select: none;
      flex-shrink: 0;
    }

    .titlebar-drag {
      flex: 1;
      -webkit-app-region: drag;
      height: 100%;
      display: flex;
      align-items: center;
    }

    .titlebar-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .titlebar-logo {
      width: 18px;
      height: 18px;
      color: var(--color-sparrow-primary);
    }

    .titlebar-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
      letter-spacing: 0.01em;
    }

    .titlebar-tagline {
      font-size: 0.6875rem;
      color: var(--color-sparrow-text-muted);
      margin-left: 0.25rem;
    }

    .titlebar-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      -webkit-app-region: no-drag;
    }

    .titlebar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--color-sparrow-text-muted);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;

      svg { width: 12px; height: 12px; }

      &:hover {
        background-color: var(--color-sparrow-surface);
        color: var(--color-sparrow-text);
      }
    }

    .titlebar-btn--close:hover {
      background-color: var(--color-sparrow-danger);
      color: white;
    }
  `],
})
export class TitlebarComponent {
  constructor(public electron: ElectronService) {}
}
