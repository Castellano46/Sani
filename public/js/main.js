/**
 * Sani Instalaciones - Main Client-Side Application
 * Jamilena (Jaén) - Electricidad, Fontanería y Suelo Radiante
 */

// Application Global State
const appState = {
  settings: {},
  services: [],
  allGallery: [],
  filteredGallery: [],
  currentCategory: 'todos',
  activeLightboxIndex: 0,
  whatsappContact: {
    reason: 'Presupuesto General',
    features: new Set(['Presupuesto detallado']),
    customMessage: ''
  },
  whatsappModal: {
    reason: 'Presupuesto General',
    userName: '',
    location: 'Jamilena',
    features: new Set(['Presupuesto detallado']),
    customMessage: ''
  }
};

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initStickyHeader();
  initWhatsAppBuilder();
  initWhatsAppModal();
  initGallerySystem();
  initReviewsSystem();
  initCopyPhone();
  initCookieBanner();

  // Load backend data
  loadSettings();
  loadServices();
  loadGallery();
  loadReviews();

  // Check if a review was recently submitted by this user in this browser
  checkRecentSubmittedReview();
});

// Toast notification helper
function showToast(message, duration = 3200) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/* ==========================================================================
   1. Header, Navigation & Mobile Drawer
   ========================================================================== */
