export interface TranscriptSegmentDto {
  id: string;
  sessionId: string;
  sequenceNo: number;
  sourceType: string;
  speakerLabel?: string | null;
  transcriptText: string;
  isPartial: boolean;
  isFinal: boolean;
  createdAt?: string;
}

export interface DetectedQuestionDto {
  id: string;
  sessionId: string;
  sourceType: string;
  rawText: string;
  cleanedText?: string | null;
  questionType: string;
  confidence?: number | null;
  createdAt?: string;
}

export interface AiResponseDto {
  id: string;
  sessionId: string;
  questionId?: string | null;
  sourceCaptureId?: string | null;
  responseType: string;
  promptModifier?: string | null;
  responseText: string;
  modelProvider?: string | null;
  modelName?: string | null;
  status: string;
  createdAt?: string;
}

export interface SessionNoteDto {
  id: string;
  sessionId: string;
  noteType: string;
  content: string;
  createdAt?: string;
}

export interface SessionSummaryDto {
  id: string;
  sessionId: string;
  summaryText: string;
  generatedBy: string;
  createdAt?: string;
}

export interface SessionLiveStateDto {
  sessionId: string;
  status: string;
  language: string;
  startedAt?: string | null;
  latestQuestion?: DetectedQuestionDto | null;
  latestResponse?: AiResponseDto | null;
  recentTranscript: TranscriptSegmentDto[];
  notes: SessionNoteDto[];
  summary?: SessionSummaryDto | null;
}

export interface MobileCompanionInfoDto {
  sessionId: string;
  connectionToken: string;
  companionUrl: string;
}

export interface ScreenAnalysisResultDto {
  capture: {
    id: string;
    sessionId: string;
    captureType: string;
    ocrText?: string | null;
    createdAt?: string;
  };
  detectedQuestion?: DetectedQuestionDto | null;
  response?: AiResponseDto | null;
}

export interface HotkeyBinding {
  action: string;
  description: string;
  keys: string;
  category: string;
  isEnabled: boolean;
}

export interface AppSettings {
  language: string;
  overlayAlwaysOnTop: boolean;
  autoDetectQuestions: boolean;
  aiProvider: string;
  apiKey: string;
  transcriptionEngine: string;
  ocrProvider: string;
  audioDeviceId: string;
  enableSystemAudio: boolean;
  hotkeys: HotkeyBinding[];
}
