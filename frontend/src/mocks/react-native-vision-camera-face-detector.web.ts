// Web stub for react-native-vision-camera-face-detector
// This library depends on VisionCamera which is native-only.
// This stub prevents crashes when running on web.

export interface FaceDetectorConfig {
  performanceMode?: 'fast' | 'accurate';
  landmarkMode?: 'none' | 'all';
  contourMode?: 'none' | 'all';
  classificationMode?: 'none' | 'all';
  minFaceSize?: number;
  trackingEnabled?: boolean;
}

export const useFaceDetector = (_config?: FaceDetectorConfig) => ({
  detectFaces: (_frame: any): any[] => [],
});