function initMobileNav() {
  const toggleBtn = document.getElementById('nav-toggle-btn');
  const drawer = document.getElementById('mobile-drawer');
  const links = document.querySelectorAll('.mobile-nav-link');

  if (!toggleBtn || !drawer) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      drawer.classList.add('open');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
  });

  links.forEach(link => {
    link.addEventListener('click', () => {
      drawer.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

function initStickyHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

/* ==========================================================================
   2. Data Loading & DOM Population
   ========================================================================== */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Error al cargar configuración');
    const data = await res.json();
    appState.settings = data.settings || {};
    applySettingsToDOM(appState.settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

function applySettingsToDOM(settings) {
  const phone = settings.phone || '671 72 80 43';
  const phoneRaw = settings.phone_raw || '671728043';

  // Apply custom brand colors if configured
  if (settings.primary_color) {
    document.documentElement.style.setProperty('--color-brand-blue', settings.primary_color);
  }
  if (settings.accent_color) {
    document.documentElement.style.setProperty('--color-accent-yellow', settings.accent_color);
  }

  // Apply phone numbers to buttons and tel: links
  document.querySelectorAll('.phone-val').forEach(el => el.textContent = phone);
  document.querySelectorAll('.phone-tel-link').forEach(el => el.href = `tel:${phoneRaw}`);

  // Apply location strings
  document.querySelectorAll('.location-val').forEach(el => {
    el.textContent = settings.address || 'Recinto Ferial, Jamilena, Jaén (España)';
  });

  // Apply schedule notice if configured
  if (settings.schedule_notice) {
    document.querySelectorAll('.schedule-val').forEach(el => el.textContent = settings.schedule_notice);
  }

  // Dynamic Map update if coordinates provided
  if (settings.map_lat && settings.map_lng) {
    const mapIframe = document.querySelector('#map-view iframe');
    if (mapIframe) {
      const lat = parseFloat(settings.map_lat);
      const lng = parseFloat(settings.map_lng);
      const bbox = `${(lng - 0.004).toFixed(4)}%2C${(lat - 0.0025).toFixed(4)}%2C${(lng + 0.004).toFixed(4)}%2C${(lat + 0.0025).toFixed(4)}`;
      mapIframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
    }
  }

  // Hero title, subtitle and badge if customized
  if (settings.hero_badge) {
    const heroBadgeEl = document.querySelector('.hero-badge-pill');
    if (heroBadgeEl) heroBadgeEl.textContent = settings.hero_badge;
  }
  if (settings.hero_title) {
    const heroTitleEl = document.getElementById('hero-title-text');
    if (heroTitleEl) heroTitleEl.innerHTML = formatHeroTitle(settings.hero_title);
  }
  if (settings.hero_subtitle) {
    const heroSubEl = document.getElementById('hero-subtitle-text');
    if (heroSubEl) heroSubEl.textContent = settings.hero_subtitle;
  }
  if (settings.about_intro) {
    const aboutIntroEl = document.getElementById('about-intro-text');
    if (aboutIntroEl) aboutIntroEl.textContent = settings.about_intro;
  }
  if (settings.about_text) {
    const aboutBodyEl = document.getElementById('about-body-text');
    if (aboutBodyEl) aboutBodyEl.textContent = settings.about_text;
  }

  // Announcement / Emergency Banner
  if (settings.banner_active === '1' && settings.banner_text) {
    let banner = document.getElementById('site-urgent-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'site-urgent-banner';
      banner.className = 'urgent-announcement-banner';
      document.body.prepend(banner);
    }
    banner.innerHTML = `<span style="margin-right: 0.5rem;">🔔</span> ${settings.banner_text}`;
    banner.style.display = 'block';
  } else {
    const banner = document.getElementById('site-urgent-banner');
    if (banner) banner.style.display = 'none';
  }

  // Email contact card
  const emailValEl = document.getElementById('email-address-text');
  const emailBtn = document.getElementById('email-action-btn');
  if (settings.email && settings.email.trim()) {
    if (emailValEl) emailValEl.textContent = settings.email;
    if (emailBtn) {
      emailBtn.href = `mailto:${settings.email}?subject=Consulta%20desde%20la%20web%20-%20Sani%20Instalaciones`;
    }
  }

  // Social Links
  const socialBar = document.getElementById('social-icons-container');
  if (socialBar) {
    let socialHtml = '';
    if (settings.social_facebook_active === '1' && settings.social_facebook) {
      socialHtml += `<a href="${settings.social_facebook}" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="Facebook">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>
      </a>`;
    }
    if (settings.social_instagram_active === '1' && settings.social_instagram) {
      socialHtml += `<a href="${settings.social_instagram}" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="Instagram">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
      </a>`;
    }
    socialBar.innerHTML = socialHtml;
  }
}

function formatHeroTitle(title) {
  return title
    .replace('Garantía', '<span class="highlight-electric">Garantía</span>')
    .replace('Cercanía', '<span class="highlight-warm">Cercanía</span>')
    .replace('Instalaciones', '<span class="highlight-electric">Instalaciones</span>');
}

/* ==========================================================================
   3. Services Section
   ========================================================================== */
async function loadServices() {
  const container = document.getElementById('services-grid-container');
  if (!container) return;

  try {
    const res = await fetch('/api/services');
    if (!res.ok) throw new Error('Error al cargar servicios');
    const data = await res.json();
    appState.services = data.services || [];
    renderServices(appState.services, container);
  } catch (err) {
    console.error('Error fetching services:', err);
  }
}

function renderServices(services, container) {
  if (!services || services.length === 0) return;

  const icons = {
    zap: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    droplet: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`,
    flame: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
    wrench: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
    shield: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    home: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
  };

  const featureHighlights = {
    electricidad: [
      'Cuadros de protección y cableado homologado',
      'Iluminación LED de bajo consumo y mecanismos',
      'Boletines oficiales y adecuación a normativa'
    ],
    fontaneria: [
      'Redes de distribución de agua fría y caliente sanitaria',
      'Tuberías de cobre y multicapa de alta resistencia',
      'Montaje de sanitarios, grifería y solución de fugas'
    ],
    suelo_radiante: [
      'Calor uniforme y máximo confort en toda la vivienda',
      'Placas de aislamiento térmico de alta densidad',
      'Regulación digital independiente por estancias'
    ],
    climatizacion: [
      'Sistemas de climatización de alta eficiencia',
      'Instalación técnica certificada y purga',
      'Ahorro en factura energética y máximo confort'
    ],
    reformas: [
      'Instalaciones completas para cocina y baños',
      'Coordinación de trabajos y limpieza rigurosa',
      'Garantía total de materiales y mano de obra'
    ],
    otro: [
      'Asesoramiento técnico personalizado',
      'Materiales certificados con marcado CE',
      'Presupuesto claro sin costes ocultos'
    ]
  };

  const categoryPills = {
    electricidad: '⚡ Alta Demanda · Obra y Reforma',
    fontaneria: '💧 Redes Homologadas & Averías',
    suelo_radiante: '♨️ Confort Térmico & Ahorro',
    climatizacion: '❄️ Climatización Eficiente',
    reformas: '🏠 Reformas Integrales',
    otro: '🔧 Instalación Profesional'
  };

  container.innerHTML = services.map(srv => {
    const iconSvg = icons[srv.icon] || icons.wrench;
    const catClass = `service-card-${srv.category || 'otro'}`;
    const highlights = featureHighlights[srv.category] || featureHighlights.otro;
    const badgeText = categoryPills[srv.category] || categoryPills.otro;

    const highlightsHtml = highlights.map(item => `
      <div class="service-feature-row">
        <span class="feature-bullet">✓</span>
        <span>${item}</span>
      </div>
    `).join('');

    return `
      <article class="service-card ${catClass}">
        <span class="service-badge-pill">${badgeText}</span>
        <div class="service-icon-box">
          ${iconSvg}
        </div>
        <h3 class="service-title">${srv.title}</h3>
        <p class="service-description">${srv.description}</p>
        
        <div class="service-features-list">
          ${highlightsHtml}
        </div>

        <div class="service-footer">
          <button type="button" class="btn service-btn btn-service-quote" data-service="${escapeJsString(srv.title)}">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            Pedir Presupuesto por WhatsApp
          </button>
        </div>
      </article>
    `;
  }).join('');

  // Attach click listeners to all service quote buttons
  container.querySelectorAll('.btn-service-quote').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const srvTitle = btn.getAttribute('data-service') || 'Presupuesto General';
      openWhatsAppModal(srvTitle);
    });
  });
}

/* ==========================================================================
   4. Gallery System & Lightbox (Instant Click & Functional Category Filters)
   ========================================================================== */
async function loadGallery() {
  const container = document.getElementById('gallery-grid-container');
  if (!container) return;

  try {
    const res = await fetch('/api/gallery');
    if (!res.ok) throw new Error('Error al cargar la galería');
    const data = await res.json();
    appState.allGallery = data.gallery || [];
    applyGalleryFilter(appState.currentCategory);
  } catch (err) {
    console.error('Error fetching gallery:', err);
  }
}

function applyGalleryFilter(category) {
  appState.currentCategory = category;
  const container = document.getElementById('gallery-grid-container');
  if (!container) return;

  if (category === 'todos') {
    appState.filteredGallery = [...appState.allGallery];
  } else {
    appState.filteredGallery = appState.allGallery.filter(item => item.category === category);
  }

  renderGallery(appState.filteredGallery, container);
}

function renderGallery(items, container) {
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; color: var(--color-text-muted);">
        <p style="font-size: 1.1rem; font-weight: 600;">No hay fotografías disponibles en esta categoría.</p>
        <button type="button" class="btn btn-outline-dark btn-sm" style="margin-top: 1rem;" onclick="setGalleryFilter('todos')">
          Ver todos los trabajos
        </button>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    electricidad: '⚡ Electricidad',
    fontaneria: '💧 Fontanería',
    suelo_radiante: '♨️ Suelo Radiante',
    otro: 'Instalaciones'
  };

  container.innerHTML = items.map((item, idx) => {
    const catLabel = categoryLabels[item.category] || 'Instalaciones';
    const catClass = `cat-${item.category || 'otro'}`;

    return `
      <article class="gallery-card" data-gallery-index="${idx}" tabindex="0" role="button" aria-label="Ver fotografía ampliada: ${item.title}">
        <div class="gallery-img-wrap">
          <img src="${item.image_url}" alt="${item.title}" loading="lazy" />
          <div class="gallery-overlay">
            <div class="gallery-zoom-icon" title="Ampliar imagen">
              🔍
            </div>
          </div>
        </div>
        <div class="gallery-info">
          <span class="gallery-category-pill ${catClass}">${catLabel}</span>
          <h4 class="gallery-title">${item.title}</h4>
          ${item.description ? `<p class="gallery-desc">${item.description}</p>` : ''}
          <div class="gallery-view-prompt">
            <span>Ver fotografía ampliada</span> →
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach direct click & keyboard events for opening each photo directly
  container.querySelectorAll('.gallery-card').forEach(card => {
    const idx = parseInt(card.getAttribute('data-gallery-index') || '0', 10);
    
    card.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(idx);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(idx);
      }
    });
  });
}

function initGallerySystem() {
  // 1. Filter Buttons Event Binding
  const filterButtons = document.querySelectorAll('#gallery-filters-bar .filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const cat = btn.getAttribute('data-category') || 'todos';
      applyGalleryFilter(cat);
    });
  });

  // 2. Lightbox Navigation & Controls Binding
  const modal = document.getElementById('lightbox-modal');
  const closeBtn = document.getElementById('lightbox-close-btn');
  const prevBtn = document.getElementById('lightbox-prev-btn');
  const nextBtn = document.getElementById('lightbox-next-btn');

  if (!modal) return;

  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
  });

  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(1);
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
}

