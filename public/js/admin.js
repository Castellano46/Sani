/**
 * Sani Instalaciones - Professional Admin Panel Controller
 * High-performance, reactive, and secure.
 */

// Global State
const adminState = {
  authenticated: false,
  username: '',
  token: localStorage.getItem('sani_admin_token') || '',
  activeTab: 'dashboard',
  reviews: [],
  services: [],
  gallery: [],
  settings: {},
  currentReviewFilter: '',
  currentGalleryFilter: '',
  currentChartPeriod: 'monthly',
  activityTrends: null,
  charts: {
    activity: null,
    categories: null
  }
};

// Initialize Admin Application
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  initLoginForm();
  initTabNavigation();
  initQuickActions();
  initGalleryForm();
  initServicesForm();
  initSettingsForm();
  initSecurityForm();
  initModals();
  initDropzone();
});

// Authenticated Fetch Helper (Dual authentication: Bearer Token + HttpOnly Cookie)
async function authFetch(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};

  const token = adminState.token || localStorage.getItem('sani_admin_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: 'same-origin'
  };

  const response = await fetch(url, fetchOptions);
  if (response.status === 401) {
    // Session expired or invalid
    adminState.authenticated = false;
    localStorage.removeItem('sani_admin_token');
    showLoginView();
    showAdminToast('Sesión expirada. Por favor, identifícate de nuevo.', true);
    throw new Error('No autorizado');
  }

  return response;
}

// Toast notification helper
function showAdminToast(message, isError = false) {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.borderLeftColor = isError ? '#ef4444' : '#22c55e';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3800);
}

/* ==========================================================================
   1. Authentication & Session Management
   ========================================================================== */
async function checkSession() {
  try {
    const res = await authFetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      adminState.authenticated = true;
      adminState.username = data.username;
      if (data.token) {
        adminState.token = data.token;
        localStorage.setItem('sani_admin_token', data.token);
      }
      showAdminLayout();
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

function showLoginView() {
  const loginWrapper = document.getElementById('admin-login-wrapper');
  const layout = document.getElementById('admin-layout');
  if (loginWrapper) loginWrapper.style.display = 'flex';
  if (layout) layout.classList.remove('active');
}

function showAdminLayout() {
  const loginWrapper = document.getElementById('admin-login-wrapper');
  const layout = document.getElementById('admin-layout');
  if (loginWrapper) loginWrapper.style.display = 'none';
  if (layout) layout.classList.add('active');

  const usernameEl = document.getElementById('admin-display-username');
  if (usernameEl) usernameEl.textContent = adminState.username || 'admin';

  loadDashboardStats();
  loadReviewsTab();
  loadGalleryTab();
  loadServicesTab();
  loadSettingsTab();
}

function initLoginForm() {
  const form = document.getElementById('admin-login-form');
  const alertEl = document.getElementById('login-alert');
  const submitBtn = document.getElementById('login-submit-btn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando credenciales...';

    const username = form.username.value.trim();
    const password = form.password.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');

      adminState.authenticated = true;
      adminState.username = data.username;
      if (data.token) {
        adminState.token = data.token;
        localStorage.setItem('sani_admin_token', data.token);
      }

      showAdminLayout();
      showAdminToast('¡Sesión iniciada con éxito! Bienvenido.');
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message;
        alertEl.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Acceder al Panel';
    }
  });

  // Logout button
  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    adminState.authenticated = false;
    adminState.token = '';
    localStorage.removeItem('sani_admin_token');
    showLoginView();
    showAdminToast('Sesión cerrada correctamente');
  });
}

/* ==========================================================================
   2. Tab Navigation
   ========================================================================== */
function initTabNavigation() {
  const buttons = document.querySelectorAll('.sidebar-tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // Dedicated listener for Moderar Ahora button in dashboard
  const btnModerate = document.getElementById('btn-dashboard-moderate');
  if (btnModerate) {
    btnModerate.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('opiniones');
    });
  }

  // Dedicated listeners for KPI metric cards
  document.querySelectorAll('.metric-card[data-target-tab]').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const target = card.dataset.targetTab;
      if (target) switchTab(target);
    });
  });

  // Event delegation on table action buttons for maximum resilience
  initTableActionDelegation();
}

