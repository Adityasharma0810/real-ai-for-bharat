import { Platform } from 'react-native';

export type WebFaceStatus = 'scanning' | 'verified' | 'no_face' | 'multiple_faces' | 'face_mismatch' | 'unsupported' | 'error';

export const FACE_MATCH_THRESHOLD = 0.5;

// ── Face Comparison Utilities ──────────────────────────────────────────────

let recognitionModelsLoaded = false;

/**
 * Ensure the landmark + recognition models are loaded (lazy, once).
 * The tinyFaceDetector is loaded separately by WebFaceProctor.
 */
async function ensureRecognitionModels() {
  if (recognitionModelsLoaded) return;
  const faceapi = await import('face-api.js');
  await Promise.all([
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ]);
  recognitionModelsLoaded = true;
}

/**
 * Load an image from a URI and create an HTMLImageElement.
 */
async function loadImage(uri: string): Promise<HTMLImageElement> {
  // For remote URLs (http/https), fetch as blob to bypass CORS restrictions
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new (window as any).Image() as HTMLImageElement;
        img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
        img.onerror = (err) => { URL.revokeObjectURL(objectUrl); reject(err); };
        img.src = objectUrl;
      });
    } catch (fetchErr) {
      console.warn('[FaceMatch] Blob fetch failed, trying direct load:', fetchErr);
    }
  }
  // For data URIs, blob URIs, or fallback
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image() as HTMLImageElement;
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = uri;
  });
}

/**
 * Compute a 128-d face descriptor from an image URI.
 * Returns null if no face is detected.
 */
export async function computeFaceDescriptor(imageUri: string): Promise<Float32Array | null> {
  if (Platform.OS !== 'web') return null;

  try {
    const faceapi = await import('face-api.js');

    // Ensure all required models are loaded
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    }
    await ensureRecognitionModels();

    const img = await loadImage(imageUri);
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true) // true = use tiny model
      .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
  } catch (err) {
    console.warn('[FaceMatch] computeFaceDescriptor failed:', err);
    return null;
  }
}

/**
 * Euclidean distance between two 128-d descriptors.
 */
export function compareFaceDescriptors(desc1: Float32Array, desc2: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const d = desc1[i] - desc2[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * High-level: compare two images and return whether they match.
 */
export async function compareFaces(
  imageUri1: string,
  imageUri2: string,
): Promise<{ match: boolean; distance: number } | null> {
  const [desc1, desc2] = await Promise.all([
    computeFaceDescriptor(imageUri1),
    computeFaceDescriptor(imageUri2),
  ]);

  if (!desc1 || !desc2) return null;

  const distance = compareFaceDescriptors(desc1, desc2);
  return {
    match: distance < FACE_MATCH_THRESHOLD,
    distance,
  };
}

// ── WebFaceProctor (enhanced with face matching) ────────────────────────────

interface WebFaceProctorOptions {
  intervalMs?: number;
  onStatus: (status: WebFaceStatus, faceCount: number) => void;
  /** Pre-computed reference descriptor for identity matching. */
  referenceDescriptor?: Float32Array | null;
  /** How often (in cycles) to run the heavier face-match check. Default: 3 */
  matchEveryN?: number;
}

export class WebFaceProctor {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private detecting = false;
  private modelsLoaded = false;
  private cycleCount = 0;
  private readonly intervalMs: number;
  private readonly onStatus: (status: WebFaceStatus, faceCount: number) => void;
  private readonly referenceDescriptor: Float32Array | null;
  private readonly matchEveryN: number;

  constructor(options: WebFaceProctorOptions) {
    this.intervalMs = options.intervalMs ?? 1200;
    this.onStatus = options.onStatus;
    this.referenceDescriptor = options.referenceDescriptor ?? null;
    this.matchEveryN = options.matchEveryN ?? 3; // run face-match every 3rd cycle (~3.6s)
  }

  async start() {
    if (this.running) return;

    if (Platform.OS !== 'web' || typeof document === 'undefined' || !navigator?.mediaDevices) {
      this.onStatus('unsupported', 0);
      return;
    }

    this.running = true;
    this.cycleCount = 0;
    this.onStatus('scanning', 0);

    try {
      const faceapi = await import('face-api.js');
      if (!this.modelsLoaded) {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        this.modelsLoaded = true;
      }

      // Also load recognition models if we have a reference
      if (this.referenceDescriptor) {
        await ensureRecognitionModels();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
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

      this.scheduleNext(500);
    } catch (error) {
      console.warn('[WebFaceProctor] Failed to start:', error);
      await this.stop();
      this.onStatus('error', 0);
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

    this.detecting = false;
  }

  private scheduleNext(delay = this.intervalMs) {
    if (!this.running) return;
    this.timeoutId = setTimeout(() => {
      void this.detect();
    }, delay);
  }

  private async detect() {
    if (!this.running || this.detecting || !this.video) {
      this.scheduleNext();
      return;
    }

    if (this.video.readyState < 2 || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      this.scheduleNext(500);
      return;
    }

    this.detecting = true;
    this.cycleCount++;

    try {
      const faceapi = await import('face-api.js');

      // Decide whether this cycle should also do face matching
      const shouldMatch = this.referenceDescriptor && (this.cycleCount % this.matchEveryN === 0);

      if (shouldMatch) {
        // Heavier path: detect + landmarks + descriptor
        const detections = await faceapi
          .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
          .withFaceLandmarks(true)
          .withFaceDescriptors();

        const faceCount = detections.length;
        if (faceCount === 0) {
          this.onStatus('no_face', 0);
        } else if (faceCount > 1) {
          this.onStatus('multiple_faces', faceCount);
        } else {
          // Compare against reference
          const liveDescriptor = detections[0].descriptor;
          const distance = compareFaceDescriptors(this.referenceDescriptor!, liveDescriptor);
          if (distance > FACE_MATCH_THRESHOLD) {
            this.onStatus('face_mismatch', 1);
          } else {
            this.onStatus('verified', 1);
          }
        }
      } else {
        // Lightweight path: just face count (fast)
        const detections = await faceapi.detectAllFaces(
          this.video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }),
        );

        const faceCount = detections.length;
        if (faceCount === 0) {
          this.onStatus('no_face', 0);
        } else if (faceCount > 1) {
          this.onStatus('multiple_faces', faceCount);
        } else {
          this.onStatus('verified', 1);
        }
      }
    } catch (error) {
      console.warn('[WebFaceProctor] Detection failed:', error);
      this.onStatus('error', 0);
    } finally {
      this.detecting = false;
      this.scheduleNext();
    }
  }
}
