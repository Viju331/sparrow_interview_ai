import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../shared/services/api.service';
import { AppStateService } from '../../shared/services/app-state.service';

interface SessionSummary {
  id: string;
  title?: string;
  status: string;
  createdAt: string;
  sourceApp?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="dashboard">
      <!-- Header -->
      <div class="dashboard-header">
        <div>
          <h1 class="dashboard-title">{{ greetingTitle() }}</h1>
          <p class="dashboard-subtitle">{{ dashboardSubtitle() }}</p>
        </div>
        <button class="start-session-btn" (click)="startSession()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
            <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          {{ hasUser() ? 'Start New Session' : 'Complete Setup' }}
        </button>
      </div>

      <!-- Stats Row -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ sessions().length }}</span>
          <span class="stat-label">Sessions</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ completedSessionsCount() }}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ latestSessionSource() }}</span>
          <span class="stat-label">Last Source</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ hasUser() ? preferredLanguage().toUpperCase() : '--' }}</span>
          <span class="stat-label">Language</span>
        </div>
      </div>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Recent Sessions -->
        <div class="sparrow-card panel">
          <h2 class="panel-title">Recent Sessions</h2>
          @if (isLoading()) {
            <div class="empty-state">
              <p class="empty-text">Loading your recent sessions...</p>
            </div>
          } @else if (sessions().length > 0) {
            <div class="recent-sessions">
              @for (session of sessions(); track session.id) {
                <button class="session-row" (click)="openSession(session.id)">
                  <div class="session-row-main">
                    <span class="session-row-title">{{ session.title || 'Untitled Session' }}</span>
                    <span class="session-row-meta">{{ session.sourceApp || 'desktop' }} | {{ formatCreatedAt(session.createdAt) }}</span>
                  </div>
                  <span class="session-badge" [class.session-badge--completed]="session.status === 'completed'">
                    {{ session.status }}
                  </span>
                </button>
              }
            </div>
          } @else {
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p class="empty-text">
                @if (hasUser()) {
                  No sessions yet. Start your first interview session to see history here.
                } @else {
                  Finish onboarding first, then your sessions will appear here.
                }
              </p>
            </div>
          }
        </div>

        <!-- Quick Actions -->
        <div class="sparrow-card panel">
          <h2 class="panel-title">Quick Actions</h2>
          <div class="actions-list">
            <button class="action-item" (click)="startSession()">
              <div class="action-icon action-icon--live">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
              </div>
              <div>
                <span class="action-label">Live Interview</span>
                <span class="action-desc">Real-time transcription + AI answers</span>
              </div>
            </button>
            <button class="action-item" (click)="goToOnboarding()">
              <div class="action-icon action-icon--practice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
              <div>
                <span class="action-label">Profile Setup</span>
                <span class="action-desc">Edit your resume context and preferences</span>
              </div>
            </button>
            <button class="action-item" (click)="startSession()">
              <div class="action-icon action-icon--screen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <div>
                <span class="action-label">Screen Analysis</span>
                <span class="action-desc">Capture and analyze on-screen content</span>
              </div>
            </button>
            <button class="action-item" (click)="startSession()">
              <div class="action-icon action-icon--code">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
              </div>
              <div>
                <span class="action-label">Coding Interview</span>
                <span class="action-desc">Step-by-step coding assistance</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Hotkey Hints -->
      <div class="hotkey-bar">
        <span class="hotkey-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Generate Answer</span>
        <span class="hotkey-hint"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> Screen Capture</span>
        <span class="hotkey-hint"><kbd>Ctrl</kbd> + <kbd>\\</kbd> Toggle Overlay</span>
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 1200px;
    }

    .dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dashboard-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-sparrow-text);
      margin: 0;
    }

    .dashboard-subtitle {
      font-size: 0.875rem;
      color: var(--color-sparrow-text-muted);
      margin: 0.25rem 0 0;
    }

    .start-session-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background-color: var(--color-sparrow-accent);
      color: #0f172a;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      border: none;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
      }

      .btn-icon { width: 18px; height: 18px; }
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .stat-card {
      background-color: var(--color-sparrow-surface);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-sparrow-text);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 1.25rem;
    }

    .panel-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
      margin: 0 0 1rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      text-align: center;
    }

    .empty-icon {
      width: 48px;
      height: 48px;
      color: var(--color-sparrow-border);
      margin-bottom: 0.75rem;
    }

    .empty-text {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text-muted);
      max-width: 280px;
      line-height: 1.5;
      margin: 0;
    }

    .recent-sessions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .session-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: 10px;
      border: 1px solid var(--color-sparrow-border);
      background-color: var(--color-sparrow-surface);
      cursor: pointer;
      text-align: left;
      color: inherit;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--color-sparrow-primary);
        background-color: var(--color-sparrow-surface-hover);
      }
    }

    .session-row-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .session-row-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
    }

    .session-row-meta {
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      margin-top: 0.125rem;
    }

    .session-badge {
      flex-shrink: 0;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #f8fafc;
      background-color: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 999px;
      padding: 0.25rem 0.5rem;
    }

    .session-badge--completed {
      color: #bbf7d0;
      background-color: rgba(34, 197, 94, 0.18);
      border-color: rgba(34, 197, 94, 0.35);
    }

    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .action-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 10px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
      width: 100%;
      color: inherit;

      &:hover {
        background-color: var(--color-sparrow-surface-hover);
        border-color: var(--color-sparrow-border);
      }
    }

    .action-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      svg { width: 18px; height: 18px; }
    }

    .action-icon--live { background-color: rgba(34, 197, 94, 0.15); color: var(--color-sparrow-accent); }
    .action-icon--practice { background-color: rgba(139, 94, 60, 0.15); color: var(--color-sparrow-primary); }
    .action-icon--screen { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .action-icon--code { background-color: rgba(168, 85, 247, 0.15); color: #a855f7; }

    .action-label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
    }

    .action-desc {
      display: block;
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      margin-top: 0.125rem;
    }

    .hotkey-bar {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      padding: 0.75rem 1rem;
      background-color: var(--color-sparrow-surface);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 12px;
    }

    .hotkey-hint {
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      display: flex;
      align-items: center;
      gap: 0.25rem;

      kbd {
        background-color: var(--color-sparrow-bg);
        border: 1px solid var(--color-sparrow-border);
        border-radius: 4px;
        padding: 0.125rem 0.375rem;
        font-size: 0.6875rem;
        font-family: inherit;
        color: var(--color-sparrow-text);
      }
    }
  `],
})
export class DashboardComponent implements OnInit {
  greetingTitle = signal('Welcome');
  dashboardSubtitle = signal('Complete your setup to start using SparrowInterviewAI.');
  sessions = signal<SessionSummary[]>([]);
  isLoading = signal(false);

  constructor(
    private readonly api: ApiService,
    private readonly appState: AppStateService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    void this.loadDashboard();
  }

  hasUser(): boolean {
    return !!this.appState.currentUserId;
  }

  preferredLanguage(): string {
    return this.appState.preferredLanguage;
  }

  completedSessionsCount(): number {
    return this.sessions().filter((session) => session.status === 'completed').length;
  }

  latestSessionSource(): string {
    return this.sessions()[0]?.sourceApp ?? '--';
  }

  formatCreatedAt(value: string): string {
    return new Date(value).toLocaleString();
  }

  startSession(): void {
    if (!this.appState.currentUserId) {
      void this.router.navigate(['/onboarding']);
      return;
    }

    void this.router.navigate(['/session']);
  }

  goToOnboarding(): void {
    void this.router.navigate(['/onboarding']);
  }

  openSession(sessionId: string): void {
    this.appState.saveCurrentSessionId(sessionId);
    void this.router.navigate(['/session']);
  }

  private async loadDashboard(): Promise<void> {
    const currentUser = this.appState.currentUser;

    if (!currentUser) {
      return;
    }

    const firstName = currentUser.fullName.split(' ')[0];
    this.greetingTitle.set(`Welcome back, ${firstName}`);
    this.dashboardSubtitle.set('Ready to ace your next interview?');
    this.isLoading.set(true);

    try {
      const sessions = await firstValueFrom(this.api.getUserSessions(currentUser.id));
      this.sessions.set(sessions ?? []);
    } catch (error) {
      console.error(error);
      this.dashboardSubtitle.set('Your profile is saved, but the backend is currently unavailable.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
