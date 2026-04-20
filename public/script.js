/* ─────────────────────────────────────────────────────────────────────────────
   KrishiSeva — Main Application Script
   All data operations go through the backend REST API (api.js).
   ───────────────────────────────────────────────────────────────────────────── */

const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.querySelector(".theme-toggle-label");
const toast = document.getElementById("toast");
const backToTopButton = document.getElementById("backToTop");
const liveClock = document.getElementById("liveClock");
const themeStorageKey = "krishiseva-theme";

let currentStep = 1;
let toastTimer;
let editingFarmerId = null; // tracks if we are in edit mode
let editingLandId = null;
let landModalMode = "create";

const statusMap = {
  Active: "badge-active",
  Approved: "badge-approved",
  Pending: "badge-pending"
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatCount(value) {
  return Number(value).toLocaleString("en-IN");
}

function setAnimatedCount(id, value, suffix = '') {
  const element = document.getElementById(id);
  if (!element) return;
  element.dataset.count = value;
  element.dataset.suffix = suffix;
  element.dataset.animated = 'false';
  animateCount(element);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 172800) return 'Yesterday';
  return `${Math.floor(diff / 86400)} days ago`;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function updateThemeLabel(theme) {
  if (!themeToggleLabel || !themeToggle) return;
  const nextLabel = theme === "dark" ? "Light mode" : "Dark mode";
  themeToggleLabel.textContent = nextLabel;
  themeToggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()}`);
}

function applyTheme(theme) {
  body.dataset.theme = theme;
  updateThemeLabel(theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#09120d" : "#1a3d2b"
  );
}

function initTheme() {
  const savedTheme = localStorage.getItem(themeStorageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const nextTheme = body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
  showToast(`${nextTheme === "dark" ? "Dark" : "Light"} theme activated`);
}

// ─── Render Farmers Table ─────────────────────────────────────────────────────
function renderFarmers(data) {
  const tbody = document.getElementById("farmerTbody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;opacity:.5;">No farmers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((farmer) => `
    <tr>
      <td>${escapeHtml(farmer.id)}</td>
      <td><strong>${escapeHtml(farmer.name || `${farmer.first_name} ${farmer.last_name}`)}</strong></td>
      <td>${escapeHtml(farmer.district || '-')}</td>
      <td>${escapeHtml(farmer.aadhaar || '-')}</td>
      <td>${escapeHtml(farmer.land_area ?? farmer.land ?? '-')}</td>
      <td>${escapeHtml(farmer.crop || '-')}</td>
      <td><span class="status-badge ${statusMap[farmer.status] || "badge-pending"}">${escapeHtml(farmer.status || 'Pending')}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick='openEditFarmer(${JSON.stringify(farmer.id)})'>Edit</button>
          <button class="btn btn-sm btn-danger" onclick='deleteFarmer(${JSON.stringify(farmer.id)}, ${JSON.stringify(farmer.name || `${farmer.first_name} ${farmer.last_name}`)})'>Del</button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ─── Fetch and render farmers ─────────────────────────────────────────────────
async function filterFarmers() {
  const searchValue = document.getElementById("farmerSearch")?.value.trim() || '';
  const districtValue = document.getElementById("districtFilter")?.value || '';
  try {
    const data = await Api.Farmers.getAll(searchValue, districtValue);
    renderFarmers(data);
  } catch (e) {
    showToast('Could not load farmer data: ' + e.message);
  }
}

// ─── Delete farmer ────────────────────────────────────────────────────────────
async function deleteFarmer(id, name) {
  if (!confirm(`Delete record for "${name}"? This cannot be undone.`)) return;
  try {
    await Api.Farmers.delete(id);
    showToast(`Record for ${name} deleted.`);
    filterFarmers();
    loadDashboard();
  } catch (e) {
    showToast('Delete failed: ' + e.message);
  }
}

// ─── Open edit modal pre-filled ───────────────────────────────────────────────
async function openEditFarmer(id) {
  try {
    const all = await Api.Farmers.getAll();
    const farmer = all.find(f => f.id === id);
    if (!farmer) { showToast('Farmer not found'); return; }

    editingFarmerId = id;

    // Switch to register tab and fill form
    showPage('farmers', document.querySelector('.nav-links button:nth-child(2)'));
    switchTab('farmers', 'tab-register', document.querySelector('.tab-btn'));

    const set = (fieldId, val) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = val || '';
    };
    set('firstName', farmer.first_name);
    set('lastName', farmer.last_name);
    set('dob', farmer.dob);
    set('gender', farmer.gender);
    set('aadhaar', farmer.aadhaar);
    set('mobile', farmer.mobile);
    set('caste', farmer.caste);
    set('income', farmer.income);
    set('village', farmer.village);
    set('district', farmer.district);
    set('state', farmer.state);
    set('surveyNo', farmer.survey_no);
    set('landArea', farmer.land_area);
    set('landType', farmer.land_type);
    set('soilType', farmer.soil_type);
    set('crop', farmer.crop);
    set('ownership', farmer.ownership);
    set('bankAccNo', farmer.bank_acc_no);
    set('ifsc', farmer.ifsc);
    set('bankName', farmer.bank_name);
    set('bankBranch', farmer.bank_branch);
    set('docStatus', farmer.doc_status);

    // Change submit button text to indicate edit mode
    const submitBtn = document.querySelector('#step-3 .form-actions .btn-primary');
    if (submitBtn) submitBtn.textContent = 'Update Registration';

    // Go straight to step 1
    nextStep(1);
    showToast(`Editing record for ${farmer.first_name} ${farmer.last_name}`);
  } catch (e) {
    showToast('Failed to load farmer: ' + e.message);
  }
}

