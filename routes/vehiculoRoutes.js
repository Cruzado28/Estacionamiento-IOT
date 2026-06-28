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

// ============================================================
// PUT /api/v2/vehiculos/:id
// Actualiza conductor, vehículo y tarjeta RFID
// ============================================================
router.put("/:id", async (req, res) => {
  let conexion;

  try {
    const idVehiculo = Number(req.params.id);

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

    if (
      !Number.isInteger(idVehiculo) ||
      idVehiculo <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador del vehículo no es válido"
      });
    }

    if (!placa) {
      return res.status(400).json({
        ok: false,
        mensaje: "La placa es obligatoria"
      });
    }

    if (!tipo) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El tipo de vehículo es obligatorio"
      });
    }

    if (!Number.isInteger(idRol) || idRol <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Debes seleccionar un rol válido"
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

    const [vehiculos] = await conexion.query(
      `
        SELECT
          v.id_vehiculo,
          v.conductor_id,

          (
            SELECT MIN(t.id_tarjeta)
            FROM tarjetas_rfid t
            WHERE
              t.vehiculo_id = v.id_vehiculo
              AND t.estado = 'Activa'
          ) AS id_tarjeta

        FROM vehiculos v
        WHERE v.id_vehiculo = ?
        LIMIT 1
        FOR UPDATE
      `,
      [idVehiculo]
    );

    if (vehiculos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        ok: false,
        mensaje: "Vehículo no encontrado"
      });
    }

    const vehiculoActual = vehiculos[0];

    const idConductor =
      vehiculoActual.conductor_id;

    const idTarjetaActual =
      vehiculoActual.id_tarjeta;

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
            AND id_vehiculo <> ?
          LIMIT 1
        `,
        [placa, idVehiculo]
      );

    if (placasExistentes.length > 0) {
      await conexion.rollback();

      return res.status(409).json({
        ok: false,
        mensaje:
          "Otro vehículo ya utiliza esa placa"
      });
    }

    const [documentosExistentes] =
      await conexion.query(
        `
          SELECT id_conductor
          FROM conductores
          WHERE documento = ?
            AND id_conductor <> ?
          LIMIT 1
        `,
        [documento, idConductor]
      );

    if (documentosExistentes.length > 0) {
      await conexion.rollback();

      return res.status(409).json({
        ok: false,
        mensaje:
          "Otro conductor ya utiliza ese documento"
      });
    }

    if (correo) {
      const [correosExistentes] =
        await conexion.query(
          `
            SELECT id_conductor
            FROM conductores
            WHERE correo = ?
              AND id_conductor <> ?
            LIMIT 1
          `,
          [correo, idConductor]
        );

      if (correosExistentes.length > 0) {
        await conexion.rollback();

        return res.status(409).json({
          ok: false,
          mensaje:
            "Otro conductor ya utiliza ese correo"
        });
      }
    }

    if (uidRfid) {
      const [tarjetasExistentes] =
        await conexion.query(
          `
            SELECT id_tarjeta
            FROM tarjetas_rfid
            WHERE uid_rfid = ?
              AND (
                ? IS NULL
                OR id_tarjeta <> ?
              )
            LIMIT 1
          `,
          [
            uidRfid,
            idTarjetaActual,
            idTarjetaActual
          ]
        );

      if (tarjetasExistentes.length > 0) {
        await conexion.rollback();

        return res.status(409).json({
          ok: false,
          mensaje:
            "Otra tarjeta ya utiliza ese UID RFID"
        });
      }
    }

    await conexion.query(
      `
        UPDATE conductores
        SET
          nombre_completo = ?,
          documento = ?,
          telefono = ?,
          correo = ?
        WHERE id_conductor = ?
      `,
      [
        nombreConductor,
        documento,
        telefono || null,
        correo || null,
        idConductor
      ]
    );

    await conexion.query(
      `
        UPDATE vehiculos
        SET
          placa = ?,
          rol_id = ?,
          tipo = ?,
          marca = ?,
          modelo = ?,
          color = ?
        WHERE id_vehiculo = ?
      `,
      [
        placa,
        idRol,
        tipo,
        marca || null,
        modelo || null,
        color || null,
        idVehiculo
      ]
    );

    if (uidRfid && idTarjetaActual) {
      await conexion.query(
        `
          UPDATE tarjetas_rfid
          SET
            uid_rfid = ?,
            saldo_virtual = ?,
            estado = 'Activa'
          WHERE id_tarjeta = ?
        `,
        [
          uidRfid,
          saldoVirtual,
          idTarjetaActual
        ]
      );
    } else if (uidRfid && !idTarjetaActual) {
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
    } else if (!uidRfid && idTarjetaActual) {
      await conexion.query(
        `
          UPDATE tarjetas_rfid
          SET estado = 'Inactiva'
          WHERE id_tarjeta = ?
        `,
        [idTarjetaActual]
      );
    }

    await conexion.commit();

    return res.json({
      ok: true,
      mensaje:
        "Vehículo actualizado correctamente",

      vehiculo: {
        idVehiculo,
        placa,
        idConductor,
        idRol,
        uidRfid: uidRfid || null,
        saldoVirtual
      }
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error(
      "Error al actualizar el vehículo:",
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
        "Error al actualizar el vehículo",
      error: error.message
    });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
});

// ============================================================
// DELETE /api/v2/vehiculos/:id
// Desactiva un vehículo y sus tarjetas RFID
// ============================================================
router.delete("/:id", async (req, res) => {
  let conexion;

  try {
    const idVehiculo = Number(req.params.id);

    if (
      !Number.isInteger(idVehiculo) ||
      idVehiculo <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador del vehículo no es válido"
      });
    }

    conexion = await db.getConnection();

    await conexion.beginTransaction();

    const [vehiculos] = await conexion.query(
      `
        SELECT
          id_vehiculo,
          placa,
          estado
        FROM vehiculos
        WHERE id_vehiculo = ?
        LIMIT 1
        FOR UPDATE
      `,
      [idVehiculo]
    );

    if (vehiculos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        ok: false,
        mensaje: "Vehículo no encontrado"
      });
    }

    const vehiculo = vehiculos[0];

    const [sesionesActivas] =
      await conexion.query(
        `
          SELECT id_sesion
          FROM sesiones_parqueo
          WHERE vehiculo_id = ?
            AND fecha_hora_salida IS NULL
            AND estado IN (
              'Activa',
              'Pagada',
              'Penalizada'
            )
          LIMIT 1
        `,
        [idVehiculo]
      );

    if (sesionesActivas.length > 0) {
      await conexion.rollback();

      return res.status(409).json({
        ok: false,
        mensaje:
          "No se puede desactivar un vehículo que todavía está dentro del estacionamiento"
      });
    }

    await conexion.query(
      `
        UPDATE vehiculos
        SET estado = 'Inactivo'
        WHERE id_vehiculo = ?
      `,
      [idVehiculo]
    );

    await conexion.query(
      `
        UPDATE tarjetas_rfid
        SET estado = 'Inactiva'
        WHERE vehiculo_id = ?
          AND estado = 'Activa'
      `,
      [idVehiculo]
    );

    await conexion.commit();

    return res.json({
      ok: true,
      mensaje:
        `Vehículo ${vehiculo.placa} desactivado correctamente`,

      vehiculo: {
        idVehiculo,
        placa: vehiculo.placa,
        estado: "Inactivo"
      }
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error(
      "Error al desactivar el vehículo:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al desactivar el vehículo",
      error: error.message
    });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
});

// ============================================================
// PATCH /api/v2/vehiculos/:id/reactivar
// Reactiva un vehículo y su última tarjeta RFID
// ============================================================
router.patch("/:id/reactivar", async (req, res) => {
  let conexion;

  try {
    const idVehiculo = Number(req.params.id);

    if (
      !Number.isInteger(idVehiculo) ||
      idVehiculo <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador del vehículo no es válido"
      });
    }

    conexion = await db.getConnection();

    await conexion.beginTransaction();

    const [vehiculos] = await conexion.query(
      `
        SELECT
          id_vehiculo,
          placa,
          estado
        FROM vehiculos
        WHERE id_vehiculo = ?
        LIMIT 1
        FOR UPDATE
      `,
      [idVehiculo]
    );

    if (vehiculos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        ok: false,
        mensaje: "Vehículo no encontrado"
      });
    }

    const vehiculo = vehiculos[0];

    if (vehiculo.estado === "Activo") {
      await conexion.rollback();

      return res.status(409).json({
        ok: false,
        mensaje:
          `El vehículo ${vehiculo.placa} ya se encuentra activo`
      });
    }

    await conexion.query(
      `
        UPDATE vehiculos
        SET estado = 'Activo'
        WHERE id_vehiculo = ?
      `,
      [idVehiculo]
    );

    const [tarjetas] = await conexion.query(
      `
        SELECT id_tarjeta
        FROM tarjetas_rfid
        WHERE vehiculo_id = ?
        ORDER BY id_tarjeta DESC
        LIMIT 1
        FOR UPDATE
      `,
      [idVehiculo]
    );

    if (tarjetas.length > 0) {
      await conexion.query(
        `
          UPDATE tarjetas_rfid
          SET estado = 'Inactiva'
          WHERE vehiculo_id = ?
        `,
        [idVehiculo]
      );

      await conexion.query(
        `
          UPDATE tarjetas_rfid
          SET estado = 'Activa'
          WHERE id_tarjeta = ?
        `,
        [tarjetas[0].id_tarjeta]
      );
    }

    await conexion.commit();

    return res.json({
      ok: true,
      mensaje:
        `Vehículo ${vehiculo.placa} reactivado correctamente`,

      vehiculo: {
        idVehiculo,
        placa: vehiculo.placa,
        estado: "Activo"
      }
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error(
      "Error al reactivar el vehículo:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al reactivar el vehículo"
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