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

// ============================================================
// POST /api/v2/vehiculos
// Registra conductor, vehículo y tarjeta RFID
// ============================================================
router.post("/", async (req, res) => {
  let conexion;

  try {
    const placa = String(
      req.body.placa || ""
    ).trim().toUpperCase();

    const tipo = String(
      req.body.tipo || ""
    ).trim();

    const marca = String(
      req.body.marca || ""
    ).trim();

    const modelo = String(
      req.body.modelo || ""
    ).trim();

    const color = String(
      req.body.color || ""
    ).trim();

    const idRol = Number(req.body.idRol);

    const conductor = req.body.conductor || {};

    const nombreConductor = String(
      conductor.nombre || ""
    ).trim();

    const documento = String(
      conductor.documento || ""
    ).trim();

    const telefono = String(
      conductor.telefono || ""
    ).trim();

    const correo = String(
      conductor.correo || ""
    ).trim().toLowerCase();

    const uidRfid = String(
      req.body.uidRfid || ""
    ).trim().toUpperCase();

    const saldoVirtual = Number(
      req.body.saldoVirtual || 0
    );

    if (!placa) {
      return res.status(400).json({
        ok: false,
        mensaje: "La placa es obligatoria"
      });
    }

    if (!tipo) {
      return res.status(400).json({
        ok: false,
        mensaje: "El tipo de vehículo es obligatorio"
      });
    }

    if (!Number.isInteger(idRol) || idRol <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debes seleccionar un rol válido"
      });
    }

    if (!nombreConductor) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El nombre del conductor es obligatorio"
      });
    }

    if (!documento) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El documento del conductor es obligatorio"
      });
    }

    if (
      !Number.isFinite(saldoVirtual) ||
      saldoVirtual < 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El saldo virtual no puede ser negativo"
      });
    }

    conexion = await db.getConnection();

    await conexion.beginTransaction();

    const [roles] = await conexion.query(
      `
        SELECT id_rol
        FROM roles
        WHERE id_rol = ?
          AND estado = 'Activo'
        LIMIT 1
      `,
      [idRol]
    );

    if (roles.length === 0) {
      await conexion.rollback();

      return res.status(400).json({
        ok: false,
        mensaje:
          "El rol seleccionado no existe o está inactivo"
      });
    }

    const [placasExistentes] =
      await conexion.query(
        `
          SELECT id_vehiculo
          FROM vehiculos
          WHERE placa = ?
          LIMIT 1
        `,
        [placa]
      );

    if (placasExistentes.length > 0) {
      await conexion.rollback();

      return res.status(409).json({
        ok: false,
        mensaje:
          "Ya existe un vehículo registrado con esa placa"
      });
    }

    if (uidRfid) {
      const [tarjetasExistentes] =
        await conexion.query(
          `
            SELECT id_tarjeta
            FROM tarjetas_rfid
            WHERE uid_rfid = ?
            LIMIT 1
          `,
          [uidRfid]
        );

      if (tarjetasExistentes.length > 0) {
        await conexion.rollback();

        return res.status(409).json({
          ok: false,
          mensaje:
            "La tarjeta RFID ya se encuentra registrada"
        });
      }
    }

    const [conductores] =
      await conexion.query(
        `
          SELECT id_conductor
          FROM conductores
          WHERE documento = ?
          LIMIT 1
        `,
        [documento]
      );

    let idConductor;

    if (conductores.length > 0) {
      idConductor =
        conductores[0].id_conductor;

      await conexion.query(
        `
          UPDATE conductores
          SET
            nombre_completo = ?,
            telefono = ?,
            correo = ?,
            estado = 'Activo'
          WHERE id_conductor = ?
        `,
        [
          nombreConductor,
          telefono || null,
          correo || null,
          idConductor
        ]
      );
    } else {
      const [resultadoConductor] =
        await conexion.query(
          `
            INSERT INTO conductores (
              nombre_completo,
              documento,
              telefono,
              correo,
              estado
            )
            VALUES (?, ?, ?, ?, 'Activo')
          `,
          [
            nombreConductor,
            documento,
            telefono || null,
            correo || null
          ]
        );

      idConductor =
        resultadoConductor.insertId;
    }

    const [resultadoVehiculo] =
      await conexion.query(
        `
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
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo')
        `,
        [
          placa,
          idConductor,
          idRol,
          tipo,
          marca || null,
          modelo || null,
          color || null
        ]
      );

    const idVehiculo =
      resultadoVehiculo.insertId;

    let idTarjeta = null;

    if (uidRfid) {
      const [resultadoTarjeta] =
        await conexion.query(
          `
            INSERT INTO tarjetas_rfid (
              uid_rfid,
              vehiculo_id,
              saldo_virtual,
              estado
            )
            VALUES (?, ?, ?, 'Activa')
          `,
          [
            uidRfid,
            idVehiculo,
            saldoVirtual
          ]
        );

      idTarjeta =
        resultadoTarjeta.insertId;
    }

    await conexion.commit();

    return res.status(201).json({
      ok: true,
      mensaje:
        "Vehículo registrado correctamente",

      vehiculo: {
        idVehiculo,
        placa,
        idConductor,
        idRol,
        idTarjeta,
        uidRfid: uidRfid || null,
        saldoVirtual
      }
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error(
      "Error al registrar el vehículo:",
      error.message
    );

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        ok: false,
        mensaje:
          "La placa, documento, correo o RFID ya está registrado"
      });
    }

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al registrar el vehículo",
      error: error.message
    });
  } finally {
    if (conexion) {
      conexion.release();
    }
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