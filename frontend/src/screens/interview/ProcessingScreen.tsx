import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AppButton } from '../../components/AppButton';

export const ProcessingScreen: React.FC<any> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.aiGlow}>
          <Ionicons name="sparkles" size={80} color={theme.colors.primary} />
          <ActivityIndicator
            size={120}
            color={theme.colors.primary}
            style={styles.spinner}
          />
        </View>
        <Text style={styles.title}>Processing happens after the live interview</Text>
        <Text style={styles.subtitle}>
          Results are saved by the backend voice agent when Priya closes the interview.
        </Text>
        <AppButton
          title="Back to Home"
          onPress={() => navigation.navigate('HomeTabs')}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  aiGlow: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  spinner: {
    position: 'absolute',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  button: {
    width: '100%',
  },
});
