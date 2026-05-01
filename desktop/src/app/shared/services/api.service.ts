import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MobileCompanionInfoDto, ScreenAnalysisResultDto, SessionLiveStateDto, SessionNoteDto, SessionSummaryDto, TranscriptSegmentDto } from '../models/runtime.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Users
  createUser(data: {
    fullName: string;
    email?: string;
    language: string;
    targetRole?: string;
    companyName?: string;
    jobDescription?: string;
    customInstructions?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/users`, data);
  }

  getUser(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/users/${id}`);
  }

  getUserProfile(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/users/${id}/profile`);
  }

  // Sessions
  startSession(data: {
    userId: string;
    title?: string;
    sourceApp?: string;
    sessionMode: string;
    language: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/sessions`, data);
  }

  getSession(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/sessions/${id}`);
  }

  getUserSessions(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/sessions/user/${userId}`);
  }

  endSession(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/sessions/${id}/end`, {});
  }

  pauseSession(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/sessions/${id}/pause`, {});
  }

  resumeSession(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/sessions/${id}/resume`, {});
  }

  getTranscript(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/sessions/${sessionId}/transcript`);
  }

  addTranscriptSegment(sessionId: string, data: {
    transcriptText: string;
    sourceType: string;
    sequenceNo: number;
    isPartial: boolean;
  }): Observable<TranscriptSegmentDto> {
    return this.http.post<TranscriptSegmentDto>(`${this.baseUrl}/api/sessions/${sessionId}/transcript-segments`, data);
  }

  generateAnswer(sessionId: string, data: {
    questionText?: string;
    promptModifier?: string;
    responseType?: string;
    provider?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/sessions/${sessionId}/generate-answer`, data);
  }

  transcribeAudio(sessionId: string, audio: Blob, options: {
    language: string;
    sequenceNo: number;
    sourceType?: string;
    provider?: string;
    fileName?: string;
  }): Observable<any> {
    const formData = new FormData();
    formData.append('audio', audio, options.fileName ?? `audio-${Date.now()}.webm`);
    formData.append('language', options.language);
    formData.append('sequenceNo', String(options.sequenceNo));
    formData.append('sourceType', options.sourceType ?? 'microphone_external');
    if (options.provider) formData.append('provider', options.provider);
    return this.http.post(`${this.baseUrl}/api/sessions/${sessionId}/transcribe-audio`, formData);
  }

  analyzeScreen(
    sessionId: string,
    screenshot: File,
    options?: {
      captureType?: string;
      windowTitle?: string;
      appName?: string;
      extractedText?: string;
      promptModifier?: string;
      ocrProvider?: string;
      aiProvider?: string;
    }
  ): Observable<ScreenAnalysisResultDto> {
    const formData = new FormData();
    formData.append('screenshot', screenshot);
    if (options?.captureType) formData.append('captureType', options.captureType);
    if (options?.windowTitle) formData.append('windowTitle', options.windowTitle);
    if (options?.appName) formData.append('appName', options.appName);
    if (options?.extractedText) formData.append('extractedText', options.extractedText);
    if (options?.promptModifier) formData.append('promptModifier', options.promptModifier);
    if (options?.ocrProvider) formData.append('ocrProvider', options.ocrProvider);
    if (options?.aiProvider) formData.append('aiProvider', options.aiProvider);

    return this.http.post<ScreenAnalysisResultDto>(`${this.baseUrl}/api/sessions/${sessionId}/screen-analysis`, formData);
  }

  saveSessionNote(sessionId: string, data: { noteType: string; content: string }): Observable<SessionNoteDto> {
    return this.http.post<SessionNoteDto>(`${this.baseUrl}/api/sessions/${sessionId}/notes`, data);
  }

  getLiveState(sessionId: string): Observable<SessionLiveStateDto> {
    return this.http.get<SessionLiveStateDto>(`${this.baseUrl}/api/sessions/${sessionId}/live-state`);
  }

  generateSummary(sessionId: string, data?: { provider?: string }): Observable<SessionSummaryDto> {
    return this.http.post<SessionSummaryDto>(`${this.baseUrl}/api/sessions/${sessionId}/summary`, data ?? {});
  }

  createMobileCompanion(sessionId: string, data?: { deviceName?: string; deviceType?: string }): Observable<MobileCompanionInfoDto> {
    return this.http.post<MobileCompanionInfoDto>(`${this.baseUrl}/api/sessions/${sessionId}/mobile-companion`, data ?? {});
  }

  getMobileState(token: string): Observable<SessionLiveStateDto> {
    return this.http.get<SessionLiveStateDto>(`${this.baseUrl}/api/mobile/${token}`);
  }

  // Documents
  getUserDocuments(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/documents/user/${userId}`);
  }

  uploadDocument(userId: string, documentType: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('documentType', documentType);
    formData.append('file', file);
    return this.http.post(`${this.baseUrl}/api/documents/upload`, formData);
  }

  // Settings
  getUserSettings(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/users/${userId}/settings`);
  }

  upsertUserSetting(userId: string, settingKey: string, value: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/users/${userId}/settings/${settingKey}`, value);
  }

  getUserHotkeys(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/users/${userId}/hotkeys`);
  }

  upsertUserHotkeys(userId: string, bindings: Array<{ actionName: string; keyCombo: string; isEnabled: boolean }>): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/users/${userId}/hotkeys`, bindings);
  }
}
