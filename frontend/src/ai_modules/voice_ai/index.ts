import { Audio } from 'expo-av';

/**
 * Voice AI Module
 * 
 * This module handles real-time voice analysis and tracking.
 */

export class VoiceTracker {
  private recording: Audio.Recording | null = null;
  private isRecording: boolean = false;

  async requestPermissions(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    console.log('Microphone permission status:', status);
    return status === 'granted';
  }

  async startTracking(): Promise<void> {
    if (this.isRecording) return;
    
    try {
      const permission = await this.requestPermissions();
      if (!permission) {
        throw new Error('Microphone permission not granted');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
      this.isRecording = true;
      console.log('Started voice tracking recording');
    } catch (err) {
      console.error('Failed to start voice tracking', err);
    }
  }

  async stopTracking(): Promise<void> {
    if (!this.isRecording || !this.recording) return;
    
    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      console.log('Stopped voice tracking. Recording stored at:', uri);
      
      this.recording = null;
      this.isRecording = false;
    } catch (err) {
      console.error('Failed to stop voice tracking', err);
    }
  }
}
