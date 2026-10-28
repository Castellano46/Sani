# Sani Instalaciones - Web Corporativa y Panel de Administración

Sitio web profesional, moderno, responsive y dinámico para **Sani Instalaciones**, empresa ubicada en **Jamilena (Jaén)** especializada en:
- ⚡ **Electricidad**: Instalaciones completas en obra y reforma, mantenimiento, cuadros y boletines.
- 💧 **Fontanería**: Redes de distribución de agua, renovación de tuberías, sanitarios y reparación de averías.
- ♨️ **Suelo Radiante**: Sistemas eficientes de calefacción y climatización por suelo radiante.

---

## 🚀 Características Principales

### 1. Web Pública
- **Identidad Visual Corporativa**: Diseño coherente con el logotipo oficial (`resources/imagen.png`), combinando azul corporativo intenso (`#0b2568`), amarillo relámpago (`#f5b700`), azul cyan agua (`#00a4e4`) y rojo térmico (`#ea262a`).
- **Totalmente Responsive**: Optimizado para dispositivos móviles, tablets y pantallas de escritorio.
- **Herramienta Interactiva de WhatsApp**:
  - Selector rápido de motivo de consulta (Electricidad, Fontanería, Suelo Radiante, Reparación, Presupuesto General).
  - Campo de texto libre para detalles específicos.
  - Vista previa en tiempo real del mensaje.
  - Generación de enlace directo y apertura de WhatsApp con el texto preparado para el número **660 26 09 41**.
- **Canales de Contacto Directo**:
  - Enlace de marcación telefónica directa (`tel:660260941`).
  - Botón de "Copiar número" con confirmación visual.
  - Enlace de correo electrónico configurable por el administrador.
- **Galería de Trabajos Filtrable con Lightbox**:
  - Filtrado instantáneo por especialidades (Todos, Electricidad, Fontanería, Suelo Radiante).
  - Modal Lightbox a pantalla completa con navegación por teclado (flechas, escape) y controles anterior/siguiente.
- **Sistema de Opiniones y Valoraciones**:
  - Los visitantes pueden publicar valoraciones de 1 a 5 estrellas y comentarios sin necesidad de registrarse.
  - Protección antispam mediante campo trampa honeypot y limitación de tasa (rate limiting).
  - **Moderación obligatoria**: Las opiniones quedan en estado *pendiente* hasta que el administrador las aprueba.
  - Cálculo automático y en tiempo real de la nota media y del número total de valoraciones aprobadas.
- **Mapa Interactivo Libre de Costes**:
  - Integración con OpenStreetMap / Leaflet sin necesidad de claves API de pago.
  - Botón directo para iniciar navegación GPS hacia Jamilena en Google Maps.
- **Cumplimiento Legal y RGPD**:
  - Páginas completas de Aviso Legal, Política de Privacidad y Política de Cookies adaptadas a la normativa española y europea.
  - Banner de consentimiento de cookies técnicas y de navegación.

### 2. Panel de Administración Privado (`/admin`)
- **Acceso Restringido y Seguro**:
  - Autenticación con contraseñas cifradas mediante `bcryptjs` (sin almacenamiento en texto plano).
  - Sesiones gestionadas en SQLite con cookies `httpOnly` y `sameSite`.
  - Protección contra fuerza bruta mediante limitación de intentos con `express-rate-limit`.
- **Métricas en Tiempo Real**:
  - Contador de opiniones pendientes con distintivo de aviso.
  - Total de opiniones publicadas, trabajos en galería y servicios activos.
- **Gestión de la Galería**:
  - Subida de nuevas imágenes (JPG, PNG, WEBP, máx. 10MB) con previsualización en el navegador.
  - Asignación de categorías, títulos, descripciones técnicas y orden de visualización.
  - Almacenamiento persistente en disco en `public/uploads/` y registro en la base de datos.
  - Eliminación de imágenes con borrado seguro del archivo físico.
- **Moderación de Opiniones**:
  - Filtro por estado (Todas, Pendientes, Aprobadas, Ocultas).
  - Acciones con un clic: Aprobar, Ocultar o Eliminar definitivamente.
- **Gestión de Servicios**:
  - Crear, editar, activar/desactivar y eliminar especialidades.
