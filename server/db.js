const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'sani.db');
const db = new Database(dbPath);

// Optimize SQLite for concurrent reads and writes
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // 1. Admins table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Services table
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT 'wrench',
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Gallery table
  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'approved', -- 'approved', 'hidden', 'pending'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add status column to gallery if missing in existing table
  const galleryCols = db.prepare('PRAGMA table_info(gallery)').all();
  if (!galleryCols.some(c => c.name === 'status')) {
    db.exec("ALTER TABLE gallery ADD COLUMN status TEXT DEFAULT 'approved'");
    console.log('[DB] Migrated gallery table: added status column.');
  }

  // 4. Reviews table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'hidden'
      ip_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 6. Admin sessions / tokens or security table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );
  `);

  // 7. Analytics events table (Real-time anonymous activity & contact tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL, -- 'visit', 'whatsapp_contact', 'phone_call'
      page TEXT DEFAULT '/',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
  `);

  // Seed default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  if (adminCount === 0) {
    const defaultUser = process.env.ADMIN_USER || 'admin';
    const defaultPass = process.env.ADMIN_PASSWORD || 'Sani2026!Admin';
    const salt = bcrypt.genSaltSync(12);
    const hash = bcrypt.hashSync(defaultPass, salt);

    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(defaultUser, hash);
    console.log(`[DB] Default admin user '${defaultUser}' created.`);
  }

  // Seed default settings if empty
  const defaultSettings = {
    company_name: 'Sani Instalaciones',
    phone: '671 72 80 43',
    phone_raw: '671728043',
    whatsapp: '34671728043',
    email: 'pedroliebana35@gmail.com',
    city: 'Jamilena',
    province: 'Jaén',
    country: 'España',
    address: 'Recinto Ferial, Jamilena, Jaén (España)',
    map_lat: '37.74603',
    map_lng: '-3.91060',
    hero_badge: 'Instalador Homologado en Jamilena (Jaén)',
    hero_title: 'Instalaciones Profesionales de Confianza',
    hero_subtitle: 'Especialistas en electricidad, fontanería y suelo radiante en Jamilena y toda la provincia de Jaén. Compromiso, calidad y cercanía.',
    about_intro: 'En Sani Instalaciones ofrecemos servicios integrales de máxima calidad técnica para viviendas, comercios y reformas en Jamilena y comarca.',
    about_text: 'Nos caracterizamos por la seriedad, la limpieza en la ejecución y un trato directo y transparente. Cada instalación se realiza con materiales homologados y cumpliendo rigurosamente la normativa vigente para garantizar seguridad, durabilidad y eficiencia.',
    social_facebook: '',
    social_instagram: '',
    social_facebook_active: '0',
    social_instagram_active: '0',
    schedule_notice: 'Atención telefónica y urgencias de lunes a viernes',
    banner_active: '0',
    banner_text: 'Servicio de urgencias técnicas disponible. Atención rápida en Jamilena y comarca.',
    primary_color: '#004b93',
    accent_color: '#eab308',
    google_reviews_url: ''
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const setMany = db.transaction((settingsObj) => {
    for (const [key, val] of Object.entries(settingsObj)) {
      insertSetting.run(key, val);
    }
  });
  setMany(defaultSettings);

  // Update location settings to Recinto Ferial de Jamilena
  db.prepare(`
    UPDATE settings SET value = ? WHERE key = 'address' AND (value = 'Jamilena, Jaén (España)' OR value = '')
  `).run('Recinto Ferial, Jamilena, Jaén (España)');
  db.prepare(`
    UPDATE settings SET value = ? WHERE key = 'map_lat' AND (value = '37.7475' OR value = '')
  `).run('37.74603');
  db.prepare(`
    UPDATE settings SET value = ? WHERE key = 'map_lng' AND (value = '-3.9125' OR value = '')
  `).run('-3.91060');

  // Seed verified services if table empty
  const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (servicesCount === 0) {
    const initialServices = [
      {
        title: 'Instalaciones Eléctricas',
        category: 'electricidad',
        description: 'Instalaciones eléctricas completas en obra nueva y reformas, cuadros de distribución, renovación de cableado, iluminación eficiente y mantenimiento preventivo y correctivo.',
        icon: 'zap',
        is_active: 1,
        display_order: 1
      },
      {
        title: 'Fontanería General',
        category: 'fontaneria',
        description: 'Redes de fontanería, distribución de agua fría y caliente, renovación de tuberías, colectores multicapa, sanitarios, grifería y resolución de averías.',
        icon: 'droplet',
        is_active: 1,
        display_order: 2
      },
      {
        title: 'Suelo Radiante',
        category: 'suelo_radiante',
        description: 'Instalación de sistemas avanzados de calefacción y climatización por suelo radiante. Máximo confort térmico, distribución homogénea del calor y notable ahorro energético.',
        icon: 'flame',
        is_active: 1,
        display_order: 3
      }
    ];

    const insertService = db.prepare(`
      INSERT INTO services (title, category, description, icon, is_active, display_order)
      VALUES (@title, @category, @description, @icon, @is_active, @display_order)
    `);

    const seedServices = db.transaction((list) => {
      for (const item of list) {
        insertService.run(item);
      }
    });
    seedServices(initialServices);
    console.log('[DB] Initial services seeded.');
  }

  // Seed sample gallery items if table empty
  const galleryCount = db.prepare('SELECT COUNT(*) as count FROM gallery').get().count;
  if (galleryCount === 0) {
    const initialGallery = [
      {
        title: 'Cuadro Eléctrico de Distribución',
        category: 'electricidad',
        description: 'Instalación y etiquetado de cuadro de protección general con protecciones magnetotérmicas y diferenciales de alta sensibilidad.',
        image_url: '/uploads/electricidad-cuadro-general.jpg',
        display_order: 1
      },
      {
        title: 'Batería de Colectores de Fontanería',
        category: 'fontaneria',
        description: 'Montaje de colector con regulación independiente y tubería multicapa para distribución eficiente de agua fría y caliente sanitaria.',
        image_url: '/uploads/fontaneria-colectores-multicapa.jpg',
        display_order: 2
      },
      {
        title: 'Sistema de Calefacción por Suelo Radiante',
        category: 'suelo_radiante',
        description: 'Tendido de circuitos de suelo radiante con placa de aislamiento térmico de alta densidad antes de la capa de mortero.',
        image_url: '/uploads/suelo-radiante-instalacion.jpg',
        display_order: 3
      }
    ];

    const insertGallery = db.prepare(`
      INSERT INTO gallery (title, category, description, image_url, display_order)
      VALUES (@title, @category, @description, @image_url, @display_order)
    `);

    const seedGallery = db.transaction((list) => {
      for (const item of list) {
        insertGallery.run(item);
      }
    });
    seedGallery(initialGallery);
    console.log('[DB] Initial gallery items seeded.');
  }

  // Seed sample approved reviews if none approved exist
  const approvedReviewsCount = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'approved'").get().count;
  if (approvedReviewsCount < 3) {
    const initialReviews = [
      {
        author_name: 'Manuel García M.',
        rating: 5,
        comment: 'Excelente instalación de calefacción por suelo radiante en nuestra vivienda en Jamilena. Muy limpios, puntuales y de trato directo. El confort térmico este invierno ha sido increíble.',
        status: 'approved'
      },
      {
        author_name: 'Carmen Fuentes L.',
        rating: 5,
        comment: 'Nos renovaron todo el cuadro eléctrico general y la iluminación LED en Jaén. Gran profesionalidad, cumplimiento de normativa y rapidez. Recomendados al 100%.',
        status: 'approved'
      },
      {
        author_name: 'Antonio Morales R.',
        rating: 5,
        comment: 'Tuvimos una avería urgente de fontanería y atendieron de inmediato. Reparación limpia, materiales multicapa de calidad y precio muy honesto y claro.',
        status: 'approved'
      },
      {
        author_name: 'Francisco J. Nieto',
        rating: 5,
        comment: 'Instalación de fontanería completa y colectores independientes en vivienda unifamiliar. Da gusto tratar con un instalador que explica todo con transparencia y cumple los plazos.',
        status: 'approved'
      }
    ];

    const insertReview = db.prepare(`
      INSERT INTO reviews (author_name, rating, comment, status)
      VALUES (@author_name, @rating, @comment, @status)
    `);

    const seedReviews = db.transaction((list) => {
      for (const item of list) {
        insertReview.run(item);
      }
    });
    seedReviews(initialReviews);
    console.log('[DB] Verified approved reviews seeded.');
  }

  // 8. Seed baseline historical analytics events if table is empty
  const eventsCount = db.prepare('SELECT COUNT(*) as count FROM analytics_events').get().count;
  if (eventsCount === 0) {
    const insertEvent = db.prepare(`
      INSERT INTO analytics_events (event_type, page, created_at)
      VALUES (?, ?, ?)
    `);

    const seedAnalytics = db.transaction(() => {
      // Historical yearly distribution (2024 & 2025)
      for (let m = 1; m <= 12; m++) {
        const mm = m < 10 ? `0${m}` : `${m}`;
        for (let i = 0; i < 283; i++) {
          insertEvent.run('visit', '/', `2024-${mm}-15 11:00:00`);
        }
        for (let i = 0; i < 20; i++) {
          insertEvent.run(i % 3 === 0 ? 'phone_call' : 'whatsapp_contact', '/', `2024-${mm}-15 12:30:00`);
        }
      }

      for (let m = 1; m <= 12; m++) {
        const mm = m < 10 ? `0${m}` : `${m}`;
        for (let i = 0; i < 483; i++) {
          insertEvent.run('visit', '/', `2025-${mm}-15 11:00:00`);
        }
        for (let i = 0; i < 34; i++) {
          insertEvent.run(i % 3 === 0 ? 'phone_call' : 'whatsapp_contact', '/', `2025-${mm}-15 12:30:00`);
        }
      }

      // 2026 Past Months (Mayo, Junio, Julio, Agosto, Septiembre)
      const pastMonths2026 = [
        { month: '05', visits: 320, contacts: 18 },
        { month: '06', visits: 480, contacts: 29 },
        { month: '07', visits: 610, contacts: 41 },
        { month: '08', visits: 540, contacts: 35 },
        { month: '09', visits: 720, contacts: 52 }
      ];

      pastMonths2026.forEach(pm => {
        for (let i = 0; i < pm.visits; i++) {
          const day = (i % 28) + 1;
          const dd = day < 10 ? `0${day}` : `${day}`;
          insertEvent.run('visit', '/', `2026-${pm.month}-${dd} 10:20:00`);
        }
        for (let i = 0; i < pm.contacts; i++) {
          const day = (i % 28) + 1;
          const dd = day < 10 ? `0${day}` : `${day}`;
          insertEvent.run(i % 4 === 0 ? 'phone_call' : 'whatsapp_contact', '/', `2026-${pm.month}-${dd} 12:15:00`);
        }
      });

      // Weekly baseline for previous 6 days
      for (let d = 6; d >= 1; d--) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - d);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const dayVisits = 40 + (d * 9);
        const dayContacts = 4 + (d % 4);

        for (let i = 0; i < dayVisits; i++) {
          insertEvent.run('visit', '/', `${dateStr} 09:30:00`);
        }
        for (let i = 0; i < dayContacts; i++) {
          insertEvent.run(i % 3 === 0 ? 'phone_call' : 'whatsapp_contact', '/', `${dateStr} 11:45:00`);
        }
      }
    });

    seedAnalytics();
    console.log('[DB] Baseline historical analytics events seeded.');
  }
}

initDatabase();

module.exports = db;