function initTableActionDelegation() {
  // 1. Reviews table delegation
  const reviewsTbody = document.getElementById('admin-reviews-tbody');
  reviewsTbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-table-action');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;
    e.preventDefault();

    if (action === 'approve') updateReviewStatus(id, 'approved');
    else if (action === 'hide') updateReviewStatus(id, 'hidden');
    else if (action === 'pending') updateReviewStatus(id, 'pending');
    else if (action === 'delete') deleteReview(id);
  });

  // 2. Gallery table delegation
  const galleryTbody = document.getElementById('admin-gallery-tbody');
  galleryTbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-table-action');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;
    e.preventDefault();

    if (action === 'approve') updateGalleryStatus(id, 'approved');
    else if (action === 'hide') updateGalleryStatus(id, 'hidden');
    else if (action === 'edit') openEditGalleryModal(id);
    else if (action === 'delete') deleteGalleryItem(id);
  });

  // 3. Services table delegation
  const servicesTbody = document.getElementById('admin-services-tbody');
  servicesTbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-table-action');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;
    e.preventDefault();

    if (action === 'toggle-active') {
      const newState = Number(btn.dataset.newstate);
      toggleServiceActive(id, newState);
    } else if (action === 'edit') {
      openEditServiceModal(id);
    } else if (action === 'delete') {
      deleteService(id);
    }
  });
}

