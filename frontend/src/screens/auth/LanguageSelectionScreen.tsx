import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AuthContext } from '../../context/AuthContext';

const LANGUAGES = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { id: 'hi', label: 'Hindi', native: 'हिंदी' },
];

export const LanguageSelectionScreen: React.FC<any> = ({ navigation }) => {
  const { setLanguage, language } = useContext(AuthContext);
  const [selected, setSelected] = useState(language || 'en');

  const handleContinue = async () => {
    await setLanguage(selected);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Language</Text>
        <Text style={styles.subtitle}>Select your preferred language to continue</Text>
      </View>

      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => setSelected(item.id)}
            activeOpacity={0.7}
            style={styles.cardContainer}
          >
            <AppCard 
              style={[
                styles.card,
                ...(selected === item.id ? [styles.selectedCard] : [])
              ]}
              variant={selected === item.id ? 'elevated' : 'outlined'}
            >
              <View style={styles.cardContent}>
                <View>
                  <Text style={[styles.nativeText, selected === item.id && styles.selectedText]}>
                    {item.native}
                  </Text>
                  <Text style={styles.labelText}>{item.label}</Text>
                </View>
                {selected === item.id && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                )}
              </View>
            </AppCard>
          </TouchableOpacity>
        )}
      />

      <View style={styles.footer}>
        <AppButton 
          title="Continue" 
          onPress={handleContinue}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 20,
  },
  list: {
    padding: 24,
  },
  cardContainer: {
    marginBottom: 16,
  },
  card: {
    padding: 24,
    borderRadius: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCard: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  nativeText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  labelText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  selectedText: {
    color: theme.colors.primary,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  }
});
