import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Greeting */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Good evening,</Text>
        <Text style={styles.name}>Alex</Text>
      </View>

      {/* Focus Score Card */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Focus Score</Text>
        <Text style={styles.scoreValue}>
          84<Text style={styles.scoreMax}>/100</Text>
        </Text>
      </View>

      {/* Streak Card */}
      <View style={styles.streakCard}>
        <Text style={styles.streakTitle}>🔥 7-day streak</Text>
        <Text style={styles.streakSub}>Keep it up!</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>24.5h</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>87%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>7 PM</Text>
          <Text style={styles.statLabel}>Best Time</Text>
        </View>
      </View>

      {/* Start Button */}
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Start Focus Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
  },
  scoreCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 24,
    marginBottom: 14,
  },
  scoreLabel: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 6,
  },
  scoreValue: {
    color: '#fff',
    fontSize: 42,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 20,
    fontWeight: 'normal',
    color: '#aaa',
  },
  streakCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  streakTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  streakSub: {
    fontSize: 13,
    color: '#888',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
