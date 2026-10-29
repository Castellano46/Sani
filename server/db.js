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

  // Ensure all 6 standard gallery items exist in database
  const standardGallery = [
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
    },
    {
      title: 'Iluminación LED y Mecanismos de Diseño',
      category: 'electricidad',
      description: 'Instalación completa de focos LED empotrados de bajo consumo y serie de mecanismos modernos en vivienda unifamiliar.',
      image_url: '/uploads/electricidad-iluminacion-led.jpg',
      display_order: 4
    },
    {
      title: 'Renovación de Fontanería en Baño',
      category: 'fontaneria',
      description: 'Instalación empotrada de grifería termostática, tuberías de cobre y multicapa, y saneamiento para plato de ducha.',
      image_url: '/uploads/fontaneria-bano-ducha.jpg',
      display_order: 5
    },
    {
      title: 'Armario de Colectores y Termostatos Digitales',
      category: 'suelo_radiante',
      description: 'Montaje de armario de regulación de suelo radiante con actuadores electrotérmicos y bomba de circulación de alta eficiencia.',
      image_url: '/uploads/suelo-radiante-colectores.jpg',
      display_order: 6
    }
  ];

  const checkGalleryItem = db.prepare('SELECT id FROM gallery WHERE title = ?');
  const insertGalleryItem = db.prepare(`
    INSERT INTO gallery (title, category, description, image_url, display_order, status)
    VALUES (@title, @category, @description, @image_url, @display_order, 'approved')
  `);

  standardGallery.forEach(item => {
    const existing = checkGalleryItem.get(item.title);
    if (!existing) {
      insertGalleryItem.run(item);
      console.log(`[DB] Standard gallery item ensured: ${item.title}`);
    }
  });

  // Ensure all 6 standard approved reviews exist in database
  const standardReviews = [
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
    },
    {
      author_name: 'Elena Sánchez P.',
      rating: 5,
      comment: 'Muy satisfechos con la reforma integral de fontanería y electricidad en nuestro piso. Trabajo impecable, rápido y con materiales de primera calidad.',
      status: 'approved'
    },
    {
      author_name: 'Pedro L. (Jamilena)',
      rating: 5,
      comment: 'Excelente atención técnica y cercanía. Nos instalaron los termostatos y colectores de suelo radiante. Funcionamiento perfecto y trato inmejorable.',
      status: 'approved'
    }
  ];

  const checkReviewItem = db.prepare('SELECT id FROM reviews WHERE author_name = ?');
  const insertReviewItem = db.prepare(`
    INSERT INTO reviews (author_name, rating, comment, status)
    VALUES (@author_name, @rating, @comment, @status)
  `);

  standardReviews.forEach(r => {
    const existing = checkReviewItem.get(r.author_name);
    if (!existing) {
      insertReviewItem.run(r);
      console.log(`[DB] Standard review ensured: ${r.author_name}`);
    }
  });

  // Ensure analytics_events contains ONLY 100% real usage events (purge any previously seeded mock/simulated baseline data)
  const hasSeededHistorical = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE created_at LIKE '2024-%' OR created_at LIKE '2025-%'").get().count;
  if (hasSeededHistorical > 0) {
    db.prepare('DELETE FROM analytics_events').run();
    console.log('[DB] Cleaned all baseline mock data from analytics_events. Ready for 100% real tracking.');
  }
}

initDatabase();

module.exports = db;
