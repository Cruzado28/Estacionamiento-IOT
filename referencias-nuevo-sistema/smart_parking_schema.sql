-- ============================================================
-- SMART PARKING IoT — ESQUEMA DE BASE DE DATOS
-- Sistema de Gestión de Estacionamiento Inteligente
-- Centro Comercial · Motor: MySQL 8.0+ (compatible con MariaDB 10.5+)
-- ============================================================
-- Para PostgreSQL: cambiar AUTO_INCREMENT por SERIAL/GENERATED ALWAYS AS IDENTITY,
-- ENGINE=InnoDB se omite, y TINYINT(1) -> BOOLEAN.
-- ============================================================

CREATE DATABASE IF NOT EXISTS smart_parking_iot
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_parking_iot;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. ADMINISTRADORES
-- Usuarios con acceso al panel administrativo (login del sistema)
-- ============================================================
DROP TABLE IF EXISTS administradores;
CREATE TABLE administradores (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(100)  NOT NULL,
  correo              VARCHAR(150)  NOT NULL UNIQUE,
  usuario             VARCHAR(50)   NOT NULL UNIQUE,
  contrasena_hash     VARCHAR(255)  NOT NULL,
  tema_preferido      ENUM('claro','oscuro') NOT NULL DEFAULT 'oscuro',
  color_principal     VARCHAR(20)   NOT NULL DEFAULT '#4f8ef7',
  tamano_fuente       ENUM('pequeno','normal','grande') NOT NULL DEFAULT 'normal',
  activo              TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso       DATETIME      NULL
) ENGINE=InnoDB;