window.switchTab = function(tabId) {
  adminState.activeTab = tabId;
  document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-panel-${tabId}`);
  });

  // Smoothly scroll content area to top
  const contentArea = document.querySelector('.admin-content-area');
  if (contentArea) contentArea.scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Always refresh latest data when navigating to tabs
  if (tabId === 'dashboard') {
    loadDashboardStats();
    setTimeout(() => {
      if (adminState.charts.activity) adminState.charts.activity.resize();
      if (adminState.charts.categories) adminState.charts.categories.resize();
    }, 100);
  } else if (tabId === 'opiniones') {
    loadReviewsTab();
  } else if (tabId === 'galeria') {
    loadGalleryTab();
  } else if (tabId === 'servicios') {
    loadServicesTab();
  } else if (tabId === 'personalizacion') {
    loadSettingsTab();
  }
};

window.refreshDashboard = function() {
  loadDashboardStats();
  showAdminToast('Datos del panel actualizados');
};

/* ==========================================================================
   3. Dashboard Stats & Analytics Charts
   ========================================================================== */
async function loadDashboardStats() {
  try {
    const res = await authFetch('/api/settings/stats');
    if (!res.ok) return;
    const { stats } = await res.json();

    // Update KPI numbers
    const pendingEl = document.getElementById('stat-pending-reviews');
    const totalRevEl = document.getElementById('stat-total-reviews');
    const totalWorksEl = document.getElementById('stat-total-works');
    const activeSrvEl = document.getElementById('stat-active-services');

    if (pendingEl) pendingEl.textContent = stats.pendingReviews;
    if (totalRevEl) totalRevEl.textContent = stats.totalReviews;
    if (totalWorksEl) totalWorksEl.textContent = stats.totalWorks;
    if (activeSrvEl) activeSrvEl.textContent = stats.activeServices;

    // Badges in sidebar
    const badgeEl = document.getElementById('sidebar-pending-badge');
    if (badgeEl) {
      if (stats.pendingReviews > 0) {
        badgeEl.textContent = stats.pendingReviews;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    const worksBadge = document.getElementById('sidebar-works-badge');
    if (worksBadge) worksBadge.textContent = stats.totalWorks;

    const srvBadge = document.getElementById('sidebar-services-badge');
    if (srvBadge) srvBadge.textContent = stats.activeServices;

    // Urgent Alert Banner on Dashboard
    const urgentBanner = document.getElementById('dashboard-urgent-alert');
    if (urgentBanner) {
      urgentBanner.style.display = stats.pendingReviews > 0 ? 'flex' : 'none';
    }

    const ratingBadge = document.getElementById('stat-rating-badge');
    if (ratingBadge) {
      ratingBadge.textContent = `Media: ${stats.averageRating || '5.0'} / 5 ★ (${stats.totalReviews} opiniones)`;
    }

    const worksDetail = document.getElementById('stat-works-detail');
    if (worksDetail) {
      worksDetail.textContent = `${stats.approvedWorks || 0} visibles · ${stats.hiddenWorks || 0} ocultas`;
    }

    // Render Recent Activity Feed
    renderRecentActivity(stats.recentActivity);

    // Store activity trends in state
    if (stats.activityTrends) {
      adminState.activityTrends = stats.activityTrends;
    } else if (stats.monthlyTrends) {
      adminState.activityTrends = { monthly: stats.monthlyTrends };
    }

    // Sync select dropdown if exists
    const periodSelect = document.getElementById('select-chart-period');
    if (periodSelect && adminState.currentChartPeriod) {
      periodSelect.value = adminState.currentChartPeriod;
    }

    // Initialize/Update Charts
    renderCharts(stats);

  } catch (err) {
    console.error('Error loading admin stats:', err);
  }
}

function renderRecentActivity(activity) {
  const container = document.getElementById('recent-activity-feed');
  if (!container) return;

  if (!activity || (!activity.reviews?.length && !activity.works?.length && !activity.contacts?.length)) {
    container.innerHTML = '<p style="color: #64748b; font-size: 0.9rem; padding: 0.5rem 0;">No hay actividad reciente registrada.</p>';
    return;
  }

  const items = [];

  if (activity.contacts) {
    activity.contacts.forEach(c => {
      const dateStr = new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const isWa = c.event_type === 'whatsapp_contact';
      const label = isWa ? 'Consulta directa por WhatsApp' : 'Llamada telefónica iniciada';
      const icon = isWa ? '🟢' : '📞';
      const badgeText = isWa ? 'WhatsApp' : 'Llamada';
      items.push({
        date: new Date(c.created_at),
        html: `
          <div class="activity-item">
            <div>
              ${icon} <span class="activity-user">${label}</span>
              <span class="status-badge status-approved" style="margin-left: 0.5rem; font-size: 0.7rem;">${badgeText}</span>
            </div>
            <span class="activity-date">${dateStr}</span>
          </div>
        `
      });
    });
  }

  if (activity.reviews) {
    activity.reviews.forEach(r => {
      const dateStr = new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const statusLabel = r.status === 'approved' ? 'Aprobada' : (r.status === 'pending' ? 'Pendiente' : 'Oculta');
      const statusClass = `status-${r.status}`;
      items.push({
        date: new Date(r.created_at),
        html: `
          <div class="activity-item">
            <div>
              💬 Opinión de <span class="activity-user">${r.author_name}</span> (${r.rating}★)
              <span class="status-badge ${statusClass}" style="margin-left: 0.5rem; font-size: 0.7rem;">${statusLabel}</span>
            </div>
            <span class="activity-date">${dateStr}</span>
          </div>
        `
      });
    });
  }

  if (activity.works) {
    activity.works.forEach(w => {
      const dateStr = new Date(w.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const statusLabel = w.status === 'hidden' ? 'Oculta' : 'Visible';
      const statusClass = w.status === 'hidden' ? 'status-hidden' : 'status-approved';
      items.push({
        date: new Date(w.created_at),
        html: `
          <div class="activity-item">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <img src="${w.image_url}" style="width: 28px; height: 28px; border-radius: 4px; object-fit: cover;">
              <span>Fotografía: <strong>${w.title}</strong></span>
              <span class="status-badge ${statusClass}" style="font-size: 0.7rem;">${statusLabel}</span>
            </div>
            <span class="activity-date">${dateStr}</span>
          </div>
        `
      });
    });
  }

  items.sort((a, b) => b.date - a.date);
  container.innerHTML = items.slice(0, 6).map(i => i.html).join('');
}

// Render Charts with Chart.js (with Vanilla Canvas Fallback if CDN unavailable)
function renderCharts(stats) {
  const ctxActivity = document.getElementById('chart-activity-trends');
  const ctxCategories = document.getElementById('chart-categories');

  try {
    if (typeof Chart !== 'undefined') {
      // 1. Activity Trends Chart
      if (ctxActivity) {
        if (adminState.charts.activity) {
          try { adminState.charts.activity.destroy(); } catch (e) {}
        }

        const period = adminState.currentChartPeriod || 'monthly';
        const trendsSource = adminState.activityTrends || stats?.activityTrends || {};
        const emptyTrend = {
          labels: ['Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre'],
          visits: [0, 0, 0, 0, 0, 0],
          whatsappContacts: [0, 0, 0, 0, 0, 0]
        };

        const currentTrend = trendsSource[period] || emptyTrend;

        adminState.charts.activity = new Chart(ctxActivity, {
          type: 'line',
          data: {
            labels: currentTrend.labels,
            datasets: [
              {
                label: 'Visitas a la Web',
                data: currentTrend.visits,
                borderColor: '#0284c7',
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'Contactos por WhatsApp / Teléfono',
                data: currentTrend.whatsappContacts,
                borderColor: '#eab308',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'top', labels: { font: { family: 'Outfit', size: 12 } } }
            },
            scales: {
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: 'Visitas' }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'Contactos' },
                grid: { drawOnChartArea: false }
              }
            }
          }
        });
      }

      // 2. Categories Doughnut Chart
      if (ctxCategories) {
        if (adminState.charts.categories) {
          try { adminState.charts.categories.destroy(); } catch (e) {}
        }

        const catData = stats?.worksByCategory || {
          electricidad: 2,
          fontaneria: 2,
          suelo_radiante: 2,
          otro: 0
        };

        adminState.charts.categories = new Chart(ctxCategories, {
          type: 'doughnut',
          data: {
            labels: ['Electricidad ⚡', 'Fontanería 💧', 'Suelo Radiante ♨️', 'Otras Instalaciones 🔧'],
            datasets: [{
              data: [
                catData.electricidad || 1,
                catData.fontaneria || 1,
                catData.suelo_radiante || 1,
                catData.otro || 0
              ],
              backgroundColor: ['#0284c7', '#38bdf8', '#f59e0b', '#64748b'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Outfit', size: 11 } } }
            }
          }
        });
      }
    } else {
      drawCanvasFallback(ctxActivity, 'Evolución de Actividad');
      drawCanvasFallback(ctxCategories, 'Distribución de Trabajos');
    }
  } catch (chartErr) {
    console.warn('Chart render fallback triggered:', chartErr);
    drawCanvasFallback(ctxActivity, 'Evolución de Actividad');
    drawCanvasFallback(ctxCategories, 'Distribución de Trabajos');
  }
}

// Interactive Period Selector for Activity Chart
window.changeChartPeriod = function(period) {
  if (!period) return;
  adminState.currentChartPeriod = period;

  // Subtitle update map for clear user feedback
  const subtitleMap = {
    weekly: 'Registro en tiempo real de visitas y contactos en los últimos 7 días',
    monthly: 'Registro en tiempo real de visitas y contactos en los últimos 6 meses',
    yearly: 'Registro anual acumulado de visitas y contactos reales'
  };

  const subtitleEl = document.getElementById('chart-activity-subtitle');
  if (subtitleEl && subtitleMap[period]) {
    subtitleEl.textContent = subtitleMap[period];
  }

  const trendsSource = adminState.activityTrends || {};
  const trendData = trendsSource[period];
  if (!trendData) return;

  if (adminState.charts.activity) {
    adminState.charts.activity.data.labels = trendData.labels;
    adminState.charts.activity.data.datasets[0].data = trendData.visits;
    adminState.charts.activity.data.datasets[1].data = trendData.whatsappContacts;
    adminState.charts.activity.update();
  } else {
    renderCharts({ activityTrends: trendsSource });
  }
};

function drawCanvasFallback(canvas, title) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = '14px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px Outfit, sans-serif';
  ctx.fillText('(Métricas cargadas en base de datos)', canvas.width / 2, canvas.height / 2 + 15);
}

/* ==========================================================================
   4. Acciones Rápidas (100% Funcionales desde el Dashboard)
   ========================================================================== */
function initQuickActions() {
  const formContact = document.getElementById('form-quick-contact');
  const btnContact = document.getElementById('btn-save-quick-contact');

  formContact?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnContact) {
      btnContact.disabled = true;
      btnContact.textContent = 'Guardando datos...';
    }

    const phone = document.getElementById('quick-phone')?.value.trim();
    const whatsapp = document.getElementById('quick-whatsapp')?.value.trim();
    const email = document.getElementById('quick-email')?.value.trim();
    const phone_raw = phone ? phone.replace(/\s+/g, '') : '';

    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, phone_raw, whatsapp, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showAdminToast('¡Datos de contacto actualizados de inmediato en la web!');
      loadSettingsTab();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      if (btnContact) {
        btnContact.disabled = false;
        btnContact.textContent = '💾 Guardar Contacto Inmediatamente';
      }
    }
  });

  const formBanner = document.getElementById('form-quick-banner');
  const btnBanner = document.getElementById('btn-save-quick-banner');

  formBanner?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnBanner) {
      btnBanner.disabled = true;
      btnBanner.textContent = 'Actualizando aviso...';
    }

    const bannerActive = document.getElementById('quick-banner-active')?.checked ? '1' : '0';
    const bannerText = document.getElementById('quick-banner-text')?.value.trim() || '';

    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banner_active: bannerActive, banner_text: bannerText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar aviso');

      showAdminToast(bannerActive === '1' ? '¡Aviso superior activado en la web!' : 'Aviso superior desactivado.');
      loadSettingsTab();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      if (btnBanner) {
        btnBanner.disabled = false;
        btnBanner.textContent = '📢 Actualizar Aviso en Portada';
      }
    }
  });
}

/* ==========================================================================
   5. Moderación de Opiniones
   ========================================================================== */
async function loadReviewsTab(statusFilter = adminState.currentReviewFilter) {
  const tbody = document.getElementById('admin-reviews-tbody');
  if (!tbody) return;

  try {
    const url = statusFilter ? `/api/reviews/all?status=${statusFilter}` : '/api/reviews/all';
    const res = await authFetch(url);
    const data = await res.json();
    adminState.reviews = data.reviews || [];

    // Update filter counts
    if (data.counts) {
      const btnAll = document.getElementById('filter-btn-all');
      const btnPending = document.getElementById('filter-btn-pending');
      const btnApproved = document.getElementById('filter-btn-approved');
      const btnHidden = document.getElementById('filter-btn-hidden');

      if (btnAll) btnAll.textContent = `Todas (${data.counts.total})`;
      if (btnPending) btnPending.textContent = `Pendientes (${data.counts.pending})`;
      if (btnApproved) btnApproved.textContent = `Aprobadas (${data.counts.approved})`;
      if (btnHidden) btnHidden.textContent = `Ocultas (${data.counts.hidden})`;
    }

    if (adminState.reviews.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 2.5rem;">No hay opiniones registradas con este filtro.</td></tr>`;
      return;
    }

    tbody.innerHTML = adminState.reviews.map(r => {
      const dateStr = new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const statusClass = `status-${r.status}`;
      const statusLabel = r.status === 'approved' ? 'Aprobada' : (r.status === 'pending' ? 'Pendiente' : 'Oculta');

      return `
        <tr>
          <td><strong>${r.author_name}</strong></td>
          <td style="color: #f59e0b; font-size: 1.1rem; white-space: nowrap;">${stars}</td>
          <td style="max-width: 340px; line-height: 1.4; color: #334155;">${r.comment}</td>
          <td style="white-space: nowrap; font-size: 0.85rem; color: #64748b;">${dateStr}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="action-btns-group">
              ${r.status !== 'approved' ? `<button type="button" class="btn-table-action btn-approve" data-action="approve" data-id="${r.id}" onclick="updateReviewStatus(${r.id}, 'approved')" title="Aprobar para que aparezca en la web">✓ Aprobar</button>` : ''}
              ${r.status !== 'hidden' ? `<button type="button" class="btn-table-action btn-hide" data-action="hide" data-id="${r.id}" onclick="updateReviewStatus(${r.id}, 'hidden')" title="Ocultar de la web sin borrar">👁️ Ocultar</button>` : ''}
              ${r.status !== 'pending' ? `<button type="button" class="btn-table-action btn-pending-action" data-action="pending" data-id="${r.id}" onclick="updateReviewStatus(${r.id}, 'pending')" title="Mover a pendientes">⏳ Pendiente</button>` : ''}
              <button type="button" class="btn-table-action btn-delete" data-action="delete" data-id="${r.id}" onclick="deleteReview(${r.id})" title="Eliminar permanentemente">🗑️ Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; padding: 2rem;">Error al cargar opiniones.</td></tr>`;
  }
}

