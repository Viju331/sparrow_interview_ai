import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface AudioChunk {
  blob: Blob;
  mimeType: string;
  fileName: string;
  sourceType: 'microphone' | 'system_audio';
}

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

@Injectable({ providedIn: 'root' })
export class AudioCaptureService {
  private micRecorder: MediaRecorder | null = null;
  private micStream: MediaStream | null = null;
  private systemRecorder: MediaRecorder | null = null;
  private systemStream: MediaStream | null = null;
  private readonly chunkSubject = new Subject<AudioChunk>();
  private readonly errorSubject = new Subject<string>();

  // Stored to allow transparent restart when audio devices change (e.g. Bluetooth connects)
  private lastTimesliceMs = 4000;
  private lastDeviceId?: string;
  private lastSystemTimesliceMs = 5000;
  private readonly onDeviceChange = () => {
    if (!this.isCapturingMicrophone) return;
    void this.start(this.lastTimesliceMs, this.lastDeviceId);
  };
  private readonly onSystemDeviceChange = () => {
    if (!this.isCapturingSystemAudio) return;
    // Output device changed (e.g. Bluetooth headset connected) — restart system audio
    // so the loopback capture follows the new default output device.
    void this.startSystemAudio(this.lastSystemTimesliceMs);
  };

  readonly chunks$ = this.chunkSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    // Request permission first so labels are available
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((track) => track.stop());
    } catch {
      // Permission denied — labels will be empty but IDs still work
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `${device.kind} (${device.deviceId.substring(0, 8)})`,
        kind: device.kind as 'audioinput' | 'audiooutput',
      }));
  }

  async start(timesliceMs = 4000, deviceId?: string): Promise<void> {
    if (!this.supported) {
      console.error('[AudioCapture] start() called but not supported. MediaRecorder available:', typeof MediaRecorder !== 'undefined', 'getUserMedia available:', !!navigator.mediaDevices?.getUserMedia);
      this.errorSubject.next('Audio capture is not supported in this environment.');
      return;
    }

    console.log('[AudioCapture] start() called. timeslice:', timesliceMs, 'deviceId:', deviceId);
    this.stopMicrophone();

    this.lastTimesliceMs = timesliceMs;
    this.lastDeviceId = deviceId;

    // Use `ideal` instead of `exact` so we fall back to the default device
    // if the specified device is disconnected (e.g. Bluetooth dropped).
    const audioConstraints: MediaTrackConstraints = deviceId
      ? { deviceId: { ideal: deviceId } }
      : {};

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      console.log('[AudioCapture] getUserMedia succeeded. Tracks:', this.micStream.getAudioTracks().length);
    } catch (err) {
      console.error('[AudioCapture] getUserMedia FAILED:', err);
      this.errorSubject.next(
        `Unable to access audio device${deviceId ? ` (${deviceId})` : ''}. Check that the microphone or earphone is connected and permissions are granted.`
      );
      return;
    }

    this.micRecorder = this.createRecorder(this.micStream, 'microphone', timesliceMs);
    console.log('[AudioCapture] MediaRecorder created and started, state:', this.micRecorder.state);

    // Listen for device changes so connecting a Bluetooth headset or headphones
    // automatically switches the capture to the new device.
    navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange);
    navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);
  }

  async startSystemAudio(timesliceMs = 5000): Promise<void> {
    this.stopSystemAudio();
    this.lastSystemTimesliceMs = timesliceMs;

    try {
      // Use Electron desktopCapturer to get system audio (loopback).
      // Works with speakers, wired headsets, and Bluetooth headsets because
      // it captures from the Windows WASAPI loopback at the audio session level.
      this.systemStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 },
      });

      // Remove video track — we only need audio
      this.systemStream.getVideoTracks().forEach((track) => track.stop());

      const audioTracks = this.systemStream.getAudioTracks();
      if (audioTracks.length === 0) {
        this.errorSubject.next('System audio capture started but no audio track was available. Ensure you selected "Share audio" when prompted.');
        this.systemStream = null;
        return;
      }

      // Create a stream with only the audio tracks
      const audioOnlyStream = new MediaStream(audioTracks);
      this.systemRecorder = this.createRecorder(audioOnlyStream, 'system_audio', timesliceMs);

      // Restart if the audio output device changes (e.g. Bluetooth headset connects)
      navigator.mediaDevices.removeEventListener('devicechange', this.onSystemDeviceChange);
      navigator.mediaDevices.addEventListener('devicechange', this.onSystemDeviceChange);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.errorSubject.next('System audio capture was cancelled. To capture interviewer audio, share a screen or window with audio enabled.');
      } else {
        this.errorSubject.next('Unable to capture system audio. This feature requires screen sharing with audio.');
      }
    }
  }

  stop(): void {
    this.stopMicrophone();
    this.stopSystemAudio();
  }

  stopMicrophone(): void {
    navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange);
    if (this.micRecorder && this.micRecorder.state !== 'inactive') {
      this.micRecorder.stop();
    }
    this.micRecorder = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  stopSystemAudio(): void {
    navigator.mediaDevices.removeEventListener('devicechange', this.onSystemDeviceChange);
    if (this.systemRecorder && this.systemRecorder.state !== 'inactive') {
      this.systemRecorder.stop();
    }
    this.systemRecorder = null;
    this.systemStream?.getTracks().forEach((track) => track.stop());
    this.systemStream = null;
  }

  get isCapturingSystemAudio(): boolean {
    return this.systemRecorder !== null && this.systemRecorder.state === 'recording';
  }

  get isCapturingMicrophone(): boolean {
    return this.micRecorder !== null && this.micRecorder.state === 'recording';
  }

  private createRecorder(stream: MediaStream, sourceType: 'microphone' | 'system_audio', timesliceMs: number): MediaRecorder {
    const mimeType = this.pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        console.log('[AudioCapture] chunk emitted, sourceType:', sourceType, 'size:', event.data.size, 'type:', event.data.type);
        const resolvedMimeType = event.data.type || mimeType || 'audio/webm';
        this.chunkSubject.next({
          blob: event.data,
          mimeType: resolvedMimeType,
          fileName: `${sourceType}-chunk-${Date.now()}${this.extensionForMimeType(resolvedMimeType)}`,
          sourceType,
        });
      }
    };

    recorder.onerror = () => {
      this.errorSubject.next(`Audio capture failed while recording ${sourceType === 'system_audio' ? 'system' : 'microphone'} input.`);
    };

    recorder.start(timesliceMs);
    return recorder;
  }

  private pickMimeType(): string | undefined {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  }

  private extensionForMimeType(mimeType: string): string {
    if (mimeType.includes('mp4')) {
      return '.mp4';
    }

    return '.webm';
  }
}
