const express = require("express");
const db = require("../config/db");

const router = express.Router();

// ============================================================
// GET /api/v2/configuracion/tarifa
// ============================================================
router.get("/tarifa", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_tarifa,
        nombre,
        tarifa_hora,
        tarifa_minuto,
        tiempo_gracia_min,
        tiempo_salida_despues_pago_min,
        tarifa_maxima_diaria,
        DATE_FORMAT(horario_promocional_inicio, '%H:%i') AS horario_promocional_inicio,
        DATE_FORMAT(horario_promocional_fin, '%H:%i') AS horario_promocional_fin,
        estado
      FROM tarifas_config
      WHERE estado = 'Activa'
      ORDER BY id_tarifa DESC
      LIMIT 1
    `);

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "No existe una tarifa activa"
      });
    }

    const tarifa = filas[0];

    return res.json({
      ok: true,
      tarifa: {
        idTarifa: tarifa.id_tarifa,
        nombre: tarifa.nombre,
        tarifaHora: Number(tarifa.tarifa_hora),
        tarifaMinuto: Number(tarifa.tarifa_minuto),
        tiempoGraciaMinutos: Number(tarifa.tiempo_gracia_min),
        tiempoSalidaDespuesPagoMinutos: Number(tarifa.tiempo_salida_despues_pago_min),
        tarifaMaximaDiaria: Number(tarifa.tarifa_maxima_diaria),
        horarioPromocionalInicio: tarifa.horario_promocional_inicio,
        horarioPromocionalFin: tarifa.horario_promocional_fin,
        estado: tarifa.estado
      }
    });
  } catch (error) {
    console.error("Error al obtener la tarifa:", error.message);

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener la tarifa",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/configuracion/roles
// ============================================================
router.get("/roles", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_rol,
        nombre,
        icono,
        porcentaje_descuento,
        horas_gratis,
        exoneracion_total,
        prioridad_acceso,
        descripcion,
        estado
      FROM roles
      ORDER BY id_rol ASC
    `);

    return res.json({
      ok: true,
      total: filas.length,
      roles: filas.map((rol) => ({
        idRol: rol.id_rol,
        nombre: rol.nombre,
        icono: rol.icono || "fa-user",
        porcentajeDescuento: Number(rol.porcentaje_descuento),
        horasGratis: Number(rol.horas_gratis),
        exoneracionTotal: Boolean(rol.exoneracion_total),
        prioridadAcceso: rol.prioridad_acceso,
        descripcion: rol.descripcion,
        estado: rol.estado
      }))
    });
  } catch (error) {
    console.error("Error al obtener los roles:", error.message);

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los roles",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/configuracion/promociones
// ============================================================
router.get("/promociones", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_promocion,
        nombre,
        monto_minimo,
        tipo_beneficio,
        valor_beneficio,
        beneficio_descripcion,
        DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
        DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin,
        estado,
        limite_usos,
        usos_realizados
      FROM promociones
      ORDER BY id_promocion ASC
    `);

    return res.json({
      ok: true,
      total: filas.length,
      promociones: filas.map((promocion) => ({
        idPromocion: promocion.id_promocion,
        nombre: promocion.nombre,
        montoMinimo: Number(promocion.monto_minimo),
        tipoBeneficio: promocion.tipo_beneficio,
        valorBeneficio: Number(promocion.valor_beneficio),
        beneficioDescripcion: promocion.beneficio_descripcion,
        fechaInicio: promocion.fecha_inicio,
        fechaFin: promocion.fecha_fin,
        estado: promocion.estado,
        limiteUsos: promocion.limite_usos === null ? null : Number(promocion.limite_usos),
        usosRealizados: Number(promocion.usos_realizados)
      }))
    });
  } catch (error) {
    console.error("Error al obtener las promociones:", error.message);

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener las promociones",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/configuracion/establecimientos
// ============================================================
router.get("/establecimientos", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_establecimiento,
        nombre,
        categoria,
        icono,
        ubicacion,
        tipo_registro,
        estado,
        descripcion
      FROM establecimientos
      ORDER BY id_establecimiento ASC
    `);

    return res.json({
      ok: true,
      total: filas.length,
      establecimientos: filas.map((establecimiento) => ({
        idEstablecimiento: establecimiento.id_establecimiento,
        nombre: establecimiento.nombre,
        categoria: establecimiento.categoria,
        icono: establecimiento.icono || "fa-store",
        ubicacion: establecimiento.ubicacion,
        tipoRegistro: establecimiento.tipo_registro,
        estado: establecimiento.estado,
        descripcion: establecimiento.descripcion
      }))
    });
  } catch (error) {
    console.error("Error al obtener los establecimientos:", error.message);

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los establecimientos",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/configuracion/administrador
// ============================================================
router.get("/administrador", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_admin,
        nombre,
        correo,
        usuario,
        tema_preferido,
        color_principal,
        estado,
        DATE_FORMAT(
          creado_en,
          '%Y-%m-%d %H:%i:%s'
        ) AS creado_en,
        DATE_FORMAT(
          actualizado_en,
          '%Y-%m-%d %H:%i:%s'
        ) AS actualizado_en
      FROM administradores
      WHERE estado = 'Activo'
      ORDER BY id_admin ASC
      LIMIT 1
    `);

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "No existe un administrador activo"
      });
    }

    const administrador = filas[0];

    return res.json({
      ok: true,
      administrador: {
        idAdministrador: administrador.id_admin,
        nombre: administrador.nombre,
        correo: administrador.correo,
        usuario: administrador.usuario,
        temaPreferido: administrador.tema_preferido,
        colorPrincipal: administrador.color_principal,
        estado: administrador.estado,
        creadoEn: administrador.creado_en,
        actualizadoEn: administrador.actualizado_en
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener el administrador:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el administrador",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/configuracion/sistema
// ============================================================
router.get("/sistema", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        id_configuracion,
        nombre_estacionamiento,
        tiempo_maximo_horas,
        alertas_visuales,
        alertas_sonoras,
        correos_automaticos,
        alertas_sensores_desconectados,
        DATE_FORMAT(
          actualizado_en,
          '%Y-%m-%d %H:%i:%s'
        ) AS actualizado_en
      FROM configuracion_sistema
      WHERE id_configuracion = 1
      LIMIT 1
    `);

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "No existe la configuración del sistema"
      });
    }

    const [[conteoEspacios]] = await db.query(`
      SELECT COUNT(*) AS total_espacios
      FROM espacios
    `);

    const configuracion = filas[0];

    return res.json({
      ok: true,
      configuracion: {
        idConfiguracion:
          configuracion.id_configuracion,

        nombreEstacionamiento:
          configuracion.nombre_estacionamiento,

        numeroEspacios:
          Number(conteoEspacios.total_espacios),

        tiempoMaximoHoras:
          Number(configuracion.tiempo_maximo_horas),

        alertasVisuales:
          Boolean(configuracion.alertas_visuales),

        alertasSonoras:
          Boolean(configuracion.alertas_sonoras),

        correosAutomaticos:
          Boolean(configuracion.correos_automaticos),

        alertasSensoresDesconectados:
          Boolean(
            configuracion.alertas_sensores_desconectados
          ),

        actualizadoEn:
          configuracion.actualizado_en
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener la configuración del sistema:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener la configuración del sistema",
      error: error.message
    });
  }
});

