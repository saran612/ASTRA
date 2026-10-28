export interface UserProfile {
  id: string;
  email: string;
  role: 'INSTITUTION' | 'OFFICER' | 'REGIONAL_OFFICER' | 'BUREAU' | 'COMMITTEE' | 'AUTHORITY' | 'ADMIN';
  institutionId?: string | null;
  institutionName?: string | null;
  region?: string | null;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('fdr_vault_token');
}

export function setAuthSession(token: string, user: UserProfile) {
  localStorage.setItem('fdr_vault_token', token);
  localStorage.setItem('fdr_vault_user', JSON.stringify(user));
}

export function getCurrentUser(): UserProfile | null {
  const raw = localStorage.getItem('fdr_vault_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem('fdr_vault_token');
  localStorage.removeItem('fdr_vault_user');
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    let errMsg = `Request failed: ${response.statusText}`;
    try {
      const data = await response.json();
      errMsg = data.error || errMsg;
    } catch {
      // fallback
    }
    throw new Error(errMsg);
  }

  return response.json();
}
