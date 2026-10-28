/**
 * Sani Instalaciones - Admin Panel Controller
 */

// State
const adminState = {
  authenticated: false,
  username: '',
  activeTab: 'dashboard',
  reviews: [],
  services: [],
  gallery: [],
  settings: {}
};

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  initLoginForm();
  initTabNavigation();
  initGalleryForm();
  initServicesForm();
  initSettingsForm();
  initSecurityForm();
});

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
  }, 3500);
}

/* ==========================================================================
   1. Authentication & Session
   ========================================================================== */
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      adminState.authenticated = true;
      adminState.username = data.username;
      showAdminLayout();
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('admin-login-wrapper').style.display = 'flex';
  document.getElementById('admin-layout').classList.remove('active');
}

function showAdminLayout() {
  document.getElementById('admin-login-wrapper').style.display = 'none';
  const layout = document.getElementById('admin-layout');
  layout.classList.add('active');

  const usernameEl = document.getElementById('admin-display-username');
  if (usernameEl) usernameEl.textContent = adminState.username;

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
    alertEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';

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
      showAdminLayout();
      showAdminToast('¡Bienvenido al panel de administración!');
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Acceder al Panel';
    }
  });

  // Logout button
  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    adminState.authenticated = false;
    showLoginView();
    showAdminToast('Sesión cerrada');
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
      switchTab(tabId);
    });
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
};

/* ==========================================================================
   3. Dashboard Stats
   ========================================================================== */
async function loadDashboardStats() {
  try {
    const res = await fetch('/api/settings/stats');
    if (!res.ok) return;
    const { stats } = await res.json();

    document.getElementById('stat-pending-reviews').textContent = stats.pendingReviews;
    document.getElementById('stat-total-reviews').textContent = stats.totalReviews;
    document.getElementById('stat-total-works').textContent = stats.totalWorks;
    document.getElementById('stat-active-services').textContent = stats.activeServices;

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
  } catch (err) {
    console.error('Error loading admin stats:', err);
  }
}

/* ==========================================================================
   4. Reviews Moderation Tab
   ========================================================================== */
adminState.currentReviewFilter = '';

