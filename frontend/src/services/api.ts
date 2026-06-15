const BASE_URL = 'http://localhost:5000/api';

// Helper to manage JWT token in localStorage
export const authStorage = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token'),
  getUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
  setUser: (user: any) => localStorage.setItem('user', JSON.stringify(user)),
  clearUser: () => localStorage.removeItem('user'),
};

// Base request wrapper
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) => request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body?: any, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string, options?: RequestInit) => request<T>(endpoint, { ...options, method: 'DELETE' }),
};
