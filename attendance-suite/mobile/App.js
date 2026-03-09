import React, { useEffect, useMemo, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';

const API_BASE = 'http://10.0.2.2:4000';

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('ravi@company.com');
  const [password, setPassword] = useState('Password@123');
  const [status, setStatus] = useState('Ready');
  const [trackingOn, setTrackingOn] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);

  const employeeName = useMemo(() => {
    return user ? user.name : 'Not logged in';
  }, [user]);

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Request failed ${path}`);
    }

    return response.json();
  }

  async function onLogin() {
    try {
      setStatus('Logging in...');
      const payload = await fetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (payload.user.role !== 'EMPLOYEE') {
        throw new Error('Please login with employee account');
      }

      setToken(payload.token);
      setUser(payload.user);
      setStatus(`Logged in as ${payload.user.name}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function getCurrentCoords() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Location permission denied');
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const coords = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      speedKph: Math.max(0, (current.coords.speed || 0) * 3.6)
    };

    setLastLocation(coords);
    return coords;
  }

  async function checkIn() {
    try {
      setStatus('Checking in...');
      const coords = await getCurrentCoords();

      const attendance = await fetchJson('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude
        })
      });

      setStatus(`Checked in: ${attendance.status}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function checkOut() {
    try {
      setStatus('Checking out...');
      await fetchJson('/attendance/check-out', {
        method: 'POST',
        body: JSON.stringify({})
      });
      setStatus('Checked out');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function pushLiveLocation() {
    const coords = await getCurrentCoords();

    await fetchJson('/locations/live', {
      method: 'POST',
      body: JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        speedKph: Number(coords.speedKph.toFixed(2))
      })
    });
  }

  useEffect(() => {
    if (!trackingOn || !token) return;

    setStatus('Live tracking enabled');

    const timer = setInterval(() => {
      pushLiveLocation().catch((error) => setStatus(error.message));
    }, 30000);

    return () => clearInterval(timer);
  }, [trackingOn, token]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Attendance Mobile</Text>
        <Text style={styles.subtitle}>Employee: {employeeName}</Text>

        {!token ? (
          <View style={styles.loginCard}>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="Email" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" />
            <Button title="Login" onPress={onLogin} />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <Button title="Check In" onPress={checkIn} />
              <Button title="Check Out" onPress={checkOut} />
            </View>

            <View style={styles.row}>
              <Button
                title={trackingOn ? 'Stop Live Tracking' : 'Start Live Tracking'}
                onPress={() => setTrackingOn((value) => !value)}
              />
            </View>
          </>
        )}

        <Text style={styles.label}>Status: {status}</Text>
        <Text style={styles.label}>
          Last Location: {lastLocation ? `${lastLocation.latitude.toFixed(5)}, ${lastLocation.longitude.toFixed(5)}` : 'N/A'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fd'
  },
  content: {
    padding: 20,
    gap: 16
  },
  title: {
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 16
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  label: {
    fontSize: 14,
    lineHeight: 20
  },
  loginCard: {
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d9deea',
    borderRadius: 10,
    padding: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccd4e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  }
});
