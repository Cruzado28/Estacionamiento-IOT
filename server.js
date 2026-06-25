const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./config/db");
const initDatabase = require("./config/initDb");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/api/v2/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 3000;

app.get("/api/status", (req, res) => {
  res.json({
    mensaje: "Servidor del Estacionamiento IoT funcionando correctamente",
    estado: "OK",
    puerto: PORT
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await db.query(`
  SELECT
    DATABASE() AS base_actual,
    DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS fecha_servidor,
    @@SESSION.time_zone AS zona_horaria
`);

    res.json({
      ok: true,
      mensaje: "Conexión a MySQL realizada correctamente",
      datos: rows[0]
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: "Error al conectar con MySQL",
      error: error.message
    });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const [[resumen]] = await db.query(`
      SELECT 
        COUNT(*) AS totalEspacios,
        SUM(CASE WHEN estado = 'Libre' THEN 1 ELSE 0 END) AS espaciosLibres,
        SUM(CASE WHEN estado != 'Libre' THEN 1 ELSE 0 END) AS espaciosOcupados,
        COALESCE((
          SELECT SUM(monto) 
          FROM pagos 
          WHERE DATE(fecha_pago) = CURDATE()
        ), 0) AS ingresosDia
      FROM espacios
    `);

    const [espacios] = await db.query(`
      SELECT 
        id_espacio AS id,
        estado,
        uid_rfid_actual AS rfid
      FROM espacios
      ORDER BY id_espacio ASC
    `);

    const [eventos] = await db.query(`
      SELECT 
        id_evento,
        tipo_evento,
        descripcion,
        uid_rfid,
        DATE_FORMAT(fecha_hora, '%H:%i') AS hora
      FROM eventos
      ORDER BY fecha_hora DESC
      LIMIT 5
    `);

    const [vehiculos] = await db.query(`
      SELECT 
        uid_rfid AS rfid,
        id_espacio AS espacio,
        DATE_FORMAT(hora_ingreso, '%H:%i') AS horaIngreso,
        TIMESTAMPDIFF(MINUTE, hora_ingreso, NOW()) AS tiempoMinutos,
        pago_realizado AS pagoRealizado,
        monto
      FROM registros_estacionamiento
      WHERE hora_salida IS NULL
      ORDER BY hora_ingreso DESC
    `);

    res.json({
      ok: true,
      resumen,
      espacios,
      eventos,
      vehiculos
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: "Error al obtener datos del dashboard",
      error: error.message
    });
  }
});

app.get("/api/ingreso/:uid", async (req, res) => {
  const { uid } = req.params;
  const conexion = await db.getConnection();

  try {
    await conexion.beginTransaction();

    const [[tarjeta]] = await conexion.query(
      "SELECT * FROM tarjetas_rfid WHERE uid_rfid = ?",
      [uid]
    );

    if (!tarjeta) {
      await conexion.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: "Tarjeta RFID no registrada"
      });
    }

    if (tarjeta.estado === "Bloqueada") {
      await conexion.rollback();
      return res.status(403).json({
        ok: false,
        mensaje: "Tarjeta bloqueada"
      });
    }

    if (tarjeta.estado === "Adentro") {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "Acceso denegado: la tarjeta ya registra un vehículo dentro"
      });
    }

    const [[config]] = await conexion.query(
      "SELECT capacidad_maxima FROM configuracion LIMIT 1"
    );

    const [[ocupacion]] = await conexion.query(
      "SELECT COUNT(*) AS ocupados FROM espacios WHERE estado != 'Libre'"
    );

    if (ocupacion.ocupados >= config.capacidad_maxima) {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "Estacionamiento lleno"
      });
    }

    const [[espacioLibre]] = await conexion.query(
      "SELECT id_espacio FROM espacios WHERE estado = 'Libre' ORDER BY id_espacio ASC LIMIT 1"
    );

    if (!espacioLibre) {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "No hay espacios libres disponibles"
      });
    }

    await conexion.query(
      "UPDATE tarjetas_rfid SET estado = 'Adentro' WHERE uid_rfid = ?",
      [uid]
    );

    await conexion.query(
      "UPDATE espacios SET estado = 'Ocupado', uid_rfid_actual = ? WHERE id_espacio = ?",
      [uid, espacioLibre.id_espacio]
    );

    await conexion.query(
      `INSERT INTO registros_estacionamiento 
      (uid_rfid, id_espacio, hora_ingreso, pago_realizado, estado)
      VALUES (?, ?, NOW(), FALSE, 'Activo')`,
      [uid, espacioLibre.id_espacio]
    );

    await conexion.query(
      `INSERT INTO eventos (tipo_evento, descripcion, uid_rfid)
      VALUES ('Ingreso', ?, ?)`,
      [`Vehículo con tarjeta ${uid} ingresó al espacio ${espacioLibre.id_espacio}`, uid]
    );

    await conexion.commit();

    res.json({
      ok: true,
      mensaje: "Ingreso registrado correctamente",
      uid_rfid: uid,
      espacio_asignado: espacioLibre.id_espacio
    });

  } catch (error) {
    await conexion.rollback();

    res.status(500).json({
      ok: false,
      mensaje: "Error al registrar ingreso",
      error: error.message
    });

  } finally {
    conexion.release();
  }
});

