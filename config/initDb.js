const fs = require("fs");
const path = require("path");
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

    if (acumulado.trimEnd().endsWith(delimitador)) {
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
 * Comprueba si las tablas y vistas principales del nuevo
 * sistema ya se encuentran creadas.
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
    Number(resultado[0].total) === objetosEsperados.length
  );
}

async function initDatabase() {
  const connection = await db.getConnection();

  try {
    const esquemaCompleto = await esquemaNuevoCompleto(
      connection
    );

    if (esquemaCompleto) {
      console.log(
        "Esquema Smart Parking IoT verificado correctamente"
      );
      return;
    }

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

    const sentencias = dividirSentenciasSQL(contenidoSQL);

    console.log(
      `Inicializando Smart Parking IoT con ${sentencias.length} instrucciones...`
    );

    for (let indice = 0; indice < sentencias.length; indice += 1) {
      try {
        await connection.query(sentencias[indice]);
      } catch (error) {
        throw new Error(
          `Error en la instrucción SQL ${indice + 1}: ${error.message}`
        );
      }
    }

    console.log(
      "Base de datos Smart Parking IoT inicializada correctamente"
    );
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