- **Datos Comerciales y Contenido**:
  - Edición del teléfono, WhatsApp, correo oficial, textos de la portada y dirección.
  - Configuración y activación/desactivación de enlaces a redes sociales oficiales (Facebook, Instagram).
- **Seguridad**:
  - Cambio directo de la contraseña del administrador desde el propio panel.

---

## 🛠️ Tecnologías Utilizadas

- **Backend**: Node.js + Express
- **Base de Datos**: SQLite nativo de alto rendimiento mediante `better-sqlite3` con modo WAL (Write-Ahead Logging).
- **Seguridad**: `helmet` (cabeceras HTTP seguras y CSP), `bcryptjs` (hashing de claves), `cookie-parser`, `express-rate-limit`.
- **Gestión de Archivos**: `multer` con validación de tipos MIME y tamaño.
- **Frontend**: HTML5 semántico, CSS3 moderno (Vanilla CSS con Custom Properties y Glassmorphism), JavaScript ES6+.
- **Mapas**: Leaflet + OpenStreetMap (100% gratuito sin coste de API).

---

## 📦 Puesta en Marcha en Local

### 1. Requisitos Previos
- Node.js versión 18 o superior (probado y verificado en Node v24).
- npm (incluido con Node.js).

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Configuración del Entorno
Copia el archivo `.env.example` como `.env` (ya existe uno configurado por defecto para pruebas locales):
```bash
cp .env.example .env
```

Variables de entorno disponibles en `.env`:
- `PORT`: Puerto del servidor web (por defecto `3000`).
- `NODE_ENV`: Entorno (`development` o `production`).
- `COOKIE_SECRET`: Clave secreta para la firma de cookies.
- `ADMIN_USER`: Nombre de usuario inicial del administrador (por defecto `admin`).
- `ADMIN_PASSWORD`: Contraseña inicial del administrador (por defecto `Sani2026!Admin`).

### 4. Iniciar el Servidor
Para desarrollo con reinicio automático:
```bash
npm run dev
```

Para producción o ejecución estándar:
```bash
npm start
```

### 5. Acceso
- **Sitio Web Público**: [http://localhost:3000](http://localhost:3000)
- **Panel de Administración**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - Usuario: `admin`
  - Contraseña: `Sani2026!Admin`

---

## 🌐 Guía de Despliegue en Producción

Para desplegar la aplicación en un servidor VPS (Ubuntu/Debian, CentOS, etc.) con dominio propio (ejemplo: `saniinstalaciones.es`):

### 1. Subir el Proyecto al Servidor
```bash
git clone <URL_DEL_REPOSITORIO> /var/www/sani
cd /var/www/sani
npm install --production
```

### 2. Configurar Variables de Producción en `.env`
Edita `.env` con una contraseña robusta para el administrador y una clave segura para cookies:
```ini
PORT=3000
NODE_ENV=production
COOKIE_SECRET=generar_cadena_larga_y_aleatoria
ADMIN_USER=admin
ADMIN_PASSWORD=ContraseñaFuerte2026!
```

### 3. Ejecutar como Servicio con PM2
Instala PM2 para que el servidor Node.js se ejecute permanentemente y se reinicie ante caídas o reinicios del servidor:
```bash
npm install -g pm2
pm2 start server/index.js --name sani-instalaciones
pm2 save
pm2 startup
```

### 4. Configurar Servidor Web Reverso con Nginx y SSL (Let's Encrypt)
Ejemplo de bloque de configuración de Nginx (`/etc/nginx/sites-available/saniinstalaciones.es`):
```nginx
server {
    server_name saniinstalaciones.es www.saniinstalaciones.es;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilitar HTTPS gratuito con Certbot:
```bash
sudo certbot --nginx -d saniinstalaciones.es -d www.saniinstalaciones.es
```

### 5. Copias de Seguridad
Para respaldar la base de datos y las imágenes subidas por el administrador:
- Archivo de base de datos: `data/sani.db`
- Carpeta de fotografías: `public/uploads/`

---

## ⚖️ Aviso Legal y Cumplimiento RGPD
- La base de datos no almacena contraseñas en texto claro (se utiliza hash `bcrypt` con 12 rondas de sal).
- Las valoraciones enviadas por visitantes registran un hash irreversible de su dirección IP para prevenir ataques de spam sin vulnerar su privacidad.
- Todos los formularios cuentan con validación de entradas y protección contra inyección de código y XSS.
