import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { VisitorRequestInput, UpdateVisitorStatusInput } from '@portl/shared';

export let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void) {
  onUnauthorized = cb;
}

function check401(res: Response) {
  if (res.status === 401) {
    onUnauthorized?.();
  }
}
function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
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
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

export const API_BASE_URL = getApiBaseUrl();
console.log('API_BASE_URL configured as:', API_BASE_URL);

// Helper to prevent infinite hangs
async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 8000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);

  return response;
}

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

export async function getMe(token: string): Promise<{ id: string; role: string; societyId: string }> {
  const res = await fetch(`${API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    throw new Error('Failed to fetch profile');
  }
  const result = await res.json();
  return result.user;
}

export async function updatePushToken(token: string, expoPushToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/push-token`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ expoPushToken }),
  });
  if (!res.ok) {
    check401(res);
    throw new Error('Failed to update push token');
  }
}

// ---------------------------------------------------------------------------
// Staff & Service Providers
// ---------------------------------------------------------------------------

export interface ServiceProvider {
  id: string;
  name: string;
  category: string;
  phone: string;
  notes?: string;
}

export async function getStaff(token: string): Promise<ServiceProvider[]> {
  const res = await fetch(`${API_BASE_URL}/staff`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    throw new Error('Failed to fetch staff directory');
  }
  const data = await res.json();
  return data.providers;
}

export async function createStaff(
  token: string,
  payload: { name: string; category: string; phone: string; notes?: string }
): Promise<ServiceProvider> {
  const res = await fetch(`${API_BASE_URL}/staff`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json();
    throw new Error(err.error || 'Failed to create staff member');
  }
  return res.json();
}

export async function updateStaff(
  token: string,
  id: string,
  payload: Partial<{ name: string; category: string; phone: string; notes: string }>
): Promise<ServiceProvider> {
  const res = await fetch(`${API_BASE_URL}/staff/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json();
    throw new Error(err.error || 'Failed to update staff member');
  }
  return res.json();
}

export async function deleteStaff(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/staff/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete staff member');
  }
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
  console.log(`Attempting login to ${API_BASE_URL}/auth/login...`);
  const res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, password }),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || err.message || 'Failed to login');
  }
  const { accessToken } = await res.json() as { accessToken: string };

  // Fetch the user profile from /me using the just-issued token
  const meRes = await fetchWithTimeout(`${API_BASE_URL}/me`, {
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
    check401(res);
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
    check401(res);
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
    check401(res);
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || err.message || 'Failed to update visitor status');
  }
  const result = await res.json();
  return result.visitorRequest;
}

// ---------------------------------------------------------------------------
// Flats & Residents
// ---------------------------------------------------------------------------

export interface FlatSearchResult {
  id: string;
  number: string;
  tower: { name: string };
  residents: { name: string; phone: string | null }[];
}

export async function searchFlats(token: string, q: string): Promise<FlatSearchResult[]> {
  const res = await fetch(`${API_BASE_URL}/flats/search?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    throw new Error('Failed to search flats');
  }
  const result = await res.json();
  return result.flats;
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
    check401(res);
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
    check401(res);
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
  endsAt: string | null;
  votes?: { userId: string; selectedOption: string; user: { name: string } }[];
}

export async function getPolls(token: string): Promise<Poll[]> {
  const res = await fetch(`${API_BASE_URL}/polls`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ error: 'Fetch failed' }));
    throw new Error(err.error || err.message || 'Failed to fetch polls');
  }
  const result = await res.json();
  return result.polls;
}

export async function createPoll(
  token: string,
  data: { question: string; options: string[] }
): Promise<Poll> {
  const res = await fetch(`${API_BASE_URL}/polls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ error: 'Creation failed' }));
    throw new Error(err.error || err.message || 'Failed to create poll');
  }
  const result = await res.json();
  return result.poll;
}

export async function updatePoll(
  token: string,
  id: string,
  data: Partial<{ question: string; options: string[] }>
): Promise<Poll> {
  const res = await fetch(`${API_BASE_URL}/polls/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Update failed' }));
    throw new Error(err.message || err.error || 'Failed to update poll');
  }
  const result = await res.json();
  return result.poll;
}

export async function deletePoll(
  token: string,
  id: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/polls/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Deletion failed' }));
    throw new Error(err.message || err.error || 'Failed to delete poll');
  }
}

export async function endPoll(
  token: string,
  id: string
): Promise<Poll> {
  const res = await fetch(`${API_BASE_URL}/polls/${id}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'End failed' }));
    throw new Error(err.message || err.error || 'Failed to end poll');
  }
  const result = await res.json();
  return result.poll;
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
    check401(res);
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
    check401(res);
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
    check401(res);
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
    check401(res);
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || err.message || 'Failed to update complaint status');
  }
  const result = await res.json();
  return result.complaint;
}

export async function getComplaintCount(token: string): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/complaints/count`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    throw new Error('Failed to fetch complaint count');
  }
  const result = await res.json();
  return result.count;
}

// ---------------------------------------------------------------------------
// Amenities
// ---------------------------------------------------------------------------

export interface Amenity {
  id: string;
  name: string;
  description: string | null;
  societyId: string;
  slotDurationMinutes: number;
  createdAt: string;
  bookings?: {
    id: string;
    bookedByUserId: string;
    startTime: string;
    endTime: string;
  }[];
}

export interface AmenityBooking {
  id: string;
  amenityId: string;
  bookedByUserId: string;
  date: string;
  startTime: string;
  endTime: string;
  amenity: Amenity;
}

export async function getAmenities(token: string): Promise<Amenity[]> {
  const res = await fetch(`${API_BASE_URL}/amenities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
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
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Booking failed' }));
    throw new Error(err.message || err.error || 'Failed to book amenity');
  }
  const result = await res.json();
  return result.booking;
}

export async function createAmenity(
  token: string,
  data: { name: string; description?: string; slotDurationMinutes: number }
): Promise<Amenity> {
  const res = await fetch(`${API_BASE_URL}/amenities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Creation failed' }));
    throw new Error(err.message || err.error || 'Failed to create amenity');
  }
  const result = await res.json();
  return result.amenity;
}

export async function updateAmenity(
  token: string,
  id: string,
  data: Partial<{ name: string; description: string; slotDurationMinutes: number }>
): Promise<Amenity> {
  const res = await fetch(`${API_BASE_URL}/amenities/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Update failed' }));
    throw new Error(err.message || err.error || 'Failed to update amenity');
  }
  const result = await res.json();
  return result.amenity;
}

export async function deleteAmenity(
  token: string,
  id: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/amenities/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    check401(res);
    const err = await res.json().catch(() => ({ message: 'Deletion failed' }));
    throw new Error(err.message || err.error || 'Failed to delete amenity');
  }
}
