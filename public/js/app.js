/* ─────────────────────────────────────────────────────────────────────────────
   KrishiSeva — Main Application Script
   All data operations go through the backend REST API (api.js).
   ───────────────────────────────────────────────────────────────────────────── */

const body = document.body;
const appShell = document.querySelector(".app-shell");
const authScreen = document.getElementById("authScreen");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authTabs = document.querySelectorAll(".auth-tab");
const themeToggleButtons = document.querySelectorAll("[data-theme-toggle]");
const passwordStrengthFill = document.getElementById("passwordStrengthFill");
const passwordHint = document.getElementById("passwordHint");
const authUserName = document.getElementById("authUserName");
const authUserEmail = document.getElementById("authUserEmail");
const authUserScope = document.getElementById("authUserScope");
const authUserRole = document.getElementById("authUserRole");
const logoutButton = document.getElementById("logoutButton");
const toast = document.getElementById("toast");
const backToTopButton = document.getElementById("backToTop");
const liveClock = document.getElementById("liveClock");
const adminWhitelistCard = document.getElementById("adminWhitelistCard");
const whitelistForm = document.getElementById("whitelistForm");
const whitelistEditEmailInput = document.getElementById("whitelistEditEmail");
const whitelistEmailInput = document.getElementById("whitelistEmail");
const whitelistRoleInput = document.getElementById("whitelistRole");
const whitelistStateInput = document.getElementById("whitelistState");
const whitelistDistrictsInput = document.getElementById("whitelistDistricts");
const whitelistSubmitButton = document.getElementById("whitelistSubmitButton");
const whitelistCancelButton = document.getElementById("whitelistCancelButton");
const whitelistFieldError = document.getElementById("whitelistFieldError");
const whitelistCount = document.getElementById("whitelistCount");
const whitelistEmptyState = document.getElementById("whitelistEmptyState");
const whitelistList = document.getElementById("whitelistList");
const themeStorageKey = "krishiseva-theme";

let currentStep = 1;
let toastTimer;
let editingFarmerId = null; // tracks if we are in edit mode
let editingLandId = null;
let landModalMode = "create";
let currentUser = null;
let adminEmailAddress = "admin@example.com";
const locationMap = window.KRISHI_LOCATIONS || {};

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

function setMetricValue(id, value, suffix = "", digits = 1) {
  const element = document.getElementById(id);
  if (!element) return;
  const num = Number(value) || 0;
  element.textContent = `${num.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}${suffix}`;
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

function getInitials(name = "") {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "KS";
}

function isAdminCurrentUser() {
  return currentUser?.role === "admin";
}

function isSubAdminCurrentUser() {
  return currentUser?.role === "sub-admin";
}

function getRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "sub-admin") return "Sub Admin";
  return "User";
}

function getAllStates() {
  return Object.keys(locationMap);
}

function getDistrictOptionsForState(state) {
  return Array.isArray(locationMap[state]) ? locationMap[state] : [];
}