window.setGalleryFilter = function(category) {
  const btn = document.querySelector(`#gallery-filters-bar .filter-btn[data-category="${category}"]`);
  if (btn) btn.click();
};

window.openLightbox = function(index) {
  const currentList = appState.filteredGallery.length > 0 ? appState.filteredGallery : appState.allGallery;
  if (!currentList || currentList.length === 0) return;

  if (index < 0) index = 0;
  if (index >= currentList.length) index = currentList.length - 1;

  appState.activeLightboxIndex = index;
  updateLightboxContent();

  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

function navigateLightbox(direction) {
  const currentList = appState.filteredGallery.length > 0 ? appState.filteredGallery : appState.allGallery;
  if (!currentList || currentList.length === 0) return;
  const total = currentList.length;

  let newIndex = appState.activeLightboxIndex + direction;
  if (newIndex < 0) newIndex = total - 1;
  if (newIndex >= total) newIndex = 0;

  appState.activeLightboxIndex = newIndex;
  updateLightboxContent();
}

function updateLightboxContent() {
  const currentList = appState.filteredGallery.length > 0 ? appState.filteredGallery : appState.allGallery;
  const item = currentList[appState.activeLightboxIndex];
  if (!item) return;

  const imgEl = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  const descEl = document.getElementById('lightbox-desc');
  const catBadge = document.getElementById('lightbox-category-badge');
  const counterEl = document.getElementById('lightbox-counter');
  const thumbsContainer = document.getElementById('lightbox-thumbs');

  if (imgEl) {
    imgEl.src = item.image_url;
    imgEl.alt = item.title;
  }
  if (titleEl) titleEl.textContent = item.title;
  if (descEl) descEl.textContent = item.description || 'Instalación técnica realizada por Sani Instalaciones.';

  const categoryLabels = {
    electricidad: '⚡ Electricidad',
    fontaneria: '💧 Fontanería',
    suelo_radiante: '♨️ Suelo Radiante',
    otro: 'Instalaciones'
  };
  if (catBadge) {
    catBadge.textContent = categoryLabels[item.category] || 'Instalaciones';
    catBadge.className = `gallery-category-pill cat-${item.category || 'otro'}`;
  }

  if (counterEl) {
    counterEl.textContent = `Foto ${appState.activeLightboxIndex + 1} de ${currentList.length}`;
  }

  // Render thumbnail strip
  if (thumbsContainer) {
    thumbsContainer.innerHTML = currentList.map((thumb, tIdx) => {
      const activeClass = tIdx === appState.activeLightboxIndex ? 'active' : '';
      return `
        <div class="lightbox-thumb-item ${activeClass}" data-thumb-index="${tIdx}" title="${thumb.title}">
          <img src="${thumb.image_url}" alt="Miniatura ${thumb.title}">
        </div>
      `;
    }).join('');

    thumbsContainer.querySelectorAll('.lightbox-thumb-item').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        const tIdx = parseInt(thumb.getAttribute('data-thumb-index') || '0', 10);
        appState.activeLightboxIndex = tIdx;
        updateLightboxContent();
      });
    });
  }
}

