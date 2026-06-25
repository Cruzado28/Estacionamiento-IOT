const express = require("express");
const db = require("../config/db");

const router = express.Router();

/**
 * GET /api/v2/vehiculos
 * Devuelve todos los vehículos registrados con su conductor,
 * rol, tarjeta RFID y sesión activa.
 */
router.get("/", async (req, res) => {
  try {
    const [vehiculos] = await db.query(`
      SELECT
        v.id_vehiculo AS idVehiculo,
        v.placa,
        v.tipo,
        v.marca,
        v.modelo,
        v.color,
        v.estado,

        c.id_conductor AS idConductor,
        c.nombre_completo AS conductor,
        c.documento,
        c.telefono,
        c.correo,

        r.id_rol AS idRol,
        r.nombre AS rol,
        r.porcentaje_descuento AS porcentajeDescuento,
        r.horas_gratis AS horasGratis,
        r.exoneracion_total AS exoneracionTotal,
        r.prioridad_acceso AS prioridadAcceso,

        t.id_tarjeta AS idTarjeta,
        t.uid_rfid AS uidRfid,
        t.saldo_virtual AS saldoVirtual,
        t.estado AS estadoTarjeta,

        s.id_sesion AS idSesionActiva,
        s.espacio_id AS idEspacioActual,
        s.fecha_hora_ingreso AS fechaHoraIngreso,
        s.estado AS estadoSesion

      FROM vehiculos v

      INNER JOIN conductores c
        ON c.id_conductor = v.conductor_id

      INNER JOIN roles r
        ON r.id_rol = v.rol_id

      LEFT JOIN tarjetas_rfid t
        ON t.id_tarjeta = (
          SELECT MIN(t2.id_tarjeta)
          FROM tarjetas_rfid t2
          WHERE
            t2.vehiculo_id = v.id_vehiculo
            AND t2.estado = 'Activa'
        )

      LEFT JOIN sesiones_parqueo s
        ON s.vehiculo_id = v.id_vehiculo
        AND s.fecha_hora_salida IS NULL
        AND s.estado IN (
          'Activa',
          'Pagada',
          'Penalizada'
        )

      ORDER BY v.id_vehiculo
    `);

    return res.json({
      ok: true,
      total: vehiculos.length,
      vehiculos: vehiculos.map((vehiculo) => ({
        ...vehiculo,
        porcentajeDescuento: Number(
          vehiculo.porcentajeDescuento
        ),
        horasGratis: Number(vehiculo.horasGratis),
        exoneracionTotal: Boolean(
          vehiculo.exoneracionTotal
        ),
        saldoVirtual:
          vehiculo.saldoVirtual === null
            ? null
            : Number(vehiculo.saldoVirtual),
        dentroDelEstacionamiento:
          vehiculo.idSesionActiva !== null
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los vehículos:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los vehículos",
      error: error.message
    });
  }
});

/**
 * GET /api/v2/vehiculos/:id
 * Devuelve el detalle de un vehículo específico.
 */
router.get("/:id", async (req, res) => {
  try {
    const idVehiculo = Number(req.params.id);

    if (!Number.isInteger(idVehiculo) || idVehiculo <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "El identificador del vehículo no es válido"
      });
    }

    const [vehiculos] = await db.query(
      `
        SELECT
          v.id_vehiculo AS idVehiculo,
          v.placa,
          v.tipo,
          v.marca,
          v.modelo,
          v.color,
          v.estado,

          c.id_conductor AS idConductor,
          c.nombre_completo AS conductor,
          c.documento,
          c.telefono,
          c.correo,

          r.id_rol AS idRol,
          r.nombre AS rol,
          r.porcentaje_descuento AS porcentajeDescuento,
          r.horas_gratis AS horasGratis,
          r.exoneracion_total AS exoneracionTotal,
          r.prioridad_acceso AS prioridadAcceso,

          t.id_tarjeta AS idTarjeta,
          t.uid_rfid AS uidRfid,
          t.saldo_virtual AS saldoVirtual,
          t.estado AS estadoTarjeta

        FROM vehiculos v

        INNER JOIN conductores c
          ON c.id_conductor = v.conductor_id

        INNER JOIN roles r
          ON r.id_rol = v.rol_id

        LEFT JOIN tarjetas_rfid t
          ON t.id_tarjeta = (
            SELECT MIN(t2.id_tarjeta)
            FROM tarjetas_rfid t2
            WHERE
              t2.vehiculo_id = v.id_vehiculo
              AND t2.estado = 'Activa'
          )

        WHERE v.id_vehiculo = ?
        LIMIT 1
      `,
      [idVehiculo]
    );

    if (vehiculos.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Vehículo no encontrado"
      });
    }

    const vehiculo = vehiculos[0];

    return res.json({
      ok: true,
      vehiculo: {
        ...vehiculo,
        porcentajeDescuento: Number(
          vehiculo.porcentajeDescuento
        ),
        horasGratis: Number(vehiculo.horasGratis),
        exoneracionTotal: Boolean(
          vehiculo.exoneracionTotal
        ),
        saldoVirtual:
          vehiculo.saldoVirtual === null
            ? null
            : Number(vehiculo.saldoVirtual)
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener el vehículo:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el vehículo",
      error: error.message
    });
  }
});

module.exports = router;