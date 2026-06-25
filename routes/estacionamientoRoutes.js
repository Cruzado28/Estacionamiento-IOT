const express = require("express");
const db = require("../config/db");

const router = express.Router();

/**
 * POST /api/v2/estacionamiento/ingreso/:uid
 *
 * Registra el ingreso de un vehículo utilizando su tarjeta RFID.
 * Asigna automáticamente el primer espacio libre disponible.
 */
router.post("/ingreso/:uid", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const uidRfid = String(req.params.uid || "")
      .trim()
      .toUpperCase();

    if (
      uidRfid.length < 3 ||
      uidRfid.length > 80 ||
      !/^[A-Z0-9-]+$/.test(uidRfid)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "El código RFID no es válido"
      });
    }

    await connection.beginTransaction();

    // Buscar la tarjeta y el vehículo asociado.
    const [tarjetas] = await connection.query(
      `
        SELECT
          t.id_tarjeta AS idTarjeta,
          t.uid_rfid AS uidRfid,
          t.vehiculo_id AS idVehiculo,
          t.estado AS estadoTarjeta,
          t.saldo_virtual AS saldoVirtual,

          v.placa,
          v.tipo,
          v.marca,
          v.modelo,
          v.color,
          v.estado AS estadoVehiculo,

          c.nombre_completo AS conductor,

          r.nombre AS rol

        FROM tarjetas_rfid t

        INNER JOIN vehiculos v
          ON v.id_vehiculo = t.vehiculo_id

        INNER JOIN conductores c
          ON c.id_conductor = v.conductor_id

        INNER JOIN roles r
          ON r.id_rol = v.rol_id

        WHERE t.uid_rfid = ?
        LIMIT 1
        FOR UPDATE
      `,
      [uidRfid]
    );

    if (tarjetas.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        ok: false,
        mensaje: "La tarjeta RFID no está registrada"
      });
    }

    const tarjeta = tarjetas[0];

    if (tarjeta.estadoTarjeta !== "Activa") {
      await connection.rollback();

      return res.status(403).json({
        ok: false,
        mensaje: `La tarjeta RFID está ${tarjeta.estadoTarjeta.toLowerCase()}`
      });
    }

    if (tarjeta.estadoVehiculo !== "Activo") {
      await connection.rollback();

      return res.status(403).json({
        ok: false,
        mensaje: "El vehículo no se encuentra activo"
      });
    }

    // Evitar que el mismo vehículo ingrese dos veces.
    const [sesionesActivas] = await connection.query(
      `
        SELECT
          id_sesion AS idSesion,
          espacio_id AS idEspacio,
          estado
        FROM sesiones_parqueo
        WHERE
          vehiculo_id = ?
          AND fecha_hora_salida IS NULL
          AND estado IN (
            'Activa',
            'Pagada',
            'Penalizada'
          )
        LIMIT 1
        FOR UPDATE
      `,
      [tarjeta.idVehiculo]
    );

    if (sesionesActivas.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        ok: false,
        mensaje: "El vehículo ya se encuentra dentro del estacionamiento",
        sesion: sesionesActivas[0]
      });
    }

    // Buscar el primer espacio libre.
    const [espacios] = await connection.query(`
      SELECT
        id_espacio AS idEspacio,
        numero,
        zona
      FROM espacios
      WHERE estado = 'Libre'
      ORDER BY numero
      LIMIT 1
      FOR UPDATE
    `);

    if (espacios.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        ok: false,
        mensaje: "No existen espacios libres disponibles"
      });
    }

    const espacio = espacios[0];

    // Obtener la tarifa activa.
    const [tarifas] = await connection.query(`
      SELECT
        id_tarifa AS idTarifa,
        nombre,
        tarifa_minuto AS tarifaMinuto,
        tiempo_gracia_min AS tiempoGraciaMinutos
      FROM tarifas_config
      WHERE estado = 'Activa'
      ORDER BY actualizado_en DESC, id_tarifa DESC
      LIMIT 1
    `);

    if (tarifas.length === 0) {
      await connection.rollback();

      return res.status(500).json({
        ok: false,
        mensaje: "No existe una tarifa activa configurada"
      });
    }

    const tarifa = tarifas[0];

    // Crear la sesión de estacionamiento.
    const [resultadoSesion] = await connection.query(
      `
        INSERT INTO sesiones_parqueo (
          vehiculo_id,
          espacio_id,
          tarjeta_id,
          tarifa_aplicada,
          estado,
          observaciones
        )
        VALUES (?, ?, ?, ?, 'Activa', ?)
      `,
      [
        tarjeta.idVehiculo,
        espacio.idEspacio,
        tarjeta.idTarjeta,
        tarifa.tarifaMinuto,
        "Ingreso registrado mediante tarjeta RFID"
      ]
    );

    const idSesion = resultadoSesion.insertId;

    // Actualizar la última lectura de la tarjeta.
    await connection.query(
      `
        UPDATE tarjetas_rfid
        SET ultima_lectura = NOW()
        WHERE id_tarjeta = ?
      `,
      [tarjeta.idTarjeta]
    );

    // Registrar el evento del sistema.
    await connection.query(
      `
        INSERT INTO eventos_sistema (
          tipo_evento,
          sesion_id,
          tarjeta_id,
          descripcion,
          nivel
        )
        VALUES (
          'Ingreso',
          ?,
          ?,
          ?,
          'Exitoso'
        )
      `,
      [
        idSesion,
        tarjeta.idTarjeta,
        `El vehículo ${tarjeta.placa} ingresó al espacio ${espacio.numero}`
      ]
    );

    await connection.commit();

    return res.status(201).json({
      ok: true,
      mensaje: "Ingreso registrado correctamente",
      ingreso: {
        idSesion,
        uidRfid: tarjeta.uidRfid,
        placa: tarjeta.placa,
        conductor: tarjeta.conductor,
        rol: tarjeta.rol,
        espacio: espacio.numero,
        zona: espacio.zona,
        tarifaPorMinuto: Number(tarifa.tarifaMinuto),
        tiempoGraciaMinutos: Number(
          tarifa.tiempoGraciaMinutos
        )
      }
    });
  } catch (error) {
    await connection.rollback();

    console.error(
      "Error al registrar el ingreso:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al registrar el ingreso",
      error: error.message
    });
  } finally {
    connection.release();
  }
});

module.exports = router;