// ============================================================
// PUT /api/v2/configuracion/sistema
// ============================================================
router.put("/sistema", async (req, res) => {
  try {
    const {
      nombreEstacionamiento,
      tiempoMaximoHoras,
      alertasVisuales,
      alertasSonoras,
      correosAutomaticos,
      alertasSensoresDesconectados
    } = req.body;

    const nombre = String(
      nombreEstacionamiento || ""
    ).trim();

    const tiempoMaximo = Number(
      tiempoMaximoHoras
    );

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El nombre del estacionamiento es obligatorio"
      });
    }

    if (nombre.length > 150) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El nombre no puede superar los 150 caracteres"
      });
    }

    if (
      !Number.isInteger(tiempoMaximo) ||
      tiempoMaximo < 1 ||
      tiempoMaximo > 168
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El tiempo máximo debe estar entre 1 y 168 horas"
      });
    }

    const configuracionesBooleanas = [
      alertasVisuales,
      alertasSonoras,
      correosAutomaticos,
      alertasSensoresDesconectados
    ];

    if (
      configuracionesBooleanas.some(
        (valor) => typeof valor !== "boolean"
      )
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Las opciones de notificación deben ser verdaderas o falsas"
      });
    }

    const [resultado] = await db.query(
      `
        UPDATE configuracion_sistema
        SET
          nombre_estacionamiento = ?,
          tiempo_maximo_horas = ?,
          alertas_visuales = ?,
          alertas_sonoras = ?,
          correos_automaticos = ?,
          alertas_sensores_desconectados = ?
        WHERE id_configuracion = 1
      `,
      [
        nombre,
        tiempoMaximo,
        alertasVisuales,
        alertasSonoras,
        correosAutomaticos,
        alertasSensoresDesconectados
      ]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "No existe la configuración del sistema"
      });
    }

    return res.json({
      ok: true,
      mensaje:
        "Configuración guardada correctamente"
    });
  } catch (error) {
    console.error(
      "Error al guardar la configuración:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al guardar la configuración",
      error: error.message
    });
  }
});

