const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');

loadEnvFile();

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const DEFAULT_LOCAL_MONGODB_URI = 'mongodb://127.0.0.1:27017/krishiseva';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_LOCAL_MONGODB_URI;
const AUTH_SECRET = process.env.AUTH_SECRET || 'krishiseva-dev-secret';
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@example.com');
const AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const STORE_KEY = 'primary';
let dbConnectPromise = null;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const schemaOptions = {
  versionKey: false,
  minimize: false,
  strict: false
};

const storeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    farmers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    landRecords: { type: [mongoose.Schema.Types.Mixed], default: [] },
    schemes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    enrollments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    activityLogs: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  {
    ...schemaOptions,
    timestamps: true
  }
);

const entitySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }
  },
  schemaOptions
);

const enrollmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    farmer_id: { type: String, required: true },
    scheme_id: { type: String, required: true }
  },
  schemaOptions
);

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, default: 'user' },
    password_hash: { type: String, required: true },
    password_salt: { type: String, required: true },
    created_at: { type: String, required: true }
  },
  schemaOptions
);

const Store = mongoose.model('Store', storeSchema);
const Farmer = mongoose.model('Farmer', entitySchema, 'farmers');
const LandRecord = mongoose.model('LandRecord', entitySchema, 'landRecords');
const Scheme = mongoose.model('Scheme', entitySchema, 'schemes');
const Enrollment = mongoose.model('Enrollment', enrollmentSchema, 'enrollments');
const ActivityLog = mongoose.model('ActivityLog', entitySchema, 'activityLogs');
const User = mongoose.model('User', userSchema, 'users');

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  });
}

function isUsingDefaultLocalMongo() {
  return !process.env.MONGODB_URI;
}

function maskMongoUri(uri) {
  if (!uri) return 'unknown';
  return uri.replace(/\/\/([^:/?#]+):([^@]+)@/, '//$1:***@');
}

function getMongoConnectionInfo() {
  const connection = mongoose.connection;
  return {
    readyState: connection.readyState,
    dbName: connection.name || '',
    host: connection.host || '',
    port: connection.port || '',
    collections: [
      User.collection?.name || 'users',
      Farmer.collection?.name || 'farmers',
      LandRecord.collection?.name || 'landRecords',
      Scheme.collection?.name || 'schemes',
      Enrollment.collection?.name || 'enrollments',
      ActivityLog.collection?.name || 'activityLogs'
    ],
    legacyCollection: Store.collection?.name || 'stores',
    uriSource: isUsingDefaultLocalMongo() ? 'local-default' : 'env'
  };
}

function createId() {
  return crypto.randomUUID();
}

function timestamp() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeScopeValue(value) {
  return normalizeText(value);
}

function normalizeDistrictList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(normalizeScopeValue).filter(Boolean))].sort();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, ' ').toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.password_salt || !user?.password_hash) {
    return false;
  }

  const hash = crypto.scryptSync(password, user.password_salt, 64).toString('hex');
  const expected = Buffer.from(user.password_hash, 'hex');
  const received = Buffer.from(hash, 'hex');
  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

function signTokenValue(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url');
}

function createAuthToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Date.now() + AUTH_TOKEN_TTL_MS
  })).toString('base64url');

  return `${payload}.${signTokenValue(payload)}`;
}

function verifyAuthToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signTokenValue(payload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed?.sub || !parsed?.email || !parsed?.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function inferUserRole(email) {
  return normalizeEmail(email) === ADMIN_EMAIL ? 'admin' : 'user';
}

function isAdminUser(user = {}) {
  return inferUserRole(user.email || '') === 'admin' || user.role === 'admin';
} 

function isSubAdminUser(user = {}) {
  return user.role === 'sub-admin';
}

function normalizeWhitelistEntry(entry) {
  if (typeof entry === 'string') {
    const email = normalizeEmail(entry);
    return email
      ? {
          email,
          role: email === ADMIN_EMAIL ? 'admin' : 'user',
          state: '',
          districts: []
        }
      : null;
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const email = normalizeEmail(entry.email);
  if (!email) {
    return null;
  }

  const role = email === ADMIN_EMAIL
    ? 'admin'
    : entry.role === 'sub-admin'
      ? 'sub-admin'
      : 'user';
  const state = role === 'sub-admin' ? normalizeScopeValue(entry.state) : '';
  const districts = role === 'sub-admin' ? normalizeDistrictList(entry.districts) : [];

  return {
    email,
    role,
    state,
    districts
  };
}

function createImplicitAdminWhitelistEntry() {
  return {
    email: ADMIN_EMAIL,
    role: 'admin',
    state: '',
    districts: []
  };
}

function describeUserScope(user = {}) {
  if (isAdminUser(user)) {
    return 'All states and districts';
  }

  if (!isSubAdminUser(user)) {
    return 'Whitelisted portal access';
  }

  const districtLabel = Array.isArray(user.districts) && user.districts.length
    ? user.districts.join(', ')
    : 'All districts';
  return `${user.state || 'Assigned state'} - ${districtLabel}`;
}

function sanitizeUser(user = {}, accessProfile = null) {
  const profile = accessProfile || resolveAccessProfileFromSources(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: profile.role,
    state: profile.state,
    districts: profile.districts,
    scopeLabel: describeUserScope(profile),
    created_at: user.created_at
  };
}

async function readWhitelist() {
  if (!fs.existsSync(WHITELIST_FILE)) {
    return [createImplicitAdminWhitelistEntry()];
  }

  const raw = await fsp.readFile(WHITELIST_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  const entries = Array.isArray(parsed)
    ? parsed.map(normalizeWhitelistEntry).filter(Boolean)
    : [];

  const deduped = new Map();
  entries.forEach((entry) => {
    deduped.set(entry.email, entry);
  });
  deduped.set(ADMIN_EMAIL, createImplicitAdminWhitelistEntry());

  return [...deduped.values()].sort((a, b) => a.email.localeCompare(b.email));
}

async function writeWhitelist(entries = []) {
  const normalizedMap = new Map();

  entries
    .map(normalizeWhitelistEntry)
    .filter(Boolean)
    .forEach((entry) => {
      normalizedMap.set(entry.email, entry);
    });

  normalizedMap.set(ADMIN_EMAIL, createImplicitAdminWhitelistEntry());

  const normalized = [...normalizedMap.values()].sort((a, b) => a.email.localeCompare(b.email));
  await fsp.writeFile(WHITELIST_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

async function syncStoredUserAccess(email, accessProfile = null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || normalizedEmail === ADMIN_EMAIL) {
    return;
  }

  const nextProfile = accessProfile || {
    role: 'user',
    state: '',
    districts: []
  };

  await User.updateOne(
    { email: normalizedEmail },
    {
      $set: {
        role: nextProfile.role || 'user',
        state: nextProfile.state || '',
        districts: Array.isArray(nextProfile.districts) ? nextProfile.districts : []
      }
    }
  );
}

function getWhitelistEntryByEmail(entries = [], email = '') {
  const normalizedEmail = normalizeEmail(email);
  return entries.find((entry) => entry.email === normalizedEmail) || null;
}

function resolveAccessProfileFromSources(user = {}, whitelistEntry = null) {
  const email = normalizeEmail(user.email);
  if (email === ADMIN_EMAIL) {
    return createImplicitAdminWhitelistEntry();
  }

  if (whitelistEntry) {
    return normalizeWhitelistEntry(whitelistEntry) || {
      role: 'user',
      state: '',
      districts: []
    };
  }

  return {
    role: user.role === 'sub-admin' ? 'sub-admin' : inferUserRole(email),
    state: user.role === 'sub-admin' ? normalizeScopeValue(user.state) : '',
    districts: user.role === 'sub-admin' ? normalizeDistrictList(user.districts) : []
  };
}

function matchesUserScope(user = {}, state, district) {
  if (isAdminUser(user) || !isSubAdminUser(user)) {
    return true;
  }

  const normalizedState = normalizeScopeValue(state);
  const normalizedDistrict = normalizeScopeValue(district);
  const allowedState = normalizeScopeValue(user.state);
  const allowedDistricts = normalizeDistrictList(user.districts);

  if (allowedState && normalizedState && normalizedState !== allowedState) {
    return false;
  }

  if (allowedDistricts.length) {
    return normalizedDistrict ? allowedDistricts.includes(normalizedDistrict) : false;
  }

  if (allowedState && normalizedState) {
    return normalizedState === allowedState;
  }

  return true;
}

function filterFarmersForUser(user = {}, farmers = []) {
  if (isAdminUser(user) || !isSubAdminUser(user)) {
    return [...farmers];
  }

  return farmers.filter((farmer) => matchesUserScope(user, farmer.state, farmer.district));
}

function filterLandRecordsForUser(user = {}, records = [], farmers = []) {
  if (isAdminUser(user) || !isSubAdminUser(user)) {
    return [...records];
  }

  const visibleFarmerIds = new Set(filterFarmersForUser(user, farmers).map((farmer) => farmer.id));
  return records.filter((record) => {
    if (record.farmer_id && visibleFarmerIds.has(record.farmer_id)) {
      return true;
    }
    return matchesUserScope(user, record.state, record.district);
  });
}

function filterEnrollmentsForUser(user = {}, enrollments = [], farmers = []) {
  if (isAdminUser(user) || !isSubAdminUser(user)) {
    return [...enrollments];
  }

  const visibleFarmerIds = new Set(filterFarmersForUser(user, farmers).map((farmer) => farmer.id));
  return enrollments.filter((entry) => visibleFarmerIds.has(entry.farmer_id));
}

function buildScopeMeta(user = {}, farmers = []) {
  const visibleFarmers = filterFarmersForUser(user, farmers);
  const stateSet = new Set();
  const districtSet = new Set();

  visibleFarmers.forEach((farmer) => {
    if (farmer.state) stateSet.add(farmer.state);
    if (farmer.district) districtSet.add(farmer.district);
  });

  return {
    role: user.role || 'user',
    isAdmin: isAdminUser(user),
    state: user.state || '',
    districts: normalizeDistrictList(user.districts),
    visibleStates: [...stateSet].sort(),
    visibleDistricts: [...districtSet].sort(),
    label: describeUserScope(user)
  };
}

function ensureScopedPayloadAllowed(user = {}, payload = {}, fallback = {}) {
  if (isAdminUser(user) || !isSubAdminUser(user)) {
    return null;
  }

  const nextState = normalizeScopeValue(payload.state || fallback.state);
  const nextDistrict = normalizeScopeValue(payload.district || fallback.district);

  if (!matchesUserScope(user, nextState, nextDistrict)) {
    return 'You can only work with farmers and land records inside your assigned state and districts.';
  }

  return null;
}

function composeName(record = {}) {
  return [record.first_name, record.last_name].filter(Boolean).join(' ').trim();
}

function sortByCreatedDesc(items = []) {
  return [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function withDefaults(db = {}) {
  return {
    farmers: Array.isArray(db.farmers) ? db.farmers : [],
    landRecords: Array.isArray(db.landRecords) ? db.landRecords : [],
    schemes: Array.isArray(db.schemes) ? db.schemes : [],
    enrollments: Array.isArray(db.enrollments) ? db.enrollments : [],
    activityLogs: Array.isArray(db.activityLogs) ? db.activityLogs : []
  };
}

function sanitizeStoredDoc(doc = {}) {
  if (!doc || typeof doc !== 'object') return doc;
  const next = { ...doc };
  delete next._id;
  return next;
}

function createSeedData() {
  const farmers = [
    { id: createId(), first_name: 'Ramesh', last_name: 'Kumar', district: 'Nagpur', aadhaar: '4823 XXXX 9012', land_area: 4.2, crop: 'Soybean', status: 'Active', survey_no: '142/A', village: 'Borkhedi', land_type: 'Irrigated', state: 'Maharashtra', created_at: timestamp(), doc_status: 'All Documents Submitted' },
    { id: createId(), first_name: 'Sunita', last_name: 'Devi', district: 'Pune', aadhaar: '3712 XXXX 5543', land_area: 2.8, crop: 'Wheat', status: 'Approved', survey_no: '88/B', village: 'Alandi', land_type: 'Rain-fed', state: 'Maharashtra', created_at: timestamp(), doc_status: 'All Documents Submitted' },
    { id: createId(), first_name: 'Mahesh', last_name: 'Yadav', district: 'Nashik', aadhaar: '9021 XXXX 3410', land_area: 6.1, crop: 'Grapes', status: 'Pending', survey_no: '207/C', village: 'Sinnar', land_type: 'Irrigated', state: 'Maharashtra', created_at: timestamp(), doc_status: 'Land Record Pending' },
    { id: createId(), first_name: 'Lalita', last_name: 'Bai', district: 'Amravati', aadhaar: '2234 XXXX 8891', land_area: 1.5, crop: 'Cotton', status: 'Active', survey_no: '54/D', village: 'Paratwada', land_type: 'Dry Land', state: 'Maharashtra', created_at: timestamp(), doc_status: 'All Documents Submitted' },
    { id: createId(), first_name: 'Govind', last_name: 'Patil', district: 'Kolhapur', aadhaar: '6612 XXXX 7700', land_area: 3.9, crop: 'Sugarcane', status: 'Approved', survey_no: '321/A', village: 'Ichalkaranji', land_type: 'Irrigated', state: 'Maharashtra', created_at: timestamp(), doc_status: 'All Documents Submitted' },
    { id: createId(), first_name: 'Priya', last_name: 'Sharma', district: 'Nagpur', aadhaar: '5509 XXXX 1123', land_area: 2.1, crop: 'Onion', status: 'Pending', survey_no: '99/E', village: 'Kamptee', land_type: 'Rain-fed', state: 'Maharashtra', created_at: timestamp(), doc_status: 'Bank Details Pending' },
    { id: createId(), first_name: 'Vinod', last_name: 'Tiwari', district: 'Pune', aadhaar: '8871 XXXX 4456', land_area: 5.0, crop: 'Rice', status: 'Active', survey_no: '412/F', village: 'Shirur', land_type: 'Irrigated', state: 'Maharashtra', created_at: timestamp(), doc_status: 'All Documents Submitted' }
  ];

  const landRecords = farmers.map((farmer) => ({
    id: createId(),
    survey_no: farmer.survey_no,
    farmer_id: farmer.id,
    farmer_name: composeName(farmer),
    village: farmer.village,
    district: farmer.district,
    state: farmer.state,
    area_ha: farmer.land_area,
    land_type: farmer.land_type,
    primary_crop: farmer.crop,
    created_at: farmer.created_at
  }));

  const schemes = [
    { id: createId(), name: 'PM-KISAN Samman Nidhi', dept: 'Ministry of Agriculture - Central Govt', category: 'Central Govt', description: 'Direct income support for small and marginal farmers in three equal instalments.', tags: 'Income Support,All Farmers', enrolled: 0, color_class: '', created_at: timestamp() },
    { id: createId(), name: 'Pradhan Mantri Fasal Bima Yojana', dept: 'Ministry of Agriculture - Central Govt', category: 'Central Govt', description: 'Crop insurance support for farmers facing crop loss due to natural calamities.', tags: 'Insurance,Kharif and Rabi', enrolled: 0, color_class: 'amber', created_at: timestamp() },
    { id: createId(), name: 'Soil Health Card Scheme', dept: 'Dept. of Agriculture - State Govt', category: 'State Govt', description: 'Provides soil health insights with crop-wise fertilizer recommendations.', tags: 'Free Service,All Land Types', enrolled: 0, color_class: 'earth', created_at: timestamp() },
    { id: createId(), name: 'Kisan Credit Card (KCC)', dept: 'Ministry of Finance - Central Govt', category: 'Central Govt', description: 'Access to concessional agricultural credit for seasonal farm needs.', tags: 'Credit Facility,Up to Rs. 3 Lakh', enrolled: 0, color_class: '', created_at: timestamp() },
    { id: createId(), name: 'PMKSY - Micro Irrigation', dept: 'Ministry of Agriculture - Central Govt', category: 'Central Govt', description: 'Support for drip and sprinkler irrigation under per-drop-more-crop.', tags: '55% Subsidy,Irrigation', enrolled: 0, color_class: 'amber', created_at: timestamp() },
    { id: createId(), name: 'eNAM - Online Trading Portal', dept: 'SFAC', category: 'Central Govt', description: 'Connects farmers to national agricultural markets for better price discovery.', tags: 'Digital Market,All Crops', enrolled: 0, color_class: '', created_at: timestamp() }
  ];

  const schemeAssignments = [
    [0, 0], [1, 0], [3, 0], [4, 0], [6, 0],
    [0, 1], [2, 1], [5, 1],
    [0, 2], [1, 2], [2, 2], [4, 2], [6, 2],
    [1, 3], [3, 3], [6, 3],
    [0, 4], [4, 4],
    [2, 5], [5, 5]
  ];

  const enrollments = schemeAssignments.map(([farmerIndex, schemeIndex]) => ({
    id: createId(),
    farmer_id: farmers[farmerIndex].id,
    scheme_id: schemes[schemeIndex].id,
    enrolled_at: timestamp()
  }));

  schemes.forEach((scheme) => {
    scheme.enrolled = enrollments.filter((entry) => entry.scheme_id === scheme.id).length;
  });

  const activityLogs = [
    { id: createId(), message: 'Ramesh Kumar enrolled in PM-KISAN Scheme', dot_class: 'dot-green', created_at: timestamp() },
    { id: createId(), message: 'Land record updated - Survey No. 142/A, Nagpur', dot_class: 'dot-amber', created_at: timestamp() },
    { id: createId(), message: 'New scheme Fasal Bima added for Kharif 2026', dot_class: 'dot-blue', created_at: timestamp() },
    { id: createId(), message: 'Sunita Devi verification completed', dot_class: 'dot-green', created_at: timestamp() },
    { id: createId(), message: 'Dashboard analytics refreshed for district coordinators', dot_class: 'dot-amber', created_at: timestamp() }
  ];

  return { farmers, landRecords, schemes, enrollments, activityLogs };
}

async function loadInitialData() {
  if (fs.existsSync(DATA_FILE)) {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    if (raw.trim()) {
      return withDefaults(JSON.parse(raw));
    }
  }

  return createSeedData();
}

async function seedCollections(db) {
  const nextDb = withDefaults(db);
  await Promise.all([
    nextDb.farmers.length ? Farmer.insertMany(nextDb.farmers, { ordered: true }) : Promise.resolve(),
    nextDb.landRecords.length ? LandRecord.insertMany(nextDb.landRecords, { ordered: true }) : Promise.resolve(),
    nextDb.schemes.length ? Scheme.insertMany(nextDb.schemes, { ordered: true }) : Promise.resolve(),
    nextDb.enrollments.length ? Enrollment.insertMany(nextDb.enrollments, { ordered: true }) : Promise.resolve(),
    nextDb.activityLogs.length ? ActivityLog.insertMany(nextDb.activityLogs, { ordered: true }) : Promise.resolve()
  ]);
}

async function ensureCollectionsInitialized() {
  await connectDatabase();

  const counts = await Promise.all([
    Farmer.countDocuments(),
    LandRecord.countDocuments(),
    Scheme.countDocuments(),
    Enrollment.countDocuments(),
    ActivityLog.countDocuments()
  ]);

  const hasCollectionData = counts.some((count) => count > 0);
  if (hasCollectionData) {
    return;
  }

  const legacyStore = await Store.findOne({ key: STORE_KEY }).lean();
  if (legacyStore) {
    const migrated = withDefaults(legacyStore);
    recomputeSchemeEnrollmentCounts(migrated);
    await seedCollections(migrated);
    return;
  }

  const initialData = await loadInitialData();
  recomputeSchemeEnrollmentCounts(initialData);
  await seedCollections(initialData);
}

async function readDb() {
  await ensureCollectionsInitialized();

  const [farmers, landRecords, schemes, enrollments, activityLogs] = await Promise.all([
    Farmer.find().lean(),
    LandRecord.find().lean(),
    Scheme.find().lean(),
    Enrollment.find().lean(),
    ActivityLog.find().lean()
  ]);

  return withDefaults({
    farmers: farmers.map(sanitizeStoredDoc),
    landRecords: landRecords.map(sanitizeStoredDoc),
    schemes: schemes.map(sanitizeStoredDoc),
    enrollments: enrollments.map(sanitizeStoredDoc),
    activityLogs: activityLogs.map(sanitizeStoredDoc)
  });
}

async function writeDb(db) {
  const nextDb = withDefaults(db);
  await Promise.all([
    Farmer.deleteMany({}),
    LandRecord.deleteMany({}),
    Scheme.deleteMany({}),
    Enrollment.deleteMany({}),
    ActivityLog.deleteMany({})
  ]);
  await seedCollections(nextDb);
}

async function mutateDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

function findFarmerByName(db, farmerName) {
  const normalized = normalizeName(farmerName);
  if (!normalized) return null;
  return db.farmers.find((farmer) => normalizeName(composeName(farmer)) === normalized) || null;
}

function recomputeSchemeEnrollmentCounts(db) {
  db.schemes.forEach((scheme) => {
    scheme.enrolled = db.enrollments.filter((entry) => entry.scheme_id === scheme.id).length;
  });
}

function syncFarmerFromLandRecords(db, farmerId) {
  if (!farmerId) return;
  const farmer = db.farmers.find((item) => item.id === farmerId);
  if (!farmer) return;

  const linkedRecords = sortByCreatedDesc(
    db.landRecords.filter((record) => record.farmer_id === farmerId)
  );

  if (!linkedRecords.length) {
    farmer.survey_no = '';
    farmer.land_area = 0;
    farmer.land_type = '';
    farmer.crop = '';
    return;
  }

  const primary = linkedRecords[0];
  farmer.survey_no = primary.survey_no || '';
  farmer.land_area = toNumber(primary.area_ha, 0);
  farmer.land_type = primary.land_type || '';
  farmer.crop = primary.primary_crop || '';
  farmer.village = primary.village || farmer.village || '';
  farmer.district = primary.district || farmer.district || '';
  farmer.state = primary.state || farmer.state || '';
}

function mapFarmer(farmer) {
  return {
    ...farmer,
    id: farmer.id,
    name: composeName(farmer)
  };
}

function mapLandRecord(record) {
  return {
    ...record,
    id: record.id
  };
}

function mapScheme(scheme, totalFarmers) {
  return {
    ...scheme,
    id: scheme.id,
    total: totalFarmers
  };
}

async function logActivity(message, dotClass = 'dot-green') {
  await mutateDb(async (db) => {
    db.activityLogs.unshift({
      id: createId(),
      message,
      dot_class: dotClass,
      created_at: timestamp()
    });
    db.activityLogs = db.activityLogs.slice(0, 50);
  });
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({
    error: 'Please correct the highlighted fields.',
    fields: errors.array().map((item) => ({
      field: item.path,
      message: item.msg
    }))
  });
  return true;
}

async function resolveAuthenticatedUser(req) {
  const token = getBearerToken(req);
  const payload = verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  const user = await User.findOne({ id: payload.sub, email: payload.email }).lean();
  if (!user) {
    return null;
  }

  const whitelist = await readWhitelist().catch(() => []);
  const accessProfile = resolveAccessProfileFromSources(
    user,
    getWhitelistEntryByEmail(whitelist, user.email)
  );
  return sanitizeUser(user, accessProfile);
}

async function requireAuth(req, res, next) {
  if (req.path.startsWith('/auth/') || req.path === '/health') {
    return next();
  }

  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    req.authUser = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication required' });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.authUser)) {
    return res.status(403).json({
      error: 'Only the admin can manage whitelist access.'
    });
  }

  next();
}

const registerValidators = [
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .customSanitizer((value) => normalizeEmail(value)),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Za-z]/)
    .withMessage('Password must include at least one letter')
    .matches(/\d/)
    .withMessage('Password must include at least one number'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match')
];

const loginValidators = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .customSanitizer((value) => normalizeEmail(value)),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

app.use('/api', requireAuth);

app.post('/api/auth/register', registerValidators, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) {
      return;
    }

    const name = normalizeText(req.body.name).replace(/\s+/g, ' ');
    const email = normalizeEmail(req.body.email);

    let whitelistEntry = null;
    try {
      if (fs.existsSync(WHITELIST_FILE)) {
        const normalizedWhitelist = await readWhitelist();
        whitelistEntry = getWhitelistEntryByEmail(normalizedWhitelist, email);
        if (normalizedWhitelist.length > 0 && !whitelistEntry && email !== ADMIN_EMAIL) {
          return res.status(403).json({
            error: 'This email does not have signup access yet. Please contact the admin for approval.',
            fields: [{ field: 'email', message: 'Signup access has not been granted for this email yet.' }]
          });
        }
      }
    } catch (e) {
      console.error('Failed to read whitelist:', e);
    }

    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        fields: [{ field: 'email', message: 'Email already registered' }]
      });
    }

    const password = String(req.body.password || '');
    const passwordData = hashPassword(password);
    const accessProfile = resolveAccessProfileFromSources({ email }, whitelistEntry);
    const userRecord = {
      id: createId(),
      name,
      email,
      role: accessProfile.role,
      state: accessProfile.state,
      districts: accessProfile.districts,
      password_hash: passwordData.hash,
      password_salt: passwordData.salt,
      created_at: timestamp()
    };

    await User.create(userRecord);
    await logActivity(`Portal user ${name} created a new account`, 'dot-blue');

    const user = sanitizeUser(userRecord, accessProfile);
    res.status(201).json({
      message: 'Account created successfully',
      user,
      token: createAuthToken(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', loginValidators, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) {
      return;
    }

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const userRecord = await User.findOne({ email }).lean();
    if (!userRecord || !verifyPassword(password, userRecord)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const whitelist = await readWhitelist().catch(() => []);
    const user = sanitizeUser(
      userRecord,
      resolveAccessProfileFromSources(userRecord, getWhitelistEntryByEmail(whitelist, email))
    );
    res.json({
      message: 'Login successful',
      user,
      token: createAuthToken(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  res.status(204).end();
});

app.get('/api/admin/whitelist', requireAdmin, async (req, res) => {
  try {
    const entries = await readWhitelist();
    res.json({
      adminEmail: ADMIN_EMAIL,
      entries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/api/admin/whitelist',
  requireAdmin,
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address')
      .customSanitizer((value) => normalizeEmail(value)),
    body('role')
      .optional()
      .isIn(['user', 'sub-admin'])
      .withMessage('Role must be user or sub-admin'),
    body('state')
      .optional()
      .customSanitizer((value) => normalizeScopeValue(value)),
    body('districts')
      .optional()
      .isArray()
      .withMessage('Districts must be provided as a list')
  ],
  async (req, res) => {
    try {
      if (sendValidationErrors(req, res)) {
        return;
      }

      const email = normalizeEmail(req.body.email);
      const role = req.body.role === 'sub-admin' ? 'sub-admin' : 'user';
      const state = role === 'sub-admin' ? normalizeScopeValue(req.body.state) : '';
      const districts = role === 'sub-admin' ? normalizeDistrictList(req.body.districts) : [];

      if (role === 'sub-admin' && !state) {
        return res.status(400).json({
          error: 'State is required for sub-admin access.',
          fields: [{ field: 'state', message: 'Select a state for this sub-admin.' }]
        });
      }

      if (role === 'sub-admin' && !districts.length) {
        return res.status(400).json({
          error: 'At least one district is required for sub-admin access.',
          fields: [{ field: 'districts', message: 'Select one or more districts for this sub-admin.' }]
        });
      }

      const whitelist = await readWhitelist();
      const existingEntry = getWhitelistEntryByEmail(whitelist, email);
      const updated = await writeWhitelist([
        ...whitelist.filter((entry) => entry.email !== email),
        { email, role, state, districts }
      ]);
      await syncStoredUserAccess(email, { role, state, districts });
      await logActivity(
        `${existingEntry ? 'Access updated' : 'Access granted'} to ${email} as ${role} by ${req.authUser.email}`,
        'dot-blue'
      );
      res.status(201).json({
        message: existingEntry ? 'Access updated successfully.' : 'Access list updated successfully.',
        entries: updated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete('/api/admin/whitelist/:email', requireAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(req.params.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    if (email === ADMIN_EMAIL) {
      return res.status(400).json({ error: 'The admin email cannot be removed from the whitelist.' });
    }

    const whitelist = await readWhitelist();
    if (!getWhitelistEntryByEmail(whitelist, email)) {
      return res.status(404).json({ error: 'That email was not found in the access list.' });
    }

    const updated = await writeWhitelist(whitelist.filter((entry) => entry.email !== email));
    await syncStoredUserAccess(email, { role: 'user', state: '', districts: [] });
    await logActivity(`Access removed for ${email} by ${req.authUser.email}`, 'dot-amber');
    res.json({
      message: 'Whitelist entry removed successfully.',
      entries: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/farmers', async (req, res) => {
  try {
    const db = await readDb();
    const search = normalizeText(req.query.search).toLowerCase();
    const district = normalizeText(req.query.district);
    const state = normalizeText(req.query.state);

    let farmers = filterFarmersForUser(req.authUser, db.farmers);

    if (search) {
      farmers = farmers.filter((farmer) => {
        const haystack = [
          farmer.first_name,
          farmer.last_name,
          composeName(farmer),
          farmer.district,
          farmer.aadhaar
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    if (district) {
      farmers = farmers.filter((farmer) => farmer.district === district);
    }

    if (state) {
      farmers = farmers.filter((farmer) => farmer.state === state);
    }

    res.json(sortByCreatedDesc(farmers).map(mapFarmer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/farmers/stats', async (req, res) => {
  try {
    const db = await readDb();
    const byDistrictMap = new Map();
    const byStateMap = new Map();
    const byStatusMap = new Map();
    const farmers = filterFarmersForUser(req.authUser, db.farmers);
    const landRecords = filterLandRecordsForUser(req.authUser, db.landRecords, db.farmers);

    farmers.forEach((farmer) => {
      if (farmer.district) {
        byDistrictMap.set(farmer.district, (byDistrictMap.get(farmer.district) || 0) + 1);
      }
      if (farmer.state) {
        byStateMap.set(farmer.state, (byStateMap.get(farmer.state) || 0) + 1);
      }
      if (farmer.status) {
        byStatusMap.set(farmer.status, (byStatusMap.get(farmer.status) || 0) + 1);
      }
    });

    const byDistrict = [...byDistrictMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);
    const byState = [...byStateMap.entries()]
      .map(([stateName, count]) => ({ state: stateName, count }))
      .sort((a, b) => b.count - a.count);
    const byStatus = [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total: farmers.length,
      byDistrict,
      byState,
      byStatus,
      landParcels: landRecords.length,
      scope: buildScopeMeta(req.authUser, db.farmers)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/farmers', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!normalizeText(payload.first_name) || !normalizeText(payload.last_name)) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const scopeError = ensureScopedPayloadAllowed(req.authUser, payload);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const result = await mutateDb(async (db) => {
      const farmer = {
        id: createId(),
        first_name: normalizeText(payload.first_name),
        last_name: normalizeText(payload.last_name),
        dob: payload.dob || '',
        gender: payload.gender || '',
        aadhaar: normalizeText(payload.aadhaar),
        mobile: normalizeText(payload.mobile),
        caste: payload.caste || '',
        income: payload.income == null ? null : toNumber(payload.income, null),
        village: normalizeText(payload.village),
        district: normalizeText(payload.district),
        state: normalizeText(payload.state) || 'Maharashtra',
        survey_no: normalizeText(payload.survey_no),
        land_area: toNumber(payload.land_area, 0),
        land_type: payload.land_type || '',
        soil_type: payload.soil_type || '',
        crop: normalizeText(payload.crop),
        ownership: payload.ownership || '',
        bank_acc_no: normalizeText(payload.bank_acc_no),
        ifsc: normalizeText(payload.ifsc),
        bank_name: normalizeText(payload.bank_name),
        bank_branch: normalizeText(payload.bank_branch),
        doc_status: payload.doc_status || 'All Documents Submitted',
        status: 'Pending',
        created_at: timestamp()
      };

      db.farmers.unshift(farmer);

      if (farmer.survey_no) {
        db.landRecords.unshift({
          id: createId(),
          survey_no: farmer.survey_no,
          farmer_id: farmer.id,
          farmer_name: composeName(farmer),
          village: farmer.village,
          district: farmer.district,
          state: farmer.state,
          area_ha: farmer.land_area,
          land_type: farmer.land_type,
          primary_crop: farmer.crop,
          created_at: timestamp()
        });
      }

      return mapFarmer(farmer);
    });

    await logActivity(`${result.name} registered from ${result.district || 'Unknown'}`, 'dot-green');
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/farmers/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const farmerId = req.params.id;
    const result = await mutateDb(async (db) => {
      const farmer = db.farmers.find((item) => item.id === farmerId);
      if (!farmer) return null;
      if (!matchesUserScope(req.authUser, farmer.state, farmer.district)) {
        return 'forbidden';
      }

      const scopeError = ensureScopedPayloadAllowed(req.authUser, payload, farmer);
      if (scopeError) {
        return 'forbidden-payload';
      }

      Object.assign(farmer, {
        first_name: normalizeText(payload.first_name),
        last_name: normalizeText(payload.last_name),
        dob: payload.dob || '',
        gender: payload.gender || '',
        aadhaar: normalizeText(payload.aadhaar),
        mobile: normalizeText(payload.mobile),
        caste: payload.caste || '',
        income: payload.income == null ? null : toNumber(payload.income, null),
        village: normalizeText(payload.village),
        district: normalizeText(payload.district),
        state: normalizeText(payload.state) || 'Maharashtra',
        survey_no: normalizeText(payload.survey_no),
        land_area: toNumber(payload.land_area, 0),
        land_type: payload.land_type || '',
        soil_type: payload.soil_type || '',
        crop: normalizeText(payload.crop),
        ownership: payload.ownership || '',
        bank_acc_no: normalizeText(payload.bank_acc_no),
        ifsc: normalizeText(payload.ifsc),
        bank_name: normalizeText(payload.bank_name),
        bank_branch: normalizeText(payload.bank_branch),
        doc_status: payload.doc_status || 'All Documents Submitted',
        status: payload.status || farmer.status || 'Pending'
      });

      const existingLand = db.landRecords.find((record) => record.farmer_id === farmerId);
      if (farmer.survey_no) {
        const landPayload = {
          survey_no: farmer.survey_no,
          farmer_id: farmer.id,
          farmer_name: composeName(farmer),
          village: farmer.village,
          district: farmer.district,
          state: farmer.state,
          area_ha: farmer.land_area,
          land_type: farmer.land_type,
          primary_crop: farmer.crop
        };

        if (existingLand) {
          Object.assign(existingLand, landPayload);
        } else {
          db.landRecords.unshift({
            id: createId(),
            ...landPayload,
            created_at: timestamp()
          });
        }
      } else {
        db.landRecords = db.landRecords.filter((record) => record.farmer_id !== farmerId);
      }

      return mapFarmer(farmer);
    });

    if (!result) {
      return res.status(404).json({ error: 'Farmer not found' });
    }
    if (result === 'forbidden' || result === 'forbidden-payload') {
      return res.status(403).json({
        error: 'You can only edit farmers inside your assigned state and districts.'
      });
    }

    await logActivity(`${result.name}'s record updated`, 'dot-amber');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/farmers/:id', async (req, res) => {
  try {
    const farmerId = req.params.id;
    const deleted = await mutateDb(async (db) => {
      const farmer = db.farmers.find((item) => item.id === farmerId);
      if (!farmer) return null;
      if (!matchesUserScope(req.authUser, farmer.state, farmer.district)) {
        return 'forbidden';
      }

      db.farmers = db.farmers.filter((item) => item.id !== farmerId);
      db.landRecords = db.landRecords.filter((record) => record.farmer_id !== farmerId);
      db.enrollments = db.enrollments.filter((entry) => entry.farmer_id !== farmerId);
      recomputeSchemeEnrollmentCounts(db);
      return farmer;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Farmer not found' });
    }
    if (deleted === 'forbidden') {
      return res.status(403).json({
        error: 'You can only delete farmers inside your assigned state and districts.'
      });
    }

    await logActivity(`Farmer record for ${composeName(deleted)} deleted`, 'dot-amber');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/land', async (req, res) => {
  try {
    const db = await readDb();
    const search = normalizeText(req.query.search).toLowerCase();
    const type = normalizeText(req.query.type);

    let records = filterLandRecordsForUser(req.authUser, db.landRecords, db.farmers);
    if (search) {
      records = records.filter((record) => {
        const haystack = [
          record.survey_no,
          record.farmer_name,
          record.village,
          record.district
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }
    if (type) {
      records = records.filter((record) => record.land_type === type);
    }

    res.json(sortByCreatedDesc(records).map(mapLandRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/land/:id', async (req, res) => {
  try {
    const db = await readDb();
    const land = db.landRecords.find((record) => record.id === req.params.id);
    if (!land) {
      return res.status(404).json({ error: 'Land record not found' });
    }
    if (!filterLandRecordsForUser(req.authUser, [land], db.farmers).length) {
      return res.status(403).json({ error: 'You cannot view this land record.' });
    }
    res.json(mapLandRecord(land));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/land', async (req, res) => {
  try {
    const payload = req.body || {};
    const surveyNo = normalizeText(payload.survey_no);
    if (!surveyNo) {
      return res.status(400).json({ error: 'Survey number is required' });
    }

    const scopeError = ensureScopedPayloadAllowed(req.authUser, payload);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const result = await mutateDb(async (db) => {
      let farmerId = normalizeText(payload.farmer_id) || null;
      let matchedFarmer = farmerId ? db.farmers.find((item) => item.id === farmerId) : null;

      if (!matchedFarmer && payload.farmer_name) {
        matchedFarmer = findFarmerByName(db, payload.farmer_name);
        farmerId = matchedFarmer ? matchedFarmer.id : null;
      }
      if (matchedFarmer && !matchesUserScope(req.authUser, matchedFarmer.state, matchedFarmer.district)) {
        return 'forbidden';
      }

      const land = {
        id: createId(),
        survey_no: surveyNo,
        farmer_id: farmerId,
        farmer_name: matchedFarmer ? composeName(matchedFarmer) : normalizeText(payload.farmer_name),
        village: normalizeText(payload.village) || (matchedFarmer ? matchedFarmer.village : ''),
        district: normalizeText(payload.district) || (matchedFarmer ? matchedFarmer.district : ''),
        state: normalizeText(payload.state) || (matchedFarmer ? matchedFarmer.state : ''),
        area_ha: toNumber(payload.area_ha, 0),
        land_type: payload.land_type || '',
        primary_crop: normalizeText(payload.primary_crop),
        created_at: timestamp()
      };

      db.landRecords.unshift(land);
      if (farmerId) syncFarmerFromLandRecords(db, farmerId);
      return land;
    });

    if (result === 'forbidden') {
      return res.status(403).json({ error: 'You cannot link land outside your assigned scope.' });
    }

    await logActivity(`Land parcel ${result.survey_no} added for ${result.farmer_name || 'Unknown'}`, 'dot-green');
    res.status(201).json(mapLandRecord(result));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/land/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const landId = req.params.id;
    const updated = await mutateDb(async (db) => {
      const land = db.landRecords.find((record) => record.id === landId);
      if (!land) return null;
      if (!filterLandRecordsForUser(req.authUser, [land], db.farmers).length) {
        return 'forbidden';
      }

      const scopeError = ensureScopedPayloadAllowed(req.authUser, payload, land);
      if (scopeError) {
        return 'forbidden-payload';
      }

      const previousFarmerId = land.farmer_id || null;
      let farmerId = normalizeText(payload.farmer_id) || land.farmer_id || null;
      let matchedFarmer = farmerId ? db.farmers.find((item) => item.id === farmerId) : null;

      if (!matchedFarmer && payload.farmer_name) {
        matchedFarmer = findFarmerByName(db, payload.farmer_name);
        farmerId = matchedFarmer ? matchedFarmer.id : null;
      }
      if (matchedFarmer && !matchesUserScope(req.authUser, matchedFarmer.state, matchedFarmer.district)) {
        return 'forbidden-payload';
      }

      Object.assign(land, {
        survey_no: normalizeText(payload.survey_no),
        farmer_id: farmerId,
        farmer_name: matchedFarmer ? composeName(matchedFarmer) : normalizeText(payload.farmer_name),
        village: normalizeText(payload.village) || (matchedFarmer ? matchedFarmer.village : ''),
        district: normalizeText(payload.district) || (matchedFarmer ? matchedFarmer.district : ''),
        state: normalizeText(payload.state) || (matchedFarmer ? matchedFarmer.state : ''),
        area_ha: toNumber(payload.area_ha, 0),
        land_type: payload.land_type || '',
        primary_crop: normalizeText(payload.primary_crop)
      });

      if (previousFarmerId && previousFarmerId !== farmerId) {
        syncFarmerFromLandRecords(db, previousFarmerId);
      }
      if (farmerId) {
        syncFarmerFromLandRecords(db, farmerId);
      }

      return land;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Land record not found' });
    }
    if (updated === 'forbidden' || updated === 'forbidden-payload') {
      return res.status(403).json({
        error: 'You can only edit land records inside your assigned state and districts.'
      });
    }

    await logActivity(`Land parcel ${updated.survey_no} updated`, 'dot-amber');
    res.json(mapLandRecord(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/land/:id', async (req, res) => {
  try {
    const landId = req.params.id;
    const deleted = await mutateDb(async (db) => {
      const land = db.landRecords.find((record) => record.id === landId);
      if (!land) return null;
      if (!filterLandRecordsForUser(req.authUser, [land], db.farmers).length) {
        return 'forbidden';
      }
      db.landRecords = db.landRecords.filter((record) => record.id !== landId);
      if (land.farmer_id) {
        syncFarmerFromLandRecords(db, land.farmer_id);
      }
      return land;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Land record not found' });
    }
    if (deleted === 'forbidden') {
      return res.status(403).json({
        error: 'You can only delete land records inside your assigned state and districts.'
      });
    }

    await logActivity(`Land parcel ${deleted.survey_no} deleted`, 'dot-amber');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schemes', async (req, res) => {
  try {
    const db = await readDb();
    const category = normalizeText(req.query.category);
    const visibleFarmers = filterFarmersForUser(req.authUser, db.farmers);
    const visibleFarmerIds = new Set(visibleFarmers.map((farmer) => farmer.id));
    const visibleEnrollments = db.enrollments.filter((entry) => visibleFarmerIds.has(entry.farmer_id));
    const enrollmentCountByScheme = new Map();

    visibleEnrollments.forEach((entry) => {
      enrollmentCountByScheme.set(
        entry.scheme_id,
        (enrollmentCountByScheme.get(entry.scheme_id) || 0) + 1
      );
    });

    const schemes = category
      ? db.schemes.filter((scheme) => scheme.category === category)
      : db.schemes;
    res.json(sortByCreatedDesc(schemes).map((scheme) => mapScheme({
      ...scheme,
      enrolled: enrollmentCountByScheme.get(scheme.id) || 0
    }, visibleFarmers.length)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schemes', async (req, res) => {
  try {
    const payload = req.body || {};
    const name = normalizeText(payload.name);
    if (!name) {
      return res.status(400).json({ error: 'Scheme name is required' });
    }

    const scheme = await mutateDb(async (db) => {
      const nextScheme = {
        id: createId(),
        name,
        dept: normalizeText(payload.dept),
        category: payload.category || 'Central Govt',
        description: normalizeText(payload.description),
        tags: normalizeText(payload.tags),
        enrolled: 0,
        color_class: payload.color_class || '',
        created_at: timestamp()
      };
      db.schemes.unshift(nextScheme);
      return nextScheme;
    });

    await logActivity(`New scheme "${scheme.name}" added`, 'dot-blue');
    const db = await readDb();
    res.status(201).json(mapScheme(scheme, db.farmers.length));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schemes/:id/enroll', async (req, res) => {
  try {
    const schemeId = req.params.id;
    const farmerIds = Array.isArray(req.body && req.body.farmer_ids) ? req.body.farmer_ids : [];

    const result = await mutateDb(async (db) => {
      const scheme = db.schemes.find((item) => item.id === schemeId);
      if (!scheme) return null;

      const validFarmerIds = new Set(filterFarmersForUser(req.authUser, db.farmers).map((farmer) => farmer.id));
      let enrolled = 0;

      farmerIds.forEach((farmerId) => {
        if (!validFarmerIds.has(farmerId)) return;
        const exists = db.enrollments.some(
          (entry) => entry.farmer_id === farmerId && entry.scheme_id === schemeId
        );
        if (!exists) {
          db.enrollments.push({
            id: createId(),
            farmer_id: farmerId,
            scheme_id: schemeId,
            enrolled_at: timestamp()
          });
          enrolled += 1;
        }
      });

      recomputeSchemeEnrollmentCounts(db);
      return {
        enrolled,
        total_enrolled: db.enrollments.filter((entry) => entry.scheme_id === schemeId).length,
        schemeName: scheme.name
      };
    });

    if (!result) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    await logActivity(`${result.enrolled} farmer(s) enrolled in ${result.schemeName}`, 'dot-green');
    res.json({ enrolled: result.enrolled, total_enrolled: result.total_enrolled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const db = await readDb();
    if (isAdminUser(req.authUser) || !isSubAdminUser(req.authUser)) {
      return res.json(sortByCreatedDesc(db.activityLogs).slice(0, 20));
    }

    const visibleDistricts = new Set(buildScopeMeta(req.authUser, db.farmers).visibleDistricts);
    const visibleStates = new Set(buildScopeMeta(req.authUser, db.farmers).visibleStates);
    const filteredLogs = sortByCreatedDesc(db.activityLogs).filter((log) => {
      const message = normalizeText(log.message).toLowerCase();
      return [...visibleDistricts, ...visibleStates].some((value) =>
        message.includes(String(value).toLowerCase())
      );
    });

    res.json(filteredLogs.slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/summary', async (req, res) => {
  try {
    const db = await readDb();
    const farmers = filterFarmersForUser(req.authUser, db.farmers);
    const landRecords = filterLandRecordsForUser(req.authUser, db.landRecords, db.farmers);
    const enrollments = filterEnrollmentsForUser(req.authUser, db.enrollments, db.farmers);

    const byDistrictMap = new Map();
    const byStateMap = new Map();
    const byStatusMap = new Map();
    farmers.forEach((farmer) => {
      if (!farmer.district) return;
      byDistrictMap.set(farmer.district, (byDistrictMap.get(farmer.district) || 0) + 1);
      if (farmer.state) {
        byStateMap.set(farmer.state, (byStateMap.get(farmer.state) || 0) + 1);
      }
      if (farmer.status) {
        byStatusMap.set(farmer.status, (byStatusMap.get(farmer.status) || 0) + 1);
      }
    });

    const byDistrict = [...byDistrictMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);
    const byState = [...byStateMap.entries()]
      .map(([stateName, count]) => ({ state: stateName, count }))
      .sort((a, b) => b.count - a.count);
    const byStatus = [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const schemeEnrollment = [...db.schemes]
      .map((scheme) => ({
        ...scheme,
        enrolled: enrollments.filter((entry) => entry.scheme_id === scheme.id).length
      }))
      .sort((a, b) => (b.enrolled || 0) - (a.enrolled || 0))
      .map((scheme) => ({
        name: scheme.name,
        enrolled: scheme.enrolled || 0
      }));

    const totalLandArea = landRecords.reduce(
      (sum, record) => sum + toNumber(record.area_ha, 0),
      0
    );

    res.json({
      totalFarmers: farmers.length,
      landParcels: landRecords.length,
      activeSchemes: db.schemes.length,
      beneficiaries: enrollments.length,
      totalLandArea,
      byDistrict,
      byState,
      byStatus,
      schemeEnrollment,
      scope: buildScopeMeta(req.authUser, db.farmers)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const db = await readDb();
    const info = getMongoConnectionInfo();
    res.json({
      ok: true,
      storage: 'mongodb',
      mongoConnected: mongoose.connection.readyState === 1,
      mongoUriSource: info.uriSource,
      dbName: info.dbName,
      host: info.host,
      port: info.port,
      collections: info.collections,
      legacyCollection: info.legacyCollection,
      farmers: db.farmers.length,
      landRecords: db.landRecords.length,
      schemes: db.schemes.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (dbConnectPromise) {
    await dbConnectPromise;
    return;
  }

  if (process.env.VERCEL && !process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in Vercel project settings.');
  }

  if (isUsingDefaultLocalMongo()) {
    console.warn(
      `MONGODB_URI not set. Using fallback local database: ${maskMongoUri(MONGODB_URI)}`
    );
  } else {
    console.log(`Connecting to MongoDB: ${maskMongoUri(MONGODB_URI)}`);
  }

  dbConnectPromise = mongoose.connect(MONGODB_URI)
    .then(() => {
      const info = getMongoConnectionInfo();
      console.log(
        `MongoDB connected to database "${info.dbName}" on ${info.host || 'unknown-host'}${info.port ? `:${info.port}` : ''}, collections "${info.collections.join(', ')}".`
      );
    })
    .finally(() => {
      dbConnectPromise = null;
    });

  await dbConnectPromise;
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`KrishiSeva server running at http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy. Trying ${nextPort}...`);
        resolve(startServer(nextPort));
        return;
      }
      reject(err);
    });
  });
}

async function startApp(port = DEFAULT_PORT) {
  return connectDatabase()
    .then(() => ensureCollectionsInitialized())
    .then(() => startServer(port))
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err);
      throw err;
    });
}

module.exports = {
  app,
  connectDatabase,
  ensureCollectionsInitialized,
  startServer,
  startApp
};

if (require.main === module) {
  startApp().catch(() => {
    process.exit(1);
  });
}
