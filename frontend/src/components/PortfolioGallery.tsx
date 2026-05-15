import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePortfolio } from '../hooks/usePortfolio';
import { PortfolioPhoto } from '../services/portfolioService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMBNAIL_SIZE = 100;
const MAX_CAPTION_LENGTH = 300;

interface PortfolioGalleryProps {
  userId: string;
  /** When true, hides the Add Photo button (used when viewing another candidate's profile) */
  readOnly?: boolean;
}

export const PortfolioGallery: React.FC<PortfolioGalleryProps> = ({ userId, readOnly = false }) => {
  const { photos, isLoading, isUploading, error, uploadError, addPhoto, removePhoto, atLimit } =
    usePortfolio(userId);

  const [selectedPhoto, setSelectedPhoto] = useState<PortfolioPhoto | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    uri: string;
    mimeType: string;
    fileSize: number;
  } | null>(null);

  // ── Pick photo from library ──────────────────────────────────────────────

  const handleAddPhoto = useCallback(async () => {
    if (atLimit) return; // guard already shown via UI

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileSize = asset.fileSize ?? 0;

    // Store pending upload and show caption modal
    setPendingUpload({ uri: asset.uri, mimeType, fileSize });
    setCaptionInput('');
    setShowCaptionModal(true);
  }, [atLimit]);

  // ── Confirm upload (after caption entry) ────────────────────────────────

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingUpload) return;
    setShowCaptionModal(false);
    const caption = captionInput.trim() || undefined;
    await addPhoto(pendingUpload.uri, pendingUpload.mimeType, pendingUpload.fileSize, caption);
    setPendingUpload(null);
    setCaptionInput('');
  }, [pendingUpload, captionInput, addPhoto]);

  const handleCancelUpload = useCallback(() => {
    setShowCaptionModal(false);
    setPendingUpload(null);
    setCaptionInput('');
  }, []);

  // ── Delete photo ─────────────────────────────────────────────────────────

  const handleDeletePhoto = useCallback(
    (photo: PortfolioPhoto) => {
      Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSelectedPhoto(null);
            await removePhoto(photo);
          },
        },
      ]);
    },
    [removePhoto]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Work Portfolio</Text>
        {!readOnly && !atLimit && (
          <TouchableOpacity
            style={[styles.addButton, isUploading && styles.addButtonDisabled]}
            onPress={handleAddPhoto}
            disabled={isUploading}
            accessibilityLabel="Add work photo"
            accessibilityRole="button"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>+ Add Photo</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Limit reached message */}
      {!readOnly && atLimit && (
        <Text style={styles.limitText}>
          You've reached the maximum of 20 photos. Delete a photo to add a new one.
        </Text>
      )}

      {/* Error messages */}
      {(error || uploadError) && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{uploadError || error}</Text>
        </View>
      )}

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#6366f1" />
        </View>
      )}

      {/* Empty state */}
      {!isLoading && photos.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={styles.emptyText}>No work photos yet</Text>
          <Text style={styles.emptySubText}>
            Add photos to showcase your skills and past work experience.
          </Text>
        </View>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          accessibilityLabel="Work portfolio photos"
        >
          {photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              style={styles.thumbnail}
              onPress={() => setSelectedPhoto(photo)}
              accessibilityLabel={photo.caption ?? 'Work photo'}
              accessibilityRole="button"
            >
              {photo.signedUrl ? (
                <Image
                  source={{ uri: photo.signedUrl }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.brokenImage}>
                  <Text style={styles.brokenImageIcon}>🖼️</Text>
                </View>
              )}
              {photo.caption ? (
                <Text style={styles.thumbnailCaption} numberOfLines={2} ellipsizeMode="tail">
                  {photo.caption}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Caption input modal ── */}
      <Modal
        visible={showCaptionModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancelUpload}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.captionModalContent}>
            <Text style={styles.modalTitle}>Add a Caption (optional)</Text>
            <TextInput
              style={styles.captionInput}
              placeholder="Describe this work photo..."
              placeholderTextColor="#9ca3af"
              value={captionInput}
              onChangeText={(t) => setCaptionInput(t.slice(0, MAX_CAPTION_LENGTH))}
              maxLength={MAX_CAPTION_LENGTH}
              multiline
              numberOfLines={3}
              accessibilityLabel="Caption input"
            />
            <Text style={styles.charCount}>
              {captionInput.length}/{MAX_CAPTION_LENGTH}
            </Text>
            <View style={styles.captionModalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={handleCancelUpload}
                accessibilityRole="button"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleConfirmUpload}
                accessibilityRole="button"
              >
                <Text style={styles.confirmBtnText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Full-screen photo modal ── */}
      <Modal
        visible={!!selectedPhoto}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        {selectedPhoto && (
          <View style={styles.fullScreenModal}>
            {/* Close button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedPhoto(null)}
              accessibilityLabel="Close photo"
              accessibilityRole="button"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            {/* Full-resolution image */}
            {selectedPhoto.signedUrl ? (
              <Image
                source={{ uri: selectedPhoto.signedUrl }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.fullScreenBroken}>
                <Text style={styles.brokenImageIcon}>🖼️</Text>
                <Text style={styles.brokenImageText}>Image unavailable</Text>
              </View>
            )}

            {/* Caption */}
            {selectedPhoto.caption ? (
              <View style={styles.fullScreenCaptionContainer}>
                <Text style={styles.fullScreenCaption}>{selectedPhoto.caption}</Text>
              </View>
            ) : null}

            {/* Delete button — hidden in readOnly mode */}
            {!readOnly && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePhoto(selectedPhoto)}
                accessibilityLabel="Delete photo"
                accessibilityRole="button"
              >
                <Text style={styles.deleteButtonText}>🗑 Delete Photo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  addButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  limitText: {
    fontSize: 12,
    color: '#f59e0b',
    marginBottom: 8,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  scrollContent: {
    paddingRight: 8,
    gap: 10,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    marginRight: 10,
  },
  thumbnailImage: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  brokenImage: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  brokenImageIcon: {
    fontSize: 24,
    opacity: 0.4,
  },
  brokenImageText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  thumbnailCaption: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 15,
  },
  // Caption modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  captionModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  captionInput: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  captionModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    backgroundColor: '#6366f1',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Full-screen modal
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  fullScreenBroken: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCaptionContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  fullScreenCaption: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  deleteButton: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