// ============================================================
// PUT /api/v2/configuracion/administrador/preferencias
// ============================================================
router.put("/administrador/preferencias", async (req, res) => {
  try {
    const temaPreferido = String(
      req.body.temaPreferido || ""
    ).toLowerCase();

    const colorPrincipal = String(
      req.body.colorPrincipal || ""
    ).trim();

    if (!["dark", "light"].includes(temaPreferido)) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El tema debe ser dark o light"
      });
    }

    if (
      !/^#[0-9a-fA-F]{6}$/.test(colorPrincipal)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El color principal debe tener formato hexadecimal"
      });
    }

    const [administradores] = await db.query(`
      SELECT id_admin
      FROM administradores
      WHERE estado = 'Activo'
      ORDER BY id_admin ASC
      LIMIT 1
    `);

    if (administradores.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "No existe un administrador activo"
      });
    }

    const idAdministrador =
      administradores[0].id_admin;

    await db.query(
      `
        UPDATE administradores
        SET
          tema_preferido = ?,
          color_principal = ?
        WHERE id_admin = ?
      `,
      [
        temaPreferido,
        colorPrincipal,
        idAdministrador
      ]
    );

    return res.json({
      ok: true,
      mensaje:
        "Preferencias visuales guardadas correctamente",
      preferencias: {
        temaPreferido,
        colorPrincipal
      }
    });
  } catch (error) {
    console.error(
      "Error al guardar las preferencias visuales:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al guardar las preferencias visuales",
      error: error.message
    });
  }
});

// ============================================================
// PUT /api/v2/configuracion/tarifa
// Actualiza la tarifa activa del estacionamiento
// ============================================================
router.put("/tarifa", async (req, res) => {
  try {
    const tarifaHora = Number(
      req.body.tarifaHora
    );

    const tarifaMinuto = Number(
      req.body.tarifaMinuto
    );

    const tiempoGraciaMinutos = Number(
      req.body.tiempoGraciaMinutos
    );

    const tiempoSalidaDespuesPagoMinutos = Number(
      req.body.tiempoSalidaDespuesPagoMinutos
    );

    const tarifaMaximaDiaria = Number(
      req.body.tarifaMaximaDiaria
    );

    const horarioPromocionalInicio =
      req.body.horarioPromocionalInicio || null;

    const horarioPromocionalFin =
      req.body.horarioPromocionalFin || null;

    const valoresNumericos = [
      tarifaHora,
      tarifaMinuto,
      tiempoGraciaMinutos,
      tiempoSalidaDespuesPagoMinutos,
      tarifaMaximaDiaria
    ];

    if (
      valoresNumericos.some(
        (valor) =>
          !Number.isFinite(valor) ||
          valor < 0
      )
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Los valores de la tarifa deben ser números válidos y no negativos"
      });
    }

    if (
      !Number.isInteger(tiempoGraciaMinutos) ||
      !Number.isInteger(
        tiempoSalidaDespuesPagoMinutos
      )
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Los tiempos deben ingresarse en minutos completos"
      });
    }

    const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (
      horarioPromocionalInicio &&
      !formatoHora.test(
        horarioPromocionalInicio
      )
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El horario promocional de inicio no es válido"
      });
    }

    if (
      horarioPromocionalFin &&
      !formatoHora.test(
        horarioPromocionalFin
      )
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El horario promocional de fin no es válido"
      });
    }

    const [tarifas] = await db.query(`
      SELECT id_tarifa
      FROM tarifas_config
      WHERE estado = 'Activa'
      ORDER BY id_tarifa DESC
      LIMIT 1
    `);

    if (tarifas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "No existe una tarifa activa para actualizar"
      });
    }

    const idTarifa = tarifas[0].id_tarifa;

    await db.query(
      `
        UPDATE tarifas_config
        SET
          tarifa_hora = ?,
          tarifa_minuto = ?,
          tiempo_gracia_min = ?,
          tiempo_salida_despues_pago_min = ?,
          tarifa_maxima_diaria = ?,
          horario_promocional_inicio = ?,
          horario_promocional_fin = ?
        WHERE id_tarifa = ?
      `,
      [
        tarifaHora,
        tarifaMinuto,
        tiempoGraciaMinutos,
        tiempoSalidaDespuesPagoMinutos,
        tarifaMaximaDiaria,
        horarioPromocionalInicio,
        horarioPromocionalFin,
        idTarifa
      ]
    );

    return res.json({
      ok: true,
      mensaje:
        "Tarifa actualizada correctamente",
      tarifa: {
        idTarifa,
        tarifaHora,
        tarifaMinuto,
        tiempoGraciaMinutos,
        tiempoSalidaDespuesPagoMinutos,
        tarifaMaximaDiaria,
        horarioPromocionalInicio,
        horarioPromocionalFin
      }
    });
  } catch (error) {
    console.error(
      "Error al actualizar la tarifa:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al actualizar la tarifa",
      error: error.message
    });
  }
});

module.exports = router;