window.quoteCurrentLightboxWork = function() {
  const currentList = appState.filteredGallery.length > 0 ? appState.filteredGallery : appState.allGallery;
  const item = currentList[appState.activeLightboxIndex];
  closeLightbox();
  const workTitle = item ? item.title : 'Trabajo de Galería';
  openWhatsAppModal(`Consulta sobre: ${workTitle}`);
};

/* ==========================================================================
   5. Interactive WhatsApp Generator with Functional "Añadir" Features
   ========================================================================== */
function initWhatsAppBuilder() {
  // On-page WhatsApp card controls
  const reasonPills = document.querySelectorAll('#contact-reason-pills .reason-pill');
  const featureChips = document.querySelectorAll('#contact-features-selector .feature-toggle-btn');
  const textarea = document.getElementById('wa-contact-message');
  const sendBtn = document.getElementById('wa-contact-send-btn');

  // Reason buttons
  reasonPills.forEach(pill => {
    pill.addEventListener('click', () => {
      reasonPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.whatsappContact.reason = pill.dataset.reason;
      updateContactWhatsAppPreview();
    });
  });

  // Feature Toggle Buttons (Apartado «Añadir»)
  featureChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const featureName = chip.getAttribute('data-feature');
      const iconSpan = chip.querySelector('.feature-check-icon');

      if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        if (iconSpan) iconSpan.textContent = '+';
        appState.whatsappContact.features.delete(featureName);
      } else {
        chip.classList.add('active');
        if (iconSpan) iconSpan.textContent = '✓';
        appState.whatsappContact.features.add(featureName);
      }
      updateContactWhatsAppPreview();
    });
  });

  // Custom text input
  textarea?.addEventListener('input', () => {
    appState.whatsappContact.customMessage = textarea.value;
    updateContactWhatsAppPreview();
  });

  // Send WhatsApp message button
  sendBtn?.addEventListener('click', () => {
    const finalMsg = buildFormattedMessage(
      appState.whatsappContact.reason,
      '',
      'Jamilena',
      Array.from(appState.whatsappContact.features),
      appState.whatsappContact.customMessage
    );
    const phone = appState.settings.whatsapp || '34671728043';
    const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(finalMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  });

  updateContactWhatsAppPreview();
}