window.filterAdminReviews = function(status, btn) {
  adminState.currentReviewFilter = status;
  document.querySelectorAll('.review-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadReviewsTab(status);
};

window.updateReviewStatus = async function(id, newStatus) {
  try {
    const res = await authFetch(`/api/reviews/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');
    const label = newStatus === 'approved' ? 'aprobada y publicada' : (newStatus === 'hidden' ? 'ocultada' : 'movida a pendientes');
    showAdminToast(`Opinión #${id} ${label}`);
    await loadReviewsTab(adminState.currentReviewFilter);
    await loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message || 'Error al actualizar opinión', true);
  }
};

window.deleteReview = async function(id) {
  if (!confirm(`¿Eliminar definitivamente la opinión #${id}? Esta acción no se puede deshacer.`)) return;
  try {
    const res = await authFetch(`/api/reviews/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar');
    showAdminToast('Opinión eliminada de la base de datos');
    await loadReviewsTab(adminState.currentReviewFilter);
    await loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message || 'Error al eliminar opinión', true);
  }
};

/* ==========================================================================
   6. Publicaciones / Galería de Obras (Aprobar, Ocultar, Editar, Eliminar)
   ========================================================================== */
function initDropzone() {
  const dropzone = document.getElementById('gallery-dropzone');
  const fileInput = document.getElementById('gallery-file-input');
  const previewImg = document.getElementById('gallery-preview-thumb');
  const fileInfo = document.getElementById('gallery-file-chosen-info');
  const fileNameEl = document.getElementById('chosen-filename');
  const fileSizeEl = document.getElementById('chosen-filesize');

  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleSelectedFile(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleSelectedFile(fileInput.files[0]);
    }
  });

  function handleSelectedFile(file) {
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (fileInfo) fileInfo.style.display = 'inline-block';

    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
}

async function loadGalleryTab(statusFilter = adminState.currentGalleryFilter) {
  const tbody = document.getElementById('admin-gallery-tbody');
  if (!tbody) return;

  try {
    const url = statusFilter ? `/api/gallery/all?status=${statusFilter}` : '/api/gallery/all';
    const res = await authFetch(url);
    const data = await res.json();
    adminState.gallery = data.gallery || [];

    if (adminState.gallery.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 2.5rem;">No hay publicaciones en la galería con este filtro.</td></tr>`;
      return;
    }

    const catLabels = {
      electricidad: '⚡ Electricidad',
      fontaneria: '💧 Fontanería',
      suelo_radiante: '♨️ Suelo Radiante',
      climatizacion: '❄️ Climatización',
      reformas: '🏠 Reformas',
      otro: '🔧 Instalaciones'
    };

    tbody.innerHTML = adminState.gallery.map(item => {
      const catText = catLabels[item.category] || item.category;
      const isVisible = item.status !== 'hidden';
      const statusLabel = isVisible ? 'Visible' : 'Oculta';
      const statusClass = isVisible ? 'status-approved' : 'status-hidden';

      return `
        <tr>
          <td><img src="${item.image_url}" class="table-img-thumb" alt="${item.title}"></td>
          <td><strong>${item.title}</strong></td>
          <td><span class="status-badge" style="background:#e0f2fe; color:#0369a1;">${catText}</span></td>
          <td style="max-width: 260px; font-size: 0.85rem; color: #64748b;">${item.description || '-'}</td>
          <td>${item.display_order}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="action-btns-group">
              ${item.status === 'hidden'
                ? `<button type="button" class="btn-table-action btn-approve" data-action="approve" data-id="${item.id}" onclick="updateGalleryStatus(${item.id}, 'approved')" title="Mostrar en la web">✓ Mostrar</button>`
                : `<button type="button" class="btn-table-action btn-hide" data-action="hide" data-id="${item.id}" onclick="updateGalleryStatus(${item.id}, 'hidden')" title="Ocultar sin borrar">👁️ Ocultar</button>`
              }
              <button type="button" class="btn-table-action btn-edit" data-action="edit" data-id="${item.id}" onclick="openEditGalleryModal(${item.id})" title="Editar título, descripción u orden">✏️ Editar</button>
              <button type="button" class="btn-table-action btn-delete" data-action="delete" data-id="${item.id}" onclick="deleteGalleryItem(${item.id})" title="Eliminar definitivamente">🗑️ Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 2rem;">Error al cargar trabajos de la galería.</td></tr>`;
  }
}

window.filterAdminGallery = function(status, btn) {
  adminState.currentGalleryFilter = status;
  document.querySelectorAll('.filter-gallery-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadGalleryTab(status);
};

function initGalleryForm() {
  const form = document.getElementById('form-add-gallery');
  const fileInput = document.getElementById('gallery-file-input');
  const previewImg = document.getElementById('gallery-preview-thumb');
  const fileInfo = document.getElementById('gallery-file-chosen-info');
  const submitBtn = document.getElementById('btn-submit-gallery');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!fileInput.files[0]) {
      alert('Por favor, selecciona una imagen para subir.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Subiendo y guardando fotografía...';

    const formData = new FormData(form);

    try {
      const res = await authFetch('/api/gallery', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir trabajo');

      showAdminToast('¡Fotografía publicada con éxito en la galería!');
      form.reset();
      if (previewImg) previewImg.style.display = 'none';
      if (fileInfo) fileInfo.style.display = 'none';
      loadGalleryTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publicar Fotografía';
    }
  });
}

window.updateGalleryStatus = async function(id, newStatus) {
  try {
    const res = await authFetch(`/api/gallery/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Error al actualizar publicación');
    const label = newStatus === 'approved' ? 'visible y aprobada' : 'oculta de la web';
    showAdminToast(`Publicación marcada como ${label}`);
    loadGalleryTab(adminState.currentGalleryFilter);
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

window.deleteGalleryItem = async function(id) {
  if (!confirm('¿Seguro que deseas eliminar definitivamente esta fotografía de la galería?')) return;
  try {
    const res = await authFetch(`/api/gallery/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showAdminToast('Fotografía eliminada correctamente');
    loadGalleryTab(adminState.currentGalleryFilter);
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

/* ==========================================================================
   7. Gestión de Servicios (Guardado Permanente y Edición)
   ========================================================================== */
async function loadServicesTab() {
  const tbody = document.getElementById('admin-services-tbody');
  if (!tbody) return;

  try {
    const res = await authFetch('/api/services/all');
    const data = await res.json();
    adminState.services = data.services || [];

    if (adminState.services.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 2.5rem;">No hay servicios configurados.</td></tr>`;
      return;
    }

    const iconSymbols = {
      zap: '⚡ Rayo',
      droplet: '💧 Gota',
      flame: '♨️ Fuego',
      wrench: '🔧 Herramienta',
      shield: '🛡️ Escudo',
      home: '🏠 Casa'
    };

    tbody.innerHTML = adminState.services.map(srv => {
      const activeLabel = srv.is_active ? 'Activo' : 'Desactivado';
      const activeClass = srv.is_active ? 'status-approved' : 'status-hidden';
      const iconText = iconSymbols[srv.icon] || '🔧';

      return `
        <tr>
          <td><span style="font-size: 1.25rem;">${iconText}</span></td>
          <td><strong>${srv.title}</strong></td>
          <td><span class="status-badge" style="background:#f1f5f9; color:#334155;">${srv.category}</span></td>
          <td style="max-width: 300px; font-size: 0.85rem; color: #64748b;">${srv.description}</td>
          <td>${srv.display_order}</td>
          <td><span class="status-badge ${activeClass}">${activeLabel}</span></td>
          <td>
            <div class="action-btns-group">
              <button type="button" class="btn-table-action ${srv.is_active ? 'btn-hide' : 'btn-approve'}" data-action="toggle-active" data-id="${srv.id}" data-newstate="${srv.is_active ? 0 : 1}" onclick="toggleServiceActive(${srv.id}, ${srv.is_active ? 0 : 1})" title="${srv.is_active ? 'Ocultar servicio' : 'Activar servicio'}">
                ${srv.is_active ? 'Ocultar' : 'Activar'}
              </button>
              <button type="button" class="btn-table-action btn-edit" data-action="edit" data-id="${srv.id}" onclick="openEditServiceModal(${srv.id})" title="Modificar texto o categoría">
                ✏️ Editar
              </button>
              <button type="button" class="btn-table-action btn-delete" data-action="delete" data-id="${srv.id}" onclick="deleteService(${srv.id})" title="Eliminar servicio">
                🗑️ Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 2rem;">Error al cargar servicios.</td></tr>`;
  }
}

function initServicesForm() {
  const form = document.getElementById('form-add-service');
  const btn = document.getElementById('btn-submit-service');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando permanentemente...';
    }

    const title = form.title.value.trim();
    const category = form.category.value;
    const description = form.description.value.trim();
    const icon = form.icon.value;
    const display_order = parseInt(form.display_order.value, 10) || 0;

    try {
      const res = await authFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, icon, display_order, is_active: 1 })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear servicio');

      showAdminToast('¡Servicio añadido y guardado para siempre en la base de datos!');
      form.reset();
      loadServicesTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Guardar Servicio';
      }
    }
  });
}

window.toggleServiceActive = async function(id, newState) {
  try {
    const res = await authFetch(`/api/services/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newState })
    });
    if (!res.ok) throw new Error('Error al actualizar servicio');
    showAdminToast(`Servicio ${newState ? 'activado en la web' : 'desactivado/ocultado'}`);
    loadServicesTab();
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

window.deleteService = async function(id) {
  if (!confirm('¿Seguro que deseas eliminar definitivamente este servicio?')) return;
  try {
    const res = await authFetch(`/api/services/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showAdminToast('Servicio eliminado permanentemente');
    loadServicesTab();
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

/* ==========================================================================
   8. Personalización Completa y Configuración
   ========================================================================== */
async function loadSettingsTab() {
  try {
    const res = await authFetch('/api/settings');
    const { settings } = await res.json();
    adminState.settings = settings || {};

    const form = document.getElementById('form-settings');
    if (!form) return;

    for (const [k, v] of Object.entries(settings)) {
      if (form.elements[k]) {
        if (form.elements[k].type === 'checkbox') {
          form.elements[k].checked = v === '1';
        } else {
          form.elements[k].value = v;
        }
      }
    }

    // Populate quick actions inputs as well
    const qPhone = document.getElementById('quick-phone');
    const qWa = document.getElementById('quick-whatsapp');
    const qEmail = document.getElementById('quick-email');
    const qBannerActive = document.getElementById('quick-banner-active');
    const qBannerText = document.getElementById('quick-banner-text');

    if (qPhone && settings.phone) qPhone.value = settings.phone;
    if (qWa && settings.whatsapp) qWa.value = settings.whatsapp;
    if (qEmail && settings.email) qEmail.value = settings.email;
    if (qBannerActive) qBannerActive.checked = settings.banner_active === '1';
    if (qBannerText && settings.banner_text) qBannerText.value = settings.banner_text;

  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function initSettingsForm() {
  const form = document.getElementById('form-settings');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando cambios...';
    }

    const payload = {};
    const elements = form.elements;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.name) {
        if (el.type === 'checkbox') {
          payload[el.name] = el.checked ? '1' : '0';
        } else {
          payload[el.name] = (el.value !== undefined && el.value !== null ? String(el.value) : '').trim();
        }
      }
    }

    // Compute raw phone automatically
    if (payload.phone && !payload.phone_raw) {
      payload.phone_raw = payload.phone.replace(/\s+/g, '');
    }

    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showAdminToast('¡Toda la configuración de la web ha sido actualizada y guardada con éxito!');
      loadSettingsTab();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Guardar Todos los Cambios de Personalización';
      }
    }
  });
}

/* ==========================================================================
   9. Seguridad y Cambio de Contraseña
   ========================================================================== */
function initSecurityForm() {
  const form = document.getElementById('form-security');
  const alertEl = document.getElementById('security-alert');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const confirmPassword = form.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      if (alertEl) {
        alertEl.textContent = 'Las contraseñas nuevas no coinciden.';
        alertEl.className = 'alert alert-error';
        alertEl.style.display = 'block';
      }
      return;
    }

    if (newPassword.length < 8) {
      if (alertEl) {
        alertEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
        alertEl.className = 'alert alert-error';
        alertEl.style.display = 'block';
      }
      return;
    }

    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar contraseña');

      if (alertEl) {
        alertEl.textContent = '¡Contraseña cambiada con éxito!';
        alertEl.className = 'alert alert-success';
        alertEl.style.display = 'block';
      }
      form.reset();
      showAdminToast('Contraseña de administrador actualizada con éxito');
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message;
        alertEl.className = 'alert alert-error';
        alertEl.style.display = 'block';
      }
    }
  });
}

