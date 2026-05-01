import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
  }

  interface SpeechRecognitionResultLike {
    readonly isFinal: boolean;
    readonly 0: SpeechRecognitionAlternative;
    readonly length: number;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionEvent {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  }

  interface SpeechRecognitionErrorEvent {
    readonly error: string;
    readonly message: string;
  }
}

export interface SpeechSegment {
  text: string;
  isFinal: boolean;
}

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;
  private readonly segmentSubject = new Subject<SpeechSegment>();
  private readonly errorSubject = new Subject<string>();
  private keepAlive = false;

  readonly segments$ = this.segmentSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  get supported(): boolean {
    return !!this.getConstructor();
  }

  start(language: string): void {
    const RecognitionCtor = this.getConstructor();
    if (!RecognitionCtor) {
      this.errorSubject.next('Speech recognition is not supported in this environment.');
      return;
    }

    this.keepAlive = true;
    this.recognition?.abort();
    this.recognition = new RecognitionCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.mapLanguage(language);
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.errorSubject.next(event.error || 'Speech recognition failed.');
    this.recognition.onend = () => {
      if (this.keepAlive) {
        this.recognition?.start();
      }
    };
    this.recognition.start();
  }

  stop(): void {
    this.keepAlive = false;
    this.recognition?.stop();
  }

  private handleResult(event: SpeechRecognitionEvent): void {
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) {
        continue;
      }

      this.segmentSubject.next({
        text: transcript,
        isFinal: result.isFinal,
      });
    }
  }

  private getConstructor(): SpeechRecognitionConstructor | undefined {
    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }

  private mapLanguage(language: string): string {
    const normalized = language.toLowerCase();
    return ({
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      hi: 'hi-IN',
      ja: 'ja-JP',
      ko: 'ko-KR',
      zh: 'zh-CN',
      ar: 'ar-SA',
    } as Record<string, string>)[normalized] ?? 'en-US';
  }
}
