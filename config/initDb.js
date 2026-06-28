const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./db");

/**
 * Divide el archivo SQL respetando los cambios de DELIMITER.
 * Esto permite ejecutar correctamente los triggers que contienen
 * varias instrucciones separadas por punto y coma.
 */
function dividirSentenciasSQL(contenidoSQL) {
  const sentencias = [];

  const lineas = contenidoSQL
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  let delimitador = ";";
  let acumulado = "";

  for (const lineaOriginal of lineas) {
    const lineaLimpia = lineaOriginal.trim();

    const cambioDelimitador = lineaLimpia.match(
      /^DELIMITER\s+(.+)$/i
    );

    if (cambioDelimitador) {
      delimitador = cambioDelimitador[1].trim();
      continue;
    }

    acumulado += `${lineaOriginal}\n`;

    if (
      acumulado
        .trimEnd()
        .endsWith(delimitador)
    ) {
      const sentencia = acumulado
        .trimEnd()
        .slice(0, -delimitador.length)
        .trim();

      if (sentencia) {
        sentencias.push(sentencia);
      }

      acumulado = "";
    }
  }

  if (acumulado.trim()) {
    sentencias.push(acumulado.trim());
  }

  return sentencias;
}

/**
 * Comprueba si las tablas y vistas principales
 * del nuevo sistema ya se encuentran creadas.
 */
async function esquemaNuevoCompleto(connection) {
  const objetosEsperados = [
    "administradores",
    "roles",
    "conductores",
    "vehiculos",
    "tarjetas_rfid",
    "espacios",
    "sesiones_parqueo",
    "pagos",
    "movimientos_saldo",
    "establecimientos",
    "actividades",
    "promociones",
    "promociones_aplicadas",
    "tarifas_config",
    "dispositivos_iot",
    "logs_iot",
    "eventos_sistema",
    "vw_estado_espacios",
    "vw_vehiculos_estacionados",
    "vw_historial_sesiones",
    "vw_dashboard_resumen"
  ];

  const marcadores = objetosEsperados
    .map(() => "?")
    .join(", ");

  const [resultado] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${marcadores})
    `,
    objetosEsperados
  );

  return (
    Number(resultado[0].total) ===
    objetosEsperados.length
  );
}

/**
 * Crea la tabla de configuración si todavía no existe
 * y registra la configuración inicial del estacionamiento.
 */
async function asegurarConfiguracionSistema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS configuracion_sistema (
      id_configuracion TINYINT UNSIGNED PRIMARY KEY,

      nombre_estacionamiento VARCHAR(150)
        NOT NULL
        DEFAULT 'Smart Parking IoT',

      tiempo_maximo_horas INT UNSIGNED
        NOT NULL
        DEFAULT 24,

      alertas_visuales BOOLEAN
        NOT NULL
        DEFAULT TRUE,

      alertas_sonoras BOOLEAN
        NOT NULL
        DEFAULT FALSE,

      correos_automaticos BOOLEAN
        NOT NULL
        DEFAULT FALSE,

      alertas_sensores_desconectados BOOLEAN
        NOT NULL
        DEFAULT TRUE,

      creado_en DATETIME
        DEFAULT CURRENT_TIMESTAMP,

      actualizado_en DATETIME
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT chk_configuracion_tiempo
        CHECK (
          tiempo_maximo_horas >= 1
          AND tiempo_maximo_horas <= 168
        )
    )
    ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    INSERT INTO configuracion_sistema (
      id_configuracion,
      nombre_estacionamiento,
      tiempo_maximo_horas,
      alertas_visuales,
      alertas_sonoras,
      correos_automaticos,
      alertas_sensores_desconectados
    )
    VALUES (
      1,
      'Smart Parking IoT',
      24,
      TRUE,
      FALSE,
      FALSE,
      TRUE
    )
    ON DUPLICATE KEY UPDATE
      nombre_estacionamiento =
        CASE
          WHEN TRIM(nombre_estacionamiento) = ''
          THEN 'Smart Parking IoT'
          ELSE nombre_estacionamiento
        END
  `);

  console.log(
    "Configuración del sistema verificada correctamente"
  );
}

