import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { VisitorRequestInput, UpdateVisitorStatusInput } from '@portl/shared';

function getApiBaseUrl(): string {
  // 1. If running in Expo Go or Expo dev build over Wi-Fi/LAN, extract the exact host IP address (e.g. 192.168.1.11)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:3000`;
    }
  }

  // 2. If running on Android emulator fallback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  // 3. Web or iOS simulator default
  return 'http://localhost:3000';
}

export const API_BASE_URL = getApiBaseUrl();

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: 'RESIDENT' | 'GUARD' | 'ADMIN';
  societyId: string;
  flatId: string | null;
  gateId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: UserProfile;
}

export interface VisitorRequest {
  id: string;
  name: string;
  purpose: string;
  visitorType: string;
  flatId: string;
  photoUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'EXPIRED';
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export async function login(credential: string, password = 'password123'): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || err.message || 'Failed to login');
  }
  return res.json();
}

export async function createVisitorRequest(
  token: string,
  data: VisitorRequestInput
): Promise<VisitorRequest> {
  const res = await fetch(`${API_BASE_URL}/visitor-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Creation failed' }));
    throw new Error(err.error || err.message || 'Failed to create visitor request');
  }
  const result = await res.json();
  return result.visitorRequest;
}

export async function getVisitorRequests(token: string): Promise<VisitorRequest[]> {
  const res = await fetch(`${API_BASE_URL}/visitor-requests`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch visitor requests');
  }
  const result = await res.json();
  return result.visitorRequests;
}

export async function updateVisitorStatus(
  token: string,
  id: string,
  status: UpdateVisitorStatusInput['status'],
  idempotencyKey?: string
): Promise<VisitorRequest> {
  const payload: UpdateVisitorStatusInput = { status };
  if (idempotencyKey) {
    payload.idempotencyKey = idempotencyKey;
  }
  const res = await fetch(`${API_BASE_URL}/visitor-requests/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || err.message || 'Failed to update visitor status');
  }
  const result = await res.json();
  return result.visitorRequest;
}