function updateContactWhatsAppPreview() {
  const preview = document.getElementById('wa-contact-preview');
  if (!preview) return;

  const msg = buildFormattedMessage(
    appState.whatsappContact.reason,
    '',
    'Jamilena',
    Array.from(appState.whatsappContact.features),
    appState.whatsappContact.customMessage
  );

  preview.textContent = msg;
}

function initWhatsAppModal() {
  const modal = document.getElementById('whatsapp-quote-modal');
  const closeBtn = document.getElementById('wa-modal-close-btn');
  const submitBtn = document.getElementById('wa-modal-submit-btn');
  const nameInput = document.getElementById('wa-modal-user-name');
  const locInput = document.getElementById('wa-modal-user-loc');
  const customText = document.getElementById('wa-modal-custom-text');
  const pills = document.querySelectorAll('#modal-reason-pills .reason-pill');
  const featureChips = document.querySelectorAll('#modal-features-selector .feature-toggle-btn');

  // Trigger buttons in header / hero / services
  document.getElementById('hero-wa-btn')?.addEventListener('click', () => openWhatsAppModal('Presupuesto General'));
  document.getElementById('empresa-wa-btn')?.addEventListener('click', () => openWhatsAppModal('Consulta de Empresa'));
  document.getElementById('floating-wa-btn')?.addEventListener('click', () => openWhatsAppModal('Presupuesto General'));

  if (!modal) return;

  closeBtn?.addEventListener('click', closeWhatsAppModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeWhatsAppModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeWhatsAppModal();
  });

  // Reason pills
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.whatsappModal.reason = pill.dataset.reason;
      updateModalWhatsAppPreview();
    });
  });

  // Features Toggle Buttons (Apartado «Añadir» in Modal)
  featureChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const featureName = chip.getAttribute('data-feature');
      const iconSpan = chip.querySelector('.feature-check-icon');

      if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        if (iconSpan) iconSpan.textContent = '+';
        appState.whatsappModal.features.delete(featureName);
      } else {
        chip.classList.add('active');
        if (iconSpan) iconSpan.textContent = '✓';
        appState.whatsappModal.features.add(featureName);
      }
      updateModalWhatsAppPreview();
    });
  });

  nameInput?.addEventListener('input', () => {
    appState.whatsappModal.userName = nameInput.value.trim();
    updateModalWhatsAppPreview();
  });

  locInput?.addEventListener('input', () => {
    appState.whatsappModal.location = locInput.value.trim() || 'Jamilena';
    updateModalWhatsAppPreview();
  });

  customText?.addEventListener('input', () => {
    appState.whatsappModal.customMessage = customText.value;
    updateModalWhatsAppPreview();
  });

  submitBtn?.addEventListener('click', () => {
    const finalMsg = buildFormattedMessage(
      appState.whatsappModal.reason,
      appState.whatsappModal.userName,
      appState.whatsappModal.location,
      Array.from(appState.whatsappModal.features),
      appState.whatsappModal.customMessage
    );
    const phone = appState.settings.whatsapp || '34671728043';
    const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(finalMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    closeWhatsAppModal();
  });
}

