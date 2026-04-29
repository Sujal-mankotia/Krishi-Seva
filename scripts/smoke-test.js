const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { startApp } = require('../src/server');

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_USER_EMAIL = `smoke-${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'SmokeTest123';
const TEST_SURVEY_NO = `SMK-${Date.now()}`;
const WHITELIST_PATH = path.join(__dirname, '..', 'data', 'whitelist.json');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw lastError || new Error('Server did not become ready in time');
}

async function apiRequest(method, path, { token, body, expectedStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (expectedStatus != null) {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${path} returned ${response.status} instead of ${expectedStatus}`
    );
  } else {
    assert.ok(response.ok, `${method} ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function runSmokeTest() {
  const health = await apiRequest('GET', '/api/health');
  assert.strictEqual(health.ok, true, 'Health endpoint did not report ok=true');

  await apiRequest('GET', '/api/farmers', { expectedStatus: 401 });

  const registerPayload = {
    name: 'Smoke Test User',
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    confirmPassword: TEST_USER_PASSWORD
  };

  const registerResponse = await apiRequest('POST', '/api/auth/register', { body: registerPayload });
  assert.ok(registerResponse.token, 'Register did not return a token');
  assert.strictEqual(registerResponse.user.email, TEST_USER_EMAIL);
  const token = registerResponse.token;

  const session = await apiRequest('GET', '/api/auth/session', { token });
  assert.strictEqual(session.user.email, TEST_USER_EMAIL, 'Session user email mismatch');

  const farmersBefore = await apiRequest('GET', '/api/farmers', { token });
  assert.ok(Array.isArray(farmersBefore), 'Farmers response should be an array');

  const farmerPayload = {
    first_name: 'Smoke',
    last_name: 'Farmer',
    aadhaar: '1234 5678 9012',
    mobile: '9999999999',
    village: 'Test Village',
    district: 'Test District',
    state: 'Maharashtra',
    survey_no: TEST_SURVEY_NO,
    land_area: 1.5,
    land_type: 'Irrigated',
    crop: 'Wheat',
    bank_acc_no: '1234567890',
    ifsc: 'TEST0001234',
    bank_name: 'Test Bank',
    bank_branch: 'Main Branch',
    doc_status: 'All Documents Submitted'
  };

  const createdFarmer = await apiRequest('POST', '/api/farmers', {
    token,
    body: farmerPayload,
    expectedStatus: 201
  });
  assert.strictEqual(createdFarmer.first_name, farmerPayload.first_name);

  const updatedFarmer = await apiRequest('PUT', `/api/farmers/${createdFarmer.id}`, {
    token,
    body: {
      ...farmerPayload,
      district: 'Updated District',
      crop: 'Rice',
      status: 'Approved'
    }
  });
  assert.strictEqual(updatedFarmer.district, 'Updated District');
  assert.strictEqual(updatedFarmer.crop, 'Rice');

  const landRecords = await apiRequest(
    'GET',
    `/api/land?search=${encodeURIComponent(TEST_SURVEY_NO)}&type=`,
    { token }
  );
  assert.ok(Array.isArray(landRecords), 'Land records response should be an array');
  assert.ok(landRecords.some((record) => record.farmer_id === createdFarmer.id), 'Linked land record missing');

  const reports = await apiRequest('GET', '/api/reports/summary', { token });
  assert.ok(typeof reports.totalFarmers === 'number', 'Summary report missing totalFarmers');

  const activity = await apiRequest('GET', '/api/activity', { token });
  assert.ok(Array.isArray(activity), 'Activity response should be an array');

  await apiRequest('DELETE', `/api/farmers/${createdFarmer.id}`, { token });
  await apiRequest('POST', '/api/auth/logout', { token, expectedStatus: 204 });
}

async function withWhitelistedTestEmail(callback) {
  const original = await fs.readFile(WHITELIST_PATH, 'utf8');
  const parsed = JSON.parse(original);
  const whitelist = Array.isArray(parsed) ? parsed : [];
  const hasEmail = whitelist.some((entry) =>
    typeof entry === 'string' ? entry === TEST_USER_EMAIL : entry?.email === TEST_USER_EMAIL
  );

  if (!hasEmail) {
    whitelist.push({ email: TEST_USER_EMAIL, role: 'user', state: '', districts: [] });
    await fs.writeFile(WHITELIST_PATH, `${JSON.stringify(whitelist, null, 2)}\n`, 'utf8');
  }

  try {
    return await callback();
  } finally {
    await fs.writeFile(WHITELIST_PATH, original, 'utf8');
  }
}

async function main() {
  let server;

  try {
    await withWhitelistedTestEmail(async () => {
      server = await startApp(PORT);
      await waitForServer(`${BASE_URL}/api/health`);
      await runSmokeTest();
    });
    console.log('Smoke test passed.');
  } catch (error) {
    console.error('Smoke test failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }
}

main();
