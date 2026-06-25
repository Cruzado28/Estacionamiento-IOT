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

/**
 * POST /api/v2/estacionamiento/pago/:uid
 *
 * Calcula y registra el pago de una sesión activa utilizando
 * el saldo virtual de la tarjeta RFID.
 */
router.post("/pago/:uid", async (req, res) => {
  const connection = await db.getConnection();

  const redondearDinero = (valor) =>
    Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

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

    // Buscar la tarjeta, el vehículo y los beneficios del rol.
    const [tarjetas] = await connection.query(
      `
        SELECT
          t.id_tarjeta AS idTarjeta,
          t.uid_rfid AS uidRfid,
          t.vehiculo_id AS idVehiculo,
          t.saldo_virtual AS saldoVirtual,
          t.estado AS estadoTarjeta,

          v.placa,
          v.estado AS estadoVehiculo,

          c.nombre_completo AS conductor,

          r.nombre AS rol,
          r.porcentaje_descuento AS porcentajeDescuento,
          r.horas_gratis AS horasGratis,
          r.exoneracion_total AS exoneracionTotal

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

    // Buscar la sesión activa del vehículo.
    const [sesiones] = await connection.query(
      `
        SELECT
          id_sesion AS idSesion,
          espacio_id AS idEspacio,
          tarifa_aplicada AS tarifaAplicada,
          pago_realizado AS pagoRealizado,
          estado,
          fecha_hora_ingreso AS fechaHoraIngreso,

          TIMESTAMPDIFF(
            MINUTE,
            fecha_hora_ingreso,
            NOW()
          ) AS tiempoTotalMinutos

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

    if (sesiones.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        ok: false,
        mensaje: "El vehículo no tiene una sesión activa"
      });
    }

    const sesion = sesiones[0];

    if (
      Boolean(sesion.pagoRealizado) ||
      sesion.estado === "Pagada"
    ) {
      await connection.rollback();

      return res.status(409).json({
        ok: false,
        mensaje: "La sesión ya fue pagada"
      });
    }

    // Obtener la configuración tarifaria vigente.
    const [tarifas] = await connection.query(`
      SELECT
        tiempo_gracia_min AS tiempoGraciaMinutos,
        tiempo_salida_despues_pago_min AS tiempoSalidaMinutos
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

    const configuracion = tarifas[0];

    const tiempoTotalMinutos = Math.max(
      0,
      Number(sesion.tiempoTotalMinutos)
    );

    const tiempoGraciaMinutos = Math.max(
      0,
      Number(configuracion.tiempoGraciaMinutos)
    );

    const minutosGratisRol = Math.max(
      0,
      Number(tarjeta.horasGratis) * 60
    );

    const minutosFacturables = Math.max(
      tiempoTotalMinutos -
        tiempoGraciaMinutos -
        minutosGratisRol,
      0
    );

    const tarifaPorMinuto = Number(
      sesion.tarifaAplicada
    );

    const montoAntesDescuento = redondearDinero(
      minutosFacturables * tarifaPorMinuto
    );

    const tieneExoneracion = Boolean(
      tarjeta.exoneracionTotal
    );

    const porcentajeDescuento = tieneExoneracion
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            Number(tarjeta.porcentajeDescuento)
          )
        );

    const montoDescuento = redondearDinero(
      montoAntesDescuento *
        (porcentajeDescuento / 100)
    );

    const montoFinal = redondearDinero(
      Math.max(
        0,
        montoAntesDescuento - montoDescuento
      )
    );

    const saldoAnterior = redondearDinero(
      tarjeta.saldoVirtual
    );

    if (saldoAnterior < montoFinal) {
      await connection.rollback();

      return res.status(402).json({
        ok: false,
        mensaje: "Saldo virtual insuficiente",
        pago: {
          saldoDisponible: saldoAnterior,
          montoRequerido: montoFinal,
          saldoFaltante: redondearDinero(
            montoFinal - saldoAnterior
          )
        }
      });
    }

    const saldoNuevo = redondearDinero(
      saldoAnterior - montoFinal
    );

    const referenciaPago =
      `RFID-${uidRfid}-${Date.now()}`;

    // Registrar el pago.
    const [resultadoPago] = await connection.query(
      `
        INSERT INTO pagos (
          sesion_id,
          tarjeta_id,
          monto,
          metodo_pago,
          estado,
          referencia,
          observaciones
        )
        VALUES (
          ?,
          ?,
          ?,
          'Saldo virtual',
          'Completado',
          ?,
          ?
        )
      `,
      [
        sesion.idSesion,
        tarjeta.idTarjeta,
        montoFinal,
        referenciaPago,
        "Pago realizado mediante tarjeta RFID"
      ]
    );

    const idPago = resultadoPago.insertId;

    // Actualizar el saldo y la última lectura de la tarjeta.
    await connection.query(
      `
        UPDATE tarjetas_rfid
        SET
          saldo_virtual = ?,
          ultima_lectura = NOW()
        WHERE id_tarjeta = ?
      `,
      [saldoNuevo, tarjeta.idTarjeta]
    );

    // Registrar el movimiento solo cuando existe un cobro.
    if (montoFinal > 0) {
      await connection.query(
        `
          INSERT INTO movimientos_saldo (
            tarjeta_id,
            pago_id,
            tipo,
            monto,
            saldo_anterior,
            saldo_nuevo,
            descripcion
          )
          VALUES (
            ?,
            ?,
            'Cobro',
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          tarjeta.idTarjeta,
          idPago,
          montoFinal,
          saldoAnterior,
          saldoNuevo,
          `Cobro del estacionamiento para el vehículo ${tarjeta.placa}`
        ]
      );
    }

    const tiempoSalidaMinutos = Math.max(
      1,
      Number(configuracion.tiempoSalidaMinutos)
    );

    // Marcar la sesión como pagada.
    await connection.query(
      `
        UPDATE sesiones_parqueo
        SET
          fecha_hora_pago = NOW(),
          hora_limite_salida = DATE_ADD(
            NOW(),
            INTERVAL ? MINUTE
          ),
          tiempo_minutos = ?,
          monto_descuento = ?,
          monto_total_pagado = ?,
          pago_realizado = TRUE,
          estado = 'Pagada',
          observaciones = ?
        WHERE id_sesion = ?
      `,
      [
        tiempoSalidaMinutos,
        tiempoTotalMinutos,
        montoDescuento,
        montoFinal,
        "Pago registrado mediante saldo virtual RFID",
        sesion.idSesion
      ]
    );

    // Registrar el evento.
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
          'Pago',
          ?,
          ?,
          ?,
          'Exitoso'
        )
      `,
      [
        sesion.idSesion,
        tarjeta.idTarjeta,
        `El vehículo ${tarjeta.placa} pagó S/ ${montoFinal.toFixed(2)}`
      ]
    );

    await connection.commit();

    return res.json({
      ok: true,
      mensaje: "Pago registrado correctamente",
      pago: {
        idPago,
        idSesion: sesion.idSesion,
        uidRfid,
        placa: tarjeta.placa,
        conductor: tarjeta.conductor,
        rol: tarjeta.rol,
        tiempoTotalMinutos,
        tiempoGraciaMinutos,
        minutosGratisRol,
        minutosFacturables,
        tarifaPorMinuto,
        montoAntesDescuento,
        porcentajeDescuento,
        montoDescuento,
        montoPagado: montoFinal,
        saldoAnterior,
        saldoNuevo,
        tiempoPermitidoParaSalir:
          tiempoSalidaMinutos
      }
    });
  } catch (error) {
    await connection.rollback();

    console.error(
      "Error al registrar el pago:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al registrar el pago",
      error: error.message
    });
  } finally {
    connection.release();
  }
});

module.exports = router;