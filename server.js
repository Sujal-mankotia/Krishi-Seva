const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const mongoose = require('mongoose');

loadEnvFile();

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/krishiseva';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const STORE_KEY = 'primary';
let dbConnectPromise = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    versionKey: false,
    timestamps: true,
    minimize: false
  }
);

const Store = mongoose.model('Store', storeSchema);

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
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

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, ' ').toLowerCase();
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

async function ensureStoreDocument() {
  await connectDatabase();

  let store = await Store.findOne({ key: STORE_KEY }).lean();
  if (store) {
    return withDefaults(store);
  }

  const initialData = await loadInitialData();
  await Store.create({ key: STORE_KEY, ...initialData });
  return initialData;
}

async function readDb() {
  const store = await ensureStoreDocument();
  return withDefaults(store);
}

async function writeDb(db) {
  const nextDb = withDefaults(db);
  await Store.updateOne(
    { key: STORE_KEY },
    { $set: nextDb },
    { upsert: true }
  );
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

app.get('/api/farmers', async (req, res) => {
  try {
    const db = await readDb();
    const search = normalizeText(req.query.search).toLowerCase();
    const district = normalizeText(req.query.district);

    let farmers = [...db.farmers];

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

    res.json(sortByCreatedDesc(farmers).map(mapFarmer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/farmers/stats', async (req, res) => {
  try {
    const db = await readDb();
    const byDistrictMap = new Map();
    const byStatusMap = new Map();

    db.farmers.forEach((farmer) => {
      if (farmer.district) {
        byDistrictMap.set(farmer.district, (byDistrictMap.get(farmer.district) || 0) + 1);
      }
      if (farmer.status) {
        byStatusMap.set(farmer.status, (byStatusMap.get(farmer.status) || 0) + 1);
      }
    });

    const byDistrict = [...byDistrictMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);
    const byStatus = [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total: db.farmers.length,
      byDistrict,
      byStatus,
      landParcels: db.landRecords.length
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

      db.farmers = db.farmers.filter((item) => item.id !== farmerId);
      db.landRecords = db.landRecords.filter((record) => record.farmer_id !== farmerId);
      db.enrollments = db.enrollments.filter((entry) => entry.farmer_id !== farmerId);
      recomputeSchemeEnrollmentCounts(db);
      return farmer;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Farmer not found' });
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

    let records = [...db.landRecords];
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

    const result = await mutateDb(async (db) => {
      let farmerId = normalizeText(payload.farmer_id) || null;
      let matchedFarmer = farmerId ? db.farmers.find((item) => item.id === farmerId) : null;

      if (!matchedFarmer && payload.farmer_name) {
        matchedFarmer = findFarmerByName(db, payload.farmer_name);
        farmerId = matchedFarmer ? matchedFarmer.id : null;
      }

      const land = {
        id: createId(),
        survey_no: surveyNo,
        farmer_id: farmerId,
        farmer_name: matchedFarmer ? composeName(matchedFarmer) : normalizeText(payload.farmer_name),
        village: normalizeText(payload.village) || (matchedFarmer ? matchedFarmer.village : ''),
        district: normalizeText(payload.district) || (matchedFarmer ? matchedFarmer.district : ''),
        area_ha: toNumber(payload.area_ha, 0),
        land_type: payload.land_type || '',
        primary_crop: normalizeText(payload.primary_crop),
        created_at: timestamp()
      };

      db.landRecords.unshift(land);
      if (farmerId) syncFarmerFromLandRecords(db, farmerId);
      return land;
    });

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

      const previousFarmerId = land.farmer_id || null;
      let farmerId = normalizeText(payload.farmer_id) || land.farmer_id || null;
      let matchedFarmer = farmerId ? db.farmers.find((item) => item.id === farmerId) : null;

      if (!matchedFarmer && payload.farmer_name) {
        matchedFarmer = findFarmerByName(db, payload.farmer_name);
        farmerId = matchedFarmer ? matchedFarmer.id : null;
      }

      Object.assign(land, {
        survey_no: normalizeText(payload.survey_no),
        farmer_id: farmerId,
        farmer_name: matchedFarmer ? composeName(matchedFarmer) : normalizeText(payload.farmer_name),
        village: normalizeText(payload.village) || (matchedFarmer ? matchedFarmer.village : ''),
        district: normalizeText(payload.district) || (matchedFarmer ? matchedFarmer.district : ''),
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
      db.landRecords = db.landRecords.filter((record) => record.id !== landId);
      if (land.farmer_id) {
        syncFarmerFromLandRecords(db, land.farmer_id);
      }
      return land;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Land record not found' });
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
    const schemes = category
      ? db.schemes.filter((scheme) => scheme.category === category)
      : db.schemes;
    res.json(sortByCreatedDesc(schemes).map((scheme) => mapScheme(scheme, db.farmers.length)));
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

      const validFarmerIds = new Set(db.farmers.map((farmer) => farmer.id));
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
    res.json(sortByCreatedDesc(db.activityLogs).slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/summary', async (req, res) => {
  try {
    const db = await readDb();

    const byDistrictMap = new Map();
    db.farmers.forEach((farmer) => {
      if (!farmer.district) return;
      byDistrictMap.set(farmer.district, (byDistrictMap.get(farmer.district) || 0) + 1);
    });

    const byDistrict = [...byDistrictMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);

    const schemeEnrollment = [...db.schemes]
      .sort((a, b) => (b.enrolled || 0) - (a.enrolled || 0))
      .map((scheme) => ({
        name: scheme.name,
        enrolled: scheme.enrolled || 0
      }));

    const totalLandArea = db.landRecords.reduce(
      (sum, record) => sum + toNumber(record.area_ha, 0),
      0
    );

    res.json({
      totalFarmers: db.farmers.length,
      landParcels: db.landRecords.length,
      activeSchemes: db.schemes.length,
      beneficiaries: db.enrollments.length,
      totalLandArea,
      byDistrict,
      schemeEnrollment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const db = await readDb();
    res.json({
      ok: true,
      storage: 'mongodb',
      mongoConnected: mongoose.connection.readyState === 1,
      farmers: db.farmers.length,
      landRecords: db.landRecords.length,
      schemes: db.schemes.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

  dbConnectPromise = mongoose.connect(MONGODB_URI)
    .then(() => undefined)
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

if (process.env.VERCEL) {
  module.exports = app;
} else {
  connectDatabase()
    .then(() => ensureStoreDocument())
    .then(() => startServer(DEFAULT_PORT))
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err);
      process.exit(1);
    });
}
