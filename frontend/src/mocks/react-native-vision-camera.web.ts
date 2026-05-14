// Web stub for react-native-vision-camera
// VisionCamera is a native-only library and does not work on web.
// This stub prevents the crash when the app is loaded in a browser.

import React from 'react';
import { View } from 'react-native';

export const Camera = View;
export const useCameraDevice = (_position: string) => null;
export const useCameraPermission = () => ({ hasPermission: true, requestPermission: async () => true });
export const useFrameProcessor = (_fn: any, _deps: any[]) => undefined;
export const runAtTargetFps = (_fps: number, _fn: () => void) => {};
export const useCameraFormat = () => null;
export const getCameraFormat = () => null;
export const useMicrophonePermission = () => ({ hasPermission: true, requestPermission: async () => true });