/* ==========================================================================
   10. Modals: Edit Gallery, Edit Service, Add Manual Review
   ========================================================================== */
function initModals() {
  // 1. Edit Gallery Form
  const formEditGallery = document.getElementById('form-edit-gallery');
  formEditGallery?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-gallery-id')?.value;
    if (!id) return;

    const formData = new FormData(formEditGallery);

    try {
      const res = await authFetch(`/api/gallery/${id}`, {
        method: 'PUT',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');

      showAdminToast('Publicación actualizada correctamente');
      closeEditGalleryModal();
      loadGalleryTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });

  // 2. Edit Service Form
  const formEditService = document.getElementById('form-edit-service');
  formEditService?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-service-id')?.value;
    if (!id) return;

    const title = document.getElementById('edit-service-title')?.value.trim();
    const category = document.getElementById('edit-service-category')?.value;
    const description = document.getElementById('edit-service-description')?.value.trim();
    const icon = document.getElementById('edit-service-icon')?.value;
    const display_order = parseInt(document.getElementById('edit-service-order')?.value, 10) || 0;
    const is_active = parseInt(document.getElementById('edit-service-active')?.value, 10) || 1;

    try {
      const res = await authFetch(`/api/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, icon, display_order, is_active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar servicio');

      showAdminToast('Servicio actualizado correctamente');
      closeEditServiceModal();
      loadServicesTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });

  // 3. Add Manual Review Form
  const formManualReview = document.getElementById('form-manual-review');
  formManualReview?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author_name = formManualReview.author_name.value.trim();
    const rating = formManualReview.rating.value;
    const comment = formManualReview.comment.value.trim();
    const status = formManualReview.status.value;

    try {
      const res = await authFetch('/api/reviews/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name, rating, comment, status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar opinión');

      showAdminToast('¡Opinión registrada y guardada con éxito!');
      formManualReview.reset();
      closeAddReviewModal();
      loadReviewsTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });
}

// Modal Open & Close Functions
window.openEditGalleryModal = function(id) {
  const item = adminState.gallery.find(g => g.id === Number(id));
  if (!item) return;

  document.getElementById('edit-gallery-id').value = item.id;
  document.getElementById('edit-gallery-title').value = item.title;
  document.getElementById('edit-gallery-category').value = item.category;
  document.getElementById('edit-gallery-status').value = item.status || 'approved';
  document.getElementById('edit-gallery-desc').value = item.description || '';
  document.getElementById('edit-gallery-order').value = item.display_order || 0;
  document.getElementById('edit-gallery-current-img').src = item.image_url;

  document.getElementById('modal-edit-gallery').style.display = 'flex';
};

window.closeEditGalleryModal = function() {
  document.getElementById('modal-edit-gallery').style.display = 'none';
};

window.openEditServiceModal = function(id) {
  const item = adminState.services.find(s => s.id === Number(id));
  if (!item) return;

  document.getElementById('edit-service-id').value = item.id;
  document.getElementById('edit-service-title').value = item.title;
  document.getElementById('edit-service-category').value = item.category;
  document.getElementById('edit-service-description').value = item.description;
  document.getElementById('edit-service-icon').value = item.icon || 'wrench';
  document.getElementById('edit-service-order').value = item.display_order || 0;
  document.getElementById('edit-service-active').value = item.is_active ? '1' : '0';

  document.getElementById('modal-edit-service').style.display = 'flex';
};

window.closeEditServiceModal = function() {
  document.getElementById('modal-edit-service').style.display = 'none';
};

window.openAddReviewModal = function() {
  document.getElementById('modal-add-review').style.display = 'flex';
};

window.closeAddReviewModal = function() {
  document.getElementById('modal-add-review').style.display = 'none';
};

window.openAddGalleryModal = function() {
  switchTab('galeria');
  setTimeout(() => {
    document.getElementById('card-add-gallery')?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};

window.openAddServiceModal = function() {
  switchTab('servicios');
  setTimeout(() => {
    document.getElementById('form-add-service')?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};
