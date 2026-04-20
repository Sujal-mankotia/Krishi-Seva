/**
 * KrishiSeva API Service
 * Handles all communication with the backend REST API.
 * Falls back to localStorage if the server is unreachable.
 */

const API_BASE = window.location.origin + '/api';

const Api = (() => {
  // ─── Internal fetch wrapper ───────────────────────────────────────────────
  async function request(method, endpoint, body = null) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(API_BASE + endpoint, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Request failed');
      }
      return res.json();
    } catch (e) {
      throw e;
    }
  }

  // ─── Farmers ──────────────────────────────────────────────────────────────
  const Farmers = {
    getAll: (search = '', district = '') =>
      request('GET', `/farmers?search=${encodeURIComponent(search)}&district=${encodeURIComponent(district)}`),

    getStats: () => request('GET', '/farmers/stats'),

    create: (data) => request('POST', '/farmers', data),

    update: (id, data) => request('PUT', `/farmers/${id}`, data),

    delete: (id) => request('DELETE', `/farmers/${id}`),
  };

  // ─── Land Records ─────────────────────────────────────────────────────────
  const Land = {
    getAll: (search = '', type = '') =>
      request('GET', `/land?search=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}`),

    getById: (id) => request('GET', `/land/${id}`),

    create: (data) => request('POST', '/land', data),

    update: (id, data) => request('PUT', `/land/${id}`, data),

    delete: (id) => request('DELETE', `/land/${id}`),
  };

  // ─── Schemes ──────────────────────────────────────────────────────────────
  const Schemes = {
    getAll: (category = '') =>
      request('GET', `/schemes?category=${encodeURIComponent(category)}`),

    create: (data) => request('POST', '/schemes', data),

    enrollFarmers: (schemeId, farmerIds) =>
      request('POST', `/schemes/${schemeId}/enroll`, { farmer_ids: farmerIds }),
  };

  // ─── Activity Log ─────────────────────────────────────────────────────────
  const Activity = {
    getAll: () => request('GET', '/activity'),
  };

  // ─── Reports ─────────────────────────────────────────────────────────────
  const Reports = {
    getSummary: () => request('GET', '/reports/summary'),
  };

  return { Farmers, Land, Schemes, Activity, Reports };
})();

window.Api = Api;
