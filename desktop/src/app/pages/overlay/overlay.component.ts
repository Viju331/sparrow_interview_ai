import { Component, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../shared/services/api.service';
import { AppStateService } from '../../shared/services/app-state.service';
import { AudioCaptureService } from '../../shared/services/audio-capture.service';
import { ElectronService } from '../../shared/services/electron.service';
import { ScreenCaptureService } from '../../shared/services/screen-capture.service';
import { SettingsService } from '../../shared/services/settings.service';
import { SessionRealtimeService } from '../../shared/services/session-realtime.service';

@Component({
  selector: 'app-overlay',
  standalone: true,
  template: `
    <div class="overlay" [class.overlay--click-through]="clickThrough()">
      <div class="overlay-handle">
        <div class="handle-dots">
          <span></span><span></span><span></span>
        </div>
        <div class="overlay-controls">
          <button
            class="overlay-ctrl-btn"
            [class.overlay-ctrl-btn--active]="clickThrough()"
            (click)="toggleClickThrough()"
            title="Toggle click-through mode"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M2 12h3M12 2v3M4.93 4.93l2.12 2.12M19.07 4.93l-2.12 2.12"/>
            </svg>
          </button>
          <div class="overlay-status" [class.overlay-status--live]="isLive()">
            <span class="status-dot"></span>
            {{ isLive() ? 'Live' : 'Ready' }}
          </div>
          <button
            class="overlay-ctrl-btn overlay-ctrl-btn--stop"
            [disabled]="isStopping()"
            (click)="stopSession()"
            title="Stop session"
          >
            @if (isStopping()) {
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            } @else {
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            }
          </button>
        </div>
      </div>

      <div class="overlay-body">
        <div class="overlay-section">
          <h3 class="overlay-label">Question</h3>
          <p class="overlay-question">
            @if (currentQuestion()) {
              {{ currentQuestion() }}
            } @else {
              <span class="overlay-placeholder">Waiting for question...</span>
            }
          </p>
        </div>

        <div class="overlay-section">
          <h3 class="overlay-label">Answer</h3>
          @if (isCapturing()) {
            <div class="overlay-capturing">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              {{ captureStatus() }}
            </div>
          }
          @if (screenshotPreview()) {
            <img class="overlay-screenshot" [src]="screenshotPreview()" alt="Captured screen" />
          }
          <pre class="overlay-answer">{{ answerText() || 'Answer will appear here...' }}</pre>
        </div>

        <div class="overlay-section">
          <h3 class="overlay-label">Transcript</h3>
          <div class="overlay-transcript-list">
            @for (seg of localSegments(); track seg.id) {
              <div class="transcript-item">
                <p class="transcript-text">{{ seg.text }}</p>
                <button class="send-btn" (click)="sendToAI()" title="Send all text to AI (Ctrl+Enter)">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Send
                </button>
              </div>
            }
            @if (interimText()) {
              <div class="transcript-item transcript-item--interim">
                <p class="transcript-text">{{ interimText() }}</p>
              </div>
            }
            @if (localSegments().length === 0 && !interimText()) {
              <p class="overlay-placeholder">
                @if (isLive()) { Listening... } @else { Waiting for session... }
              </p>
            }
          </div>
          @if (localSegments().length > 0) {
            <div class="send-bar">
              <button class="send-all-btn" (click)="sendToAI()" [disabled]="isGenerating()">
                @if (isGenerating()) { Thinking... } @else { Send All · Ctrl+Enter }
              </button>
              <button class="clear-btn" (click)="clearTranscript()" title="Clear transcript">Clear</button>
            </div>
          }
        </div>
      </div>

      @if (opacityHint()) {
        <div class="overlay-opacity-hint">{{ opacityHint() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    .overlay {
      height: 100%;
      display: flex;
      flex-direction: column;
      background-color: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 14px;
      overflow: hidden;
      user-select: none;
      transition: border-color 0.3s ease;
    }

    .overlay--click-through {
      border-color: rgba(34, 197, 94, 0.4);
      pointer-events: none;

      .overlay-handle { pointer-events: auto; }
    }

    .overlay-handle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background-color: rgba(30, 41, 59, 0.8);
      cursor: grab;
      -webkit-app-region: drag;
      flex-shrink: 0;

      &:active { cursor: grabbing; }
    }

    .handle-dots {
      display: flex;
      gap: 3px;

      span {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background-color: var(--color-sparrow-text-muted);
      }
    }

    .overlay-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      -webkit-app-region: no-drag;
    }

    .overlay-ctrl-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid var(--color-sparrow-border);
      background: transparent;
      color: var(--color-sparrow-text-muted);
      cursor: pointer;
      padding: 0;
      transition: all 0.2s ease;

      &:hover {
        background-color: rgba(139, 94, 60, 0.25);
        color: var(--color-sparrow-text);
      }
    }

    .overlay-ctrl-btn--active {
      border-color: var(--color-sparrow-accent);
      color: var(--color-sparrow-accent);
      background-color: rgba(34, 197, 94, 0.12);
    }

    .overlay-ctrl-btn--stop {
      color: #f87171;
      border-color: rgba(248, 113, 113, 0.3);

      &:hover:not(:disabled) {
        background-color: rgba(239, 68, 68, 0.2);
        border-color: #f87171;
        color: #fca5a5;
      }

      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .overlay-status {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.6875rem;
      color: var(--color-sparrow-text-muted);
      font-weight: 500;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--color-sparrow-border);
      transition: background-color 0.3s ease, box-shadow 0.3s ease;
    }

    .overlay-status--live {
      color: var(--color-sparrow-accent);

      .status-dot {
        background-color: var(--color-sparrow-accent);
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
      }
    }

    .overlay-body {
      flex: 1;
      padding: 0.75rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      -webkit-app-region: no-drag;
    }

    .overlay-section { }

    .overlay-label {
      font-size: 0.625rem;
      font-weight: 600;
      color: var(--color-sparrow-primary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 0.375rem;
    }

    .overlay-question {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-sparrow-text);
      line-height: 1.45;
      margin: 0;
    }

    .overlay-answer {
      margin: 0;
      white-space: pre-wrap;
      font: inherit;
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--color-sparrow-text);
    }

    .overlay-placeholder {
      font-size: 0.75rem;
      color: var(--color-sparrow-text-muted);
      font-style: italic;
    }

    .overlay-transcript-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      max-height: 180px;
      overflow-y: auto;
    }

    .transcript-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 6px;
      padding: 0.4rem 0.5rem;
    }

    .transcript-item--interim {
      border-color: rgba(139, 94, 60, 0.4);
      opacity: 0.75;
      font-style: italic;
    }

    .transcript-text {
      flex: 1;
      margin: 0;
      font-size: 0.72rem;
      color: var(--color-sparrow-text);
      line-height: 1.45;
      word-break: break-word;
    }

    .send-btn {
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
      padding: 0.2rem 0.45rem;
      font-size: 0.6rem;
      font-weight: 600;
      border-radius: 4px;
      border: 1px solid rgba(34, 197, 94, 0.35);
      background: rgba(34, 197, 94, 0.1);
      color: var(--color-sparrow-accent);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: rgba(34, 197, 94, 0.25);
        border-color: var(--color-sparrow-accent);
      }
    }

    .send-bar {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.4rem;
    }

    .send-all-btn {
      flex: 1;
      padding: 0.3rem 0.6rem;
      font-size: 0.65rem;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid var(--color-sparrow-accent);
      background: rgba(34, 197, 94, 0.15);
      color: var(--color-sparrow-accent);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover:not(:disabled) { background: rgba(34, 197, 94, 0.3); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .clear-btn {
      padding: 0.3rem 0.5rem;
      font-size: 0.65rem;
      border-radius: 6px;
      border: 1px solid var(--color-sparrow-border);
      background: transparent;
      color: var(--color-sparrow-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: #f87171;
        color: #f87171;
      }
    }

    .overlay-capturing {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.7rem;
      color: var(--color-sparrow-primary);
      margin-bottom: 0.375rem;
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    .overlay-screenshot {
      width: 100%;
      max-height: 120px;
      object-fit: contain;
      border-radius: 6px;
      border: 1px solid var(--color-sparrow-border);
      margin-bottom: 0.375rem;
    }

    .overlay-opacity-hint {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.2rem 0.6rem;
      border-radius: 8px;
      background-color: rgba(15, 23, 42, 0.85);
      border: 1px solid var(--color-sparrow-border);
      color: var(--color-sparrow-text);
      font-size: 0.65rem;
      font-weight: 500;
      pointer-events: none;
      animation: fadeHint 1.5s ease forwards;
    }

    @keyframes fadeHint {
      0%   { opacity: 1; }
      70%  { opacity: 1; }
      100% { opacity: 0; }
    }
  `],
})
export class OverlayComponent implements OnInit, OnDestroy {
  // ── UI state ──────────────────────────────────────────────────────────────
  isLive = signal(false);
  currentQuestion = signal<string | null>(null);
  answerText = signal('');
  clickThrough = signal(false);
  opacityHint = signal('');
  isStopping = signal(false);
  isCapturing = signal(false);
  captureStatus = signal('');
  screenshotPreview = signal<string | null>(null);
  isGenerating = signal(false);

