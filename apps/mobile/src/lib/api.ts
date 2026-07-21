import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { VisitorRequestInput, UpdateVisitorStatusInput } from '@portl/shared';

function getApiBaseUrl(): string {
  // 0. Production override — set this for EAS/APK builds, takes priority over everything below
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 1. If running in Expo Go or Expo dev build over Wi-Fi/LAN, extract the exact host IP address
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

  // 2. Android emulator fallback
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
  const { accessToken } = await res.json() as { accessToken: string };

  // Fetch the user profile from /me using the just-issued token
  const meRes = await fetch(`${API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    throw new Error('Failed to load user profile');
  }
  const { user } = await meRes.json() as { user: UserProfile };

  return { accessToken, user };
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

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export interface Notice {
  id: string;
  title: string;
  content: string;
  societyId: string;
  createdByUserId: string;
  createdBy?: { name: string };
  createdAt: string;
}

export async function getNotices(token: string): Promise<Notice[]> {
  const res = await fetch(`${API_BASE_URL}/notices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch notices');
  }
  const result = await res.json();
  return result.notices;
}

export async function createNotice(
  token: string,
  data: { title: string; content: string }
): Promise<Notice> {
  const res = await fetch(`${API_BASE_URL}/notices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Creation failed' }));
    throw new Error(err.error || err.message || 'Failed to create notice');
  }
  const result = await res.json();
  return result.notice;
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

export interface PollResult {
  option: string;
  count: number;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  results: PollResult[];
  createdBy?: { name: string };
  createdAt: string;
}

export async function getPolls(token: string): Promise<Poll[]> {
  const res = await fetch(`${API_BASE_URL}/polls`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch polls');
  }
  const result = await res.json();
  return result.polls;
}

export async function castVote(
  token: string,
  pollId: string,
  selectedOption: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/polls/${pollId}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ selectedOption }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Vote failed' }));
    throw new Error(err.error || err.message || 'Failed to cast vote');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

export interface Complaint {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  flatId: string;
  createdByUserId: string;
  createdBy?: { name: string };
  flat?: { number: string; tower?: { name: string } };
  createdAt: string;
  updatedAt: string;
}

export async function getComplaints(token: string): Promise<Complaint[]> {
  const res = await fetch(`${API_BASE_URL}/complaints`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch complaints');
  }
  const result = await res.json();
  return result.complaints;
}

export async function createComplaint(
  token: string,
  data: { title: string; description: string }
): Promise<Complaint> {
  const res = await fetch(`${API_BASE_URL}/complaints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Creation failed' }));
    throw new Error(err.error || err.message || 'Failed to create complaint');
  }
  const result = await res.json();
  return result.complaint;
}

export async function updateComplaintStatus(
  token: string,
  id: string,
  status: string
): Promise<Complaint> {
  const res = await fetch(`${API_BASE_URL}/complaints/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || err.message || 'Failed to update complaint status');
  }
  const result = await res.json();
  return result.complaint;
}

// ---------------------------------------------------------------------------
// Amenities
// ---------------------------------------------------------------------------

export interface Amenity {
  id: string;
  name: string;
  description: string | null;
  societyId: string;
  createdAt: string;
}

export interface AmenityBooking {
  id: string;
  amenityId: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export async function getAmenities(token: string): Promise<Amenity[]> {
  const res = await fetch(`${API_BASE_URL}/amenities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch amenities');
  }
  const result = await res.json();
  return result.amenities;
}

export async function bookAmenity(
  token: string,
  amenityId: string,
  data: { date: string; startTime: string; endTime: string }
): Promise<AmenityBooking> {
  const res = await fetch(`${API_BASE_URL}/amenities/${amenityId}/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Booking failed' }));
    throw new Error(err.message || err.error || 'Failed to book amenity');
  }
  const result = await res.json();
  return result.booking;
}
