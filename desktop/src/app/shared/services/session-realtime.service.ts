import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AiResponseDto, DetectedQuestionDto, SessionLiveStateDto, TranscriptSegmentDto } from '../models/runtime.models';

@Injectable({ providedIn: 'root' })
export class SessionRealtimeService {
  private connection: HubConnection | null = null;
  private currentSessionId: string | null = null;

  readonly transcript$ = new BehaviorSubject<TranscriptSegmentDto[]>([]);
  readonly latestQuestion$ = new BehaviorSubject<DetectedQuestionDto | null>(null);
  readonly latestResponse$ = new BehaviorSubject<AiResponseDto | null>(null);
  readonly answerText$ = new BehaviorSubject<string>('');
  readonly sessionStatus$ = new BehaviorSubject<string>('ready');
  readonly connectionState$ = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');
  readonly screenCapture$ = new BehaviorSubject<string | null>(null);

  async connect(sessionId: string): Promise<void> {
    if (this.connection && this.currentSessionId === sessionId && this.connection.state === HubConnectionState.Connected) {
      return;
    }

    await this.disconnect();
    this.currentSessionId = sessionId;
    this.connectionState$.next('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(environment.wsUrl)
      .withAutomaticReconnect()
      .build();

    this.registerHandlers(this.connection);
    await this.connection.start();
    await this.connection.invoke('JoinSession', sessionId);
    this.connectionState$.next('connected');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      if (this.currentSessionId && this.connection.state === HubConnectionState.Connected) {
        try {
          await this.connection.invoke('LeaveSession', this.currentSessionId);
        } catch {
          // Ignore disconnect cleanup errors.
        }
      }

      await this.connection.stop();
      this.connection = null;
    }

    this.currentSessionId = null;
    this.connectionState$.next('disconnected');
  }

  hydrate(state: SessionLiveStateDto | null): void {
    if (!state) {
      this.clear();
      return;
    }

    this.transcript$.next(state.recentTranscript ?? []);
    this.latestQuestion$.next(state.latestQuestion ?? null);
    this.latestResponse$.next(state.latestResponse ?? null);
    this.answerText$.next(state.latestResponse?.responseText ?? '');
    this.sessionStatus$.next(state.status ?? 'ready');
  }

  clear(): void {
    this.transcript$.next([]);
    this.latestQuestion$.next(null);
    this.latestResponse$.next(null);
    this.answerText$.next('');
    this.sessionStatus$.next('ready');
    this.screenCapture$.next(null);
  }

  private registerHandlers(connection: HubConnection): void {
    connection.on('TranscriptUpdate', (segment: TranscriptSegmentDto) => {
      const existing = this.transcript$.value.filter((item) => item.id !== segment.id);
      existing.push(segment);
      existing.sort((left, right) => left.sequenceNo - right.sequenceNo);
      this.transcript$.next(existing);
    });

    connection.on('QuestionDetected', (question: DetectedQuestionDto) => {
      this.latestQuestion$.next(question);
    });

    connection.on('AnswerStream', (chunk: string) => {
      this.answerText$.next(`${this.answerText$.value}${chunk}`);
    });

    connection.on('AnswerComplete', (response: AiResponseDto) => {
      this.latestResponse$.next(response);
      this.answerText$.next(response.responseText ?? this.answerText$.value);
    });

    connection.on('SessionStatusChanged', (status: string) => {
      this.sessionStatus$.next(status);
    });

    connection.on('LiveStateUpdated', (state: SessionLiveStateDto) => {
      this.hydrate(state);
    });

    connection.on('ScreenCaptureShared', (base64: string) => {
      this.screenCapture$.next(base64);
    });

    connection.onclose(() => {
      this.connectionState$.next('disconnected');
    });
  }
}