function setSelectOptions(select, options = [], placeholder = "Select") {
  if (!select) return;
  const currentValue = select.value;
  const placeholderOption = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
  select.innerHTML = `${placeholderOption}${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}`;
  if (options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function setMultiSelectOptions(select, options = [], selectedValues = []) {
  if (!select) return;
  const selectedSet = new Set(selectedValues);
  select.innerHTML = options.map((option) => `
    <option value="${escapeHtml(option)}" ${selectedSet.has(option) ? "selected" : ""}>${escapeHtml(option)}</option>
  `).join("");
}

function getSelectedValues(select) {
  return [...(select?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
}

function getVisibleStatesForUser() {
  if (isSubAdminCurrentUser() && currentUser?.state) {
    return [currentUser.state];
  }
  return getAllStates();
}

function getVisibleDistrictsForState(state) {
  const districts = getDistrictOptionsForState(state);
  if (isSubAdminCurrentUser() && currentUser?.districts?.length) {
    const allowed = new Set(currentUser.districts);
    return districts.filter((district) => allowed.has(district));
  }
  return districts;
}

function syncDistrictDropdown(stateSelectId, districtSelectId, config = {}) {
  const stateSelect = document.getElementById(stateSelectId);
  const districtSelect = document.getElementById(districtSelectId);
  if (!stateSelect || !districtSelect) return;

  const districts = getVisibleDistrictsForState(stateSelect.value);
  const previousValue = config.selectedValue ?? districtSelect.value;
  setSelectOptions(districtSelect, districts, config.placeholder || "Select District");

  if (districts.includes(previousValue)) {
    districtSelect.value = previousValue;
  } else if (config.lockToFirst && districts.length) {
    districtSelect.value = districts[0];
  }

  districtSelect.disabled = districts.length === 0;
}

function syncWhitelistDistricts(selectedValues = []) {
  const state = whitelistStateInput?.value || "";
  const districts = getDistrictOptionsForState(state);
  setMultiSelectOptions(whitelistDistrictsInput, districts, selectedValues);
  const isSubAdmin = whitelistRoleInput?.value === "sub-admin";
  if (whitelistDistrictsInput) {
    whitelistDistrictsInput.disabled = !isSubAdmin || !districts.length;
  }
}

function applyUserScopeToForms() {
  const stateSelect = document.getElementById("state");
  const farmerStateFilter = document.getElementById("stateFilter");
  const modalStateSelect = document.getElementById("modalState");
  const visibleStates = getVisibleStatesForUser();

  setSelectOptions(stateSelect, visibleStates, "Select State");
  setSelectOptions(farmerStateFilter, visibleStates, "All States");
  setSelectOptions(modalStateSelect, visibleStates, "Select State");
  setSelectOptions(whitelistStateInput, getAllStates(), "Select State");

  if (isSubAdminCurrentUser() && currentUser?.state) {
    if (stateSelect) stateSelect.value = currentUser.state;
    if (farmerStateFilter) farmerStateFilter.value = currentUser.state;
    if (modalStateSelect) modalStateSelect.value = currentUser.state;
  }

  syncDistrictDropdown("state", "district", {
    placeholder: "Select District",
    lockToFirst: isSubAdminCurrentUser()
  });
  syncDistrictDropdown("stateFilter", "districtFilter", {
    placeholder: "All Districts"
  });
  syncDistrictDropdown("modalState", "modalDistrict", {
    placeholder: "Select District",
    lockToFirst: isSubAdminCurrentUser()
  });
  syncWhitelistDistricts(getSelectedValues(whitelistDistrictsInput));
  if (whitelistStateInput) {
    whitelistStateInput.disabled = whitelistRoleInput?.value !== "sub-admin";
  }

  if (isSubAdminCurrentUser()) {
    if (stateSelect) stateSelect.disabled = true;
    if (farmerStateFilter) farmerStateFilter.disabled = true;
    if (modalStateSelect) modalStateSelect.disabled = true;
  } else {
    if (stateSelect) stateSelect.disabled = false;
    if (farmerStateFilter) farmerStateFilter.disabled = false;
    if (modalStateSelect) modalStateSelect.disabled = false;
  }
}
function switchAuthPanel(targetId) {
  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authTarget === targetId);
  });
  document.querySelectorAll(".auth-form-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function setAuthStatus(form, message = "", type = "error") {
  const status = form?.querySelector(".auth-status");
  if (!status) return;
  status.textContent = message;
  status.className = `auth-status${message ? ` show ${type}` : ""}`;
}

function clearAuthErrors(form) {
  setAuthStatus(form, "");
  form?.querySelectorAll(".field-error").forEach((field) => {
    field.textContent = "";
  });
}

function applyFieldErrors(form, fields = []) {
  fields.forEach((item) => {
    const target = form?.querySelector(`[data-error-for="${item.field}"]`);
    if (target) {
      target.textContent = item.message;
    }
  });
}

function setFormBusy(form, isBusy) {
  form?.querySelectorAll("button, input").forEach((element) => {
    element.disabled = isBusy;
  });
}

function resetWhitelistForm() {
  whitelistForm?.reset();
  if (whitelistEditEmailInput) whitelistEditEmailInput.value = "";
  if (whitelistEmailInput) whitelistEmailInput.readOnly = false;
  if (whitelistSubmitButton) whitelistSubmitButton.textContent = "Save Access";
  if (whitelistCancelButton) whitelistCancelButton.hidden = true;
  if (whitelistFieldError) whitelistFieldError.textContent = "";
  applyUserScopeToForms();
}

function startEditWhitelistEntry(entry) {
  if (!entry || entry.email === adminEmailAddress) return;

  if (whitelistEditEmailInput) whitelistEditEmailInput.value = entry.email || "";
  if (whitelistEmailInput) {
    whitelistEmailInput.value = entry.email || "";
    whitelistEmailInput.readOnly = true;
  }
  if (whitelistRoleInput) whitelistRoleInput.value = entry.role || "user";
  if (whitelistStateInput) whitelistStateInput.value = entry.state || "";
  syncWhitelistDistricts(entry.districts || []);
  if (whitelistSubmitButton) whitelistSubmitButton.textContent = "Update Access";
  if (whitelistCancelButton) whitelistCancelButton.hidden = false;
  if (whitelistFieldError) whitelistFieldError.textContent = "";
}

function updatePasswordStrength() {
  const password = document.getElementById("signupPassword")?.value || "";
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const pct = Math.min(100, (score / 5) * 100);
  if (passwordStrengthFill) {
    passwordStrengthFill.style.width = `${pct}%`;
  }

  if (!passwordHint) return;
  if (!password) {
    passwordHint.textContent = "Use letters, numbers, and at least 8 characters.";
  } else if (score <= 2) {
    passwordHint.textContent = "Weak password. Add more variety to strengthen it.";
  } else if (score <= 4) {
    passwordHint.textContent = "Good start. One more character type will make it stronger.";
  } else {
    passwordHint.textContent = "Strong password. Ready to create the account.";
  }
}

function setAuthenticatedState(user) {
  currentUser = user || null;
  authScreen.hidden = Boolean(currentUser);
  appShell.hidden = !currentUser;

  const badge = document.querySelector(".badge-user");
  if (badge) {
    badge.textContent = getInitials(currentUser?.name);
  }
  if (authUserName) {
    authUserName.textContent = currentUser?.name || "Portal User";
  }
  if (authUserEmail) {
    authUserEmail.textContent = currentUser?.email || "Signed in";
  }
  if (authUserScope) {
    authUserScope.textContent = currentUser?.scopeLabel || "All states and districts";
  }
  if (authUserRole) {
    authUserRole.hidden = !currentUser?.role;
    authUserRole.textContent = getRoleLabel(currentUser?.role);
  }
  if (adminWhitelistCard) {
    adminWhitelistCard.hidden = !isAdminCurrentUser();
  }
  applyUserScopeToForms();

  if (!currentUser) {
    switchAuthPanel("loginPanel");
    loginForm?.reset();
    signupForm?.reset();
    updatePasswordStrength();
    resetWhitelistForm();
    if (whitelistList) whitelistList.innerHTML = "";
    if (whitelistCount) whitelistCount.textContent = "0 access entries";
    if (whitelistEmptyState) whitelistEmptyState.hidden = false;
  }
}

async function finishLogin(payload, successMessage) {
  Api.Auth.setToken(payload.token);
  setAuthenticatedState(payload.user);
  showToast(successMessage);
  updateClock();
  refreshViewportAnimations();
  updateBackToTop();
  await loadDashboard();
  animateVisibleMetrics(document.getElementById("page-dashboard"));
}

async function submitLogin(event) {
  event.preventDefault();
  clearAuthErrors(loginForm);
  setFormBusy(loginForm, true);

  const payload = {
    email: document.getElementById("loginEmail")?.value.trim(),
    password: document.getElementById("loginPassword")?.value || "",
  };

  try {
    const response = await Api.Auth.login(payload);
    await finishLogin(response, `Welcome back, ${response.user.name}`);
  } catch (error) {
    if (error?.fields?.length) {
      applyFieldErrors(loginForm, error.fields);
    }
    setAuthStatus(loginForm, error.message, "error");
  } finally {
    setFormBusy(loginForm, false);
  }
}

async function submitSignup(event) {
  event.preventDefault();
  clearAuthErrors(signupForm);
  setFormBusy(signupForm, true);

  const payload = {
    name: document.getElementById("signupName")?.value.trim(),
    email: document.getElementById("signupEmail")?.value.trim(),
    password: document.getElementById("signupPassword")?.value || "",
    confirmPassword: document.getElementById("signupConfirmPassword")?.value || "",
  };

  try {
    const response = await Api.Auth.register(payload);
    setAuthStatus(signupForm, "Account created successfully. Signing you in...", "success");
    await finishLogin(response, `Account ready for ${response.user.name}`);
  } catch (error) {
    const fieldErrors = error?.fields || [];
    if (fieldErrors.length) {
      applyFieldErrors(signupForm, fieldErrors);
    }
    setAuthStatus(signupForm, error.message, "error");
  } finally {
    setFormBusy(signupForm, false);
  }
}

async function logoutUser() {
  try {
    await Api.Auth.logout();
  } catch (error) {
    // Ignore logout API errors because the local token is the important part.
  }
  Api.Auth.clearToken();
  setAuthenticatedState(null);
  showToast("You have been logged out");
}

async function restoreSession() {
  if (!Api.Auth.getToken()) {
    setAuthenticatedState(null);
    return;
  }

  try {
    const session = await Api.Auth.getSession();
    setAuthenticatedState(session.user);
  } catch (error) {
    Api.Auth.clearToken();
    setAuthenticatedState(null);
  }
}

function renderWhitelist(entries = []) {
  if (!whitelistList || !whitelistCount || !whitelistEmptyState) return;

  whitelistCount.textContent = `${entries.length} access entr${entries.length === 1 ? "y" : "ies"}`;
  whitelistEmptyState.hidden = entries.length > 0;
  whitelistList.innerHTML = entries.map((entry) => `
    <div class="admin-list-item">
      <div>
        <strong>${escapeHtml(entry.email)}</strong>
        <div class="admin-meta">${escapeHtml(getRoleLabel(entry.role))} · ${escapeHtml(entry.state || "All states")}</div>
        <div class="admin-meta">${escapeHtml((entry.districts || []).length ? entry.districts.join(", ") : "All districts")}</div>
      </div>
      ${entry.email === adminEmailAddress
        ? '<span class="user-role-badge inline-badge">Admin</span>'
        : `<button class="btn btn-secondary btn-sm" type="button" onclick='removeWhitelistEmail(${JSON.stringify(entry.email)})'>Remove</button>`}
    </div>
  `).join("");
}

async function loadWhitelist() {
  if (!isAdminCurrentUser()) return;

  try {
    const response = await Api.Admin.getWhitelist();
    adminEmailAddress = response.adminEmail || adminEmailAddress;
    renderWhitelist(response.entries || []);
  } catch (error) {
    showToast("Could not load whitelist entries: " + error.message);
  }
}

async function submitWhitelistForm(event) {
  event.preventDefault();
  if (!isAdminCurrentUser()) return;

  const email = whitelistEmailInput?.value.trim() || "";
  const role = whitelistRoleInput?.value || "user";
  const state = whitelistStateInput?.value || "";
  const districts = getSelectedValues(whitelistDistrictsInput);
  if (whitelistFieldError) whitelistFieldError.textContent = "";
  if (!email) {
    if (whitelistFieldError) whitelistFieldError.textContent = "Enter an email address to approve.";
    return;
  }

  try {
    const response = await Api.Admin.addWhitelistEmail({ email, role, state, districts });
    whitelistForm?.reset();
    applyUserScopeToForms();
    renderWhitelist(response.entries || []);
    showToast("Access saved for " + email);
  } catch (error) {
    if (whitelistFieldError) {
      whitelistFieldError.textContent = error?.fields?.[0]?.message || error.message;
    }
    showToast("Could not update the whitelist: " + error.message);
  }
}

async function removeWhitelistEmail(email) {
  if (!isAdminCurrentUser()) return;
  if (!confirm(`Remove whitelist access for "${email}"?`)) return;

  try {
    const response = await Api.Admin.removeWhitelistEmail(email);
    renderWhitelist(response.entries || []);
    showToast("Signup access removed for " + email);
  } catch (error) {
    showToast("Could not remove whitelist access: " + error.message);
  }
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function updateThemeLabel(theme) {
  const nextLabel = theme === "dark" ? "Light mode" : "Dark mode";
  themeToggleButtons.forEach((button) => {
    const label = button.querySelector(".theme-toggle-label");
    if (label) {
      label.textContent = nextLabel;
    }
    button.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()}`);
  });
}

function applyTheme(theme) {
  body.dataset.theme = theme;
  updateThemeLabel(theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#080f0bff" : "#1a3d2b"
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
  const stateValue = document.getElementById("stateFilter")?.value || '';
  try {
    const data = await Api.Farmers.getAll(searchValue, districtValue, stateValue);
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
    set('state', farmer.state);
    syncDistrictDropdown("state", "district", {
      placeholder: "Select District",
      selectedValue: farmer.district,
      lockToFirst: isSubAdminCurrentUser()
    });
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
    setAnimatedCount('report-district-coverage', (stats.byDistrict || []).length);
    const pendingEntry = (stats.byStatus || []).find((item) => String(item.status).toLowerCase() === "pending");
    const pendingCount = Number(pendingEntry?.count) || 0;
    setAnimatedCount('report-pending-farmers', pendingCount);
    const avgLandPerFarmer = Number(stats.totalFarmers) > 0
      ? (Number(stats.totalLandArea) || 0) / Number(stats.totalFarmers)
      : 0;
    setMetricValue('report-avg-land', avgLandPerFarmer, ' Ha', 1);
    if (authUserScope && stats.scope?.label) {
      authUserScope.textContent = stats.scope.label;
    }
    const scopeLabel = document.getElementById("reportScopeLabel");
    if (scopeLabel) {
      scopeLabel.textContent = stats.scope?.label || "All states and districts";
    }
    const reportRegistrationsNote = document.getElementById("reportRegistrationsNote");
    const reportLandNote = document.getElementById("reportLandNote");
    const reportBeneficiaryNote = document.getElementById("reportBeneficiaryNote");
    const reportDistrictCoverageNote = document.getElementById("reportDistrictCoverageNote");
    const reportPendingNote = document.getElementById("reportPendingNote");
    if (reportRegistrationsNote) reportRegistrationsNote.textContent = `${formatCount(stats.totalFarmers || 0)} visible registrations`;
    if (reportLandNote) reportLandNote.textContent = `${formatCount((stats.byState || []).length || 0)} state(s) and ${formatCount((stats.byDistrict || []).length || 0)} district(s)`;
    if (reportBeneficiaryNote) reportBeneficiaryNote.textContent = `${formatCount(stats.beneficiaries || 0)} total enrollments in scope`;
    if (reportDistrictCoverageNote) reportDistrictCoverageNote.textContent = `${formatCount((stats.byDistrict || []).length)} districts currently represented`;
    if (reportPendingNote) reportPendingNote.textContent = `${Math.round((pendingCount / Math.max(Number(stats.totalFarmers) || 1, 1)) * 100)}% of visible farmers`;

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

    updateBarChart(
      document.getElementById('stateChart'),
      'Farmers by State',
      (stats.byState || []).map((item, index) => ({
        label: item.state || 'Unknown',
        value: Number(item.count) || 0,
        valueLabel: formatCount(item.count || 0),
        tone: ['', 'amber', 'earth'][index % 3]
      })),
      'No state data available'
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

    updateBarChart(
      document.getElementById('statusChart'),
      'Farmer Status Breakdown',
      (stats.byStatus || []).map((item, index) => ({
        label: item.status || 'Unknown',
        value: Number(item.count) || 0,
        valueLabel: formatCount(item.count || 0),
        tone: ['', 'amber', 'earth'][index % 3]
      })),
      'No status data available'
    );

    const topDistrict = (stats.byDistrict || [])[0];
    const topState = (stats.byState || [])[0];
    const topScheme = (stats.schemeEnrollment || [])[0];
    const topDistrictLabel = document.getElementById("reportTopDistrict");
    const topSchemeLabel = document.getElementById("reportTopScheme");
    if (topDistrictLabel) {
      topDistrictLabel.textContent = topDistrict ? `${topDistrict.district} (${formatCount(topDistrict.count)})` : "No district data";
    }
    if (topSchemeLabel) {
      topSchemeLabel.textContent = topScheme ? `${topScheme.name} (${formatCount(topScheme.enrolled)})` : "No scheme data";
    }

    const totalFarmers = Number(stats.totalFarmers) || 0;
    const topStateShare = totalFarmers > 0 && topState ? Math.round((Number(topState.count) / totalFarmers) * 100) : 0;
    const pendingRatio = totalFarmers > 0 ? Math.round((pendingCount / totalFarmers) * 100) : 0;
    const enrollmentRatio = totalFarmers > 0 ? Math.round(((Number(stats.beneficiaries) || 0) / totalFarmers) * 100) : 0;
    const spotlightTitle = document.getElementById("spotlightTitle");
    const spotlightBody = document.getElementById("spotlightBody");
    const spotlightStateShare = document.getElementById("spotlightStateShare");
    const spotlightPendingRatio = document.getElementById("spotlightPendingRatio");
    const spotlightEnrollmentRatio = document.getElementById("spotlightEnrollmentRatio");
    if (spotlightTitle) {
      spotlightTitle.textContent = topDistrict
        ? `${topDistrict.district} is currently leading your visible farmer base`
        : "No regional concentration detected yet";
    }
    if (spotlightBody) {
      spotlightBody.textContent = topDistrict
        ? `${topDistrict.district} accounts for ${Math.round((Number(topDistrict.count) / Math.max(totalFarmers, 1)) * 100)}% of visible farmers, while ${topScheme?.name || "your top scheme"} is leading participation across the current scope.`
        : "Add more farmer records to unlock district concentration, top scheme reach, and coverage insights.";
    }
    if (spotlightStateShare) spotlightStateShare.textContent = `${topStateShare}%`;
    if (spotlightPendingRatio) spotlightPendingRatio.textContent = `${pendingRatio}%`;
    if (spotlightEnrollmentRatio) spotlightEnrollmentRatio.textContent = `${enrollmentRatio}%`;

    updateReportDonut(pendingCount, totalFarmers, stats.byStatus || []);

    renderRankList("topDistrictList", (stats.byDistrict || []).slice(0, 5), (item, index) => `
      <div class="report-rank-item">
        <div class="report-rank-copy">
          <strong>#${index + 1} ${escapeHtml(item.district || "Unknown")}</strong>
          <small>${Math.round((Number(item.count || 0) / Math.max(totalFarmers, 1)) * 100)}% of visible registrations</small>
        </div>
        <div class="report-rank-value">${formatCount(item.count || 0)}</div>
      </div>
    `);

    renderRankList("topSchemeList", (stats.schemeEnrollment || []).slice(0, 5), (item, index) => {
      const enrolled = Number(item.enrolled) || 0;
      const percent = totalFarmers > 0 ? Math.round((enrolled / totalFarmers) * 100) : 0;
      return `
        <div class="report-rank-item">
          <div class="report-rank-copy">
            <strong>#${index + 1} ${escapeHtml(item.name || "Unnamed Scheme")}</strong>
            <small>${percent}% of visible farmers enrolled</small>
          </div>
          <div class="report-rank-value">${formatCount(enrolled)}</div>
        </div>
      `;
    });

    if (isAdminCurrentUser()) {
      await loadWhitelist();
    }

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
  set("modalState", record.state || currentUser?.state || "");
  syncDistrictDropdown("modalState", "modalDistrict", {
    placeholder: "Select District",
    selectedValue: record.district,
    lockToFirst: isSubAdminCurrentUser()
  });
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
    "modalState",
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
  const state = document.getElementById("modalState")?.value;
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
      state,
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

function renderRankList(containerId, items, formatter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="report-rank-item"><span>No data available yet.</span></div>`;
    return;
  }

  container.innerHTML = items.map((item, index) => formatter(item, index)).join("");
}

function updateReportDonut(pendingCount, totalFarmers, statuses = []) {
  const donutRing = document.getElementById("pendingDonutRing");
  const donutValue = document.getElementById("pendingDonutValue");
  const legendList = document.getElementById("reportLegendList");
  const pct = totalFarmers > 0 ? Math.round((pendingCount / totalFarmers) * 100) : 0;

  if (donutRing) {
    donutRing.style.background = `conic-gradient(var(--amber-500) 0deg ${pct * 3.6}deg, rgba(233, 196, 106, 0.16) ${pct * 3.6}deg 360deg)`;
  }
  if (donutValue) {
    donutValue.textContent = `${pct}%`;
  }
  if (!legendList) return;

  const toneByStatus = {
    active: "forest",
    approved: "amber",
    pending: "earth"
  };

  legendList.innerHTML = (statuses.length ? statuses.slice(0, 4) : [
    { status: "Pending", count: 0 },
    { status: "Approved", count: 0 },
    { status: "Active", count: 0 }
  ]).map((item) => {
    const tone = toneByStatus[String(item.status || "").toLowerCase()] || "forest";
    return `
      <div class="report-legend-item">
        <span class="legend-swatch ${tone}"></span>
        <div>
          <strong>${escapeHtml(item.status || "Unknown")}</strong>
          <span>${formatCount(item.count || 0)} farmers</span>
        </div>
      </div>
    `;
  }).join("");
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
  if (!currentUser) return;
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
  applyUserScopeToForms();
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
  liveClock.textContent = new Date().toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  themeToggleButtons.forEach((button) => button.addEventListener("click", toggleTheme));
  loginForm?.addEventListener("submit", submitLogin);
  signupForm?.addEventListener("submit", submitSignup);
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchAuthPanel(tab.dataset.authTarget));
  });
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      button.textContent = nextType === "password" ? "Show" : "Hide";
    });
  });
  document.querySelectorAll(".auth-form input").forEach((input) => {
    input.addEventListener("input", () => {
      const fieldError = input.closest(".form-group")?.querySelector(".field-error");
      if (fieldError) {
        fieldError.textContent = "";
      }
      const form = input.closest(".auth-form");
      if (form?.querySelector(".auth-status.show")) {
        setAuthStatus(form, "");
      }
    });
  });
  document.getElementById("signupPassword")?.addEventListener("input", updatePasswordStrength);
  whitelistForm?.addEventListener("submit", submitWhitelistForm);
  whitelistEmailInput?.addEventListener("input", () => {
    if (whitelistFieldError) whitelistFieldError.textContent = "";
  });
  whitelistRoleInput?.addEventListener("change", () => {
    if (whitelistFieldError) whitelistFieldError.textContent = "";
    const isSubAdmin = whitelistRoleInput.value === "sub-admin";
    if (!isSubAdmin && whitelistStateInput) {
      whitelistStateInput.value = "";
    }
    syncWhitelistDistricts();
    if (whitelistStateInput) whitelistStateInput.disabled = !isSubAdmin;
  });
  whitelistStateInput?.addEventListener("change", () => {
    if (whitelistFieldError) whitelistFieldError.textContent = "";
    syncWhitelistDistricts();
  });
  logoutButton?.addEventListener("click", logoutUser);
  document.querySelector(".nav-brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    showPage('dashboard', document.querySelector('.nav-links button:first-child'));
  });
  document.getElementById("aadhaar")?.addEventListener("input", handleAadhaarInput);
  document.getElementById("state")?.addEventListener("change", () => {
    syncDistrictDropdown("state", "district", {
      placeholder: "Select District",
      lockToFirst: isSubAdminCurrentUser()
    });
  });
  document.getElementById("stateFilter")?.addEventListener("change", () => {
    syncDistrictDropdown("stateFilter", "districtFilter", {
      placeholder: "All Districts"
    });
    filterFarmers();
  });
  document.getElementById("modalState")?.addEventListener("change", () => {
    syncDistrictDropdown("modalState", "modalDistrict", {
      placeholder: "Select District",
      lockToFirst: isSubAdminCurrentUser()
    });
  });

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
  window.addEventListener("krishiseva:auth-expired", () => {
    if (currentUser) {
      setAuthenticatedState(null);
      showToast("Your session expired. Please login again.");
    }
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
  updatePasswordStrength();
  updateClock();
  refreshViewportAnimations();
  updateBackToTop();
  window.setInterval(updateClock, 60000);
  await restoreSession();
  if (currentUser) {
    await loadDashboard();
    animateVisibleMetrics(document.getElementById("page-dashboard"));
  }
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
window.removeWhitelistEmail = removeWhitelistEmail;
window.showToast = showToast;
window.showLandDetail = showLandDetail;
window.openEditLandRecord = openEditLandRecord;