function buildFormattedMessage(reason, userName, location, features, customDetails) {
  let text = `Hola Sani Instalaciones, me pongo en contacto para una consulta:`;
  text += `\n\n• Especialidad: ${reason || 'Presupuesto General'}`;
  if (location && location.trim()) {
    text += `\n• Localidad: ${location.trim()}`;
  }
  if (userName && userName.trim()) {
    text += `\n• Nombre: ${userName.trim()}`;
  }

  if (features && features.length > 0) {
    text += `\n\n• Opciones y características solicitadas:`;
    features.forEach(f => {
      text += `\n  ✓ ${f}`;
    });
  }

  if (customDetails && customDetails.trim()) {
    text += `\n\n• Comentario / Detalles:\n  ${customDetails.trim()}`;
  } else {
    text += `\n\nMe gustaría solicitar información y presupuesto detallado para este trabajo.`;
  }

  return text;
}

function updateModalWhatsAppPreview() {
  const preview = document.getElementById('wa-modal-preview');
  if (!preview) return;

  const msg = buildFormattedMessage(
    appState.whatsappModal.reason,
    appState.whatsappModal.userName,
    appState.whatsappModal.location,
    Array.from(appState.whatsappModal.features),
    appState.whatsappModal.customMessage
  );

  preview.textContent = msg;
}

