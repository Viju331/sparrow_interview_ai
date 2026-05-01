import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../shared/services/api.service';
import { SessionRealtimeService } from '../../shared/services/session-realtime.service';

@Component({
  selector: 'app-mobile-companion',
  standalone: true,
  template: `
    <div class="mobile-shell">
      <div class="mobile-card">
        <div class="mobile-header">
          <div>
            <span class="eyebrow">Sparrow Companion</span>
            <h1>Live Session</h1>
          </div>
          <span class="status" [class.status--live]="status() === 'active'">{{ status() }}</span>
        </div>

        @if (errorMessage()) {
          <div class="error">{{ errorMessage() }}</div>
        }

        @if (sharedScreen()) {
          <section class="section">
            <h2>Shared Screen</h2>
            <img class="shared-screen" [src]="sharedScreen()" alt="Shared screen capture" />
          </section>
        }

        <section class="section">
          <h2>Detected Question</h2>
          <p class="question">{{ question() || 'Waiting for question detection...' }}</p>
        </section>

        <section class="section">
          <h2>Answer</h2>
          <pre class="answer">{{ answer() || 'Answer guidance will appear here.' }}</pre>
        </section>

        <section class="section">
          <h2>Recent Transcript</h2>
          <div class="transcript-list">
            @for (segment of transcript(); track segment.id) {
              <div class="transcript-item">
                <span class="source">{{ segment.sourceType }}</span>
                <p>{{ segment.transcriptText }}</p>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .mobile-shell {
      min-height: 100vh;
      padding: 1rem;
      background:
        radial-gradient(circle at top left, rgba(34, 197, 94, 0.14), transparent 30%),
        linear-gradient(180deg, #0f172a 0%, #111827 100%);
      color: #e2e8f0;
    }

    .mobile-card {
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .mobile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .eyebrow {
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    h1, h2 {
      margin: 0;
    }

    h1 {
      font-size: 1.4rem;
    }

    h2 {
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }

    .status {
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      background-color: rgba(148, 163, 184, 0.18);
      color: #cbd5e1;
      text-transform: capitalize;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status--live {
      background-color: rgba(34, 197, 94, 0.18);
      color: #bbf7d0;
    }

    .section {
      background-color: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      padding: 1rem;
      backdrop-filter: blur(12px);
    }

    .question, .answer {
      margin: 0;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .shared-screen {
      width: 100%;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      object-fit: contain;
      max-height: 300px;
    }

    .transcript-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .transcript-item {
      padding: 0.75rem;
      border-radius: 12px;
      background-color: rgba(30, 41, 59, 0.85);
    }

    .source {
      display: inline-block;
      margin-bottom: 0.25rem;
      font-size: 0.7rem;
      text-transform: uppercase;
      color: #a7f3d0;
    }

    .transcript-item p {
      margin: 0;
      font-size: 0.9rem;
      color: #e5e7eb;
    }

    .error {
      padding: 0.85rem 1rem;
      border-radius: 14px;
      background-color: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fecaca;
    }
  `],
})
export class MobileCompanionComponent implements OnInit, OnDestroy {
  status = signal('connecting');
  question = signal('');
  answer = signal('');
  transcript = signal<Array<{ id: string; sourceType: string; transcriptText: string }>>([]);
  sharedScreen = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  private subscriptions: Subscription[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly realtime: SessionRealtimeService,
  ) { }

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.errorMessage.set('Missing mobile companion token.');
      return;
    }

    try {
      const state = await firstValueFrom(this.api.getMobileState(token));
      await this.realtime.connect(state.sessionId);
      this.realtime.hydrate(state);
      this.bindRealtime();
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Unable to connect to the live session from this mobile companion link.');
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    void this.realtime.disconnect();
  }

  private bindRealtime(): void {
    this.subscriptions.push(
      this.realtime.sessionStatus$.subscribe((status) => this.status.set(status)),
      this.realtime.latestQuestion$.subscribe((question) => {
        this.question.set(question?.cleanedText || question?.rawText || '');
      }),
      this.realtime.answerText$.subscribe((answer) => this.answer.set(answer)),
      this.realtime.transcript$.subscribe((segments) => this.transcript.set(segments.slice(-10))),
      this.realtime.screenCapture$.subscribe((image) => this.sharedScreen.set(image)),
    );
  }
}