app.get("/api/pago/:uid", async (req, res) => {
  const { uid } = req.params;
  const conexion = await db.getConnection();

  try {
    await conexion.beginTransaction();

    const [[registro]] = await conexion.query(
      `SELECT * FROM registros_estacionamiento 
       WHERE uid_rfid = ? AND hora_salida IS NULL
       ORDER BY id_registro DESC
       LIMIT 1`,
      [uid]
    );

    if (!registro) {
      await conexion.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: "No existe un registro activo para esta tarjeta"
      });
    }

    if (registro.pago_realizado) {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "Este vehículo ya realizó el pago"
      });
    }

    const [[config]] = await conexion.query(
      "SELECT tarifa_por_minuto, tiempo_gracia_minutos FROM configuracion LIMIT 1"
    );

    const [[calculo]] = await conexion.query(
      `SELECT 
        GREATEST(TIMESTAMPDIFF(MINUTE, hora_ingreso, NOW()), 1) AS minutos
       FROM registros_estacionamiento
       WHERE id_registro = ?`,
      [registro.id_registro]
    );

    const tiempoMinutos = calculo.minutos;
    const monto = Number(tiempoMinutos) * Number(config.tarifa_por_minuto);

    const [[tarjeta]] = await conexion.query(
      "SELECT saldo FROM tarjetas_rfid WHERE uid_rfid = ?",
      [uid]
    );

    if (!tarjeta) {
      await conexion.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: "Tarjeta RFID no encontrada"
      });
    }

    if (Number(tarjeta.saldo) < monto) {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "Saldo insuficiente",
        saldo_actual: Number(tarjeta.saldo).toFixed(2),
        monto_a_pagar: monto.toFixed(2)
      });
    }

    await conexion.query(
      "UPDATE tarjetas_rfid SET saldo = saldo - ? WHERE uid_rfid = ?",
      [monto, uid]
    );

    await conexion.query(
      `UPDATE registros_estacionamiento
       SET 
        hora_pago = NOW(),
        hora_limite_salida = DATE_ADD(NOW(), INTERVAL ? MINUTE),
        tiempo_minutos = ?,
        monto = ?,
        pago_realizado = TRUE,
        estado = 'Pagado'
       WHERE id_registro = ?`,
      [config.tiempo_gracia_minutos, tiempoMinutos, monto, registro.id_registro]
    );

    await conexion.query(
      "UPDATE espacios SET estado = 'Pagado' WHERE id_espacio = ?",
      [registro.id_espacio]
    );

    await conexion.query(
      `INSERT INTO pagos (id_registro, uid_rfid, monto, metodo_pago)
       VALUES (?, ?, ?, 'Saldo virtual')`,
      [registro.id_registro, uid, monto]
    );

    await conexion.query(
      `INSERT INTO eventos (tipo_evento, descripcion, uid_rfid)
       VALUES ('Pago', ?, ?)`,
      [
        `Vehículo con tarjeta ${uid} pagó S/ ${monto.toFixed(2)} por ${tiempoMinutos} minuto(s)`,
        uid
      ]
    );

    await conexion.commit();

    res.json({
      ok: true,
      mensaje: "Pago registrado correctamente",
      uid_rfid: uid,
      tiempo_minutos: tiempoMinutos,
      monto_pagado: monto.toFixed(2),
      tiempo_gracia_minutos: config.tiempo_gracia_minutos
    });

  } catch (error) {
    await conexion.rollback();

    res.status(500).json({
      ok: false,
      mensaje: "Error al registrar pago",
      error: error.message
    });

  } finally {
    conexion.release();
  }
});