// ─── Submit / Update farmer ───────────────────────────────────────────────────
async function submitFarmer() {
  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();

  if (!firstName || !lastName) {
    showToast("Please fill the required name fields");
    return;
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    dob: document.getElementById("dob").value,
    gender: document.getElementById("gender").value,
    aadhaar: document.getElementById("aadhaar").value,
    mobile: document.getElementById("mobile").value,
    caste: document.getElementById("caste").value,
    income: parseFloat(document.getElementById("income").value) || null,
    village: document.getElementById("village").value,
    district: document.getElementById("district").value,
    state: document.getElementById("state").value,
    survey_no: document.getElementById("surveyNo").value,
    land_area: parseFloat(document.getElementById("landArea").value) || 0,
    land_type: document.getElementById("landType").value,
    soil_type: document.getElementById("soilType")?.value,
    crop: document.getElementById("crop").value,
    ownership: document.getElementById("ownership")?.value,
    bank_acc_no: document.getElementById("bankAccNo").value,
    ifsc: document.getElementById("ifsc").value,
    bank_name: document.getElementById("bankName").value,
    bank_branch: document.getElementById("bankBranch").value,
    doc_status: document.getElementById("docStatus").value,
  };

  try {
    if (editingFarmerId) {
      payload.status = 'Active';
      await Api.Farmers.update(editingFarmerId, payload);
      showToast(`${firstName} ${lastName}'s record updated!`);
      editingFarmerId = null;
      const submitBtn = document.querySelector('#step-3 .form-actions .btn-primary');
      if (submitBtn) submitBtn.textContent = 'Submit Registration';
    } else {
      await Api.Farmers.create(payload);
      showToast("Farmer registered successfully!");
    }

    clearRegistrationForm();
    nextStep(1);
    switchTab('farmers', 'tab-list', document.querySelectorAll("#page-farmers .tab-btn")[1]);
    await filterFarmers();
    await loadDashboard();
  } catch (e) {
    showToast('Submission failed: ' + e.message);
  }
}

