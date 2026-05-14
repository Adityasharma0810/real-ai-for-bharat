import { Platform } from 'react-native';

export type LiveOcrStatus = 'idle' | 'starting' | 'active' | 'unsupported' | 'error';

export interface LiveOcrUpdate {
  status: LiveOcrStatus;
  text: string;
  confidence: number | null;
  error?: string;
}

interface LiveOcrOptions {
  intervalMs?: number;
  onUpdate: (update: LiveOcrUpdate) => void;
}

const normalizeOcrText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();

const withFilteredTesseractConsole = async <T>(task: () => Promise<T>) => {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (
      message.includes('Estimating resolution as') ||
      message.includes('Invalid resolution') ||
      message.includes('tesseract-core')
    ) {
      return;
    }
    originalError(...args);
  };

  try {
    return await task();
  } finally {
    console.error = originalError;
  }
};

export class LiveOcrTracker {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private worker: Tesseract.Worker | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private recognizing = false;
  private readonly intervalMs: number;
  private readonly onUpdate: (update: LiveOcrUpdate) => void;

  constructor(options: LiveOcrOptions) {
    this.intervalMs = options.intervalMs ?? 4500;
    this.onUpdate = options.onUpdate;
  }

  async start() {
    if (this.running) return;

    if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
      this.onUpdate({
        status: 'unsupported',
        text: '',
        confidence: null,
        error: 'Live OCR is available in the web interview camera only.',
      });
      return;
    }

    this.running = true;
    this.onUpdate({ status: 'starting', text: '', confidence: null });

    try {
      const Tesseract = await import('tesseract.js');
      this.worker = await Tesseract.createWorker('eng');
      await this.worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      this.video = document.createElement('video');
      this.video.autoplay = true;
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = this.stream;
      this.video.style.display = 'none';
      document.body.appendChild(this.video);
      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.onUpdate({ status: 'active', text: '', confidence: null });
      this.scheduleNext(1000);
    } catch (err: any) {
      await this.stop();
      this.onUpdate({
        status: 'error',
        text: '',
        confidence: null,
        error: err?.message ?? 'Could not start live OCR.',
      });
    }
  }

  async stop() {
    this.running = false;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }

    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }

    this.canvas = null;
    this.recognizing = false;
  }

  private scheduleNext(delay = this.intervalMs) {
    if (!this.running) return;
    this.timeoutId = setTimeout(() => {
      void this.captureAndRecognize();
    }, delay);
  }

  private async captureAndRecognize() {
    if (!this.running || this.recognizing || !this.video || !this.canvas || !this.worker) {
      this.scheduleNext();
      return;
    }

    if (this.video.readyState < 2 || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      this.scheduleNext(700);
      return;
    }

    this.recognizing = true;
    try {
      const width = Math.min(960, this.video.videoWidth);
      const height = Math.round((width / this.video.videoWidth) * this.video.videoHeight);
      this.canvas.width = width;
      this.canvas.height = height;

      const context = this.canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable for OCR capture.');

      context.drawImage(this.video, 0, 0, width, height);
      const result = await withFilteredTesseractConsole(() => this.worker!.recognize(this.canvas!));
      const text = normalizeOcrText(result.data.text);

      this.onUpdate({
        status: 'active',
        text,
        confidence: Number.isFinite(result.data.confidence) ? Math.round(result.data.confidence) : null,
      });
    } catch (err: any) {
      this.onUpdate({
        status: 'error',
        text: '',
        confidence: null,
        error: err?.message ?? 'Live OCR scan failed.',
      });
    } finally {
      this.recognizing = false;
      this.scheduleNext();
    }
  }
}