-- ============================================================
-- 2. ROLES
-- Roles y privilegios de Tarifas y Beneficios (editable desde el frontend)
-- ============================================================
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  nombre                VARCHAR(80)   NOT NULL UNIQUE,
  icono                 VARCHAR(40)   NOT NULL DEFAULT 'fa-user',
  descripcion           VARCHAR(255)  NULL,
  porcentaje_descuento  DECIMAL(5,2)  NOT NULL DEFAULT 0.00,   -- 0.00 a 100.00
  horas_gratis          INT           NOT NULL DEFAULT 0,
  exoneracion_total     TINYINT(1)    NOT NULL DEFAULT 0,
  prioridad_acceso      ENUM('Normal','Alta','Máxima') NOT NULL DEFAULT 'Normal',
  color_etiqueta        VARCHAR(20)   NOT NULL DEFAULT 'gray',
  creado_en             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_roles_descuento CHECK (porcentaje_descuento BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- ============================================================
-- 3. CONDUCTORES
-- Datos personales del conductor (independiente del vehículo)
-- ============================================================
DROP TABLE IF EXISTS conductores;
CREATE TABLE conductores (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nombre_completo   VARCHAR(150) NOT NULL,
  documento         VARCHAR(20)  NOT NULL UNIQUE,
  telefono          VARCHAR(20)  NULL,
  correo            VARCHAR(150) NULL,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 4. VEHICULOS
-- Registro vehicular (pantalla "Gestión de Vehículos")
-- ============================================================
DROP TABLE IF EXISTS vehiculos;
CREATE TABLE vehiculos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  placa           VARCHAR(10)   NOT NULL UNIQUE,
  conductor_id    INT           NOT NULL,
  rol_id          INT           NOT NULL,
  tipo            ENUM('Auto','SUV','Camioneta','Moto') NOT NULL,
  marca           VARCHAR(50)   NULL,
  modelo          VARCHAR(50)   NULL,
  color           VARCHAR(30)   NULL,
  estado          ENUM('Activo','Inactivo','Bloqueado') NOT NULL DEFAULT 'Activo',
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehiculos_conductor FOREIGN KEY (conductor_id) REFERENCES conductores(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_vehiculos_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_vehiculos_estado ON vehiculos(estado);
CREATE INDEX idx_vehiculos_rol ON vehiculos(rol_id);

-- ============================================================
-- 5. ESPACIOS
-- Espacios físicos del estacionamiento (gemelo digital, 10 espacios en la maqueta)
-- ============================================================
DROP TABLE IF EXISTS espacios;
CREATE TABLE espacios (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  numero                  INT           NOT NULL UNIQUE,
  estado                  ENUM('Disponible','Ocupado','Reservado','Mantenimiento') NOT NULL DEFAULT 'Disponible',
  motivo_mantenimiento    VARCHAR(255)  NULL,
  actualizado_en          DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_espacios_estado ON espacios(estado);

-- ============================================================
-- 6. SESIONES_PARQUEO
-- Tabla central: cada ingreso/salida de un vehículo a un espacio.
-- fecha_hora_salida NULL = sesión activa (alimenta Monitoreo en Tiempo Real)
-- fecha_hora_salida NOT NULL = registro histórico (alimenta Historial y Reportes)
-- ============================================================
DROP TABLE IF EXISTS sesiones_parqueo;
CREATE TABLE sesiones_parqueo (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id           INT           NOT NULL,
  espacio_id            INT           NOT NULL,
  fecha_hora_ingreso    DATETIME      NOT NULL,
  fecha_hora_salida     DATETIME      NULL,
  tarifa_aplicada       DECIMAL(8,2)  NULL,        -- snapshot de tarifa_hora vigente al momento
  monto_consumo         DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- suma de actividades.monto_consumo
  monto_descuento       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  monto_total_pagado    DECIMAL(10,2) NULL,
  estado                ENUM('Activo','Completado') NOT NULL DEFAULT 'Activo',
  creado_en             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_sesion_espacio FOREIGN KEY (espacio_id) REFERENCES espacios(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_sesion_fechas CHECK (fecha_hora_salida IS NULL OR fecha_hora_salida >= fecha_hora_ingreso)
) ENGINE=InnoDB;

CREATE INDEX idx_sesiones_vehiculo ON sesiones_parqueo(vehiculo_id);
CREATE INDEX idx_sesiones_espacio ON sesiones_parqueo(espacio_id);
CREATE INDEX idx_sesiones_estado ON sesiones_parqueo(estado);
CREATE INDEX idx_sesiones_fecha_ingreso ON sesiones_parqueo(fecha_hora_ingreso);

-- Garantiza que un espacio no tenga dos sesiones activas simultáneas
CREATE UNIQUE INDEX uq_espacio_sesion_activa
  ON sesiones_parqueo(espacio_id, estado)
  ;
-- Nota: MySQL no soporta índice único parcial nativo. Alternativa recomendada
-- en producción: columna generada `espacio_activo` y único sobre ella, p.ej.:
--   ALTER TABLE sesiones_parqueo
--   ADD COLUMN espacio_activo INT GENERATED ALWAYS AS (IF(estado='Activo', espacio_id, NULL)) STORED,
--   ADD UNIQUE INDEX uq_espacio_activo (espacio_activo);
-- (se deja como comentario para no romper la creación en motores estrictos)

-- ============================================================
-- 7. ESTABLECIMIENTOS
-- Catálogo de tiendas/servicios del centro comercial.
-- tipo_registro distingue "consumo" (monto en S/) de "tiempo" (minutos, ej. cine/gym)
-- ============================================================
DROP TABLE IF EXISTS establecimientos;
CREATE TABLE establecimientos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  categoria       ENUM('Restaurante','Supermercado','Farmacia','Cine','Gimnasio',
                       'Electrónica','Ropa','Banco','Cafetería','Servicios') NOT NULL,
  icono           VARCHAR(40)   NOT NULL DEFAULT 'fa-store',
  ubicacion       VARCHAR(120)  NULL,
  tipo_registro   ENUM('consumo','tiempo') NOT NULL DEFAULT 'consumo',
  estado          ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  descripcion     VARCHAR(255)  NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_establecimientos_categoria ON establecimientos(categoria);
CREATE INDEX idx_establecimientos_tipo ON establecimientos(tipo_registro);

-- ============================================================
-- 8. ACTIVIDADES
-- Compras/visitas registradas durante una sesión de parqueo (timeline del vehículo)
-- Si tipo_registro del establecimiento es 'tiempo', se usa duracion_minutos.
-- Si es 'consumo', se usa monto_consumo.
-- ============================================================
DROP TABLE IF EXISTS actividades;
CREATE TABLE actividades (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  sesion_id           INT           NOT NULL,
  establecimiento_id  INT           NOT NULL,
  fecha_hora          DATETIME      NOT NULL,
  descripcion         VARCHAR(255)  NULL,
  monto_consumo       DECIMAL(10,2) NULL,
  duracion_minutos    INT           NULL,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_actividad_sesion FOREIGN KEY (sesion_id) REFERENCES sesiones_parqueo(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_actividad_establecimiento FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_actividad_monto_o_tiempo CHECK (
    (monto_consumo IS NOT NULL AND duracion_minutos IS NULL) OR
    (monto_consumo IS NULL AND duracion_minutos IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE INDEX idx_actividades_sesion ON actividades(sesion_id);
CREATE INDEX idx_actividades_establecimiento ON actividades(establecimiento_id);

-- ============================================================
-- 9. PROMOCIONES
-- Promociones por consumo (Tarifas y Beneficios → Promociones)
-- ============================================================
DROP TABLE IF EXISTS promociones;
CREATE TABLE promociones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  monto_minimo    DECIMAL(10,2) NOT NULL,
  beneficio       VARCHAR(150)  NOT NULL,        -- ej. "2 horas gratis", "Estacionamiento gratuito"
  fecha_inicio    DATE          NULL,
  fecha_fin       DATE          NULL,
  estado          ENUM('Activa','Inactiva') NOT NULL DEFAULT 'Activa',
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 10. PROMOCION_APLICADA
-- Registro de qué promoción se aplicó a qué sesión (relación N:M con histórico)
-- ============================================================
DROP TABLE IF EXISTS promocion_aplicada;
CREATE TABLE promocion_aplicada (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  sesion_id         INT       NOT NULL,
  promocion_id      INT       NOT NULL,
  fecha_aplicacion  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_promoapp_sesion FOREIGN KEY (sesion_id) REFERENCES sesiones_parqueo(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_promoapp_promocion FOREIGN KEY (promocion_id) REFERENCES promociones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_promoapp_sesion ON promocion_aplicada(sesion_id);

-- ============================================================
-- 11. TARIFAS_CONFIG
-- Configuración tarifaria global (Tarifas y Beneficios → Tarifas).
-- Se mantiene como historial: cada fila es una versión vigente en su rango de fechas.
-- ============================================================
DROP TABLE IF EXISTS tarifas_config;
CREATE TABLE tarifas_config (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  tarifa_hora             DECIMAL(8,2) NOT NULL,
  tarifa_minuto           DECIMAL(8,2) NOT NULL,
  tiempo_gracia_min       INT          NOT NULL DEFAULT 0,
  tarifa_maxima_diaria    DECIMAL(8,2) NOT NULL,
  horario_promo_inicio    TIME         NULL,
  horario_promo_fin       TIME         NULL,
  vigente_desde           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vigente_hasta           DATETIME     NULL
) ENGINE=InnoDB;

-- ============================================================
-- 12. DISPOSITIVOS_IOT
-- Inventario de hardware (Administración IoT). tipo_conexion: cable | wifi
-- ============================================================
DROP TABLE IF EXISTS dispositivos_iot;
CREATE TABLE dispositivos_iot (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(100)  NOT NULL,
  tipo_dispositivo    ENUM('ESP32','ESP32-CAM','RFID','Sensor','Pantalla OLED','Módulo WiFi') NOT NULL,
  icono               VARCHAR(40)   NOT NULL DEFAULT 'fa-microchip',
  tipo_conexion       ENUM('cable','wifi') NOT NULL,
  direccion_red       VARCHAR(50)   NULL,        -- IP, bus I2C, pin GPIO, etc.
  estado              ENUM('online','warning','offline') NOT NULL DEFAULT 'online',
  intensidad_senal    TINYINT       NULL,         -- 0-100, NULL si es por cable directo
  espacio_id          INT           NULL,         -- opcional: sensor asociado a un espacio específico
  ultima_conexion     DATETIME      NULL,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispositivo_espacio FOREIGN KEY (espacio_id) REFERENCES espacios(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_dispositivo_senal CHECK (intensidad_senal IS NULL OR intensidad_senal BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE INDEX idx_dispositivos_estado ON dispositivos_iot(estado);
CREATE INDEX idx_dispositivos_conexion ON dispositivos_iot(tipo_conexion);

-- ============================================================
-- 13. LOGS_IOT
-- Bitácora de eventos técnicos por dispositivo (panel de logs en Administración IoT)
-- ============================================================
DROP TABLE IF EXISTS logs_iot;
CREATE TABLE logs_iot (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id  INT       NOT NULL,
  fecha_hora      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nivel           ENUM('OK','INFO','WARN','ERR') NOT NULL,
  mensaje         VARCHAR(255) NOT NULL,
  CONSTRAINT fk_log_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivos_iot(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_logs_dispositivo ON logs_iot(dispositivo_id);
CREATE INDEX idx_logs_fecha ON logs_iot(fecha_hora);

-- ============================================================
-- 14. EVENTOS_SISTEMA
-- Feed de eventos de negocio mostrado en el Dashboard ("Eventos Recientes"):
-- ingresos, salidas, descuentos aplicados, RFID, cámara, sensores, promociones.
-- ============================================================
DROP TABLE IF EXISTS eventos_sistema;
CREATE TABLE eventos_sistema (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  tipo_evento     ENUM('entry','exit','discount','rfid','sensor','camera','promo') NOT NULL,
  sesion_id       INT       NULL,
  dispositivo_id  INT       NULL,
  administrador_id INT      NULL,        -- admin que revisó/generó el evento, si aplica
  titulo          VARCHAR(120) NOT NULL,
  descripcion     VARCHAR(255) NULL,
  fecha_hora      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evento_sesion FOREIGN KEY (sesion_id) REFERENCES sesiones_parqueo(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_evento_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivos_iot(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_evento_admin FOREIGN KEY (administrador_id) REFERENCES administradores(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_eventos_tipo ON eventos_sistema(tipo_evento);
CREATE INDEX idx_eventos_fecha ON eventos_sistema(fecha_hora);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- VISTAS DE APOYO (opcional, facilitan las pantallas del frontend)
-- ============================================================

-- Vista: vehículos actualmente en el estacionamiento (Monitoreo en Tiempo Real)
CREATE OR REPLACE VIEW vw_vehiculos_activos AS
SELECT
  sp.id               AS sesion_id,
  v.id                AS vehiculo_id,
  v.placa,
  c.nombre_completo   AS conductor,
  c.documento,
  c.telefono,
  c.correo,
  v.tipo,
  v.marca,
  v.modelo,
  v.color,
  r.nombre            AS rol,
  e.numero            AS espacio_numero,
  sp.fecha_hora_ingreso,
  TIMESTAMPDIFF(MINUTE, sp.fecha_hora_ingreso, NOW()) AS minutos_estacionado,
  sp.monto_consumo
FROM sesiones_parqueo sp
JOIN vehiculos v   ON v.id = sp.vehiculo_id
JOIN conductores c ON c.id = v.conductor_id
JOIN roles r       ON r.id = v.rol_id
JOIN espacios e    ON e.id = sp.espacio_id
WHERE sp.estado = 'Activo';

-- Vista: historial completo (Historial y Reportes)
CREATE OR REPLACE VIEW vw_historial_sesiones AS
SELECT
  sp.id                AS sesion_id,
  DATE(sp.fecha_hora_ingreso)   AS fecha,
  TIME(sp.fecha_hora_ingreso)   AS hora_ingreso,
  TIME(sp.fecha_hora_salida)    AS hora_salida,
  v.placa,
  c.nombre_completo    AS conductor,
  v.tipo,
  sp.monto_consumo,
  sp.monto_descuento,
  sp.monto_total_pagado,
  sp.estado,
  TIMEDIFF(sp.fecha_hora_salida, sp.fecha_hora_ingreso) AS tiempo_total
FROM sesiones_parqueo sp
JOIN vehiculos v   ON v.id = sp.vehiculo_id
JOIN conductores c ON c.id = v.conductor_id
ORDER BY sp.fecha_hora_ingreso DESC;

-- Vista: estado actual del gemelo digital (mapa de espacios)
CREATE OR REPLACE VIEW vw_mapa_espacios AS
SELECT
  esp.numero,
  esp.estado,
  v.placa,
  c.nombre_completo AS conductor,
  sp.fecha_hora_ingreso
FROM espacios esp
LEFT JOIN sesiones_parqueo sp ON sp.espacio_id = esp.id AND sp.estado = 'Activo'
LEFT JOIN vehiculos v ON v.id = sp.vehiculo_id
LEFT JOIN conductores c ON c.id = v.conductor_id
ORDER BY esp.numero;

-- ============================================================
-- DATOS DE EJEMPLO (coherentes con el mock data del frontend)
-- ============================================================

-- Administrador
INSERT INTO administradores (nombre, correo, usuario, contrasena_hash, tema_preferido, color_principal) VALUES
('Admin Central', 'admin@smartparking.pe', 'admin', SHA2('admin123', 256), 'oscuro', '#4f8ef7');

-- Roles
INSERT INTO roles (nombre, icono, descripcion, porcentaje_descuento, horas_gratis, exoneracion_total, prioridad_acceso, color_etiqueta) VALUES
('Usuario Común',          'fa-user',         'Tarifa estándar sin beneficios',     0,  0, 0, 'Normal', 'gray'),
('Trabajador',             'fa-briefcase',    'Personal del centro comercial',    100,  0, 1, 'Alta',   'green'),
('Cliente VIP',            'fa-crown',        'Clientes frecuentes premium',       50,  1, 0, 'Alta',   'purple'),
('Propietario de Tienda',  'fa-store',        'Arrendatarios del centro',         100,  0, 1, 'Máxima', 'blue'),
('Empresario Frecuente',   'fa-user-tie',     'Clientes corporativos',             30,  2, 0, 'Alta',   'amber'),
('Invitado Especial',      'fa-star',         'Invitados a eventos especiales',    20,  1, 0, 'Normal', 'teal'),
('Proveedor',              'fa-truck',        'Proveedores y distribuidores',       0,  3, 0, 'Normal', 'gray');

-- Espacios (10 espacios físicos de la maqueta)
INSERT INTO espacios (numero, estado) VALUES
(1,'Ocupado'),(2,'Ocupado'),(3,'Reservado'),(4,'Ocupado'),(5,'Ocupado'),
(6,'Mantenimiento'),(7,'Ocupado'),(8,'Ocupado'),(9,'Ocupado'),(10,'Disponible');

-- Conductores
INSERT INTO conductores (nombre_completo, documento, telefono, correo) VALUES
('Juan Pérez',    '47123456', '+51 987 654 321', 'juan@gmail.com'),
('María García',  '52365489', '+51 945 123 987', 'mgarcia@empresa.pe'),
('Carlos López',  '29874521', '+51 912 456 789', 'clopez@tienda.pe'),
('Ana Torres',    '71234567', '+51 974 321 654', 'atorres@hotmail.com'),
('Luis Ramírez',  '61234789', '+51 923 654 123', 'lramirez@proveedor.com'),
('Rosa Mendoza',  '47896325', '+51 987 123 456', 'rmendoza@executive.pe'),
('Pedro Soto',    '36512478', '+51 945 789 321', 'psoto@personal.com'),
('Lucia Vargas',  '58964123', '+51 912 369 852', 'lvargas@trabajo.pe');

-- Vehículos (rol_id según el orden de inserción de roles arriba)
INSERT INTO vehiculos (placa, conductor_id, rol_id, tipo, marca, modelo, color, estado) VALUES
('ABC-123', 1, 3, 'Auto',       'Toyota',     'Corolla', 'Blanco', 'Activo'),
('XYZ-789', 2, 2, 'SUV',        'Hyundai',    'Tucson',  'Negro',  'Activo'),
('LMN-456', 3, 4, 'Camioneta',  'Ford',       'F-150',   'Plata',  'Activo'),
('DEF-321', 4, 1, 'Auto',       'Kia',        'Rio',     'Rojo',   'Inactivo'),
('GHI-654', 5, 7, 'Moto',       'Honda',      'CB500',   'Azul',   'Activo'),
('JKL-987', 6, 3, 'Auto',       'Mercedes',   'C200',    'Blanco', 'Activo'),
('MNO-147', 7, 1, 'SUV',        'Nissan',     'Qashqai', 'Gris',   'Bloqueado'),
('PQR-258', 8, 2, 'Auto',       'Volkswagen', 'Golf',    'Verde',  'Activo');

-- Establecimientos
INSERT INTO establecimientos (nombre, categoria, icono, ubicacion, tipo_registro, estado) VALUES
('Plaza Vea',         'Supermercado', 'fa-cart-shopping',     'Planta Baja',       'consumo', 'Activo'),
('McDonald''s',       'Restaurante',  'fa-utensils',          'Food Court · P1',   'consumo', 'Activo'),
('Cinemark',          'Cine',         'fa-film',              'Piso 4',            'tiempo',  'Activo'),
('Boticas Arcángel',  'Farmacia',     'fa-pills',             'P1 · Ala Sur',      'consumo', 'Activo'),
('Ripley',            'Ropa',         'fa-shirt',             'Pisos 1 y 2',       'consumo', 'Activo'),
('Starbucks',         'Cafetería',    'fa-mug-saucer',        'Planta Baja',       'consumo', 'Activo'),
('Banco BCP',         'Banco',        'fa-building-columns',  'P1 · Entrada',      'consumo', 'Activo'),
('Samsung Store',     'Electrónica',  'fa-mobile-screen',     'P2 · Ala Norte',    'consumo', 'Inactivo'),
('Smart Fit',         'Gimnasio',     'fa-dumbbell',          'Piso 3',            'tiempo',  'Activo');

-- Tarifa vigente
INSERT INTO tarifas_config (tarifa_hora, tarifa_minuto, tiempo_gracia_min, tarifa_maxima_diaria, horario_promo_inicio, horario_promo_fin) VALUES
(3.50, 0.08, 15, 35.00, '08:00:00', '12:00:00');

-- Promociones
INSERT INTO promociones (nombre, monto_minimo, beneficio, fecha_inicio, fecha_fin, estado) VALUES
('Promo Básica',             50.00,  '1 hora gratis',              '2025-06-01', '2025-12-31', 'Activa'),
('Promo Media',              100.00, '2 horas gratis',              '2025-06-01', '2025-12-31', 'Activa'),
('Promo Premium',            200.00, 'Estacionamiento gratuito',    '2025-06-01', '2025-12-31', 'Activa'),
('Promoción Fin de Semana',  75.00,  '1.5 horas gratis',            '2025-06-15', '2025-06-30', 'Activa'),
('Noche de Estreno',         150.00, '3 horas gratis',              '2025-06-20', '2025-06-22', 'Inactiva');

-- Dispositivos IoT
INSERT INTO dispositivos_iot (nombre, tipo_dispositivo, icono, tipo_conexion, direccion_red, estado, intensidad_senal, ultima_conexion) VALUES
('ESP32 Principal',  'ESP32',          'fa-microchip',       'wifi',  '192.168.1.101', 'online',  95, NOW()),
('ESP32-CAM',        'ESP32-CAM',      'fa-camera',          'wifi',  '192.168.1.105', 'online',  88, NOW()),
('RFID RC522',       'RFID',           'fa-satellite-dish',  'cable', 'I2C-0x28',      'online',  92, NOW()),
('Sensor Entrada',   'Sensor',         'fa-code-branch',     'cable', 'GPIO-D4',       'online',  97, NOW()),
('Sensor Salida',    'Sensor',         'fa-code-merge',      'cable', 'GPIO-D5',       'warning', 61, NOW()),
('Sensores Estac.',  'Sensor',         'fa-square-parking',  'cable', 'I2C-Bus',       'online',  84, NOW()),
('Pantalla OLED',    'Pantalla OLED',  'fa-desktop',         'cable', 'I2C-0x3C',      'online', 100, NOW()),
('Módulo WiFi',      'Módulo WiFi',    'fa-wifi',            'wifi',  '192.168.1.1',   'online',  79, NOW());

-- Sesiones de parqueo: 7 activas (espacios 1,2,4,5,7,8,9) + históricas (espacio 3 reservado y 6 en mantenimiento sin sesión)
INSERT INTO sesiones_parqueo (vehiculo_id, espacio_id, fecha_hora_ingreso, fecha_hora_salida, tarifa_aplicada, monto_consumo, monto_descuento, monto_total_pagado, estado) VALUES
(1, 1, '2025-06-18 10:20:00', NULL, 3.50, 120.00, 10.00, NULL, 'Activo'),   -- ABC-123
(2, 2, '2025-06-18 09:05:00', NULL, 3.50,   0.00,  0.00, NULL, 'Activo'),   -- XYZ-789 (exonerado, trabajador)
(3, 4, '2025-06-18 08:15:00', NULL, 3.50, 890.00,890.00, NULL, 'Activo'),   -- LMN-456 (propietario, exonerado)
(5, 5, '2025-06-18 11:45:00', NULL, 3.50, 120.00,  0.00, NULL, 'Activo'),   -- GHI-654
(6, 7, '2025-06-18 07:30:00', NULL, 3.50, 210.00,105.00, NULL, 'Activo'),   -- JKL-987 (VIP 50%)
(8, 8, '2025-06-18 08:00:00', NULL, 3.50,   0.00,  0.00, NULL, 'Activo'),   -- PQR-258 (trabajador)
-- históricas
(1, 9, '2025-06-17 14:00:00', '2025-06-17 16:30:00', 3.50,  55.00,  0.00,  7.50, 'Completado'),
(6, 9, '2025-06-17 10:00:00', '2025-06-17 11:15:00', 3.50, 210.00,105.00,  2.19, 'Completado'),
(7, 9, '2025-06-17 08:00:00', '2025-06-17 13:00:00', 3.50,  30.00,  0.00, 15.00, 'Completado'),
(8, 9, '2025-06-16 09:30:00', '2025-06-16 11:00:00', 3.50,   0.00,  0.00,  0.00, 'Completado'),
(5, 9, '2025-06-16 12:00:00', '2025-06-16 15:30:00', 3.50,  80.00,  0.00,  9.33, 'Completado');

-- Actividades (timeline de compras / tiempo) — ejemplo para la sesión 1 (ABC-123 activo)
INSERT INTO actividades (sesion_id, establecimiento_id, fecha_hora, descripcion, monto_consumo, duracion_minutos) VALUES
(1, 1, '2025-06-18 10:35:00', 'Compra de abarrotes y productos del hogar', 75.00, NULL),
(1, 6, '2025-06-18 11:20:00', 'Café y postre',                            18.00, NULL),
(1, 4, '2025-06-18 11:50:00', 'Vitaminas',                                27.00, NULL),
-- sesión histórica 7 (Ana Torres, DEF-321 → vehiculo 4, sesión id 7)
(7, 4, '2025-06-17 14:20:00', 'Medicamentos recetados', 55.00, NULL),
-- sesión histórica 8 (Rosa Mendoza, JKL-987, sesión id 8): incluye cine (por tiempo)
(8, 3, '2025-06-17 10:15:00', 'Función + dulcería', NULL, 45),
(8, 5, '2025-06-17 11:00:00', 'Compra de temporada', 210.00, NULL),
-- sesión histórica 11 (Luis Ramírez, GHI-654, sesión id 11): incluye gimnasio (por tiempo)
(11, 9, '2025-06-16 12:30:00', 'Rutina de pesas', NULL, 60),
(11, 1, '2025-06-16 14:00:00', 'Compras semanales', 80.00, NULL);

-- Promoción aplicada (ejemplo: sesión 3, LMN-456, superó S/200 → estacionamiento gratuito)
INSERT INTO promocion_aplicada (sesion_id, promocion_id, fecha_aplicacion) VALUES
(3, 3, '2025-06-18 08:20:00');

-- Logs IoT (recientes)
INSERT INTO logs_iot (dispositivo_id, fecha_hora, nivel, mensaje) VALUES
(3, '2025-06-18 14:37:22', 'OK',   'RFID detectado: TAG-0041 · Trabajador autenticado'),
(1, '2025-06-18 14:37:05', 'INFO', 'Vehículo ingresó: ABC-123 · Espacio 1 asignado'),
(4, '2025-06-18 14:36:58', 'OK',   'Barrera de entrada abierta · Sensor confirmado'),
(5, '2025-06-18 14:36:30', 'WARN', 'Sensor B-07 sin respuesta · Reintentando conexión...'),
(7, '2025-06-18 14:32:15', 'INFO', 'OLED actualizado: 1 espacio libre / 10 total'),
(5, '2025-06-18 14:28:44', 'ERR',  'Sensor B-07: Timeout · Reconectando (intento 3/5)');

-- Eventos del sistema (Dashboard → Eventos Recientes)
INSERT INTO eventos_sistema (tipo_evento, sesion_id, dispositivo_id, titulo, descripcion, fecha_hora) VALUES
('entry',    1, 4, 'Vehículo ingresó',        'ABC-123 · Juan Pérez · Espacio 1',          '2025-06-18 14:35:00'),
('exit',     7, 4, 'Vehículo salió',          'DEF-321 · 2h 30m · S/ 7.50',                '2025-06-18 14:30:00'),
('discount', 6, NULL,'Descuento aplicado',    'JKL-987 · Cliente VIP 50%',                 '2025-06-18 14:27:00'),
('rfid',     NULL, 3,'RFID detectado',        'TAG-0041 · Trabajador verificado',          '2025-06-18 14:23:00'),
('sensor',   NULL, 5,'Sensor desconectado',   'Sensor B-07 · Nivel 2',                     '2025-06-18 14:17:00'),
('camera',   NULL, 2,'Cámara activa',         'ESP32-CAM · Entrada principal',             '2025-06-18 14:13:00'),
('promo',    3, NULL,'Promoción utilizada',   'Consumo >S/200 · Estacionamiento gratuito', '2025-06-18 14:05:00');

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