async function loadReviewsTab(statusFilter = adminState.currentReviewFilter) {
  const tbody = document.getElementById('admin-reviews-tbody');
  if (!tbody) return;

  try {
    const url = statusFilter ? `/api/reviews/all?status=${statusFilter}` : '/api/reviews/all';
    const res = await fetch(url);
    const data = await res.json();
    adminState.reviews = data.reviews || [];

    // Update filter counts badges on buttons if provided
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
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay opiniones registradas con este filtro.</td></tr>`;
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
          <td style="max-width: 320px; line-height: 1.4;">${r.comment}</td>
          <td style="white-space: nowrap; font-size: 0.85rem; color: #64748b;">${dateStr}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="action-btns-group">
              ${r.status !== 'approved' ? `<button class="btn-table-action btn-approve" onclick="updateReviewStatus(${r.id}, 'approved')">Aprobar</button>` : ''}
              ${r.status !== 'hidden' ? `<button class="btn-table-action btn-hide" onclick="updateReviewStatus(${r.id}, 'hidden')">Ocultar</button>` : ''}
              <button class="btn-table-action btn-delete" onclick="deleteReview(${r.id})">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error al cargar opiniones.</td></tr>`;
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
    const res = await fetch(`/api/reviews/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Error al actualizar estado');
    const label = newStatus === 'approved' ? 'aprobada' : (newStatus === 'hidden' ? 'oculta' : 'pendiente');
    showAdminToast(`Opinión marcada como ${label}`);
    loadReviewsTab(adminState.currentReviewFilter);
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

window.deleteReview = async function(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta opinión permanentemente?')) return;
  try {
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showAdminToast('Opinión eliminada');
    loadReviewsTab(adminState.currentReviewFilter);
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

/* ==========================================================================
   5. Gallery Works Tab
   ========================================================================== */
async function loadGalleryTab() {
  const tbody = document.getElementById('admin-gallery-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/gallery');
    const data = await res.json();
    adminState.gallery = data.gallery || [];

    if (adminState.gallery.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay fotografías publicadas todavía.</td></tr>`;
      return;
    }

    const catLabels = {
      electricidad: '⚡ Electricidad',
      fontaneria: '💧 Fontanería',
      suelo_radiante: '♨️ Suelo Radiante',
      otro: 'Instalaciones'
    };

    tbody.innerHTML = adminState.gallery.map(item => {
      const catText = catLabels[item.category] || item.category;
      return `
        <tr>
          <td><img src="${item.image_url}" class="table-img-thumb" alt="${item.title}"></td>
          <td><strong>${item.title}</strong></td>
          <td><span class="status-badge" style="background:#e0f2fe; color:#0369a1;">${catText}</span></td>
          <td style="max-width: 250px; font-size: 0.85rem; color: #64748b;">${item.description || '-'}</td>
          <td>${item.display_order}</td>
          <td>
            <div class="action-btns-group">
              <button class="btn-table-action btn-delete" onclick="deleteGalleryItem(${item.id})">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error al cargar galería.</td></tr>`;
  }
}

function initGalleryForm() {
  const form = document.getElementById('form-add-gallery');
  const fileInput = document.getElementById('gallery-file-input');
  const previewImg = document.getElementById('gallery-preview-thumb');
  const submitBtn = document.getElementById('btn-submit-gallery');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files[0]) {
      alert('Debes seleccionar una imagen para subir.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Subiendo imagen...';

    const formData = new FormData(form);

    try {
      const res = await fetch('/api/gallery', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir trabajo');

      showAdminToast('¡Fotografía añadida a la galería con éxito!');
      form.reset();
      previewImg.style.display = 'none';
      loadGalleryTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publicar en la Galería';
    }
  });
}

window.deleteGalleryItem = async function(id) {
  if (!confirm('¿Eliminar esta fotografía de la galería?')) return;
  try {
    const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showAdminToast('Fotografía eliminada');
    loadGalleryTab();
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

/* ==========================================================================
   6. Services Tab
   ========================================================================== */
async function loadServicesTab() {
  const tbody = document.getElementById('admin-services-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/services/all');
    const data = await res.json();
    adminState.services = data.services || [];

    tbody.innerHTML = adminState.services.map(srv => {
      const activeLabel = srv.is_active ? 'Activo' : 'Inactivo';
      const activeClass = srv.is_active ? 'status-approved' : 'status-hidden';

      return `
        <tr>
          <td><strong>${srv.title}</strong></td>
          <td>${srv.category}</td>
          <td style="max-width: 280px; font-size: 0.85rem; color: #64748b;">${srv.description}</td>
          <td>${srv.display_order}</td>
          <td><span class="status-badge ${activeClass}">${activeLabel}</span></td>
          <td>
            <div class="action-btns-group">
              <button class="btn-table-action ${srv.is_active ? 'btn-hide' : 'btn-approve'}" onclick="toggleServiceActive(${srv.id}, ${srv.is_active ? 0 : 1})">
                ${srv.is_active ? 'Desactivar' : 'Activar'}
              </button>
              <button class="btn-table-action btn-delete" onclick="deleteService(${srv.id})">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error al cargar servicios.</td></tr>`;
  }
}

function initServicesForm() {
  const form = document.getElementById('form-add-service');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const category = form.category.value;
    const description = form.description.value.trim();
    const icon = form.icon.value;
    const display_order = parseInt(form.display_order.value, 10) || 0;

    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, icon, display_order, is_active: 1 })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear servicio');

      showAdminToast('Servicio añadido con éxito');
      form.reset();
      loadServicesTab();
      loadDashboardStats();
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });
}

window.toggleServiceActive = async function(id, newState) {
  const service = adminState.services.find(s => s.id === id);
  if (!service) return;

  try {
    const res = await fetch(`/api/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: service.title,
        category: service.category,
        description: service.description,
        icon: service.icon,
        display_order: service.display_order,
        is_active: newState
      })
    });
    if (!res.ok) throw new Error('Error al actualizar servicio');
    showAdminToast(`Servicio ${newState ? 'activado' : 'desactivado'}`);
    loadServicesTab();
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

window.deleteService = async function(id) {
  if (!confirm('¿Seguro que deseas eliminar este servicio?')) return;
  try {
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showAdminToast('Servicio eliminado');
    loadServicesTab();
    loadDashboardStats();
  } catch (err) {
    showAdminToast(err.message, true);
  }
};

/* ==========================================================================
   7. Content & Settings Tab
   ========================================================================== */
async function loadSettingsTab() {
  try {
    const res = await fetch('/api/settings');
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
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function initSettingsForm() {
  const form = document.getElementById('form-settings');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const payload = {};
    const elements = form.elements;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.name) {
        if (el.type === 'checkbox') {
          payload[el.name] = el.checked ? '1' : '0';
        } else {
          payload[el.name] = el.value.trim();
        }
      }
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showAdminToast('¡Configuración actualizada y guardada con éxito!');
    } catch (err) {
      showAdminToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar Cambios';
    }
  });
}

/* ==========================================================================
   8. Security & Password Change
   ========================================================================== */
function initSecurityForm() {
  const form = document.getElementById('form-security');
  const alertEl = document.getElementById('security-alert');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.style.display = 'none';

    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const confirmPassword = form.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      alertEl.textContent = 'Las contraseñas nuevas no coinciden.';
      alertEl.className = 'alert alert-error';
      alertEl.style.display = 'block';
      return;
    }

    if (newPassword.length < 8) {
      alertEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
      alertEl.className = 'alert alert-error';
      alertEl.style.display = 'block';
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar contraseña');

      alertEl.textContent = '¡Contraseña cambiada con éxito!';
      alertEl.className = 'alert alert-success';
      alertEl.style.display = 'block';
      form.reset();
      showAdminToast('Contraseña de administrador actualizada');
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.className = 'alert alert-error';
      alertEl.style.display = 'block';
    }
  });
}