  // ── Local transcript (MediaRecorder → backend → SignalR) ─────────────────
  // text = display label (may include "[Interviewer]" prefix), rawText = clean text sent to AI
  localSegments = signal<Array<{ id: string; text: string; rawText: string }>>([]);
  interimText = signal('');

  private nextSequenceNo = 1;
  private readonly seenSegmentIds = new Set<string>();
  private readonly subscriptions: Subscription[] = [];
  private removeShortcutListener: (() => void) | null = null;
  private removeClickThroughListener: (() => void) | null = null;
  private opacityHintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly appState: AppStateService,
    private readonly audioCapture: AudioCaptureService,
    private readonly realtime: SessionRealtimeService,
    private readonly electron: ElectronService,
    private readonly screenCapture: ScreenCaptureService,
    private readonly settings: SettingsService,
  ) { }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    this.bindRealtime();
    this.bindShortcuts();
    this.bindClickThrough();
    this.bindSpeechRecognition();

    const sessionId = this.appState.getCurrentSessionId();
    if (!sessionId) return;

    try {
      const state = await firstValueFrom(this.api.getLiveState(sessionId));
      await this.realtime.connect(sessionId);
      this.realtime.hydrate(state);
      if (state.recentTranscript?.length) {
        this.nextSequenceNo = state.recentTranscript.reduce(
          (max, s) => Math.max(max, s.sequenceNo ?? 0), 0
        ) + 1;
      }
      if (state.status === 'active') {
        this.startListening();
      }
    } catch (error) {
      console.error('[Overlay] ngOnInit error:', error);
    }
  }

  ngOnDestroy(): void {
    this.audioCapture.stop();
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.removeShortcutListener?.();
    this.removeClickThroughListener?.();
    if (this.opacityHintTimer) clearTimeout(this.opacityHintTimer);
    const preview = this.screenshotPreview();
    if (preview) URL.revokeObjectURL(preview);
    void this.realtime.disconnect();
  }

  // ── Keyboard shortcut: Ctrl+Enter → send to AI ───────────────────────────
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      void this.sendToAI();
    }
  }

  // ── Dynamic click-through: hover over handle re-enables events ────────────
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.clickThrough()) return;
    // Handle bar is ~40px tall at the top; keep it interactive so toggle works
    const overHandle = event.clientY <= 40;
    this.electron.setIgnoreMouseEvents(!overHandle, true);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleClickThrough(): void {
    const next = !this.clickThrough();
    this.clickThrough.set(next);
    this.electron.setOverlayClickThrough(next);
    if (!next) {
      // Turning click-through OFF: ensure window accepts all mouse events again
      this.electron.setIgnoreMouseEvents(false);
    }
  }

  stopSession(): void {
    if (this.isStopping()) return;
    this.isStopping.set(true);
    this.electron.stopSessionFromOverlay();
  }

  clearTranscript(): void {
    this.localSegments.set([]);
    this.interimText.set('');
  }

  async sendToAI(): Promise<void> {
    const sessionId = this.appState.getCurrentSessionId();
    if (!sessionId || this.isGenerating()) return;

    const allText = this.localSegments().map((s) => s.rawText).join(' ').trim();
    if (!allText) return;

    this.isGenerating.set(true);
    try {
      const appSettings = this.settings.getSettings();
      await firstValueFrom(this.api.generateAnswer(sessionId, {
        questionText: allText,
        responseType: 'answer',
        provider: appSettings.aiProvider,
      }));
      // Answer arrives via SignalR → answerText signal
    } catch (err) {
      console.error('[Overlay] sendToAI failed:', err);
    } finally {
      this.isGenerating.set(false);
    }
  }

  async analyzeScreen(): Promise<void> {
    const sessionId = this.appState.getCurrentSessionId();
    if (!sessionId || this.isCapturing()) return;
    this.isCapturing.set(true);
    this.captureStatus.set('Capturing screen...');
    const prev = this.screenshotPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.screenshotPreview.set(null);
    try {
      const appSettings = this.settings.getSettings();
      const file = await this.screenCapture.captureScreen();
      this.screenshotPreview.set(URL.createObjectURL(file));
      this.captureStatus.set('Analyzing...');
      const result = await firstValueFrom(this.api.analyzeScreen(sessionId, file, {
        captureType: 'analyze_screen',
        windowTitle: 'overlay',
        appName: 'desktop',
        extractedText: undefined,
        promptModifier: undefined,
        ocrProvider: appSettings.ocrProvider,
        aiProvider: appSettings.aiProvider,
      }));
      this.captureStatus.set(
        result.capture?.ocrText ? `OCR: ${result.capture.ocrText.length} chars` : 'Done.'
      );
      if (result.detectedQuestion?.cleanedText || result.detectedQuestion?.rawText) {
        this.currentQuestion.set(result.detectedQuestion.cleanedText || result.detectedQuestion.rawText);
      }
      if (result.response?.responseText) {
        this.answerText.set(result.response.responseText);
      }
    } catch (err) {
      console.error(err);
      this.captureStatus.set('Capture failed.');
    } finally {
      this.isCapturing.set(false);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private startListening(): void {
    this.audioCapture.stop();
    // Only capture what comes through speakers/headset (interviewer's voice).
    // The user's own microphone is never transcribed.
    void this.audioCapture.startSystemAudio(5000);
    console.log('[Overlay] System audio capture started (interviewer voice only)');
  }

  private bindSpeechRecognition(): void {
    this.subscriptions.push(
      // System audio only — interviewer's voice coming through speakers or headset
      this.audioCapture.chunks$.subscribe((chunk) => {
        if (chunk.sourceType === 'system_audio') {
          void this.transcribeChunk(chunk.blob, chunk.fileName, chunk.sourceType);
        }
      }),
      this.audioCapture.errors$.subscribe((msg) => {
        console.warn('[Overlay] Audio capture error:', msg);
      }),
    );
  }

  private async transcribeChunk(blob: Blob, fileName: string, sourceType: string): Promise<void> {
    const sessionId = this.appState.getCurrentSessionId();
    if (!sessionId || !this.isLive()) return;
    console.log('[Overlay] transcribing system audio chunk, size:', blob.size);
    try {
      const appSettings = this.settings.getSettings();
      await firstValueFrom(this.api.transcribeAudio(sessionId, blob, {
        language: appSettings.language || 'en',
        sequenceNo: this.nextSequenceNo++,
        sourceType: 'system_audio',
        provider: appSettings.aiProvider,
        fileName,
      }));
    } catch (err) {
      console.error('[Overlay] transcribeChunk failed:', err);
    }
  }

  private bindRealtime(): void {
    this.subscriptions.push(
      this.realtime.sessionStatus$.subscribe((status) => {
        this.isLive.set(status === 'active');
        if (status === 'active') {
          this.startListening();
        } else {
          this.audioCapture.stop();
        }
      }),
      this.realtime.latestQuestion$.subscribe((question) => {
        this.currentQuestion.set(question?.cleanedText || question?.rawText || null);
      }),
      this.realtime.answerText$.subscribe((answer) => this.answerText.set(answer)),
      // Only pull system_audio segments from SignalR — mic segments are already
      // added to localSegments directly by the Web Speech API handler above.
      this.realtime.transcript$.subscribe((segments) => {
        const newSystemSegs = segments.filter(
          (s) => s.sourceType === 'system_audio' && !this.seenSegmentIds.has(s.id)
        );
        for (const seg of newSystemSegs) {
          this.seenSegmentIds.add(seg.id);
          this.localSegments.update((prev) => [...prev, { id: seg.id, text: `[Interviewer] ${seg.transcriptText}`, rawText: seg.transcriptText }]);
        }
      }),
    );
  }

  private bindShortcuts(): void {
    this.removeShortcutListener = this.electron.onShortcutTriggered((action) => {
      switch (action) {
        case 'Screen Capture':
          void this.analyzeScreen();
          break;
        case 'Generate Answer':
          void this.sendToAI();
          break;
        case 'Reset Context':
          this.currentQuestion.set(null);
          this.answerText.set('');
          this.clearTranscript();
          break;
        case 'Opacity Down':
        case 'Opacity Up':
          this.showOpacityHint();
          break;
      }
    });
  }

  private bindClickThrough(): void {
    this.removeClickThroughListener = this.electron.onOverlayClickThroughChanged((value) => {
      this.clickThrough.set(value);
    });
  }

  private showOpacityHint(): void {
    if (this.opacityHintTimer) clearTimeout(this.opacityHintTimer);
    this.electron.getOverlayState().then((state) => {
      this.opacityHint.set(`${Math.round(state.opacity * 100)}%`);
      this.opacityHintTimer = setTimeout(() => this.opacityHint.set(''), 1500);
    });
  }
}