/**
 * Crea o actualiza el administrador inicial usando
 * las variables configuradas en Railway o en el archivo .env.
 */
async function asegurarAdministrador(connection) {
  const nombre = String(
    process.env.ADMIN_NAME || ""
  ).trim();

  const correo = String(
    process.env.ADMIN_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  const usuario = String(
    process.env.ADMIN_USER || ""
  ).trim();

  const contrasena = String(
    process.env.ADMIN_PASSWORD || ""
  );

  if (
    !nombre ||
    !correo ||
    !usuario ||
    !contrasena
  ) {
    console.warn(
      "Administrador inicial omitido: faltan las variables ADMIN_NAME, ADMIN_EMAIL, ADMIN_USER o ADMIN_PASSWORD"
    );

    return;
  }

  const [administradores] =
    await connection.query(
      `
        SELECT
          id_admin,
          contrasena_hash
        FROM administradores
        WHERE usuario = ?
        LIMIT 1
      `,
      [usuario]
    );

  if (administradores.length > 0) {
    const administrador = administradores[0];

    const contrasenaSinCambios =
      await bcrypt.compare(
        contrasena,
        administrador.contrasena_hash
      );

    if (contrasenaSinCambios) {
      await connection.query(
        `
          UPDATE administradores
          SET
            nombre = ?,
            correo = ?,
            estado = 'Activo'
          WHERE id_admin = ?
        `,
        [
          nombre,
          correo,
          administrador.id_admin
        ]
      );

      console.log(
        `Administrador ${usuario} verificado correctamente`
      );

      return;
    }

    const contrasenaHash =
      await bcrypt.hash(contrasena, 12);

    await connection.query(
      `
        UPDATE administradores
        SET
          nombre = ?,
          correo = ?,
          contrasena_hash = ?,
          estado = 'Activo'
        WHERE id_admin = ?
      `,
      [
        nombre,
        correo,
        contrasenaHash,
        administrador.id_admin
      ]
    );

    console.log(
      `Contraseña del administrador ${usuario} actualizada correctamente`
    );

    return;
  }

  const contrasenaHash =
    await bcrypt.hash(contrasena, 12);

  await connection.query(
    `
      INSERT INTO administradores (
        nombre,
        correo,
        usuario,
        contrasena_hash,
        tema_preferido,
        color_principal,
        estado
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        'dark',
        '#4f8ef7',
        'Activo'
      )
    `,
    [
      nombre,
      correo,
      usuario,
      contrasenaHash
    ]
  );

  console.log(
    `Administrador ${usuario} creado correctamente`
  );
}

/**
 * Inicializa y verifica la base de datos.
 */
async function initDatabase() {
  const connection = await db.getConnection();

  try {
    const esquemaCompleto =
      await esquemaNuevoCompleto(connection);

    if (esquemaCompleto) {
      console.log(
        "Esquema Smart Parking IoT verificado correctamente"
      );
    } else {
      const rutaEsquema = path.join(
        __dirname,
        "..",
        "database",
        "schema_corregido.sql"
      );

      if (!fs.existsSync(rutaEsquema)) {
        throw new Error(
          `No se encontró el archivo SQL: ${rutaEsquema}`
        );
      }

      const contenidoSQL = fs.readFileSync(
        rutaEsquema,
        "utf8"
      );

      const sentencias =
        dividirSentenciasSQL(contenidoSQL);

      console.log(
        `Inicializando Smart Parking IoT con ${sentencias.length} instrucciones...`
      );

      for (
        let indice = 0;
        indice < sentencias.length;
        indice += 1
      ) {
        try {
          await connection.query(
            sentencias[indice]
          );
        } catch (error) {
          throw new Error(
            `Error en la instrucción SQL ${
              indice + 1
            }: ${error.message}`
          );
        }
      }

      console.log(
        "Base de datos Smart Parking IoT inicializada correctamente"
      );
    }

    await asegurarConfiguracionSistema(connection);
    await asegurarAdministrador(connection);
  } catch (error) {
    console.error(
      "Error al inicializar la base de datos:",
      error.message
    );

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = initDatabase;