const express = require("express");
const db = require("../config/db");

const router = express.Router();

/**
 * GET /api/v2/dashboard/resumen
 * Devuelve los indicadores principales del estacionamiento.
 */
router.get("/resumen", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        total_espacios,
        espacios_libres,
        espacios_ocupados,
        espacios_reservados,
        espacios_mantenimiento,
        vehiculos_activos,
        ingresos_del_dia,
        ingresos_vehiculares_del_dia,
        permanencia_promedio_minutos,
        dispositivos_online,
        dispositivos_con_alerta
      FROM vw_dashboard_resumen
      LIMIT 1
    `);

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "No se encontró información del dashboard"
      });
    }

    const datos = filas[0];

    return res.json({
      ok: true,
      resumen: {
        totalEspacios: Number(datos.total_espacios),
        espaciosLibres: Number(datos.espacios_libres),
        espaciosOcupados: Number(datos.espacios_ocupados),
        espaciosReservados: Number(
          datos.espacios_reservados
        ),
        espaciosMantenimiento: Number(
          datos.espacios_mantenimiento
        ),
        vehiculosActivos: Number(datos.vehiculos_activos),
        ingresosDelDia: Number(datos.ingresos_del_dia),
        ingresosVehicularesDelDia: Number(
          datos.ingresos_vehiculares_del_dia
        ),
        permanenciaPromedioMinutos: Number(
          datos.permanencia_promedio_minutos
        ),
        dispositivosOnline: Number(
          datos.dispositivos_online
        ),
        dispositivosConAlerta: Number(
          datos.dispositivos_con_alerta
        )
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener el resumen del dashboard:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el resumen del dashboard",
      error: error.message
    });
  }
});

/**
 * GET /api/v2/dashboard/espacios
 * Devuelve el estado actual de todos los espacios.
 */
router.get("/espacios", async (req, res) => {
  try {
    const [espacios] = await db.query(`
      SELECT
        id_espacio AS idEspacio,
        numero_espacio AS numero,
        zona,
        estado_espacio AS estado,
        motivo_mantenimiento AS motivoMantenimiento,
        id_sesion AS idSesion,
        estado_sesion AS estadoSesion,
        DATE_FORMAT(
          fecha_hora_ingreso,
          '%Y-%m-%d %H:%i:%s'
        ) AS fechaHoraIngreso,
        tiempo_actual_minutos AS tiempoActualMinutos,
        id_vehiculo AS idVehiculo,
        placa,
        tipo_vehiculo AS tipoVehiculo,
        marca,
        modelo,
        color,
        id_conductor AS idConductor,
        conductor,
        id_rol AS idRol,
        rol,
        id_tarjeta AS idTarjeta,
        uid_rfid AS uidRfid
      FROM vw_estado_espacios
      ORDER BY numero_espacio
    `);

    return res.json({
      ok: true,
      total: espacios.length,
      espacios: espacios.map((espacio) => ({
        ...espacio,
        tiempoActualMinutos:
          espacio.tiempoActualMinutos === null
            ? null
            : Number(espacio.tiempoActualMinutos)
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los espacios:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los espacios",
      error: error.message
    });
  }
});

module.exports = router;