window.openWhatsAppModal = function(serviceReason = 'Presupuesto General') {
  const modal = document.getElementById('whatsapp-quote-modal');
  if (!modal) return;

  appState.whatsappModal.reason = serviceReason;

  // Highlight matching reason pill
  const pills = document.querySelectorAll('#modal-reason-pills .reason-pill');
  let matched = false;
  pills.forEach(p => {
    const pillReason = (p.dataset.reason || '').toLowerCase();
    const targetReason = (serviceReason || '').toLowerCase();
    if (pillReason && (targetReason.includes(pillReason) || pillReason.includes(targetReason))) {
      p.classList.add('active');
      matched = true;
    } else {
      p.classList.remove('active');
    }
  });
  if (!matched && pills.length > 0) {
    pills[pills.length - 1].classList.add('active');
  }

  updateModalWhatsAppPreview();

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeWhatsAppModal = function() {
  const modal = document.getElementById('whatsapp-quote-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

/* ==========================================================================
   6. Reviews System & Modal (Validations & Moderation Flow)
   ========================================================================== */
async function loadReviews() {
  const gridContainer = document.getElementById('reviews-grid-container');
  const summaryScore = document.getElementById('review-avg-score');
  const summaryCount = document.getElementById('review-total-count');
  const summaryStars = document.getElementById('review-avg-stars');

  try {
    const res = await fetch('/api/reviews');
    if (!res.ok) throw new Error('Error al consultar valoraciones');
    const data = await res.json();
    const reviews = data.reviews || [];
    const stats = data.stats || { total: 0, averageRating: 0 };

    if (summaryScore) summaryScore.textContent = stats.total > 0 ? stats.averageRating.toFixed(1) : '5.0';
    if (summaryCount) {
      summaryCount.textContent = stats.total > 0 
        ? `Basado en ${stats.total} ${stats.total === 1 ? 'opinión verificada' : 'opiniones verificadas'}` 
        : 'Opiniones verificadas de clientes en Jamilena y Jaén';
    }
    if (summaryStars) summaryStars.textContent = '★'.repeat(Math.round(stats.averageRating || 5)) + '☆'.repeat(5 - Math.round(stats.averageRating || 5));

    if (!gridContainer) return;

    if (reviews.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--color-text-muted);">
          <p>¿Has realizado alguna instalación con Sani Instalaciones?</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="openReviewModal()">Sé el primero en dejar una opinión</button>
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = reviews.map(r => {
      const dateStr = formatDate(r.created_at);
      const initial = (r.author_name || 'C').charAt(0).toUpperCase();
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);

      return `
        <article class="review-card">
          <div class="review-header">
            <div class="review-author-wrap">
              <div class="review-avatar">${initial}</div>
              <div>
                <span class="review-author">${r.author_name}</span>
                <span class="review-verified-badge">✓ Cliente Verificado</span>
              </div>
            </div>
            <span class="review-date">${dateStr}</span>
          </div>
          <div class="review-stars">${stars}</div>
          <p class="review-comment">"${r.comment}"</p>
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading reviews:', err);
  }
}

function checkRecentSubmittedReview() {
  try {
    const raw = localStorage.getItem('sani_last_submitted_review');
    if (raw) {
      const parsed = JSON.parse(raw);
      const noticeBanner = document.getElementById('review-pending-notice');
      if (noticeBanner) {
        noticeBanner.style.display = 'flex';
      }
    }
  } catch (e) { /* ignore */ }
}

let selectedStarRating = 5;

function initReviewsSystem() {
  const modal = document.getElementById('review-modal');
  const openBtn = document.getElementById('open-review-modal-btn');
  const closeBtn = document.getElementById('review-modal-close');
  const form = document.getElementById('review-form');
  const starsContainer = document.getElementById('star-rating-selector');
  const commentTextarea = document.getElementById('review-comment-input');
  const charCounter = document.getElementById('review-char-count');
  const alertBox = document.getElementById('review-form-alert');

  if (!modal || !form) return;

  openBtn?.addEventListener('click', openReviewModal);
  closeBtn?.addEventListener('click', closeReviewModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeReviewModal();
  });

  // Star Rating Selector Interaction
  if (starsContainer) {
    const stars = starsContainer.querySelectorAll('.star-item');
    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value, 10);
        highlightStars(val);
      });

      star.addEventListener('mouseleave', () => {
        highlightStars(selectedStarRating);
      });

      star.addEventListener('click', () => {
        selectedStarRating = parseInt(star.dataset.value, 10);
        highlightStars(selectedStarRating);
        const ratingInput = document.getElementById('review-rating-val');
        if (ratingInput) ratingInput.value = selectedStarRating;
      });
    });
    highlightStars(5);
  }

  function highlightStars(val) {
    const stars = starsContainer.querySelectorAll('.star-item');
    stars.forEach(s => {
      const v = parseInt(s.dataset.value, 10);
      if (v <= val) {
        s.classList.add('selected');
        s.textContent = '★';
      } else {
        s.classList.remove('selected');
        s.textContent = '☆';
      }
    });
  }

  // Character counter
  commentTextarea?.addEventListener('input', () => {
    const len = commentTextarea.value.length;
    if (charCounter) charCounter.textContent = `${len} / 600`;
  });

  // Review Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertBox) alertBox.style.display = 'none';

    const submitBtn = document.getElementById('btn-submit-review');
    const author_name = form.author_name.value.trim();
    const comment = form.comment.value.trim();
    const honeypot = form.hp_website?.value || '';
    const rgpd_accepted = form.rgpd_accepted?.checked;
    const rating = selectedStarRating;

    if (!author_name || author_name.length < 2) {
      showReviewAlert('Por favor, indica tu nombre o empresa.', 'error');
      return;
    }

    if (!comment || comment.length < 5) {
      showReviewAlert('El comentario debe contener al menos 5 caracteres.', 'error');
      return;
    }

    if (!rgpd_accepted) {
      showReviewAlert('Debes aceptar la política de privacidad para enviar tu opinión.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando opinión...';

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name,
          rating,
          comment,
          honeypot,
          rgpd_accepted
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al enviar la valoración');

      // Persist flag in localStorage so the user sees confirmation on reload
      try {
        localStorage.setItem('sani_last_submitted_review', JSON.stringify({
          author_name,
          rating,
          comment,
          date: new Date().toISOString()
        }));
      } catch (e) { /* ignore */ }

      showReviewAlert(
        result.message || '¡Muchas gracias! Tu opinión se ha registrado con éxito y aparecerá publicada tras su revisión.',
        'success'
      );

      form.reset();
      selectedStarRating = 5;
      highlightStars(5);

      const noticeBanner = document.getElementById('review-pending-notice');
      if (noticeBanner) noticeBanner.style.display = 'flex';

      setTimeout(() => {
        closeReviewModal();
        showToast('Opinión enviada para moderación');
      }, 2500);

    } catch (err) {
      showReviewAlert(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publicar Opinión';
    }
  });

  function showReviewAlert(msg, type) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
  }
}

window.openReviewModal = function() {
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
};

window.closeReviewModal = function() {
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

/* ==========================================================================
   7. Copy Phone Helper & Cookie Banner
   ========================================================================== */
function initCopyPhone() {
  const copyBtn = document.getElementById('copy-phone-btn');
  if (!copyBtn) return;

  copyBtn.addEventListener('click', async () => {
    const rawNumber = appState.settings.phone_raw || '671728043';
    const displayPhone = appState.settings.phone || '671 72 80 43';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(rawNumber);
      } else {
        const temp = document.createElement('textarea');
        temp.value = rawNumber;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      showToast(`¡Teléfono ${displayPhone} copiado al portapapeles!`);
      copyBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ¡Copiado!
      `;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copiar Número
        `;
      }, 2500);
    } catch (e) {
      showToast(`Teléfono: ${displayPhone}`);
    }
  });
}

function initCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('accept-cookies-btn');
  const essentialBtn = document.getElementById('essential-cookies-btn');

  if (!banner) return;

  const consent = localStorage.getItem('sani_cookie_consent');
  if (!consent) {
    banner.classList.add('visible');
  }

  acceptBtn?.addEventListener('click', () => {
    localStorage.setItem('sani_cookie_consent', 'all');
    banner.classList.remove('visible');
    showToast('Preferencias de cookies guardadas');
  });

  essentialBtn?.addEventListener('click', () => {
    localStorage.setItem('sani_cookie_consent', 'essential');
    banner.classList.remove('visible');
  });
}

/* ==========================================================================
   Utilities
   ========================================================================== */
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

function escapeJsString(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
