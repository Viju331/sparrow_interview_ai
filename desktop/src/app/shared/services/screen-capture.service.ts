import { Injectable } from '@angular/core';
import Tesseract from 'tesseract.js';

export interface ScreenCaptureResult {
  file: File;
  extractedText: string;
}

@Injectable({ providedIn: 'root' })
export class ScreenCaptureService {
  async captureAndExtractText(): Promise<ScreenCaptureResult> {
    const file = await this.captureScreen();
    const extractedText = await this.extractText(file);
    return { file, extractedText };
  }

  async captureScreen(): Promise<File> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 1,
      },
      audio: false,
    });

    try {
      return await this.captureSingleFrame(stream);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  async captureRegion(region: { x: number; y: number; width: number; height: number }): Promise<File> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 1,
      },
      audio: false,
    });

    try {
      const fullFrame = await this.captureSingleFrame(stream);
      return await this.cropImage(fullFrame, region);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  async extractText(file: Blob): Promise<string> {
    const result = await Tesseract.recognize(file, 'eng');
    return result.data.text?.trim() ?? '';
  }

  private async cropImage(file: File, region: { x: number; y: number; width: number; height: number }): Promise<File> {
    const bitmap = await createImageBitmap(file);
    const scaleX = bitmap.width / window.screen.width;
    const scaleY = bitmap.height / window.screen.height;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(region.width * scaleX);
    canvas.height = Math.round(region.height * scaleY);
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(
      bitmap,
      Math.round(region.x * scaleX),
      Math.round(region.y * scaleY),
      canvas.width,
      canvas.height,
      0, 0,
      canvas.width,
      canvas.height,
    );

    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error('Unable to crop the selected region.'));
      }, 'image/png');
    });

    return new File([blob], `region-capture-${Date.now()}.png`, { type: 'image/png' });
  }

  private async captureSingleFrame(stream: MediaStream): Promise<File> {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve(undefined);
        return;
      }

      video.onloadedmetadata = () => resolve(undefined);
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }

        reject(new Error('Unable to capture the selected screen.'));
      }, 'image/png');
    });

    return new File([blob], `screen-capture-${Date.now()}.png`, { type: 'image/png' });
  }
}
