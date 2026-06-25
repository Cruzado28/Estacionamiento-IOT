-- ============================================================
-- SMART PARKING IOT
-- ESQUEMA CORREGIDO PARA MYSQL EN RAILWAY
-- ============================================================
-- Incluye:
-- Conductores, vehículos, RFID, roles, espacios,
-- sesiones de parqueo, pagos, establecimientos,
-- actividades, promociones, tarifas, dispositivos IoT,
-- logs, eventos y administradores.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '-05:00';

-- ============================================================
-- 1. ADMINISTRADORES DEL SISTEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS administradores (
    id_admin INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    tema_preferido ENUM('dark', 'light') DEFAULT 'dark',
    color_principal VARCHAR(20) DEFAULT '#4f8ef7',
    estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. ROLES Y BENEFICIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id_rol INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,
    icono VARCHAR(60),
    porcentaje_descuento DECIMAL(5,2) DEFAULT 0.00,
    horas_gratis INT UNSIGNED DEFAULT 0,
    exoneracion_total BOOLEAN DEFAULT FALSE,
    prioridad_acceso ENUM('Normal', 'Alta', 'Maxima') DEFAULT 'Normal',
    descripcion VARCHAR(255),
    estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_roles_descuento
        CHECK (
            porcentaje_descuento >= 0
            AND porcentaje_descuento <= 100
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. CONDUCTORES
-- ============================================================

CREATE TABLE IF NOT EXISTS conductores (
    id_conductor INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_completo VARCHAR(120) NOT NULL,
    documento VARCHAR(20) NOT NULL UNIQUE,
    telefono VARCHAR(25),
    correo VARCHAR(150) UNIQUE,
    estado ENUM('Activo', 'Inactivo', 'Bloqueado') DEFAULT 'Activo',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4. VEHÍCULOS
-- ============================================================

CREATE TABLE IF NOT EXISTS vehiculos (
    id_vehiculo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    placa VARCHAR(15) NOT NULL UNIQUE,
    conductor_id INT UNSIGNED NOT NULL,
    rol_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    marca VARCHAR(60),
    modelo VARCHAR(60),
    color VARCHAR(40),
    estado ENUM('Activo', 'Inactivo', 'Bloqueado') DEFAULT 'Activo',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_vehiculos_conductor (conductor_id),
    INDEX idx_vehiculos_rol (rol_id),
    INDEX idx_vehiculos_estado (estado),

    CONSTRAINT fk_vehiculos_conductor
        FOREIGN KEY (conductor_id)
        REFERENCES conductores(id_conductor)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vehiculos_rol
        FOREIGN KEY (rol_id)
        REFERENCES roles(id_rol)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5. TARJETAS RFID
-- ============================================================

CREATE TABLE IF NOT EXISTS tarjetas_rfid (
    id_tarjeta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uid_rfid VARCHAR(80) NOT NULL UNIQUE,
    vehiculo_id INT UNSIGNED,
    saldo_virtual DECIMAL(10,2) DEFAULT 0.00,
    estado ENUM('Activa', 'Inactiva', 'Bloqueada') DEFAULT 'Activa',
    fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultima_lectura DATETIME NULL,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_rfid_vehiculo (vehiculo_id),
    INDEX idx_rfid_estado (estado),

    CONSTRAINT fk_rfid_vehiculo
        FOREIGN KEY (vehiculo_id)
        REFERENCES vehiculos(id_vehiculo)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_rfid_saldo
        CHECK (saldo_virtual >= 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
-- 6. ESPACIOS DEL ESTACIONAMIENTO
-- ============================================================

CREATE TABLE IF NOT EXISTS espacios (
    id_espacio INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    numero INT UNSIGNED NOT NULL UNIQUE,
    zona VARCHAR(50) DEFAULT 'Zona general',
    estado ENUM(
        'Libre',
        'Ocupado',
        'Reservado',
        'Mantenimiento'
    ) DEFAULT 'Libre',
    motivo_mantenimiento VARCHAR(255),
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_espacios_estado (estado),

    CONSTRAINT chk_espacios_numero
        CHECK (numero > 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 7. SESIONES DE PARQUEO
-- ============================================================

CREATE TABLE IF NOT EXISTS sesiones_parqueo (
    id_sesion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id INT UNSIGNED NOT NULL,
    espacio_id INT UNSIGNED NOT NULL,
    tarjeta_id INT UNSIGNED,

    fecha_hora_ingreso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_hora_pago DATETIME NULL,
    hora_limite_salida DATETIME NULL,
    fecha_hora_salida DATETIME NULL,

    tarifa_aplicada DECIMAL(10,4) DEFAULT 0.0000,
    tiempo_minutos INT UNSIGNED DEFAULT 0,
    monto_consumo DECIMAL(10,2) DEFAULT 0.00,
    monto_descuento DECIMAL(10,2) DEFAULT 0.00,
    monto_total_pagado DECIMAL(10,2) DEFAULT 0.00,

    pago_realizado BOOLEAN DEFAULT FALSE,

    estado ENUM(
        'Activa',
        'Pagada',
        'Finalizada',
        'Penalizada',
        'Cancelada'
    ) DEFAULT 'Activa',

    observaciones VARCHAR(255),

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    vehiculo_activo_id INT UNSIGNED
        GENERATED ALWAYS AS (
            CASE
                WHEN fecha_hora_salida IS NULL
                     AND estado IN ('Activa', 'Pagada', 'Penalizada')
                THEN vehiculo_id
                ELSE NULL
            END
        ) STORED,

    espacio_activo_id INT UNSIGNED
        GENERATED ALWAYS AS (
            CASE
                WHEN fecha_hora_salida IS NULL
                     AND estado IN ('Activa', 'Pagada', 'Penalizada')
                THEN espacio_id
                ELSE NULL
            END
        ) STORED,

    INDEX idx_sesiones_vehiculo (vehiculo_id),
    INDEX idx_sesiones_espacio (espacio_id),
    INDEX idx_sesiones_tarjeta (tarjeta_id),
    INDEX idx_sesiones_estado (estado),
    INDEX idx_sesiones_ingreso (fecha_hora_ingreso),
    INDEX idx_sesiones_salida (fecha_hora_salida),

    UNIQUE KEY uk_vehiculo_sesion_activa (vehiculo_activo_id),
    UNIQUE KEY uk_espacio_sesion_activa (espacio_activo_id),

    CONSTRAINT fk_sesiones_vehiculo
        FOREIGN KEY (vehiculo_id)
        REFERENCES vehiculos(id_vehiculo)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT fk_sesiones_espacio
        FOREIGN KEY (espacio_id)
        REFERENCES espacios(id_espacio)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT fk_sesiones_tarjeta
        FOREIGN KEY (tarjeta_id)
        REFERENCES tarjetas_rfid(id_tarjeta)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_sesiones_montos
        CHECK (
            tarifa_aplicada >= 0
            AND monto_consumo >= 0
            AND monto_descuento >= 0
            AND monto_total_pagado >= 0
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 8. PAGOS
-- ============================================================

CREATE TABLE IF NOT EXISTS pagos (
    id_pago INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sesion_id INT UNSIGNED NOT NULL,
    tarjeta_id INT UNSIGNED,

    monto DECIMAL(10,2) NOT NULL,

    metodo_pago ENUM(
        'Saldo virtual',
        'Efectivo',
        'Tarjeta bancaria',
        'Yape',
        'Plin',
        'Demo'
    ) DEFAULT 'Saldo virtual',

    estado ENUM(
        'Pendiente',
        'Completado',
        'Anulado'
    ) DEFAULT 'Completado',

    referencia VARCHAR(100),
    fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
    observaciones VARCHAR(255),

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_pagos_sesion (sesion_id),
    INDEX idx_pagos_tarjeta (tarjeta_id),
    INDEX idx_pagos_fecha (fecha_pago),
    INDEX idx_pagos_estado (estado),

    CONSTRAINT fk_pagos_sesion
        FOREIGN KEY (sesion_id)
        REFERENCES sesiones_parqueo(id_sesion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pagos_tarjeta
        FOREIGN KEY (tarjeta_id)
        REFERENCES tarjetas_rfid(id_tarjeta)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_pagos_monto
        CHECK (monto >= 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 9. MOVIMIENTOS DE SALDO RFID
-- ============================================================

CREATE TABLE IF NOT EXISTS movimientos_saldo (
    id_movimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tarjeta_id INT UNSIGNED NOT NULL,
    pago_id INT UNSIGNED,

    tipo ENUM(
        'Recarga',
        'Cobro',
        'Devolucion',
        'Ajuste'
    ) NOT NULL,

    monto DECIMAL(10,2) NOT NULL,
    saldo_anterior DECIMAL(10,2) NOT NULL,
    saldo_nuevo DECIMAL(10,2) NOT NULL,

    descripcion VARCHAR(255),
    fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_movimientos_tarjeta (tarjeta_id),
    INDEX idx_movimientos_pago (pago_id),
    INDEX idx_movimientos_fecha (fecha_movimiento),

    CONSTRAINT fk_movimientos_tarjeta
        FOREIGN KEY (tarjeta_id)
        REFERENCES tarjetas_rfid(id_tarjeta)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_movimientos_pago
        FOREIGN KEY (pago_id)
        REFERENCES pagos(id_pago)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_movimientos_montos
        CHECK (
            monto >= 0
            AND saldo_anterior >= 0
            AND saldo_nuevo >= 0
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
-- 10. ESTABLECIMIENTOS DEL CENTRO COMERCIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS establecimientos (
    id_establecimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    icono VARCHAR(60),
    ubicacion VARCHAR(150),

    tipo_registro ENUM(
        'Consumo',
        'Tiempo'
    ) DEFAULT 'Consumo',

    estado ENUM(
        'Activo',
        'Inactivo'
    ) DEFAULT 'Activo',

    descripcion VARCHAR(255),

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_establecimientos_categoria (categoria),
    INDEX idx_establecimientos_tipo (tipo_registro),
    INDEX idx_establecimientos_estado (estado),

    UNIQUE KEY uk_establecimiento_nombre_ubicacion (
        nombre,
        ubicacion
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 11. ACTIVIDADES REALIZADAS DURANTE LA SESIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS actividades (
    id_actividad INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sesion_id INT UNSIGNED NOT NULL,
    establecimiento_id INT UNSIGNED NOT NULL,

    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    descripcion VARCHAR(255),

    monto_consumo DECIMAL(10,2) DEFAULT 0.00,
    duracion_minutos INT UNSIGNED DEFAULT 0,

    tipo_registro ENUM(
        'Consumo',
        'Tiempo'
    ) NOT NULL,

    estado ENUM(
        'Registrada',
        'Anulada'
    ) DEFAULT 'Registrada',

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_actividades_sesion (sesion_id),
    INDEX idx_actividades_establecimiento (establecimiento_id),
    INDEX idx_actividades_fecha (fecha_hora),
    INDEX idx_actividades_estado (estado),

    CONSTRAINT fk_actividades_sesion
        FOREIGN KEY (sesion_id)
        REFERENCES sesiones_parqueo(id_sesion)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_actividades_establecimiento
        FOREIGN KEY (establecimiento_id)
        REFERENCES establecimientos(id_establecimiento)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_actividades_valores
        CHECK (
            monto_consumo >= 0
            AND duracion_minutos >= 0
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 12. PROMOCIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS promociones (
    id_promocion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,

    monto_minimo DECIMAL(10,2) DEFAULT 0.00,

    tipo_beneficio ENUM(
        'Porcentaje',
        'Horas gratis',
        'Minutos gratis',
        'Exoneracion total',
        'Monto fijo'
    ) NOT NULL,

    valor_beneficio DECIMAL(10,2) DEFAULT 0.00,
    beneficio_descripcion VARCHAR(255),

    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,

    estado ENUM(
        'Activa',
        'Inactiva',
        'Vencida'
    ) DEFAULT 'Activa',

    limite_usos INT UNSIGNED NULL,
    usos_realizados INT UNSIGNED DEFAULT 0,

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_promociones_estado (estado),
    INDEX idx_promociones_fechas (fecha_inicio, fecha_fin),

    CONSTRAINT chk_promociones_montos
        CHECK (
            monto_minimo >= 0
            AND valor_beneficio >= 0
        ),

    CONSTRAINT chk_promociones_fechas
        CHECK (fecha_fin >= fecha_inicio),

    CONSTRAINT chk_promociones_usos
        CHECK (
            usos_realizados >= 0
            AND (
                limite_usos IS NULL
                OR usos_realizados <= limite_usos
            )
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 13. PROMOCIONES APLICADAS A LAS SESIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS promociones_aplicadas (
    id_promocion_aplicada INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sesion_id INT UNSIGNED NOT NULL,
    promocion_id INT UNSIGNED NOT NULL,

    monto_antes_descuento DECIMAL(10,2) DEFAULT 0.00,
    monto_descontado DECIMAL(10,2) DEFAULT 0.00,
    monto_despues_descuento DECIMAL(10,2) DEFAULT 0.00,

    fecha_aplicacion DATETIME DEFAULT CURRENT_TIMESTAMP,

    estado ENUM(
        'Aplicada',
        'Anulada'
    ) DEFAULT 'Aplicada',

    INDEX idx_promociones_aplicadas_sesion (sesion_id),
    INDEX idx_promociones_aplicadas_promocion (promocion_id),
    INDEX idx_promociones_aplicadas_fecha (fecha_aplicacion),

    UNIQUE KEY uk_promocion_por_sesion (
        sesion_id,
        promocion_id
    ),

    CONSTRAINT fk_promocion_aplicada_sesion
        FOREIGN KEY (sesion_id)
        REFERENCES sesiones_parqueo(id_sesion)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_promocion_aplicada_promocion
        FOREIGN KEY (promocion_id)
        REFERENCES promociones(id_promocion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_promociones_aplicadas_montos
        CHECK (
            monto_antes_descuento >= 0
            AND monto_descontado >= 0
            AND monto_despues_descuento >= 0
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
-- 14. CONFIGURACIÓN DE TARIFAS
-- ============================================================

CREATE TABLE IF NOT EXISTS tarifas_config (
    id_tarifa INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    nombre VARCHAR(100) NOT NULL DEFAULT 'Tarifa general',

    tarifa_hora DECIMAL(10,2) NOT NULL DEFAULT 3.50,
    tarifa_minuto DECIMAL(10,4) NOT NULL DEFAULT 0.0583,

    tiempo_gracia_min INT UNSIGNED DEFAULT 15,
    tiempo_salida_despues_pago_min INT UNSIGNED DEFAULT 10,

    tarifa_maxima_diaria DECIMAL(10,2) DEFAULT 35.00,

    horario_promocional_inicio TIME NULL,
    horario_promocional_fin TIME NULL,

    estado ENUM(
        'Activa',
        'Inactiva'
    ) DEFAULT 'Activa',

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_tarifas_estado (estado),

    CONSTRAINT chk_tarifas_valores
        CHECK (
            tarifa_hora >= 0
            AND tarifa_minuto >= 0
            AND tarifa_maxima_diaria >= 0
            AND tiempo_gracia_min >= 0
            AND tiempo_salida_despues_pago_min >= 0
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 15. DISPOSITIVOS IOT
-- ============================================================

CREATE TABLE IF NOT EXISTS dispositivos_iot (
    id_dispositivo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    codigo VARCHAR(60) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,

    tipo_dispositivo ENUM(
        'ESP32',
        'ESP32-CAM',
        'RFID',
        'Sensor',
        'OLED',
        'Servomotor',
        'Puntero laser',
        'LDR',
        'Potenciometro',
        'Otro'
    ) NOT NULL,

    tipo_conexion ENUM(
        'WiFi',
        'Cable',
        'I2C',
        'SPI',
        'GPIO',
        'Serial',
        'Otro'
    ) DEFAULT 'WiFi',

    direccion_red VARCHAR(100),
    ubicacion VARCHAR(150),

    estado ENUM(
        'Online',
        'Offline',
        'Advertencia',
        'Mantenimiento'
    ) DEFAULT 'Offline',

    intensidad_senal INT UNSIGNED DEFAULT 0,
    latencia_ms INT UNSIGNED DEFAULT 0,

    ultima_conexion DATETIME NULL,
    ultima_lectura DATETIME NULL,

    descripcion VARCHAR(255),

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_dispositivos_tipo (tipo_dispositivo),
    INDEX idx_dispositivos_estado (estado),
    INDEX idx_dispositivos_ultima_conexion (ultima_conexion),

    CONSTRAINT chk_dispositivos_senal
        CHECK (
            intensidad_senal >= 0
            AND intensidad_senal <= 100
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 16. LOGS DE DISPOSITIVOS IOT
-- ============================================================

CREATE TABLE IF NOT EXISTS logs_iot (
    id_log INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispositivo_id INT UNSIGNED NOT NULL,

    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,

    nivel ENUM(
        'OK',
        'INFO',
        'WARN',
        'ERROR',
        'DEBUG'
    ) DEFAULT 'INFO',

    codigo_evento VARCHAR(60),
    mensaje TEXT NOT NULL,

    datos_adicionales JSON NULL,

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_logs_dispositivo (dispositivo_id),
    INDEX idx_logs_fecha (fecha_hora),
    INDEX idx_logs_nivel (nivel),

    CONSTRAINT fk_logs_dispositivo
        FOREIGN KEY (dispositivo_id)
        REFERENCES dispositivos_iot(id_dispositivo)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 17. EVENTOS GENERALES DEL SISTEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS eventos_sistema (
    id_evento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    tipo_evento VARCHAR(80) NOT NULL,

    sesion_id INT UNSIGNED NULL,
    dispositivo_id INT UNSIGNED NULL,
    administrador_id INT UNSIGNED NULL,
    tarjeta_id INT UNSIGNED NULL,

    descripcion TEXT NOT NULL,

    nivel ENUM(
        'Informativo',
        'Exitoso',
        'Advertencia',
        'Error'
    ) DEFAULT 'Informativo',

    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,

    revisado BOOLEAN DEFAULT FALSE,
    fecha_revision DATETIME NULL,

    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_eventos_tipo (tipo_evento),
    INDEX idx_eventos_sesion (sesion_id),
    INDEX idx_eventos_dispositivo (dispositivo_id),
    INDEX idx_eventos_administrador (administrador_id),
    INDEX idx_eventos_tarjeta (tarjeta_id),
    INDEX idx_eventos_fecha (fecha_hora),
    INDEX idx_eventos_nivel (nivel),
    INDEX idx_eventos_revisado (revisado),

    CONSTRAINT fk_eventos_sesion
        FOREIGN KEY (sesion_id)
        REFERENCES sesiones_parqueo(id_sesion)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_eventos_dispositivo
        FOREIGN KEY (dispositivo_id)
        REFERENCES dispositivos_iot(id_dispositivo)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_eventos_administrador
        FOREIGN KEY (administrador_id)
        REFERENCES administradores(id_admin)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_eventos_tarjeta
        FOREIGN KEY (tarjeta_id)
        REFERENCES tarjetas_rfid(id_tarjeta)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
-- 18. VISTA: ESTADO ACTUAL DE LOS ESPACIOS
-- ============================================================

CREATE OR REPLACE VIEW vw_estado_espacios AS
SELECT
    e.id_espacio,
    e.numero AS numero_espacio,
    e.zona,
    e.estado AS estado_espacio,
    e.motivo_mantenimiento,

    s.id_sesion,
    s.estado AS estado_sesion,
    s.fecha_hora_ingreso,

    TIMESTAMPDIFF(
        MINUTE,
        s.fecha_hora_ingreso,
        NOW()
    ) AS tiempo_actual_minutos,

    v.id_vehiculo,
    v.placa,
    v.tipo AS tipo_vehiculo,
    v.marca,
    v.modelo,
    v.color,

    c.id_conductor,
    c.nombre_completo AS conductor,

    r.id_rol,
    r.nombre AS rol,

    t.id_tarjeta,
    t.uid_rfid

FROM espacios e

LEFT JOIN sesiones_parqueo s
    ON s.espacio_id = e.id_espacio
    AND s.fecha_hora_salida IS NULL
    AND s.estado IN (
        'Activa',
        'Pagada',
        'Penalizada'
    )

LEFT JOIN vehiculos v
    ON v.id_vehiculo = s.vehiculo_id

LEFT JOIN conductores c
    ON c.id_conductor = v.conductor_id

LEFT JOIN roles r
    ON r.id_rol = v.rol_id

LEFT JOIN tarjetas_rfid t
    ON t.id_tarjeta = s.tarjeta_id;


-- ============================================================
-- 19. VISTA: VEHÍCULOS ACTUALMENTE ESTACIONADOS
-- ============================================================

CREATE OR REPLACE VIEW vw_vehiculos_estacionados AS
SELECT
    s.id_sesion,

    e.id_espacio,
    e.numero AS espacio,
    e.zona,

    v.id_vehiculo,
    v.placa,
    v.tipo AS tipo_vehiculo,
    v.marca,
    v.modelo,
    v.color,

    c.id_conductor,
    c.nombre_completo AS conductor,
    c.documento,
    c.telefono,
    c.correo,

    r.id_rol,
    r.nombre AS rol,
    r.porcentaje_descuento,
    r.horas_gratis,
    r.exoneracion_total,

    t.id_tarjeta,
    t.uid_rfid,
    t.saldo_virtual,

    s.fecha_hora_ingreso,
    s.fecha_hora_pago,
    s.hora_limite_salida,

    TIMESTAMPDIFF(
        MINUTE,
        s.fecha_hora_ingreso,
        NOW()
    ) AS tiempo_actual_minutos,

    s.tarifa_aplicada,
    s.monto_consumo,
    s.monto_descuento,
    s.monto_total_pagado,
    s.pago_realizado,
    s.estado AS estado_sesion

FROM sesiones_parqueo s

INNER JOIN espacios e
    ON e.id_espacio = s.espacio_id

INNER JOIN vehiculos v
    ON v.id_vehiculo = s.vehiculo_id

INNER JOIN conductores c
    ON c.id_conductor = v.conductor_id

INNER JOIN roles r
    ON r.id_rol = v.rol_id

LEFT JOIN tarjetas_rfid t
    ON t.id_tarjeta = s.tarjeta_id

WHERE
    s.fecha_hora_salida IS NULL
    AND s.estado IN (
        'Activa',
        'Pagada',
        'Penalizada'
    );


-- ============================================================
-- 20. VISTA: HISTORIAL COMPLETO DE SESIONES
-- ============================================================

CREATE OR REPLACE VIEW vw_historial_sesiones AS
SELECT
    s.id_sesion,

    v.id_vehiculo,
    v.placa,
    v.tipo AS tipo_vehiculo,
    v.marca,
    v.modelo,
    v.color,

    c.id_conductor,
    c.nombre_completo AS conductor,
    c.documento,

    r.nombre AS rol,

    e.numero AS espacio,
    e.zona,

    t.uid_rfid,

    s.fecha_hora_ingreso,
    s.fecha_hora_pago,
    s.fecha_hora_salida,

    CASE
        WHEN s.fecha_hora_salida IS NOT NULL
        THEN TIMESTAMPDIFF(
            MINUTE,
            s.fecha_hora_ingreso,
            s.fecha_hora_salida
        )
        ELSE TIMESTAMPDIFF(
            MINUTE,
            s.fecha_hora_ingreso,
            NOW()
        )
    END AS tiempo_total_minutos,

    s.tarifa_aplicada,

    (
        SELECT COALESCE(
            SUM(a.monto_consumo),
            0.00
        )
        FROM actividades a
        WHERE
            a.sesion_id = s.id_sesion
            AND a.estado = 'Registrada'
    ) AS consumo_registrado,

    s.monto_descuento,

    (
        SELECT COALESCE(
            SUM(p.monto),
            0.00
        )
        FROM pagos p
        WHERE
            p.sesion_id = s.id_sesion
            AND p.estado = 'Completado'
    ) AS total_pagado,

    s.pago_realizado,
    s.estado

FROM sesiones_parqueo s

INNER JOIN vehiculos v
    ON v.id_vehiculo = s.vehiculo_id

INNER JOIN conductores c
    ON c.id_conductor = v.conductor_id

INNER JOIN roles r
    ON r.id_rol = v.rol_id

INNER JOIN espacios e
    ON e.id_espacio = s.espacio_id

LEFT JOIN tarjetas_rfid t
    ON t.id_tarjeta = s.tarjeta_id;


-- ============================================================
-- 21. VISTA: RESUMEN GENERAL DEL DASHBOARD
-- ============================================================

CREATE OR REPLACE VIEW vw_dashboard_resumen AS
SELECT

    (
        SELECT COUNT(*)
        FROM espacios
    ) AS total_espacios,

    (
        SELECT COUNT(*)
        FROM espacios
        WHERE estado = 'Libre'
    ) AS espacios_libres,

    (
        SELECT COUNT(*)
        FROM espacios
        WHERE estado = 'Ocupado'
    ) AS espacios_ocupados,

    (
        SELECT COUNT(*)
        FROM espacios
        WHERE estado = 'Reservado'
    ) AS espacios_reservados,

    (
        SELECT COUNT(*)
        FROM espacios
        WHERE estado = 'Mantenimiento'
    ) AS espacios_mantenimiento,

    (
        SELECT COUNT(*)
        FROM sesiones_parqueo
        WHERE
            fecha_hora_salida IS NULL
            AND estado IN (
                'Activa',
                'Pagada',
                'Penalizada'
            )
    ) AS vehiculos_activos,

    (
        SELECT COALESCE(
            SUM(monto),
            0.00
        )
        FROM pagos
        WHERE
            estado = 'Completado'
            AND DATE(fecha_pago) = CURRENT_DATE()
    ) AS ingresos_del_dia,

    (
        SELECT COUNT(*)
        FROM sesiones_parqueo
        WHERE DATE(fecha_hora_ingreso) = CURRENT_DATE()
    ) AS ingresos_vehiculares_del_dia,

    (
        SELECT COALESCE(
            ROUND(
                AVG(
                    TIMESTAMPDIFF(
                        MINUTE,
                        fecha_hora_ingreso,
                        fecha_hora_salida
                    )
                ),
                0
            ),
            0
        )
        FROM sesiones_parqueo
        WHERE fecha_hora_salida IS NOT NULL
    ) AS permanencia_promedio_minutos,

    (
        SELECT COUNT(*)
        FROM dispositivos_iot
        WHERE estado = 'Online'
    ) AS dispositivos_online,

    (
        SELECT COUNT(*)
        FROM dispositivos_iot
        WHERE estado IN (
            'Offline',
            'Advertencia',
            'Mantenimiento'
        )
    ) AS dispositivos_con_alerta;


    -- ============================================================
-- 22. DATOS INICIALES DEL SISTEMA
-- ============================================================
-- Los datos utilizan INSERT IGNORE u ON DUPLICATE KEY UPDATE
-- para que el archivo pueda ejecutarse más de una vez
-- sin duplicar los registros.
-- ============================================================

START TRANSACTION;


-- ============================================================
-- 22.1 ROLES Y BENEFICIOS INICIALES
-- ============================================================

INSERT INTO roles (
    nombre,
    icono,
    porcentaje_descuento,
    horas_gratis,
    exoneracion_total,
    prioridad_acceso,
    descripcion,
    estado
)
VALUES
(
    'Usuario Comun',
    'fa-user',
    0.00,
    0,
    FALSE,
    'Normal',
    'Usuario que paga la tarifa general del estacionamiento.',
    'Activo'
),
(
    'Trabajador',
    'fa-briefcase',
    100.00,
    0,
    TRUE,
    'Alta',
    'Personal autorizado del centro comercial.',
    'Activo'
),
(
    'Cliente VIP',
    'fa-crown',
    50.00,
    1,
    FALSE,
    'Alta',
    'Cliente frecuente con descuentos y beneficios especiales.',
    'Activo'
),
(
    'Propietario de Tienda',
    'fa-store',
    100.00,
    0,
    TRUE,
    'Maxima',
    'Propietario o arrendatario de un establecimiento.',
    'Activo'
),
(
    'Empresario Frecuente',
    'fa-user-tie',
    30.00,
    2,
    FALSE,
    'Alta',
    'Cliente corporativo con visitas frecuentes.',
    'Activo'
),
(
    'Invitado Especial',
    'fa-star',
    20.00,
    1,
    FALSE,
    'Alta',
    'Invitado autorizado para eventos o actividades especiales.',
    'Activo'
),
(
    'Proveedor',
    'fa-truck',
    0.00,
    3,
    FALSE,
    'Normal',
    'Proveedor autorizado para carga, descarga y distribución.',
    'Activo'
)
ON DUPLICATE KEY UPDATE
    icono = VALUES(icono),
    porcentaje_descuento = VALUES(porcentaje_descuento),
    horas_gratis = VALUES(horas_gratis),
    exoneracion_total = VALUES(exoneracion_total),
    prioridad_acceso = VALUES(prioridad_acceso),
    descripcion = VALUES(descripcion),
    estado = VALUES(estado);


-- ============================================================
-- 22.2 CONDUCTORES DE PRUEBA
-- ============================================================

INSERT INTO conductores (
    nombre_completo,
    documento,
    telefono,
    correo,
    estado
)
VALUES
(
    'Juan Perez',
    '47123456',
    '+51 987 654 321',
    'juan.perez@correo.pe',
    'Activo'
),
(
    'Maria Garcia',
    '52365489',
    '+51 945 123 987',
    'maria.garcia@correo.pe',
    'Activo'
),
(
    'Carlos Lopez',
    '29874521',
    '+51 912 456 789',
    'carlos.lopez@correo.pe',
    'Activo'
),
(
    'Ana Torres',
    '71234567',
    '+51 974 321 654',
    'ana.torres@correo.pe',
    'Activo'
),
(
    'Luis Ramirez',
    '61234789',
    '+51 923 654 123',
    'luis.ramirez@correo.pe',
    'Activo'
),
(
    'Rosa Mendoza',
    '47896325',
    '+51 987 123 456',
    'rosa.mendoza@correo.pe',
    'Activo'
),
(
    'Pedro Soto',
    '36512478',
    '+51 945 789 321',
    'pedro.soto@correo.pe',
    'Activo'
),
(
    'Lucia Vargas',
    '58964123',
    '+51 912 369 852',
    'lucia.vargas@correo.pe',
    'Activo'
)
ON DUPLICATE KEY UPDATE
    nombre_completo = VALUES(nombre_completo),
    telefono = VALUES(telefono),
    correo = VALUES(correo),
    estado = VALUES(estado);


-- ============================================================
-- 22.3 VEHÍCULOS DE PRUEBA
-- ============================================================

INSERT INTO vehiculos (
    placa,
    conductor_id,
    rol_id,
    tipo,
    marca,
    modelo,
    color,
    estado
)
VALUES
(
    'ABC-123',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '47123456'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Cliente VIP'
    ),
    'Auto',
    'Toyota',
    'Corolla',
    'Blanco',
    'Activo'
),
(
    'XYZ-789',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '52365489'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Trabajador'
    ),
    'SUV',
    'Hyundai',
    'Tucson',
    'Negro',
    'Activo'
),
(
    'LMN-456',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '29874521'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Propietario de Tienda'
    ),
    'Camioneta',
    'Ford',
    'F-150',
    'Plata',
    'Activo'
),
(
    'DEF-321',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '71234567'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Usuario Comun'
    ),
    'Auto',
    'Kia',
    'Rio',
    'Rojo',
    'Activo'
),
(
    'GHI-654',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '61234789'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Proveedor'
    ),
    'Moto',
    'Honda',
    'CB500',
    'Azul',
    'Activo'
),
(
    'JKL-987',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '47896325'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Cliente VIP'
    ),
    'Auto',
    'Mercedes Benz',
    'C200',
    'Blanco',
    'Activo'
),
(
    'MNO-147',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '36512478'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Usuario Comun'
    ),
    'SUV',
    'Nissan',
    'Qashqai',
    'Gris',
    'Activo'
),
(
    'PQR-258',
    (
        SELECT id_conductor
        FROM conductores
        WHERE documento = '58964123'
    ),
    (
        SELECT id_rol
        FROM roles
        WHERE nombre = 'Trabajador'
    ),
    'Auto',
    'Volkswagen',
    'Golf',
    'Verde',
    'Activo'
)
ON DUPLICATE KEY UPDATE
    conductor_id = VALUES(conductor_id),
    rol_id = VALUES(rol_id),
    tipo = VALUES(tipo),
    marca = VALUES(marca),
    modelo = VALUES(modelo),
    color = VALUES(color),
    estado = VALUES(estado);


-- ============================================================
-- 22.4 TARJETAS RFID
-- ============================================================

INSERT INTO tarjetas_rfid (
    uid_rfid,
    vehiculo_id,
    saldo_virtual,
    estado
)
VALUES
(
    'RFID-001',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'ABC-123'
    ),
    50.00,
    'Activa'
),
(
    'RFID-002',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'XYZ-789'
    ),
    40.00,
    'Activa'
),
(
    'RFID-003',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'LMN-456'
    ),
    30.00,
    'Activa'
),
(
    'RFID-004',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'DEF-321'
    ),
    25.00,
    'Activa'
),
(
    'RFID-005',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'GHI-654'
    ),
    20.00,
    'Activa'
),
(
    'RFID-006',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'JKL-987'
    ),
    60.00,
    'Activa'
),
(
    'RFID-007',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'MNO-147'
    ),
    15.00,
    'Activa'
),
(
    'RFID-008',
    (
        SELECT id_vehiculo
        FROM vehiculos
        WHERE placa = 'PQR-258'
    ),
    35.00,
    'Activa'
)
ON DUPLICATE KEY UPDATE
    vehiculo_id = VALUES(vehiculo_id),
    estado = VALUES(estado);


-- ============================================================
-- 22.5 ESPACIOS DEL ESTACIONAMIENTO
-- ============================================================

INSERT INTO espacios (
    numero,
    zona,
    estado,
    motivo_mantenimiento
)
VALUES
(1, 'Zona A', 'Libre', NULL),
(2, 'Zona A', 'Libre', NULL),
(3, 'Zona A', 'Libre', NULL),
(4, 'Zona A', 'Libre', NULL),
(5, 'Zona A', 'Libre', NULL),
(6, 'Zona B', 'Libre', NULL),
(7, 'Zona B', 'Libre', NULL),
(8, 'Zona B', 'Libre', NULL),
(9, 'Zona B', 'Libre', NULL),
(10, 'Zona B', 'Libre', NULL)
ON DUPLICATE KEY UPDATE
    zona = VALUES(zona);


-- ============================================================
-- 22.6 TARIFA GENERAL
-- ============================================================

INSERT INTO tarifas_config (
    nombre,
    tarifa_hora,
    tarifa_minuto,
    tiempo_gracia_min,
    tiempo_salida_despues_pago_min,
    tarifa_maxima_diaria,
    horario_promocional_inicio,
    horario_promocional_fin,
    estado
)
SELECT
    'Tarifa general',
    3.50,
    0.0583,
    15,
    10,
    35.00,
    '08:00:00',
    '12:00:00',
    'Activa'
WHERE NOT EXISTS (
    SELECT 1
    FROM tarifas_config
    WHERE nombre = 'Tarifa general'
);


-- ============================================================
-- 22.7 ESTABLECIMIENTOS
-- ============================================================

INSERT INTO establecimientos (
    nombre,
    categoria,
    icono,
    ubicacion,
    tipo_registro,
    estado,
    descripcion
)
VALUES
(
    'Plaza Vea',
    'Supermercado',
    'fa-cart-shopping',
    'Planta baja',
    'Consumo',
    'Activo',
    'Supermercado y productos para el hogar.'
),
(
    'McDonalds',
    'Restaurante',
    'fa-utensils',
    'Food Court - Piso 1',
    'Consumo',
    'Activo',
    'Restaurante de comida rápida.'
),
(
    'Cinemark',
    'Cine',
    'fa-film',
    'Piso 4',
    'Tiempo',
    'Activo',
    'Salas de cine y entretenimiento.'
),
(
    'Boticas Arcangel',
    'Farmacia',
    'fa-pills',
    'Piso 1 - Ala Sur',
    'Consumo',
    'Activo',
    'Farmacia y productos para la salud.'
),
(
    'Ripley',
    'Ropa',
    'fa-shirt',
    'Pisos 1 y 2',
    'Consumo',
    'Activo',
    'Tienda por departamentos.'
),
(
    'Starbucks',
    'Cafeteria',
    'fa-mug-saucer',
    'Planta baja',
    'Consumo',
    'Activo',
    'Cafetería y alimentos.'
),
(
    'Banco BCP',
    'Banco',
    'fa-building-columns',
    'Piso 1 - Entrada',
    'Consumo',
    'Activo',
    'Agencia bancaria y servicios financieros.'
),
(
    'Samsung Store',
    'Electronica',
    'fa-mobile-screen',
    'Piso 2 - Ala Norte',
    'Consumo',
    'Activo',
    'Venta de dispositivos y accesorios electrónicos.'
),
(
    'Smart Fit',
    'Gimnasio',
    'fa-dumbbell',
    'Piso 3',
    'Tiempo',
    'Activo',
    'Gimnasio y entrenamiento físico.'
)
ON DUPLICATE KEY UPDATE
    categoria = VALUES(categoria),
    icono = VALUES(icono),
    tipo_registro = VALUES(tipo_registro),
    estado = VALUES(estado),
    descripcion = VALUES(descripcion);


-- ============================================================
-- 22.8 PROMOCIONES
-- ============================================================

INSERT INTO promociones (
    nombre,
    monto_minimo,
    tipo_beneficio,
    valor_beneficio,
    beneficio_descripcion,
    fecha_inicio,
    fecha_fin,
    estado,
    limite_usos,
    usos_realizados
)
VALUES
(
    'Promocion Basica',
    50.00,
    'Horas gratis',
    1.00,
    'Una hora gratuita de estacionamiento.',
    '2026-01-01',
    '2026-12-31',
    'Activa',
    NULL,
    0
),
(
    'Promocion Media',
    100.00,
    'Horas gratis',
    2.00,
    'Dos horas gratuitas de estacionamiento.',
    '2026-01-01',
    '2026-12-31',
    'Activa',
    NULL,
    0
),
(
    'Promocion Premium',
    200.00,
    'Exoneracion total',
    100.00,
    'Estacionamiento completamente gratuito.',
    '2026-01-01',
    '2026-12-31',
    'Activa',
    NULL,
    0
),
(
    'Fin de Semana',
    75.00,
    'Minutos gratis',
    90.00,
    'Noventa minutos gratuitos.',
    '2026-01-01',
    '2026-12-31',
    'Activa',
    500,
    0
)
ON DUPLICATE KEY UPDATE
    monto_minimo = VALUES(monto_minimo),
    tipo_beneficio = VALUES(tipo_beneficio),
    valor_beneficio = VALUES(valor_beneficio),
    beneficio_descripcion = VALUES(beneficio_descripcion),
    fecha_inicio = VALUES(fecha_inicio),
    fecha_fin = VALUES(fecha_fin),
    estado = VALUES(estado),
    limite_usos = VALUES(limite_usos);


-- ============================================================
-- 22.9 DISPOSITIVOS IOT
-- ============================================================

INSERT INTO dispositivos_iot (
    codigo,
    nombre,
    tipo_dispositivo,
    tipo_conexion,
    direccion_red,
    ubicacion,
    estado,
    intensidad_senal,
    latencia_ms,
    ultima_conexion,
    ultima_lectura,
    descripcion
)
VALUES
(
    'ESP32-PRINCIPAL',
    'ESP32 principal',
    'ESP32',
    'WiFi',
    'Pendiente de asignar',
    'Módulo central',
    'Online',
    95,
    14,
    NOW(),
    NOW(),
    'Controlador principal del sistema.'
),
(
    'RFID-ENTRADA',
    'Lector RFID de entrada',
    'RFID',
    'SPI',
    'SPI-ENTRADA',
    'Puerta de entrada',
    'Online',
    100,
    5,
    NOW(),
    NOW(),
    'Lector utilizado para registrar el ingreso.'
),
(
    'RFID-SALIDA',
    'Lector RFID de salida',
    'RFID',
    'SPI',
    'SPI-SALIDA',
    'Puerta de salida',
    'Online',
    100,
    5,
    NOW(),
    NOW(),
    'Lector utilizado para validar pagos y salidas.'
),
(
    'SERVO-ENTRADA',
    'Servomotor de entrada',
    'Servomotor',
    'GPIO',
    'GPIO-ENTRADA',
    'Barrera de entrada',
    'Online',
    100,
    3,
    NOW(),
    NOW(),
    'Acciona la barrera de ingreso.'
),
(
    'SERVO-SALIDA',
    'Servomotor de salida',
    'Servomotor',
    'GPIO',
    'GPIO-SALIDA',
    'Barrera de salida',
    'Online',
    100,
    3,
    NOW(),
    NOW(),
    'Acciona la barrera de salida.'
),
(
    'OLED-ENTRADA',
    'Pantalla OLED de entrada',
    'OLED',
    'I2C',
    'I2C-0x3C',
    'Puerta de entrada',
    'Online',
    100,
    4,
    NOW(),
    NOW(),
    'Muestra mensajes de ingreso y espacios disponibles.'
),
(
    'OLED-SALIDA',
    'Pantalla OLED de salida',
    'OLED',
    'I2C',
    'I2C-0x3D',
    'Puerta de salida',
    'Online',
    100,
    4,
    NOW(),
    NOW(),
    'Muestra el monto y la confirmación de salida.'
),
(
    'LDR-SALIDA',
    'Sensor LDR de salida',
    'LDR',
    'GPIO',
    'GPIO-LDR',
    'Canal de salida',
    'Online',
    100,
    3,
    NOW(),
    NOW(),
    'Detecta la interrupción de la señal láser.'
),
(
    'LASER-SALIDA',
    'Puntero láser de salida',
    'Puntero laser',
    'GPIO',
    'GPIO-LASER',
    'Canal de salida',
    'Online',
    100,
    2,
    NOW(),
    NOW(),
    'Genera la señal utilizada por el sensor LDR.'
),
(
    'ESP32-CAM-01',
    'ESP32-CAM de monitoreo',
    'ESP32-CAM',
    'WiFi',
    'Pendiente de asignar',
    'Entrada principal',
    'Mantenimiento',
    0,
    0,
    NULL,
    NULL,
    'Cámara opcional para monitoreo visual.'
)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    tipo_dispositivo = VALUES(tipo_dispositivo),
    tipo_conexion = VALUES(tipo_conexion),
    ubicacion = VALUES(ubicacion),
    descripcion = VALUES(descripcion);


COMMIT;


-- ============================================================
-- 23. AUTOMATIZACIÓN DEL ESTADO DE LOS ESPACIOS
-- ============================================================
-- Estos triggers mantienen sincronizado el estado físico
-- del espacio con las sesiones de parqueo.
-- ============================================================

DROP TRIGGER IF EXISTS trg_sesion_insertar_espacio;

DROP TRIGGER IF EXISTS trg_sesion_actualizar_espacio;

DROP TRIGGER IF EXISTS trg_sesion_eliminar_espacio;


DELIMITER $$

CREATE TRIGGER trg_sesion_insertar_espacio
AFTER INSERT ON sesiones_parqueo
FOR EACH ROW
BEGIN
    IF NEW.fecha_hora_salida IS NULL
       AND NEW.estado IN (
           'Activa',
           'Pagada',
           'Penalizada'
       )
    THEN
        UPDATE espacios
        SET
            estado = 'Ocupado',
            motivo_mantenimiento = NULL
        WHERE id_espacio = NEW.espacio_id;
    END IF;
END$$


CREATE TRIGGER trg_sesion_actualizar_espacio
AFTER UPDATE ON sesiones_parqueo
FOR EACH ROW
BEGIN

    IF OLD.espacio_id <> NEW.espacio_id THEN

        UPDATE espacios
        SET estado = 'Libre'
        WHERE id_espacio = OLD.espacio_id;

    END IF;

    IF NEW.fecha_hora_salida IS NOT NULL
       OR NEW.estado IN (
           'Finalizada',
           'Cancelada'
       )
    THEN

        UPDATE espacios
        SET estado = 'Libre'
        WHERE id_espacio = NEW.espacio_id;

    ELSEIF NEW.fecha_hora_salida IS NULL
       AND NEW.estado IN (
           'Activa',
           'Pagada',
           'Penalizada'
       )
    THEN

        UPDATE espacios
        SET estado = 'Ocupado'
        WHERE id_espacio = NEW.espacio_id;

    END IF;

END$$


CREATE TRIGGER trg_sesion_eliminar_espacio
AFTER DELETE ON sesiones_parqueo
FOR EACH ROW
BEGIN

    IF OLD.fecha_hora_salida IS NULL THEN

        UPDATE espacios
        SET estado = 'Libre'
        WHERE id_espacio = OLD.espacio_id;

    END IF;

END$$

DELIMITER ;


-- ============================================================
-- 24. REGISTRO INICIAL DEL SISTEMA
-- ============================================================

INSERT INTO eventos_sistema (
    tipo_evento,
    descripcion,
    nivel,
    fecha_hora,
    revisado
)
SELECT
    'Inicializacion',
    'El esquema corregido de Smart Parking IoT fue inicializado correctamente.',
    'Exitoso',
    NOW(),
    FALSE
WHERE NOT EXISTS (
    SELECT 1
    FROM eventos_sistema
    WHERE tipo_evento = 'Inicializacion'
);


INSERT INTO logs_iot (
    dispositivo_id,
    fecha_hora,
    nivel,
    codigo_evento,
    mensaje,
    datos_adicionales
)
SELECT
    id_dispositivo,
    NOW(),
    'OK',
    'SISTEMA_INICIALIZADO',
    'ESP32 principal registrado y disponible para conexión.',
    JSON_OBJECT(
        'sistema',
        'Smart Parking IoT',
        'zona_horaria',
        '-05:00'
    )
FROM dispositivos_iot
WHERE codigo = 'ESP32-PRINCIPAL'
AND NOT EXISTS (
    SELECT 1
    FROM logs_iot
    WHERE codigo_evento = 'SISTEMA_INICIALIZADO'
);


-- ============================================================
-- 25. NOTA SOBRE EL ADMINISTRADOR
-- ============================================================
-- El usuario administrador NO se inserta aquí con una
-- contraseña escrita directamente.
--
-- Se creará posteriormente desde Node.js utilizando bcrypt,
-- para guardar una contraseña cifrada de manera segura.
-- ============================================================


-- ============================================================
-- 26. CONSULTAS FINALES DE VERIFICACIÓN
-- ============================================================

SELECT
    'ROLES' AS tabla,
    COUNT(*) AS total
FROM roles

UNION ALL

SELECT
    'CONDUCTORES',
    COUNT(*)
FROM conductores

UNION ALL

SELECT
    'VEHICULOS',
    COUNT(*)
FROM vehiculos

UNION ALL

SELECT
    'TARJETAS RFID',
    COUNT(*)
FROM tarjetas_rfid

UNION ALL

SELECT
    'ESPACIOS',
    COUNT(*)
FROM espacios

UNION ALL

SELECT
    'ESTABLECIMIENTOS',
    COUNT(*)
FROM establecimientos

UNION ALL

SELECT
    'PROMOCIONES',
    COUNT(*)
FROM promociones

UNION ALL

SELECT
    'DISPOSITIVOS IOT',
    COUNT(*)
FROM dispositivos_iot;


SELECT
    *
FROM vw_dashboard_resumen;


SELECT
    numero_espacio,
    zona,
    estado_espacio,
    placa,
    conductor,
    uid_rfid
FROM vw_estado_espacios
ORDER BY numero_espacio;


SELECT
    'ESQUEMA SMART PARKING IOT COMPLETADO CORRECTAMENTE'
        AS resultado_final;