const express = require("express");
const db = require("../config/db");

const router = express.Router();

// ============================================================
// GET /api/v2/iot/resumen
// ============================================================
router.get("/resumen", async (req, res) => {
  try {
    const [[dispositivos]] = await db.query(`
      SELECT
        COUNT(*) AS total_dispositivos,
        SUM(
          CASE
            WHEN estado = 'Online' THEN 1
            ELSE 0
          END
        ) AS dispositivos_online,
        SUM(
          CASE
            WHEN estado = 'Offline' THEN 1
            ELSE 0
          END
        ) AS dispositivos_offline,
        SUM(
          CASE
            WHEN estado = 'Advertencia' THEN 1
            ELSE 0
          END
        ) AS dispositivos_advertencia,
        SUM(
          CASE
            WHEN estado = 'Mantenimiento' THEN 1
            ELSE 0
          END
        ) AS dispositivos_mantenimiento,
        COALESCE(AVG(latencia_ms), 0) AS latencia_promedio
      FROM dispositivos_iot
    `);

    const [[logs]] = await db.query(`
      SELECT
        SUM(
          CASE
            WHEN DATE(fecha_hora) = CURDATE() THEN 1
            ELSE 0
          END
        ) AS eventos_hoy,
        MAX(fecha_hora) AS ultima_sincronizacion
      FROM logs_iot
    `);  

    return res.json({
      ok: true,
      resumen: {
        totalDispositivos: Number(
          dispositivos.total_dispositivos
        ),
        dispositivosOnline: Number(
          dispositivos.dispositivos_online
        ),
        dispositivosOffline: Number(
          dispositivos.dispositivos_offline
        ),
        dispositivosAdvertencia: Number(
          dispositivos.dispositivos_advertencia
        ),
        dispositivosMantenimiento: Number(
          dispositivos.dispositivos_mantenimiento
        ),
        latenciaPromedioMs: Number(
          dispositivos.latencia_promedio
        ).toFixed(0),
        eventosHoy: Number(logs.eventos_hoy),
        ultimaSincronizacion:
          logs.ultima_sincronizacion
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener el resumen IoT:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el resumen IoT",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/iot/dispositivos
// ============================================================
router.get("/dispositivos", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_dispositivo,
        codigo,
        nombre,
        tipo_dispositivo,
        tipo_conexion,
        direccion_red,
        ubicacion,
        estado,
        intensidad_senal,
        latencia_ms,
        DATE_FORMAT(
          ultima_conexion,
          '%Y-%m-%d %H:%i:%s'
        ) AS ultima_conexion,
        DATE_FORMAT(
          ultima_lectura,
          '%Y-%m-%d %H:%i:%s'
        ) AS ultima_lectura,
        descripcion
      FROM dispositivos_iot
      ORDER BY id_dispositivo ASC
    `);

    return res.json({
      ok: true,
      total: filas.length,
      dispositivos: filas.map((dispositivo) => ({
        idDispositivo:
          dispositivo.id_dispositivo,
        codigo: dispositivo.codigo,
        nombre: dispositivo.nombre,
        tipoDispositivo:
          dispositivo.tipo_dispositivo,
        tipoConexion:
          dispositivo.tipo_conexion,
        direccionRed:
          dispositivo.direccion_red,
        ubicacion: dispositivo.ubicacion,
        estado: dispositivo.estado,
        intensidadSenal: Number(
          dispositivo.intensidad_senal
        ),
        latenciaMs: Number(
          dispositivo.latencia_ms
        ),
        ultimaConexion:
          dispositivo.ultima_conexion,
        ultimaLectura:
          dispositivo.ultima_lectura,
        descripcion:
          dispositivo.descripcion
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los dispositivos IoT:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener los dispositivos IoT",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/iot/logs
// ============================================================
router.get("/logs", async (req, res) => {
  try {
    const limiteSolicitado = Number(req.query.limite);
    const limite = Number.isInteger(limiteSolicitado)
      ? Math.min(Math.max(limiteSolicitado, 1), 100)
      : 30;

    const [filas] = await db.query(
      `
        SELECT
          l.id_log,
          l.dispositivo_id,
          d.nombre AS dispositivo,
          DATE_FORMAT(
            l.fecha_hora,
            '%Y-%m-%d %H:%i:%s'
          ) AS fecha_hora,
          l.nivel,
          l.codigo_evento,
          l.mensaje,
          l.datos_adicionales
        FROM logs_iot l
        INNER JOIN dispositivos_iot d
          ON d.id_dispositivo = l.dispositivo_id
        ORDER BY l.fecha_hora DESC, l.id_log DESC
        LIMIT ?
      `,
      [limite]
    );

    return res.json({
      ok: true,
      total: filas.length,
      logs: filas.map((log) => ({
        idLog: log.id_log,
        idDispositivo: log.dispositivo_id,
        dispositivo: log.dispositivo,
        fechaHora: log.fecha_hora,
        nivel: log.nivel,
        codigoEvento: log.codigo_evento,
        mensaje: log.mensaje,
        datosAdicionales:
          log.datos_adicionales
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los logs IoT:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los logs IoT",
      error: error.message
    });
  }
});

module.exports = router;