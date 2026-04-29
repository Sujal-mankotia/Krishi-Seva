/**
 * KrishiSeva API Service
 * Handles all communication with the backend REST API.
 */

const API_BASE = window.location.origin + '/api';
const AUTH_TOKEN_KEY = 'krishiseva-auth-token';

const Api = (() => {
  function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  }

  function clearToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  async function request(method, endpoint, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const token = getToken();
    if (token) {
      opts.headers.Authorization = `Bearer ${token}`;
    }

    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(API_BASE + endpoint, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new CustomEvent('krishiseva:auth-expired'));
      }
      const error = new Error(err.error || 'Request failed');
      error.fields = Array.isArray(err.fields) ? err.fields : [];
      throw error;
    }

    if (res.status === 204) {
      return null;
    }

    return res.json();
  }

  const Auth = {
    register: (data) => request('POST', '/auth/register', data),
    login: (data) => request('POST', '/auth/login', data),
    getSession: () => request('GET', '/auth/session'),
    logout: () => request('POST', '/auth/logout'),
    getToken,
    setToken,
    clearToken,
  };

  const Farmers = {
    getAll: (search = '', district = '', state = '') =>
      request('GET', `/farmers?search=${encodeURIComponent(search)}&district=${encodeURIComponent(district)}&state=${encodeURIComponent(state)}`),
    getStats: () => request('GET', '/farmers/stats'),
    create: (data) => request('POST', '/farmers', data),
    update: (id, data) => request('PUT', `/farmers/${id}`, data),
    delete: (id) => request('DELETE', `/farmers/${id}`),
  };

  const Land = {
    getAll: (search = '', type = '') =>
      request('GET', `/land?search=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}`),
    getById: (id) => request('GET', `/land/${id}`),
    create: (data) => request('POST', '/land', data),
    update: (id, data) => request('PUT', `/land/${id}`, data),
    delete: (id) => request('DELETE', `/land/${id}`),
  };

  const Schemes = {
    getAll: (category = '') =>
      request('GET', `/schemes?category=${encodeURIComponent(category)}`),
    create: (data) => request('POST', '/schemes', data),
    enrollFarmers: (schemeId, farmerIds) =>
      request('POST', `/schemes/${schemeId}/enroll`, { farmer_ids: farmerIds }),
  };

  const Activity = {
    getAll: () => request('GET', '/activity'),
  };

  const Reports = {
    getSummary: () => request('GET', '/reports/summary'),
  };

  const Admin = {
    getWhitelist: () => request('GET', '/admin/whitelist'),
    addWhitelistEmail: (payload) => request('POST', '/admin/whitelist', payload),
    updateWhitelistEmail: (email, payload) => request('POST', '/admin/whitelist', { ...payload, email }),
    removeWhitelistEmail: (email) => request('DELETE', `/admin/whitelist/${encodeURIComponent(email)}`),
  };

  return { Auth, Farmers, Land, Schemes, Activity, Reports, Admin };
})();

window.Api = Api;