app.get("/api/salida/:uid", async (req, res) => {
  const { uid } = req.params;
  const conexion = await db.getConnection();

  try {
    await conexion.beginTransaction();

    const [[registro]] = await conexion.query(
      `SELECT * FROM registros_estacionamiento 
       WHERE uid_rfid = ? AND hora_salida IS NULL
       ORDER BY id_registro DESC
       LIMIT 1`,
      [uid]
    );

    if (!registro) {
      await conexion.rollback();
      return res.status(404).json({
        ok: false,
        mensaje: "No existe un vehículo activo dentro del estacionamiento con esta tarjeta"
      });
    }

    if (!registro.pago_realizado) {
      await conexion.rollback();
      return res.status(400).json({
        ok: false,
        mensaje: "Salida denegada: el pago aún no fue realizado"
      });
    }

    const [[validacionTiempo]] = await conexion.query(
      `SELECT 
        NOW() AS hora_actual,
        hora_limite_salida,
        CASE 
          WHEN NOW() <= hora_limite_salida THEN 1
          ELSE 0
        END AS dentro_tiempo
       FROM registros_estacionamiento
       WHERE id_registro = ?`,
      [registro.id_registro]
    );

    if (validacionTiempo.dentro_tiempo === 0) {
      await conexion.query(
        `UPDATE registros_estacionamiento
         SET pago_realizado = FALSE,
             estado = 'Penalizado'
         WHERE id_registro = ?`,
        [registro.id_registro]
      );

      await conexion.query(
        "UPDATE espacios SET estado = 'Pendiente' WHERE id_espacio = ?",
        [registro.id_espacio]
      );

      await conexion.query(
        `INSERT INTO eventos (tipo_evento, descripcion, uid_rfid)
         VALUES ('Alerta', ?, ?)`,
        [
          `El vehículo con tarjeta ${uid} excedió el tiempo de gracia y debe volver a pagar`,
          uid
        ]
      );

      await conexion.commit();

      return res.status(400).json({
        ok: false,
        mensaje: "Tiempo de gracia vencido. El usuario debe volver a pagar antes de salir.",
        uid_rfid: uid
      });
    }

    const [[calculoFinal]] = await conexion.query(
      `SELECT TIMESTAMPDIFF(MINUTE, hora_ingreso, NOW()) AS tiempo_total
       FROM registros_estacionamiento
       WHERE id_registro = ?`,
      [registro.id_registro]
    );

    await conexion.query(
      `UPDATE registros_estacionamiento
       SET hora_salida = NOW(),
           tiempo_minutos = ?,
           estado = 'Finalizado'
       WHERE id_registro = ?`,
      [calculoFinal.tiempo_total, registro.id_registro]
    );

    await conexion.query(
      "UPDATE tarjetas_rfid SET estado = 'Afuera' WHERE uid_rfid = ?",
      [uid]
    );

    await conexion.query(
      "UPDATE espacios SET estado = 'Libre', uid_rfid_actual = NULL WHERE id_espacio = ?",
      [registro.id_espacio]
    );

    await conexion.query(
      `INSERT INTO eventos (tipo_evento, descripcion, uid_rfid)
       VALUES ('Salida', ?, ?)`,
      [
        `Vehículo con tarjeta ${uid} salió del estacionamiento y liberó el espacio ${registro.id_espacio}`,
        uid
      ]
    );

    await conexion.commit();

    res.json({
      ok: true,
      mensaje: "Salida registrada correctamente",
      uid_rfid: uid,
      espacio_liberado: registro.id_espacio,
      tiempo_total_minutos: calculoFinal.tiempo_total
    });

  } catch (error) {
    await conexion.rollback();

    res.status(500).json({
      ok: false,
      mensaje: "Error al registrar salida",
      error: error.message
    });

  } finally {
    conexion.release();
  }
});

async function iniciarServidor() {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor iniciado en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error(
      "No se pudo iniciar el servidor:",
      error.message
    );

    process.exit(1);
  }
}

iniciarServidor();