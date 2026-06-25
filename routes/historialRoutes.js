const express = require("express");
const db = require("../config/db");

const router = express.Router();

function obtenerLimite(valor) {
  const limite = Number(valor);

  if (!Number.isInteger(limite) || limite <= 0) {
    return 50;
  }

  return Math.min(limite, 200);
}

/**
 * GET /api/v2/historial/sesiones
 *
 * Devuelve las sesiones de estacionamiento más recientes.
 * Puede recibir ?limite=50.
 */
router.get("/sesiones", async (req, res) => {
  try {
    const limite = obtenerLimite(req.query.limite);

    const [sesiones] = await db.query(
      `
        SELECT
          id_sesion AS idSesion,
          id_vehiculo AS idVehiculo,
          placa,
          tipo_vehiculo AS tipoVehiculo,
          marca,
          modelo,
          color,

          id_conductor AS idConductor,
          conductor,
          documento,
          rol,

          espacio,
          zona,
          uid_rfid AS uidRfid,

          DATE_FORMAT(
            fecha_hora_ingreso,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaHoraIngreso,

          DATE_FORMAT(
            fecha_hora_pago,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaHoraPago,

          DATE_FORMAT(
            fecha_hora_salida,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaHoraSalida,

          tiempo_total_minutos AS tiempoTotalMinutos,
          tarifa_aplicada AS tarifaAplicada,
          consumo_registrado AS consumoRegistrado,
          monto_descuento AS montoDescuento,
          total_pagado AS totalPagado,
          pago_realizado AS pagoRealizado,
          estado

        FROM vw_historial_sesiones

        ORDER BY id_sesion DESC
        LIMIT ?
      `,
      [limite]
    );

    return res.json({
      ok: true,
      total: sesiones.length,
      sesiones: sesiones.map((sesion) => ({
        ...sesion,
        tiempoTotalMinutos: Number(
          sesion.tiempoTotalMinutos
        ),
        tarifaAplicada: Number(
          sesion.tarifaAplicada
        ),
        consumoRegistrado: Number(
          sesion.consumoRegistrado
        ),
        montoDescuento: Number(
          sesion.montoDescuento
        ),
        totalPagado: Number(
          sesion.totalPagado
        ),
        pagoRealizado: Boolean(
          sesion.pagoRealizado
        )
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener el historial de sesiones:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener el historial de sesiones",
      error: error.message
    });
  }
});

/**
 * GET /api/v2/historial/pagos
 *
 * Devuelve los pagos realizados, incluidos los cobros
 * normales y las penalidades de salida.
 */
router.get("/pagos", async (req, res) => {
  try {
    const limite = obtenerLimite(req.query.limite);

    const [pagos] = await db.query(
      `
        SELECT
          p.id_pago AS idPago,
          p.sesion_id AS idSesion,
          p.tarjeta_id AS idTarjeta,
          p.monto,
          p.metodo_pago AS metodoPago,
          p.estado,
          p.referencia,
          p.observaciones,

          DATE_FORMAT(
            p.fecha_pago,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaPago,

          t.uid_rfid AS uidRfid,
          v.id_vehiculo AS idVehiculo,
          v.placa,

          c.nombre_completo AS conductor,

          e.numero AS espacio,
          e.zona

        FROM pagos p

        INNER JOIN sesiones_parqueo s
          ON s.id_sesion = p.sesion_id

        INNER JOIN vehiculos v
          ON v.id_vehiculo = s.vehiculo_id

        INNER JOIN conductores c
          ON c.id_conductor = v.conductor_id

        INNER JOIN espacios e
          ON e.id_espacio = s.espacio_id

        LEFT JOIN tarjetas_rfid t
          ON t.id_tarjeta = p.tarjeta_id

        ORDER BY p.id_pago DESC
        LIMIT ?
      `,
      [limite]
    );

    return res.json({
      ok: true,
      total: pagos.length,
      pagos: pagos.map((pago) => ({
        ...pago,
        monto: Number(pago.monto)
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los pagos:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los pagos",
      error: error.message
    });
  }
});

/**
 * GET /api/v2/historial/eventos
 *
 * Devuelve los eventos más recientes generados por
 * ingresos, pagos, salidas, dispositivos y administradores.
 */
router.get("/eventos", async (req, res) => {
  try {
    const limite = obtenerLimite(req.query.limite);

    const [eventos] = await db.query(
      `
        SELECT
          ev.id_evento AS idEvento,
          ev.tipo_evento AS tipoEvento,
          ev.sesion_id AS idSesion,
          ev.dispositivo_id AS idDispositivo,
          ev.administrador_id AS idAdministrador,
          ev.tarjeta_id AS idTarjeta,
          ev.descripcion,
          ev.nivel,
          ev.revisado,

          DATE_FORMAT(
            ev.fecha_hora,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaHora,

          DATE_FORMAT(
            ev.fecha_revision,
            '%Y-%m-%d %H:%i:%s'
          ) AS fechaRevision,

          t.uid_rfid AS uidRfid,
          d.nombre AS dispositivo,
          a.nombre AS administrador

        FROM eventos_sistema ev

        LEFT JOIN tarjetas_rfid t
          ON t.id_tarjeta = ev.tarjeta_id

        LEFT JOIN dispositivos_iot d
          ON d.id_dispositivo = ev.dispositivo_id

        LEFT JOIN administradores a
          ON a.id_admin = ev.administrador_id

        ORDER BY ev.id_evento DESC
        LIMIT ?
      `,
      [limite]
    );

    return res.json({
      ok: true,
      total: eventos.length,
      eventos: eventos.map((evento) => ({
        ...evento,
        revisado: Boolean(evento.revisado)
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los eventos:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los eventos",
      error: error.message
    });
  }
});

module.exports = router;