// ─── Load Dashboard ───────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, all, activities] = await Promise.all([
      Api.Reports.getSummary(),
      Api.Farmers.getAll(),
      Api.Activity.getAll()
    ]);

    setAnimatedCount('stat-farmers', stats.totalFarmers);
    setAnimatedCount('stat-land-parcels', stats.landParcels);
    setAnimatedCount('stat-active-schemes', stats.activeSchemes);
    setAnimatedCount('stat-beneficiaries', stats.beneficiaries);
    setAnimatedCount('report-total-registrations', stats.totalFarmers);
    setAnimatedCount('report-total-land-area', Math.round(stats.totalLandArea || 0), ' Ha');
    setAnimatedCount('report-beneficiaries', stats.beneficiaries);

    // Update recent farmers table
    const recentTbody = document.querySelector('#page-dashboard .recent-table tbody');
    if (recentTbody) {
      const recent = all.slice(0, 5);
      recentTbody.innerHTML = recent.length ? recent.map(f => `
        <tr>
          <td>${escapeHtml(f.name || `${f.first_name} ${f.last_name}`)}</td>
          <td>${escapeHtml(f.district || '-')}</td>
          <td>${escapeHtml(f.land_area ?? '-')}</td>
          <td><span class="status-badge ${statusMap[f.status] || 'badge-pending'}">${escapeHtml(f.status || 'Pending')}</span></td>
        </tr>
      `).join('') : `<tr><td colspan="4" style="text-align:center;opacity:.5;padding:1rem;">No farmer records yet.</td></tr>`;
    }

    // Update activity log
    const activityList = document.querySelector('.activity-list');
    if (activityList) {
      const recentActivity = activities.slice(0, 5);
      activityList.innerHTML = recentActivity.length ? recentActivity.map(a => `
        <div class="activity-item">
          <div class="activity-dot ${a.dot_class}"></div>
          <div>
            <div class="activity-text">${escapeHtml(a.message)}</div>
            <div class="activity-time">${timeAgo(a.created_at)}</div>
          </div>
        </div>
      `).join('') : `
        <div class="activity-item">
          <div class="activity-dot dot-blue"></div>
          <div>
            <div class="activity-text">No recent activity yet.</div>
            <div class="activity-time"></div>
          </div>
        </div>`;
    }

    updateBarChart(
      document.getElementById('districtChart'),
      'Farmers by District',
      (stats.byDistrict || []).map((item) => ({
        label: item.district || 'Unknown',
        value: Number(item.count) || 0,
        valueLabel: formatCount(item.count || 0),
        tone: ''
      })),
      'No district data available'
    );

    const farmerTotal = Number(stats.totalFarmers) || 0;
    updateBarChart(
      document.getElementById('schemeChart'),
      'Scheme Enrollment Status',
      (stats.schemeEnrollment || []).map((item, index) => {
        const count = Number(item.enrolled) || 0;
        const pct = farmerTotal > 0 ? Math.round((count / farmerTotal) * 100) : 0;
        const tones = ['', 'amber', 'earth'];
        return {
          label: item.name,
          value: pct,
          valueLabel: `${pct}%`,
          tone: tones[index % tones.length]
        };
      }),
      'No scheme data available'
    );

    requestAnimationFrame(() => animateVisibleMetrics(document.getElementById('page-reports')));
  } catch (e) {
    showToast('Could not load dashboard data: ' + e.message);
  }
}

// ─── Load Land Records ────────────────────────────────────────────────────────
async function filterLandRecords() {
  const search = document.getElementById("landSearch")?.value.trim() || '';
  const type = document.getElementById("landTypeFilter")?.value || '';
  try {
    const data = await Api.Land.getAll(search, type);
    renderLandRecords(data);
  } catch (e) {
    showToast('Could not load land records: ' + e.message);
  }
}

