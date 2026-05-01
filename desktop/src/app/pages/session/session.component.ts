import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../shared/services/api.service';
import { AudioCaptureService } from '../../shared/services/audio-capture.service';
import { AppStateService } from '../../shared/services/app-state.service';
import { ElectronService } from '../../shared/services/electron.service';
import { ScreenCaptureService } from '../../shared/services/screen-capture.service';
import { SessionRealtimeService } from '../../shared/services/session-realtime.service';
import { SettingsService } from '../../shared/services/settings.service';
import { SpeechRecognitionService } from '../../shared/services/speech-recognition.service';

@Component({
  selector: 'app-session',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="session">
      <div class="session-header">
        <div class="session-info">
          <h1 class="session-title">Live Interview Session</h1>
          <div class="session-meta">
            <span class="session-status" [class.session-status--active]="isActive()">
              <span class="status-dot"></span>
              {{ isActive() ? 'Live' : 'Ready' }}
            </span>
            <span class="session-chip">Socket: {{ connectionStatus() }}</span>
            <span class="session-chip">Mic: {{ isListening() ? 'Listening' : 'Idle' }}</span>
            <span class="session-chip" [class.session-chip--active]="isSystemAudioActive()">Sys Audio: {{ isSystemAudioActive() ? 'On' : 'Off' }}</span>
            <span class="session-chip">{{ timerDisplay() }}</span>
          </div>
        </div>
        <div class="session-controls">
          @if (!isActive()) {
            <button class="sparrow-btn-accent" (click)="startSession()">{{ sessionId() ? 'Resume Session' : 'Start Session' }}</button>
          } @else {
            <button class="sparrow-btn-primary" (click)="pauseSession()">Pause</button>
          }
          <button class="reset-btn" (click)="generateSummary()" [disabled]="!sessionId()">Summary</button>
          <button class="end-btn" (click)="endSession()">End Session</button>
        </div>
      </div>

      <div class="action-row">
        <input
          class="sparrow-input action-input"
          [(ngModel)]="promptModifier"
          placeholder="Prompt modifier: explain step by step, give answer in C#, keep it concise..."
        />
        <button class="sparrow-btn-primary" (click)="generateAnswer()" [disabled]="!sessionId()">Answer</button>
        <button class="sparrow-btn-primary" (click)="analyzeScreen()" [disabled]="!sessionId() || analyzingScreen()">Analyze Screen</button>
        <button class="sparrow-btn-primary" (click)="analyzeRegion()" [disabled]="!sessionId() || analyzingScreen()">Region Capture</button>
        <button class="reset-btn" (click)="createMobileCompanion()" [disabled]="!sessionId()">Mobile Link</button>
      </div>

      <div class="quick-actions-row">
        <span class="quick-label">Quick:</span>
        <button class="quick-btn" (click)="quickAnswer('shorter')" [disabled]="!sessionId() || !currentQuestion()">Shorter</button>
        <button class="quick-btn" (click)="quickAnswer('detailed')" [disabled]="!sessionId() || !currentQuestion()">Detailed</button>
        <button class="quick-btn" (click)="quickAnswer('behavioral')" [disabled]="!sessionId() || !currentQuestion()">Behavioral</button>
        <button class="quick-btn" (click)="quickAnswer('coding')" [disabled]="!sessionId() || !currentQuestion()">Coding</button>
      </div>

      @if (errorMessage()) {
        <div class="session-error">{{ errorMessage() }}</div>
      }

      @if (successMessage()) {
        <div class="session-success">{{ successMessage() }}</div>
      }

      @if (mobileCompanionUrl()) {
        <div class="companion-link">
          <span>Companion Link</span>
          <code>{{ mobileCompanionUrl() }}</code>
          <button class="reset-btn" (click)="copyMobileCompanionUrl()">Copy</button>
        </div>
      }

      <div class="session-panels">
        <div class="panel transcript-panel">
          <div class="panel-head">
            <h2 class="panel-title">Live Transcript</h2>
            <span class="panel-count">{{ transcriptSegments().length }} final</span>
          </div>
          @if (interimTranscript()) {
            <div class="interim-banner">{{ interimTranscript() }}</div>
          }
          <div class="transcript-body">
            @if (transcriptSegments().length > 0) {
              <div class="transcript-list">
                @for (segment of transcriptSegments(); track segment.id) {
                  <div class="transcript-item">
                    <span class="transcript-source">{{ segment.speakerLabel || segment.sourceType }}</span>
                    <p class="transcript-text">{{ segment.transcriptText }}</p>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-state">
                <p class="empty-text">Transcript will appear here when the session starts. Final microphone segments are persisted and used for question detection.</p>
              </div>
            }
          </div>
        </div>

        <div class="panel answer-panel">
          <div class="question-section">
            <div class="panel-head">
              <h2 class="panel-title">Detected Question</h2>
              <span class="panel-count">{{ currentQuestion() ? 'detected' : 'waiting' }}</span>
            </div>
            <div class="question-box">
              <p class="placeholder-text">{{ currentQuestion() || 'Waiting for question detection from transcript or screen analysis...' }}</p>
            </div>
          </div>
          <div class="answer-section">
            <div class="panel-head">
              <h2 class="panel-title">AI Answer</h2>
              <span class="panel-count">{{ currentAnswer() ? 'ready' : 'empty' }}</span>
            </div>
            @if (codingSections() && codingSections()!.length > 0) {
              <div class="coding-panel">
                @for (section of codingSections()!; track section.key) {
                  <details class="coding-section" [attr.open]="section.key === 'CODE' || section.key === 'OPTIMIZED' ? '' : null">
                    <summary class="coding-section-header">{{ section.label }}</summary>
                    <pre class="coding-section-body">{{ section.content }}</pre>
                  </details>
                }
              </div>
            } @else {
              <pre class="answer-box">{{ currentAnswer() || 'AI guidance will stream here once a question is answered.' }}</pre>
            }
          </div>
          <div class="summary-section">
            <div class="panel-head">
              <h2 class="panel-title">Session Summary</h2>
              <span class="panel-count">{{ summaryText() ? 'ready' : 'pending' }}</span>
            </div>
            <pre class="answer-box">{{ summaryText() || 'Generate a summary any time during or after the interview.' }}</pre>
          </div>
        </div>

        <div class="panel context-panel">
          <div class="context-section">
            <h3 class="context-subtitle">Profile Context</h3>
            <p class="context-placeholder">{{ profileContext() || 'Onboarding profile and parsed document context will appear here.' }}</p>
          </div>

          <div class="context-section">
            <h3 class="context-subtitle">Document Status</h3>
            @if (documentStatuses().length > 0) {
              <div class="doc-list">
                @for (status of documentStatuses(); track status) {
                  <span class="doc-pill">{{ status }}</span>
                }
              </div>
            } @else {
              <p class="context-placeholder">No uploaded documents found yet.</p>
            }
          </div>

          <div class="context-section">
            <h3 class="context-subtitle">Screen / OCR</h3>
            <p class="context-placeholder">{{ ocrStatus() }}</p>
          </div>

          <div class="context-section">
            <h3 class="context-subtitle">Session Notes</h3>
            <textarea
              class="sparrow-input notes-input"
              [(ngModel)]="notesDraft"
              placeholder="Type session notes here..."
              rows="4"
            ></textarea>
            <button class="sparrow-btn-primary notes-btn" (click)="saveNotes()" [disabled]="!sessionId()">Save Notes</button>
          </div>

          <div class="context-section">
            <h3 class="context-subtitle">Follow-up</h3>
            <div class="followup-input-row">
              <input
                #followUpInput
                class="sparrow-input"
                [(ngModel)]="followUpDraft"
                placeholder="Ask a follow-up..."
                type="text"
                (keydown.enter)="sendFollowUp()"
              />
              <button class="sparrow-btn-primary send-btn" (click)="sendFollowUp()" [disabled]="!sessionId()">Ask</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .session {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: calc(100vh - 40px - 3rem);
    }

    .session-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .session-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-sparrow-text);
      margin: 0;
    }

    .session-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.25rem;
      flex-wrap: wrap;
    }

    .session-status {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      font-weight: 500;
    }

    .session-chip,
    .panel-count,
    .doc-pill {
      display: inline-flex;
      align-items: center;
      padding: 0.275rem 0.65rem;
      border-radius: 999px;
      border: 1px solid var(--color-sparrow-border);
      background-color: rgba(15, 23, 42, 0.5);
      color: var(--color-sparrow-text-muted);
      font-size: 0.72rem;
    }

    .session-chip--active {
      border-color: var(--color-sparrow-accent);
      color: var(--color-sparrow-accent);
      background-color: rgba(34, 197, 94, 0.12);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-sparrow-border);
    }

    .session-status--active {
      color: var(--color-sparrow-accent);
      .status-dot {
        background-color: var(--color-sparrow-accent);
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        animation: pulse 2s ease-in-out infinite;
      }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .session-timer {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .session-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;

      .ctrl-icon { width: 16px; height: 16px; }
    }

    .action-row,
    .companion-link,
    .panel-head,
    .doc-list {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .action-input {
      flex: 1;
      min-width: 280px;
    }

    .session-error,
    .session-success,
    .interim-banner,
    .companion-link {
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-size: 0.8125rem;
    }

    .session-error {
      border: 1px solid rgba(239, 68, 68, 0.35);
      background-color: rgba(239, 68, 68, 0.12);
      color: #fecaca;
    }

    .session-success {
      border: 1px solid rgba(34, 197, 94, 0.35);
      background-color: rgba(34, 197, 94, 0.12);
      color: #bbf7d0;
    }

    .interim-banner,
    .companion-link {
      border: 1px solid rgba(148, 163, 184, 0.24);
      background-color: rgba(15, 23, 42, 0.55);
      color: var(--color-sparrow-text);
    }

    .companion-link code {
      flex: 1;
      min-width: 220px;
      padding: 0.2rem 0.45rem;
      border-radius: 8px;
      background-color: rgba(15, 23, 42, 0.8);
      color: #a7f3d0;
      overflow-wrap: anywhere;
    }

    .end-btn {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--color-sparrow-danger);
      padding: 0.625rem 1.25rem;
      border-radius: 12px;
      border: 1px solid rgba(239, 68, 68, 0.3);
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background-color: rgba(239, 68, 68, 0.25);
      }
    }

    /* Three-panel layout */
    .session-panels {
      display: grid;
      grid-template-columns: 1fr 1.4fr 0.8fr;
      gap: 1rem;
      flex: 1;
      min-height: 0;
    }

    .panel {
      background-color: var(--color-sparrow-surface);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 14px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .panel-icon {
      width: 16px;
      height: 16px;
      color: var(--color-sparrow-primary);
      flex-shrink: 0;
    }

    .transcript-body {
      flex: 1;
      overflow-y: auto;
    }

    .transcript-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .transcript-item {
      background-color: var(--color-sparrow-bg);
      border-radius: 10px;
      padding: 0.75rem;
      border: 1px solid var(--color-sparrow-border);
    }

    .transcript-source {
      display: inline-flex;
      margin-bottom: 0.35rem;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-sparrow-primary);
    }

    .transcript-text {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text);
      line-height: 1.5;
      margin: 0;
    }

    .empty-state { padding: 2rem 1rem; text-align: center; }
    .empty-text, .placeholder-text {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text-muted);
      line-height: 1.5;
      margin: 0;
    }

    .question-section, .answer-section {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .question-box, .answer-box {
      flex: 1;
      padding: 0.75rem;
      background-color: var(--color-sparrow-bg);
      border-radius: 10px;
      overflow-y: auto;
      margin: 0;
      white-space: pre-wrap;
    }

    .answer-panel {
      gap: 0.75rem;
    }

    .coding-panel {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
      overflow-y: auto;
    }

    .coding-section {
      border: 1px solid var(--color-sparrow-border);
      border-radius: 10px;
      overflow: hidden;
    }

    .coding-section-header {
      padding: 0.6rem 0.85rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-sparrow-text);
      background-color: rgba(139, 94, 60, 0.12);
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .coding-section-header::before {
      content: '▸';
      font-size: 0.7rem;
      transition: transform 0.15s ease;
    }

    details[open] > .coding-section-header::before {
      transform: rotate(90deg);
    }

    .coding-section-body {
      padding: 0.75rem;
      margin: 0;
      font-size: 0.78rem;
      line-height: 1.6;
      background-color: var(--color-sparrow-bg);
      color: var(--color-sparrow-text);
      white-space: pre-wrap;
      overflow-x: auto;
    }

    .summary-section,
    .context-section {
      margin-bottom: 1rem;
    }

    .context-subtitle {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-sparrow-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.5rem;
    }

    .context-placeholder {
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      line-height: 1.5;
      margin: 0;
    }

    .notes-input {
      resize: vertical;
      min-height: 60px;
    }

    .followup-input-row {
      display: flex;
      gap: 0.5rem;
    }

    .send-btn {
      padding: 0.625rem;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;

      svg { width: 16px; height: 16px; }
    }

    .notes-btn,
    .reset-btn {
      padding: 0.625rem 1rem;
      border-radius: 12px;
      border: 1px solid var(--color-sparrow-border);
      background-color: rgba(15, 23, 42, 0.45);
      color: var(--color-sparrow-text);
      cursor: pointer;
    }

    .quick-actions-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .quick-label {
      font-size: 0.72rem;
      color: var(--color-sparrow-text-muted);
      font-weight: 500;
      margin-right: 0.15rem;
    }

    .quick-btn {
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--color-sparrow-border);
      background-color: rgba(15, 23, 42, 0.45);
      color: var(--color-sparrow-text-muted);
      font-size: 0.72rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        background-color: rgba(139, 94, 60, 0.2);
        color: var(--color-sparrow-text);
        border-color: var(--color-sparrow-primary);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  `],
})
export class SessionComponent implements OnInit, OnDestroy {
  @ViewChild('followUpInput') followUpInput?: ElementRef<HTMLInputElement>;

  isActive = signal(false);
  analyzingScreen = signal(false);
  isListening = signal(false);
  isSystemAudioActive = signal(false);
  timerDisplay = signal('00:00:00');
  sessionId = signal<string | null>(null);
  connectionStatus = signal<'disconnected' | 'connecting' | 'connected'>('disconnected');
  transcriptSegments = signal<Array<{ id: string; transcriptText: string; sourceType: string; speakerLabel?: string | null; sequenceNo?: number }>>([]);
  currentQuestion = signal('');
  currentAnswer = signal('');
  summaryText = signal('');
  profileContext = signal('');
  documentStatuses = signal<string[]>([]);
  interimTranscript = signal('');
  mobileCompanionUrl = signal('');
  ocrStatus = signal('No screen capture has been analyzed yet.');
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  codingSections = computed(() => {
    const answer = this.currentAnswer();
    if (!answer) return null;
    const sectionMap: Record<string, string> = {
      PROBLEM_UNDERSTANDING: 'Problem Understanding',
      ASSUMPTIONS: 'Assumptions',
      BRUTE_FORCE: 'Brute-Force Approach',
      OPTIMIZED: 'Optimized Approach',
      COMPLEXITY: 'Complexity',
      CODE: 'Code',
      DRY_RUN: 'Dry Run',
      EDGE_CASES: 'Edge Cases',
    };
    const keys = Object.keys(sectionMap);
    const hasStructuredSections = keys.some(k => answer.includes(`===${k}===`));
    if (!hasStructuredSections) return null;

    const sections: Array<{ key: string; label: string; content: string }> = [];
    for (const key of keys) {
      const marker = `===${key}===`;
      const idx = answer.indexOf(marker);
      if (idx === -1) continue;
      const start = idx + marker.length;
      let end = answer.length;
      for (const nextKey of keys) {
        if (nextKey === key) continue;
        const nextIdx = answer.indexOf(`===${nextKey}===`, start);
        if (nextIdx !== -1 && nextIdx < end) end = nextIdx;
      }
      const content = answer.substring(start, end).trim();
      if (content) {
        sections.push({ key, label: sectionMap[key], content });
      }
    }
    return sections.length > 0 ? sections : null;
  });

  notesDraft = '';
  followUpDraft = '';
  promptModifier = '';

  private subscriptions: Subscription[] = [];
  private timerId: number | null = null;
  private elapsedSeconds = 0;
  private nextSequenceNo = 1;
  private removeShortcutListener: (() => void) | null = null;
  private removeSessionStopListener: (() => void) | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly audioCapture: AudioCaptureService,
    private readonly appState: AppStateService,
    private readonly router: Router,
    private readonly realtime: SessionRealtimeService,
    private readonly speechRecognition: SpeechRecognitionService,
    private readonly screenCapture: ScreenCaptureService,
    private readonly settings: SettingsService,
    private readonly electron: ElectronService,
    private readonly ngZone: NgZone,
  ) { }

  async ngOnInit(): Promise<void> {
    this.bindRealtime();
    this.bindSpeechRecognition();
    this.bindShortcuts();
    await this.loadProfileContext();

    // Handle stop triggered from the overlay's stop button.
    // Run inside NgZone so signal updates and change detection fire correctly
    // (ipcRenderer callbacks fire outside Angular's zone).
    this.removeSessionStopListener = this.electron.onSessionStopRequested(() => {
      this.ngZone.run(() => void this.endSession());
    });

    const currentSessionId = this.appState.getCurrentSessionId();
    if (currentSessionId) {
      this.sessionId.set(currentSessionId);
      await this.attachToSession(currentSessionId);
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.speechRecognition.stop();
    this.audioCapture.stop();
    this.isListening.set(false);
    this.isSystemAudioActive.set(false);
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.removeShortcutListener?.();
    this.removeSessionStopListener?.();
    void this.realtime.disconnect();
  }

  async startSession(): Promise<void> {
    this.clearMessages();

    if (this.sessionId()) {
      try {
        await firstValueFrom(this.api.resumeSession(this.sessionId()!));
        await this.attachToSession(this.sessionId()!);
        this.successMessage.set('Session resumed.');
        return;
      } catch (error) {
        console.error(error);
        this.errorMessage.set('Unable to resume the session. Please verify the backend is running.');
        return;
      }
    }

    const userId = this.appState.currentUserId;
    if (!userId) {
      this.errorMessage.set('Please complete onboarding before starting a session.');
      await this.router.navigate(['/onboarding']);
      return;
    }

    try {
      const appSettings = this.settings.getSettings();
      const session = await firstValueFrom(
        this.api.startSession({
          userId,
          title: 'Live Interview Session',
          sourceApp: 'desktop',
          sessionMode: 'live',
          language: appSettings.language || this.appState.preferredLanguage,
        })
      );

      this.sessionId.set(session.id);
      this.appState.saveCurrentSessionId(session.id);
      this.elapsedSeconds = 0;
      this.timerDisplay.set('00:00:00');
      await this.attachToSession(session.id);
      // Stop audio in the main window before it gets hidden — overlay takes over mic capture
      this.audioCapture.stop();
      this.electron.enterOverlayMode();
      this.successMessage.set('Session started. Live transcript and question detection are active.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to start a session. Please verify the backend and database are running.');
    }
  }

  async pauseSession(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();

    try {
      await firstValueFrom(this.api.pauseSession(sessionId));
      this.isActive.set(false);
      this.stopTimer();
      this.speechRecognition.stop();
      this.audioCapture.stop();
      this.isListening.set(false);
      this.isSystemAudioActive.set(false);
      this.successMessage.set('Session paused.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to pause the session. Please verify the backend is running.');
    }
  }

  async endSession(): Promise<void> {
    const sessionId = this.sessionId();

    this.clearMessages();

    if (!sessionId) {
      this.isActive.set(false);
      this.stopTimer();
      return;
    }

    try {
      const settings = this.settings.getSettings();
      const summary = await firstValueFrom(this.api.generateSummary(sessionId, { provider: settings.aiProvider }));
      this.summaryText.set(summary.summaryText);
      await firstValueFrom(this.api.endSession(sessionId));
      this.successMessage.set('Session ended and summary captured.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('The session was ended locally, but the backend could not finalize every step.');
    } finally {
      this.isActive.set(false);
      this.stopTimer();
      this.speechRecognition.stop();
      this.audioCapture.stop();
      this.isListening.set(false);
      this.isSystemAudioActive.set(false);
      this.sessionId.set(null);
      this.appState.clearCurrentSessionId();
      void this.realtime.disconnect();
      this.electron.exitOverlayMode();
    }
  }

  async generateAnswer(questionText?: string): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();

    try {
      const settings = this.settings.getSettings();
      await firstValueFrom(this.api.generateAnswer(sessionId, {
        questionText: questionText || this.currentQuestion() || undefined,
        promptModifier: this.promptModifier || undefined,
        responseType: questionText ? 'follow_up' : 'answer',
        provider: settings.aiProvider,
      }));

      if (questionText) {
        this.followUpDraft = '';
      }

      this.successMessage.set('Answer generation requested.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to generate the answer for the current question.');
    }
  }

  async analyzeScreen(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();
    this.analyzingScreen.set(true);
    this.ocrStatus.set('Capturing screen and running OCR...');

    try {
      const settings = this.settings.getSettings();
      const file = await this.screenCapture.captureScreen();
      await this.analyzeScreenFile(sessionId, file, 'analyze_screen', settings);
    } catch (error) {
      console.error(error);
      this.ocrStatus.set('Screen analysis failed.');
      this.errorMessage.set('Unable to capture or analyze the current screen.');
    } finally {
      this.analyzingScreen.set(false);
    }
  }

  async analyzeRegion(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();
    this.analyzingScreen.set(true);
    this.ocrStatus.set('Select a region to capture...');

    try {
      const region = await this.electron.captureRegion();
      if (!region) {
        this.ocrStatus.set('Region capture cancelled.');
        this.analyzingScreen.set(false);
        return;
      }

      const settings = this.settings.getSettings();
      const file = await this.screenCapture.captureRegion(region);
      await this.analyzeScreenFile(sessionId, file, 'region', settings);
    } catch (error) {
      console.error(error);
      this.ocrStatus.set('Region capture failed.');
      this.errorMessage.set('Unable to capture or analyze the selected region.');
    } finally {
      this.analyzingScreen.set(false);
    }
  }

  private async analyzeScreenFile(sessionId: string, file: File, captureType: string, settings: any): Promise<void> {
    const extractedText = settings.ocrProvider === 'local'
      ? await this.screenCapture.extractText(file)
      : undefined;
    const result = await firstValueFrom(this.api.analyzeScreen(sessionId, file, {
      captureType,
      windowTitle: document.title,
      appName: 'desktop',
      extractedText,
      promptModifier: this.promptModifier || undefined,
      ocrProvider: settings.ocrProvider,
      aiProvider: settings.aiProvider,
    }));

    this.ocrStatus.set(
      result.capture.ocrText
        ? `OCR captured ${result.capture.ocrText.length} characters from the ${captureType === 'region' ? 'selected region' : 'current screen'}.`
        : 'The capture was saved, but OCR did not find readable text.'
    );

    if (result.detectedQuestion?.cleanedText || result.detectedQuestion?.rawText) {
      this.currentQuestion.set(result.detectedQuestion.cleanedText || result.detectedQuestion.rawText);
    }

    if (result.response?.responseText) {
      this.currentAnswer.set(result.response.responseText);
    }

    this.successMessage.set(`${captureType === 'region' ? 'Region' : 'Screen'} analysis completed.`);
  }

  async saveNotes(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId || !this.notesDraft.trim()) {
      return;
    }

    this.clearMessages();

    try {
      await firstValueFrom(this.api.saveSessionNote(sessionId, {
        noteType: 'manual',
        content: this.notesDraft.trim(),
      }));

      this.successMessage.set('Session notes saved.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to save session notes.');
    }
  }

  async sendFollowUp(): Promise<void> {
    if (!this.followUpDraft.trim()) {
      return;
    }

    await this.generateAnswer(this.followUpDraft.trim());
  }

  async quickAnswer(type: 'shorter' | 'detailed' | 'behavioral' | 'coding'): Promise<void> {
    const modifiers: Record<string, string> = {
      shorter: 'Give a shorter, more concise answer suitable for speaking aloud in under 30 seconds',
      detailed: 'Give a more detailed and comprehensive answer with examples',
      behavioral: 'Answer using the STAR method (Situation, Task, Action, Result) for a behavioral interview',
      coding: 'Provide a code solution with step-by-step explanation, time and space complexity',
    };

    const saved = this.promptModifier;
    this.promptModifier = modifiers[type];
    await this.generateAnswer();
    this.promptModifier = saved;
  }

  async generateSummary(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();

    try {
      const settings = this.settings.getSettings();
      const summary = await firstValueFrom(this.api.generateSummary(sessionId, { provider: settings.aiProvider }));
      this.summaryText.set(summary.summaryText);
      this.successMessage.set('Summary generated.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to generate a session summary right now.');
    }
  }

  async createMobileCompanion(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    this.clearMessages();

    try {
      const companion = await firstValueFrom(this.api.createMobileCompanion(sessionId, {
        deviceName: 'Phone Browser',
        deviceType: 'mobile-web',
      }));

      this.mobileCompanionUrl.set(companion.companionUrl);
      this.successMessage.set('Mobile companion link created.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to create a mobile companion link.');
    }
  }

  async copyMobileCompanionUrl(): Promise<void> {
    const url = this.mobileCompanionUrl();
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.successMessage.set('Companion link copied to the clipboard.');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to copy the companion link automatically.');
    }
  }

  private async attachToSession(sessionId: string): Promise<void> {
    try {
      await this.realtime.connect(sessionId);
      const state = await firstValueFrom(this.api.getLiveState(sessionId));
      this.realtime.hydrate(state);
      this.summaryText.set(state.summary?.summaryText ?? '');
      this.notesDraft = state.notes.find((note) => note.noteType === 'manual')?.content ?? this.notesDraft;
      this.syncTimer(state.startedAt ?? null, state.status);
      this.toggleListening(state.status === 'active');
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to connect to the live session runtime.');
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.updateTimerDisplay();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private bindRealtime(): void {
    this.subscriptions.push(
      this.realtime.transcript$.subscribe((segments) => {
        this.transcriptSegments.set(segments);
        this.nextSequenceNo = segments.reduce((max, segment) => Math.max(max, segment.sequenceNo ?? 0), 0) + 1;
      }),
      this.realtime.latestQuestion$.subscribe((question) => {
        this.currentQuestion.set(question?.cleanedText || question?.rawText || '');
        // Auto-generate answer when a new question is detected (if enabled in settings)
        if (question && this.isActive() && this.settings.getSettings().autoDetectQuestions) {
          void this.generateAnswer(question.cleanedText || question.rawText || undefined);
        }
      }),
      this.realtime.answerText$.subscribe((answer) => this.currentAnswer.set(answer)),
      this.realtime.latestResponse$.subscribe((response) => {
        if (response?.responseText) {
          this.currentAnswer.set(response.responseText);
        }
      }),
      this.realtime.sessionStatus$.subscribe((status) => {
        const isLive = status === 'active';
        this.isActive.set(isLive);
        if (status === 'paused' || status === 'completed') {
          this.stopTimer();
          this.toggleListening(false);
        }
      }),
      this.realtime.connectionState$.subscribe((state) => this.connectionStatus.set(state)),
    );
  }

  private bindSpeechRecognition(): void {
    this.subscriptions.push(
      this.speechRecognition.segments$.subscribe((segment) => {
        if (segment.isFinal) {
          this.interimTranscript.set('');
          void this.persistTranscriptSegment(segment.text);
        } else {
          this.interimTranscript.set(segment.text);
        }
      }),
      this.speechRecognition.errors$.subscribe((message) => {
        this.isListening.set(false);
        this.errorMessage.set(message);
      }),
      this.audioCapture.chunks$.subscribe((chunk) => {
        void this.transcribeAudioChunk(chunk.blob, chunk.fileName, chunk.sourceType);
      }),
      this.audioCapture.errors$.subscribe((message) => {
        this.isListening.set(false);
        this.errorMessage.set(message);
      }),
    );
  }

  private bindShortcuts(): void {
    this.removeShortcutListener = this.electron.onShortcutTriggered((action) => {
      switch (action) {
        case 'Generate Answer':
          void this.generateAnswer();
          break;
        case 'Screen Capture':
          void this.analyzeScreen();
          break;
        case 'AI Chat':
          this.followUpInput?.nativeElement.focus();
          break;
        case 'Reset Context':
          this.currentQuestion.set('');
          this.currentAnswer.set('');
          this.summaryText.set('');
          break;
        case 'Delete Screenshot':
          this.ocrStatus.set('Last OCR capture cleared locally.');
          break;
        default:
          break;
      }
    });
  }

  private async loadProfileContext(): Promise<void> {
    const userId = this.appState.currentUserId;
    if (!userId) {
      return;
    }

    try {
      const [profile, documents] = await Promise.all([
        firstValueFrom(this.api.getUserProfile(userId)),
        firstValueFrom(this.api.getUserDocuments(userId)),
      ]);

      const contextParts = [
        profile?.targetRole ? `Target role: ${profile.targetRole}` : '',
        profile?.companyName ? `Company: ${profile.companyName}` : '',
        profile?.jobDescription ? `Job focus: ${profile.jobDescription}` : '',
        profile?.customInstructions ? `Instructions: ${profile.customInstructions}` : '',
      ].filter(Boolean);

      this.profileContext.set(contextParts.join('\n'));
      this.documentStatuses.set((documents ?? []).map((doc: any) => `${doc.documentType}: ${doc.parseStatus}`));
    } catch (error) {
      console.error(error);
    }
  }

  private async persistTranscriptSegment(text: string): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId || !this.isActive() || !text.trim()) {
      return;
    }

    try {
      await firstValueFrom(this.api.addTranscriptSegment(sessionId, {
        transcriptText: text.trim(),
        sourceType: 'microphone',
        sequenceNo: this.nextSequenceNo++,
        isPartial: false,
      }));
    } catch (error) {
      console.error(error);
    }
  }

  private async transcribeAudioChunk(blob: Blob, fileName: string, sourceType: string): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId || !this.isActive() || !this.isListening()) {
      console.log('[Session] transcribeAudioChunk skipped — sessionId:', sessionId, 'isActive:', this.isActive(), 'isListening:', this.isListening());
      return;
    }
    console.log('[Session] transcribing audio chunk, fileName:', fileName, 'size:', blob.size);

    const settings = this.settings.getSettings();

    try {
      await firstValueFrom(this.api.transcribeAudio(sessionId, blob, {
        language: settings.language || this.appState.preferredLanguage,
        sequenceNo: this.nextSequenceNo++,
        sourceType: sourceType === 'system_audio' ? 'system_audio' : 'microphone',
        provider: settings.aiProvider,
        fileName,
      }));
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to transcribe audio through the external provider.');
    }
  }

  private toggleListening(shouldListen: boolean): void {
    const settings = this.settings.getSettings();
    if (shouldListen) {
      if (!this.audioCapture.supported) {
        this.errorMessage.set('Audio capture is not supported. Please ensure microphone permissions are granted.');
        this.isListening.set(false);
        return;
      }

      // Always use MediaRecorder-based capture — it works even when the main window is
      // hidden behind the overlay. Web Speech API is NOT used because it requires the
      // window to be active/focused and silently stops when the window is hidden.
      this.speechRecognition.stop();
      void this.audioCapture.start(10000, settings.audioDeviceId || undefined);
      this.isListening.set(true);

      // Start system audio capture if enabled
      if (settings.enableSystemAudio) {
        void this.audioCapture.startSystemAudio().then(() => {
          this.isSystemAudioActive.set(this.audioCapture.isCapturingSystemAudio);
        });
      }

      return;
    }

    this.speechRecognition.stop();
    this.audioCapture.stop();
    this.isListening.set(false);
    this.isSystemAudioActive.set(false);
  }

  private syncTimer(startedAt: string | null, status: string): void {
    if (!startedAt) {
      this.elapsedSeconds = 0;
      this.timerDisplay.set('00:00:00');
      return;
    }

    this.elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
    this.updateTimerDisplay();

    if (status === 'active') {
      this.startTimer();
      this.isActive.set(true);
    }
  }

  private updateTimerDisplay(): void {
    const hours = Math.floor(this.elapsedSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((this.elapsedSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (this.elapsedSeconds % 60).toString().padStart(2, '0');
    this.timerDisplay.set(`${hours}:${minutes}:${seconds}`);
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}
