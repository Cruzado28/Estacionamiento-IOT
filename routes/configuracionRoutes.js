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

module.exports = router;