function renderLandRecords(data) {
  const tbody = document.querySelector('#page-land .data-table tbody');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;opacity:.5;">No land records found.</td></tr>`;
    return;
  }

  const landBadge = {
    'Irrigated': 'badge-active',
    'Rain-fed': 'badge-pending',
    'Dry Land': 'badge-dry',
    'Fallow': 'badge-approved'
  };

  tbody.innerHTML = data.map(l => `
    <tr>
      <td>${escapeHtml(l.survey_no)}</td>
      <td>${escapeHtml(l.farmer_name || '-')}</td>
      <td>${escapeHtml(l.village || '-')}</td>
      <td>${escapeHtml(l.district || '-')}</td>
      <td>${escapeHtml(l.area_ha ?? '-')}</td>
      <td><span class="status-badge ${landBadge[l.land_type] || 'badge-pending'}">${escapeHtml(l.land_type || '-')}</span></td>
      <td>${escapeHtml(l.primary_crop || '-')}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick='openEditLandRecord(${JSON.stringify(l.id)})'>Edit</button>
          <button class="btn btn-sm btn-soft" onclick='showLandDetail(${JSON.stringify(l.id)})'>View</button>
          <button class="btn btn-sm btn-danger" onclick='deleteLandRecord(${JSON.stringify(l.id)}, ${JSON.stringify(l.survey_no)})'>Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function fillLandModal(record = {}) {
  const set = (fieldId, value) => {
    const element = document.getElementById(fieldId);
    if (element) element.value = value || "";
  };

  set("modalSurveyNo", record.survey_no);
  set("modalFarmerName", record.farmer_name);
  set("modalArea", record.area_ha);
  set("modalVillage", record.village);
  set("modalDistrict", record.district);
  set("modalLandType", record.land_type || "Irrigated");
  set("modalPrimaryCrop", record.primary_crop);
}

function setLandModalMode(mode) {
  landModalMode = mode;
  const isView = mode === "view";
  const title = document.getElementById("landModalTitle");
  const saveBtn = document.getElementById("landModalSaveBtn");
  const fieldIds = [
    "modalSurveyNo",
    "modalFarmerName",
    "modalArea",
    "modalVillage",
    "modalDistrict",
    "modalLandType",
    "modalPrimaryCrop"
  ];

  if (title) {
    title.textContent =
      mode === "edit" ? "Edit Land Parcel" :
      mode === "view" ? "View Land Parcel" :
      "Add Land Parcel";
  }

  if (saveBtn) {
    saveBtn.style.display = isView ? "none" : "";
    saveBtn.textContent = mode === "edit" ? "Update Parcel" : "Save Parcel";
  }

  fieldIds.forEach((fieldId) => {
    const element = document.getElementById(fieldId);
    if (element) element.disabled = isView;
  });
}

async function showLandDetail(id) {
  try {
    const land = await Api.Land.getById(id);
    editingLandId = id;
    fillLandModal(land);
    setLandModalMode("view");
    openModal();
  } catch (e) {
    showToast("Failed to load land record: " + e.message);
  }
}

async function openEditLandRecord(id) {
  try {
    const land = await Api.Land.getById(id);
    editingLandId = id;
    fillLandModal(land);
    setLandModalMode("edit");
    openModal();
  } catch (e) {
    showToast("Failed to load land record: " + e.message);
  }
}

// ─── Add Land Parcel ─────────────────────────────────────────────────────────
async function saveLandParcel() {
  const surveyNo = document.getElementById("modalSurveyNo")?.value.trim();
  const farmerName = document.getElementById("modalFarmerName")?.value.trim();
  const areaHa = parseFloat(document.getElementById("modalArea")?.value) || 0;
  const village = document.getElementById("modalVillage")?.value.trim();
  const district = document.getElementById("modalDistrict")?.value;
  const landType = document.getElementById("modalLandType")?.value;
  const primaryCrop = document.getElementById("modalPrimaryCrop")?.value.trim();

  if (!surveyNo) { showToast('Survey number is required'); return; }

  try {
    const payload = {
      survey_no: surveyNo,
      farmer_name: farmerName,
      area_ha: areaHa,
      village,
      district,
      land_type: landType,
      primary_crop: primaryCrop
    };

    if (landModalMode === "edit" && editingLandId) {
      await Api.Land.update(editingLandId, payload);
      showToast('Land record updated!');
    } else {
      await Api.Land.create(payload);
      showToast('Land record added!');
    }

    closeModal();
    await filterLandRecords();
    await loadDashboard();
  } catch (e) {
    showToast('Failed to save land record: ' + e.message);
  }
}

async function deleteLandRecord(id, surveyNo) {
  if (!confirm(`Delete land parcel "${surveyNo}"?`)) return;

  try {
    await Api.Land.delete(id);
    showToast(`Land parcel ${surveyNo} deleted.`);
    await filterLandRecords();
    await loadDashboard();
  } catch (e) {
    showToast('Failed to delete land record: ' + e.message);
  }
}

// ─── Load Schemes ─────────────────────────────────────────────────────────────
async function filterSchemes() {
  const category = document.getElementById("schemeCategoryFilter")?.value || '';
  try {
    const data = await Api.Schemes.getAll(category);
    renderSchemes(data);
  } catch (e) {
    const grid = document.querySelector('.scheme-grid');
    if (grid) {
      grid.innerHTML = `<div style="text-align:center;opacity:.6;padding:3rem;grid-column:1/-1;">Could not load schemes.</div>`;
    }
    showToast('Could not load schemes: ' + e.message);
  }
}

function renderSchemes(data) {
  const grid = document.querySelector('.scheme-grid');
  if (!grid) return;

  if (!data.length) {
    grid.innerHTML = `<div style="text-align:center;opacity:.6;padding:3rem;grid-column:1/-1;">No schemes found.</div>`;
    return;
  }

  grid.innerHTML = data.map(s => {
    const tags = (s.tags || '').split(',').filter(Boolean);
    const schemeId = s.id || s._id;
    const total = Number(s.total) || 0;
    const pct = total > 0 ? Math.round((Number(s.enrolled || 0) / total) * 100) : 0;
    const colorClass = s.color_class || '';
    const tagClass = colorClass ? `scheme-tag-${colorClass}` : '';
    const btnClass = colorClass ? `btn-${colorClass}` : 'btn-primary';
    const fillClass = colorClass ? colorClass : '';

    return `
      <div class="scheme-card ${colorClass} reveal">
        <div class="scheme-name">${escapeHtml(s.name)}</div>
        <div class="scheme-dept">${escapeHtml(s.dept || '')}</div>
        <div class="scheme-desc">${escapeHtml(s.description || '')}</div>
        <div class="scheme-meta">
          ${tags.map(t => `<span class="scheme-tag ${tagClass}">${escapeHtml(t.trim())}</span>`).join('')}
        </div>
        <div class="scheme-progress">
          <div class="progress-label"><span>Enrollment</span><span>${formatCount(s.enrolled || 0)} / ${formatCount(total)}</span></div>
          <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width: ${pct}%"></div></div>
        </div>
        <button class="btn ${btnClass} btn-sm" onclick='enrollAllFarmers(${JSON.stringify(schemeId)}, ${JSON.stringify(s.name || "")})'>Enroll Farmers</button>
      </div>
    `;
  }).join('');

  requestAnimationFrame(() => {
    refreshViewportAnimations();
    animateVisibleMetrics(document.getElementById("page-schemes"));
  });
}

async function enrollAllFarmers(schemeId, schemeName) {
  if (!schemeId) {
    showToast('Scheme ID is missing for this card');
    return;
  }

  try {
    const farmers = await Api.Farmers.getAll();
    if (!farmers.length) { showToast('No farmers registered yet'); return; }
    const ids = farmers.map(f => f.id);
    const result = await Api.Schemes.enrollFarmers(schemeId, ids);
    showToast(`${result.enrolled} farmer(s) enrolled in ${schemeName}! Total: ${result.total_enrolled}`);
    await filterSchemes();
    await loadDashboard();
  } catch (e) {
    showToast('Enrollment failed: ' + e.message);
  }
}

// ─── Add Scheme Modal ─────────────────────────────────────────────────────────
async function saveNewScheme() {
  const name = document.getElementById("newSchemeName")?.value.trim();
  const dept = document.getElementById("newSchemeDept")?.value.trim();
  const category = document.getElementById("newSchemeCategory")?.value;
  const description = document.getElementById("newSchemeDesc")?.value.trim();
  const tags = document.getElementById("newSchemeTags")?.value.trim();

  if (!name) { showToast('Scheme name is required'); return; }

  try {
    await Api.Schemes.create({ name, dept, category, description, tags, enrolled: 0, color_class: '' });
    closeSchemeModal();
    showToast(`Scheme "${name}" added!`);
    await filterSchemes();
    await loadDashboard();
  } catch (e) {
    showToast('Failed to add scheme: ' + e.message);
  }
}

function updateBarChart(container, title, items, emptyLabel) {
  if (!container) return;
  const chartTitle = container.querySelector('.bar-chart-title');
  const rows = [...container.querySelectorAll('.bar-row')];
  if (chartTitle) chartTitle.textContent = title;

  if (!items.length) {
    rows.forEach((row, index) => {
      row.querySelector('.bar-label').textContent = index === 0 ? emptyLabel : '';
      row.querySelector('.bar-fill').style.width = '0%';
      row.querySelector('.bar-fill').className = 'bar-fill';
      row.querySelector('.bar-val').textContent = '';
    });
    return;
  }

  const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  rows.forEach((row, index) => {
    const item = items[index];
    const fill = row.querySelector('.bar-fill');
    if (!item) {
      row.querySelector('.bar-label').textContent = '';
      fill.style.width = '0%';
      fill.className = 'bar-fill';
      row.querySelector('.bar-val').textContent = '';
      return;
    }

    const pct = Math.max(0, Math.min(100, Math.round(((Number(item.value) || 0) / maxValue) * 100)));
    row.querySelector('.bar-label').textContent = item.label;
    fill.className = `bar-fill${item.tone ? ` ${item.tone}` : ''}`;
    fill.style.width = `${pct}%`;
    fill.dataset.animated = 'false';
    row.querySelector('.bar-val').textContent = item.valueLabel;
  });
}

async function getReportExportData() {
  const [summary, farmers, schemes] = await Promise.all([
    Api.Reports.getSummary(),
    Api.Farmers.getAll(),
    Api.Schemes.getAll()
  ]);

  return { summary, farmers, schemes };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

// ─── Export Reports ───────────────────────────────────────────────────────────
async function exportPDFReport() {
  try {
    const { summary, farmers, schemes } = await getReportExportData();
    const reportDate = new Date().toLocaleString('en-IN');
    const districtRows = (summary.byDistrict || [])
      .map(item => `<tr><td>${escapeHtml(item.district)}</td><td>${escapeHtml(item.count)}</td></tr>`)
      .join('');
    const schemeRows = (schemes || [])
      .map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category || '-')}</td><td>${escapeHtml(item.enrolled || 0)}</td></tr>`)
      .join('');
    const farmerRows = (farmers || []).slice(0, 12)
      .map(item => `<tr><td>${escapeHtml(item.name || `${item.first_name} ${item.last_name}`)}</td><td>${escapeHtml(item.district || '-')}</td><td>${escapeHtml(item.land_area ?? '-')}</td><td>${escapeHtml(item.crop || '-')}</td><td>${escapeHtml(item.status || '-')}</td></tr>`)
      .join('');

    const reportWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!reportWindow) {
      showToast('Please allow pop-ups to export the PDF report');
      return;
    }

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>KrishiSeva Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #17301f; }
          h1, h2 { margin: 0 0 12px; }
          p { margin: 6px 0; }
          .meta { color: #4b6353; margin-bottom: 24px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 18px 0 28px; }
          .card { border: 1px solid #cdd9d0; border-radius: 10px; padding: 14px; background: #f6faf6; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 24px; }
          th, td { border: 1px solid #d6e0d8; padding: 10px; text-align: left; font-size: 13px; }
          th { background: #eef5ef; }
          @media print {
            body { margin: 18px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>KrishiSeva Analytics Report</h1>
        <p class="meta">Generated on ${escapeHtml(reportDate)}</p>

        <div class="grid">
          <div class="card"><strong>Total Farmers</strong><p>${escapeHtml(summary.totalFarmers)}</p></div>
          <div class="card"><strong>Land Parcels</strong><p>${escapeHtml(summary.landParcels)}</p></div>
          <div class="card"><strong>Active Schemes</strong><p>${escapeHtml(summary.activeSchemes)}</p></div>
          <div class="card"><strong>Beneficiaries</strong><p>${escapeHtml(summary.beneficiaries)}</p></div>
          <div class="card"><strong>Total Land Area</strong><p>${escapeHtml(summary.totalLandArea)} Ha</p></div>
        </div>

        <h2>Farmers by District</h2>
        <table>
          <thead><tr><th>District</th><th>Farmers</th></tr></thead>
          <tbody>${districtRows || '<tr><td colspan="2">No district data available</td></tr>'}</tbody>
        </table>

        <h2>Scheme Enrollment</h2>
        <table>
          <thead><tr><th>Scheme</th><th>Category</th><th>Enrolled</th></tr></thead>
          <tbody>${schemeRows || '<tr><td colspan="3">No scheme data available</td></tr>'}</tbody>
        </table>

        <h2>Recent Farmers</h2>
        <table>
          <thead><tr><th>Name</th><th>District</th><th>Land (Ha)</th><th>Crop</th><th>Status</th></tr></thead>
          <tbody>${farmerRows || '<tr><td colspan="5">No farmer data available</td></tr>'}</tbody>
        </table>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    reportWindow.document.close();
    showToast('PDF report opened in print view');
  } catch (e) {
    showToast('PDF export failed: ' + e.message);
  }
}

async function exportCSV() {
  try {
    const { summary, farmers, schemes } = await getReportExportData();
    const sections = [];

    sections.push(['KrishiSeva Analytics Report']);
    sections.push(['Generated On', new Date().toLocaleString('en-IN')]);
    sections.push([]);
    sections.push(['Summary']);
    sections.push(['Metric', 'Value']);
    sections.push(['Total Farmers', summary.totalFarmers]);
    sections.push(['Land Parcels', summary.landParcels]);
    sections.push(['Active Schemes', summary.activeSchemes]);
    sections.push(['Beneficiaries', summary.beneficiaries]);
    sections.push(['Total Land Area (Ha)', summary.totalLandArea]);
    sections.push([]);
    sections.push(['Farmers by District']);
    sections.push(['District', 'Count']);
    (summary.byDistrict || []).forEach(item => sections.push([item.district, item.count]));
    sections.push([]);
    sections.push(['Schemes']);
    sections.push(['Scheme Name', 'Category', 'Department', 'Enrolled']);
    (schemes || []).forEach(item => sections.push([item.name, item.category || '', item.dept || '', item.enrolled || 0]));
    sections.push([]);
    sections.push(['Farmers']);
    sections.push(['ID', 'Name', 'District', 'Village', 'Aadhaar', 'Land (Ha)', 'Crop', 'Status', 'Mobile']);
    (farmers || []).forEach(f => sections.push([
      f.id,
      f.name || `${f.first_name} ${f.last_name}`,
      f.district || '',
      f.village || '',
      f.aadhaar || '',
      f.land_area ?? '',
      f.crop || '',
      f.status || '',
      f.mobile || ''
    ]));

    const csv = sections.map(row => row.map(toCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `krishiseva_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('CSV report exported successfully!');
  } catch (e) {
    showToast('Export failed: ' + e.message);
  }
}

async function emailReport() {
  try {
    const { summary, schemes } = await getReportExportData();
    const topDistricts = (summary.byDistrict || [])
      .slice(0, 5)
      .map(item => `${item.district}: ${item.count}`)
      .join('\n');
    const topSchemes = [...(schemes || [])]
      .sort((a, b) => (b.enrolled || 0) - (a.enrolled || 0))
      .slice(0, 5)
      .map(item => `${item.name}: ${item.enrolled || 0}`)
      .join('\n');

    const subject = 'KrishiSeva Analytics Report';
    const body = [
      'KrishiSeva Analytics Report',
      '',
      `Generated on: ${new Date().toLocaleString('en-IN')}`,
      '',
      `Total Farmers: ${summary.totalFarmers}`,
      `Land Parcels: ${summary.landParcels}`,
      `Active Schemes: ${summary.activeSchemes}`,
      `Beneficiaries: ${summary.beneficiaries}`,
      `Total Land Area: ${summary.totalLandArea} Ha`,
      '',
      'Top Districts',
      topDistricts || 'No district data available',
      '',
      'Top Schemes by Enrollment',
      topSchemes || 'No scheme data available'
    ].join('\n');

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showToast('Email draft opened in your mail app');
  } catch (e) {
    showToast('Email report failed: ' + e.message);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function updateNavState(id, btn) {
  document.querySelectorAll(".nav-links button").forEach((button) => {
    button.classList.toggle("active", button === btn);
  });
  if (!btn) {
    const buttonMap = { dashboard: 0, farmers: 1, land: 2, schemes: 3, reports: 4 };
    const index = buttonMap[id];
    const navButtons = document.querySelectorAll(".nav-links button");
    if (typeof index === "number" && navButtons[index]) navButtons[index].classList.add("active");
  }
}

function showPage(id, btn) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  const activePage = document.getElementById(`page-${id}`);
  if (activePage) activePage.classList.add("active");
  updateNavState(id, btn);
  refreshViewportAnimations();
  animateVisibleMetrics(activePage);

  // Load relevant data when navigating
  if (id === 'dashboard') loadDashboard();
  if (id === 'farmers') filterFarmers();
  if (id === 'land') filterLandRecords();
  if (id === 'schemes') filterSchemes();
  if (id === 'reports') loadDashboard();
}

function switchTab(pageId, tabId, btn) {
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return;
  page.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  page.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));
  page.querySelector(`#${tabId}`)?.classList.add("active");
  btn?.classList.add("active");
  if (tabId === 'tab-list') filterFarmers();
  refreshViewportAnimations();
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function nextStep(stepNumber) {
  document.querySelectorAll(".step-form").forEach((form) => form.classList.remove("active"));
  document.getElementById(`step-${stepNumber}`)?.classList.add("active");
  document.querySelectorAll(".step-item").forEach((item) => {
    const itemStep = Number(item.dataset.step);
    item.classList.remove("active", "done");
    if (itemStep < stepNumber) item.classList.add("done");
    if (itemStep === stepNumber) item.classList.add("active");
  });
  currentStep = stepNumber;
}

// ─── Form Utilities ───────────────────────────────────────────────────────────
function clearRegistrationForm() {
  [
    "firstName", "lastName", "dob", "gender", "aadhaar", "mobile", "caste", "income",
    "village", "district", "state", "surveyNo", "landArea", "landType", "soilType", "crop",
    "ownership", "landLocation", "landNotes", "bankAccNo", "ifsc", "bankName", "bankBranch", "docStatus"
  ].forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.tagName === "SELECT") field.selectedIndex = 0;
    else field.value = "";
  });
  editingFarmerId = null;
  const submitBtn = document.querySelector('#step-3 .form-actions .btn-primary');
  if (submitBtn) submitBtn.textContent = 'Submit Registration';
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function resetLandModal() {
  editingLandId = null;
  fillLandModal({});
  setLandModalMode("create");
}

function openModal() {
  if (!editingLandId && landModalMode === "create") {
    resetLandModal();
  }
  document.getElementById("landModal")?.classList.add("open");
}

function closeModal() {
  document.getElementById("landModal")?.classList.remove("open");
  resetLandModal();
}

function resetSchemeModal() {
  ["newSchemeName", "newSchemeDept", "newSchemeDesc", "newSchemeTags"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  const category = document.getElementById("newSchemeCategory");
  if (category) category.selectedIndex = 0;
}

function openSchemeModal() {
  resetSchemeModal();
  document.getElementById("schemeModal")?.classList.add("open");
}

function closeSchemeModal() {
  document.getElementById("schemeModal")?.classList.remove("open");
  resetSchemeModal();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

// ─── Animations ───────────────────────────────────────────────────────────────
function animateCount(element) {
  if (!element || element.dataset.animated === "true") return;
  const rawTarget = Number(element.dataset.count);
  if (!Number.isFinite(rawTarget)) return;
  const suffix = element.dataset.suffix || "";
  const duration = 1100;
  const start = performance.now();
  element.dataset.animated = "true";
  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${formatCount(Math.round(rawTarget * eased))}${suffix}`;
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function animateBar(bar) {
  if (!bar || bar.dataset.animated === "true") return;
  const targetWidth = bar.style.width;
  bar.dataset.targetWidth = targetWidth;
  bar.style.width = "0";
  bar.dataset.animated = "true";
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = targetWidth; }));
}

function animateVisibleMetrics(scope = document) {
  scope?.querySelectorAll("[data-count]").forEach((item) => animateCount(item));
  scope?.querySelectorAll(".bar-fill, .progress-fill").forEach((bar) => animateBar(bar));
}

function refreshViewportAnimations() {
  document.querySelectorAll(".reveal").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight - 70) element.classList.add("visible");
  });
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  if (!liveClock) return;
  liveClock.textContent = new Date().toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function updateBackToTop() {
  backToTopButton?.classList.toggle("visible", window.scrollY > 320);
}

function handleAadhaarInput(event) {
  const value = event.target.value.replace(/\D/g, "").slice(0, 12);
  event.target.value = value.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindEvents() {
  themeToggle?.addEventListener("click", toggleTheme);
  document.querySelector(".nav-brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    showPage('dashboard', document.querySelector('.nav-links button:first-child'));
  });
  document.getElementById("aadhaar")?.addEventListener("input", handleAadhaarInput);

  document.getElementById("landModal")?.addEventListener("click", (e) => {
    if (e.target.id === "landModal") closeModal();
  });
  document.getElementById("schemeModal")?.addEventListener("click", (e) => {
    if (e.target.id === "schemeModal") closeSchemeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeSchemeModal(); }
  });
  backToTopButton?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => { updateBackToTop(); refreshViewportAnimations(); }, { passive: true });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(themeStorageKey)) applyTheme(e.matches ? "dark" : "light");
  });

  // Land search/filter live binding
  document.getElementById("landSearch")?.addEventListener("input", filterLandRecords);
  document.getElementById("landTypeFilter")?.addEventListener("change", filterLandRecords);

  // Scheme category filter
  document.getElementById("schemeCategoryFilter")?.addEventListener("change", filterSchemes);
}

// ─── Initialise ───────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  bindEvents();
  updateClock();
  refreshViewportAnimations();
  updateBackToTop();
  window.setInterval(updateClock, 60000);

  // Load initial data
  await loadDashboard();
  animateVisibleMetrics(document.getElementById("page-dashboard"));
}

init();

// ─── Global exports (called from HTML onclick attributes) ─────────────────────
window.filterFarmers = filterFarmers;
window.deleteFarmer = deleteFarmer;
window.openEditFarmer = openEditFarmer;
window.showPage = showPage;
window.switchTab = switchTab;
window.nextStep = nextStep;
window.submitFarmer = submitFarmer;
window.openModal = openModal;
window.closeModal = closeModal;
window.openSchemeModal = openSchemeModal;
window.closeSchemeModal = closeSchemeModal;
window.saveLandParcel = saveLandParcel;
window.deleteLandRecord = deleteLandRecord;
window.saveNewScheme = saveNewScheme;
window.enrollAllFarmers = enrollAllFarmers;
window.filterSchemes = filterSchemes;
window.filterLandRecords = filterLandRecords;
window.exportPDFReport = exportPDFReport;
window.exportCSV = exportCSV;
window.emailReport = emailReport;
window.showToast = showToast;
window.showLandDetail = showLandDetail;
window.openEditLandRecord = openEditLandRecord;
