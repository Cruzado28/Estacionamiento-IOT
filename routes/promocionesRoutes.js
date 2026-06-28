const express = require("express");
const db = require("../config/db");

const router = express.Router();

const TIPOS_BENEFICIO = [
  "Porcentaje",
  "Horas gratis",
  "Minutos gratis",
  "Exoneracion total",
  "Monto fijo"
];

const ESTADOS_PROMOCION = [
  "Activa",
  "Inactiva",
  "Vencida"
];

function crearDescripcionBeneficio(
  tipoBeneficio,
  valorBeneficio
) {
  const valor = Number(valorBeneficio) || 0;

  switch (tipoBeneficio) {
    case "Porcentaje":
      return `${valor}% de descuento`;

    case "Horas gratis":
      return `${valor} hora${
        valor === 1 ? "" : "s"
      } gratis`;

    case "Minutos gratis":
      return `${valor} minuto${
        valor === 1 ? "" : "s"
      } gratis`;

    case "Exoneracion total":
      return "Estacionamiento completamente gratuito";

    case "Monto fijo":
      return `Descuento fijo de S/ ${valor.toFixed(2)}`;

    default:
      return "Beneficio registrado";
  }
}

function formatearPromocion(promocion) {
  return {
    idPromocion:
      promocion.id_promocion,

    nombre:
      promocion.nombre,

    montoMinimo:
      Number(promocion.monto_minimo),

    tipoBeneficio:
      promocion.tipo_beneficio,

    valorBeneficio:
      Number(promocion.valor_beneficio),

    beneficioDescripcion:
      promocion.beneficio_descripcion,

    fechaInicio:
      promocion.fecha_inicio,

    fechaFin:
      promocion.fecha_fin,

    estado:
      promocion.estado,

    limiteUsos:
      promocion.limite_usos === null
        ? null
        : Number(promocion.limite_usos),

    usosRealizados:
      Number(promocion.usos_realizados)
  };
}

function validarDatosPromocion(
  cuerpo,
  usosRealizados = 0
) {
  const nombre = String(
    cuerpo.nombre || ""
  ).trim();

  const montoMinimo = Number(
    cuerpo.montoMinimo
  );

  const tipoBeneficio = String(
    cuerpo.tipoBeneficio || ""
  ).trim();

  let valorBeneficio = Number(
    cuerpo.valorBeneficio
  );

  const beneficioDescripcionRecibida =
    String(
      cuerpo.beneficioDescripcion || ""
    ).trim();

  const fechaInicio = String(
    cuerpo.fechaInicio || ""
  ).trim();

  const fechaFin = String(
    cuerpo.fechaFin || ""
  ).trim();

  const estado = String(
    cuerpo.estado || "Activa"
  ).trim();

  const limiteRecibido =
    cuerpo.limiteUsos;

  const limiteUsos =
    limiteRecibido === null ||
    limiteRecibido === undefined ||
    limiteRecibido === ""
      ? null
      : Number(limiteRecibido);

  if (!nombre) {
    return {
      error:
        "El nombre de la promoción es obligatorio"
    };
  }

  if (nombre.length > 120) {
    return {
      error:
        "El nombre no puede superar los 120 caracteres"
    };
  }

  if (
    !Number.isFinite(montoMinimo) ||
    montoMinimo < 0
  ) {
    return {
      error:
        "El monto mínimo debe ser un número no negativo"
    };
  }

  if (
    !TIPOS_BENEFICIO.includes(
      tipoBeneficio
    )
  ) {
    return {
      error:
        "El tipo de beneficio no es válido"
    };
  }

  if (
    tipoBeneficio ===
    "Exoneracion total"
  ) {
    valorBeneficio = 0;
  } else {
    if (
      !Number.isFinite(valorBeneficio) ||
      valorBeneficio <= 0
    ) {
      return {
        error:
          "El valor del beneficio debe ser mayor que cero"
      };
    }
  }

  if (
    tipoBeneficio === "Porcentaje" &&
    valorBeneficio > 100
  ) {
    return {
      error:
        "El porcentaje no puede ser mayor que 100"
    };
  }

  const formatoFecha =
    /^\d{4}-\d{2}-\d{2}$/;

  if (
    !formatoFecha.test(fechaInicio) ||
    !formatoFecha.test(fechaFin)
  ) {
    return {
      error:
        "Las fechas deben tener el formato YYYY-MM-DD"
    };
  }

  if (fechaFin < fechaInicio) {
    return {
      error:
        "La fecha final no puede ser anterior a la fecha inicial"
    };
  }

  if (
    !ESTADOS_PROMOCION.includes(estado)
  ) {
    return {
      error:
        "El estado de la promoción no es válido"
    };
  }

  if (
    limiteUsos !== null &&
    (
      !Number.isInteger(limiteUsos) ||
      limiteUsos <= 0
    )
  ) {
    return {
      error:
        "El límite de usos debe ser un entero mayor que cero"
    };
  }

  if (
    limiteUsos !== null &&
    limiteUsos < Number(usosRealizados)
  ) {
    return {
      error:
        "El límite de usos no puede ser menor que los usos ya realizados"
    };
  }

  const beneficioDescripcion =
    beneficioDescripcionRecibida ||
    crearDescripcionBeneficio(
      tipoBeneficio,
      valorBeneficio
    );

  if (
    beneficioDescripcion.length > 255
  ) {
    return {
      error:
        "La descripción del beneficio no puede superar los 255 caracteres"
    };
  }

  return {
    datos: {
      nombre,
      montoMinimo,
      tipoBeneficio,
      valorBeneficio,
      beneficioDescripcion,
      fechaInicio,
      fechaFin,
      estado,
      limiteUsos
    }
  };
}

async function obtenerPromocionPorId(
  idPromocion
) {
  const [filas] = await db.query(
    `
      SELECT
        id_promocion,
        nombre,
        monto_minimo,
        tipo_beneficio,
        valor_beneficio,
        beneficio_descripcion,
        DATE_FORMAT(
          fecha_inicio,
          '%Y-%m-%d'
        ) AS fecha_inicio,
        DATE_FORMAT(
          fecha_fin,
          '%Y-%m-%d'
        ) AS fecha_fin,
        estado,
        limite_usos,
        usos_realizados
      FROM promociones
      WHERE id_promocion = ?
      LIMIT 1
    `,
    [idPromocion]
  );

  return filas[0] || null;
}

// ============================================================
// POST /api/v2/configuracion/promociones
// Crea una promoción.
// ============================================================
router.post("/", async (req, res) => {
  try {
    const validacion =
      validarDatosPromocion(req.body);

    if (validacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: validacion.error
      });
    }

    const datos = validacion.datos;

    const [existentes] = await db.query(
      `
        SELECT id_promocion
        FROM promociones
        WHERE LOWER(nombre) = LOWER(?)
        LIMIT 1
      `,
      [datos.nombre]
    );

    if (existentes.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Ya existe una promoción con ese nombre"
      });
    }

    const [resultado] = await db.query(
      `
        INSERT INTO promociones (
          nombre,
          monto_minimo,
          tipo_beneficio,
          valor_beneficio,
          beneficio_descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          limite_usos,
          usos_realizados
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
      [
        datos.nombre,
        datos.montoMinimo,
        datos.tipoBeneficio,
        datos.valorBeneficio,
        datos.beneficioDescripcion,
        datos.fechaInicio,
        datos.fechaFin,
        datos.estado,
        datos.limiteUsos
      ]
    );

    const promocion =
      await obtenerPromocionPorId(
        resultado.insertId
      );

    return res.status(201).json({
      ok: true,
      mensaje:
        "Promoción creada correctamente",
      promocion:
        formatearPromocion(promocion)
    });
  } catch (error) {
    console.error(
      "Error al crear la promoción:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al crear la promoción",
      error: error.message
    });
  }
});

// ============================================================
// PUT /api/v2/configuracion/promociones/:id
// Actualiza una promoción existente.
// ============================================================
router.put("/:id", async (req, res) => {
  try {
    const idPromocion = Number(
      req.params.id
    );

    if (
      !Number.isInteger(idPromocion) ||
      idPromocion <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador de la promoción no es válido"
      });
    }

    const promocionActual =
      await obtenerPromocionPorId(
        idPromocion
      );

    if (!promocionActual) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "La promoción indicada no existe"
      });
    }

    const validacion =
      validarDatosPromocion(
        req.body,
        promocionActual.usos_realizados
      );

    if (validacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: validacion.error
      });
    }

    const datos = validacion.datos;

    const [duplicados] = await db.query(
      `
        SELECT id_promocion
        FROM promociones
        WHERE LOWER(nombre) = LOWER(?)
          AND id_promocion <> ?
        LIMIT 1
      `,
      [
        datos.nombre,
        idPromocion
      ]
    );

    if (duplicados.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Ya existe otra promoción con ese nombre"
      });
    }

    await db.query(
      `
        UPDATE promociones
        SET
          nombre = ?,
          monto_minimo = ?,
          tipo_beneficio = ?,
          valor_beneficio = ?,
          beneficio_descripcion = ?,
          fecha_inicio = ?,
          fecha_fin = ?,
          estado = ?,
          limite_usos = ?
        WHERE id_promocion = ?
      `,
      [
        datos.nombre,
        datos.montoMinimo,
        datos.tipoBeneficio,
        datos.valorBeneficio,
        datos.beneficioDescripcion,
        datos.fechaInicio,
        datos.fechaFin,
        datos.estado,
        datos.limiteUsos,
        idPromocion
      ]
    );

    const promocionActualizada =
      await obtenerPromocionPorId(
        idPromocion
      );

    return res.json({
      ok: true,
      mensaje:
        "Promoción actualizada correctamente",
      promocion:
        formatearPromocion(
          promocionActualizada
        )
    });
  } catch (error) {
    console.error(
      "Error al actualizar la promoción:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al actualizar la promoción",
      error: error.message
    });
  }
});

// ============================================================
// PATCH /api/v2/configuracion/promociones/:id/estado
// Activa, desactiva o marca como vencida una promoción.
// ============================================================
router.patch(
  "/:id/estado",
  async (req, res) => {
    try {
      const idPromocion = Number(
        req.params.id
      );

      const estado = String(
        req.body.estado || ""
      ).trim();

      if (
        !Number.isInteger(idPromocion) ||
        idPromocion <= 0
      ) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "El identificador de la promoción no es válido"
        });
      }

      if (
        !ESTADOS_PROMOCION.includes(estado)
      ) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "El estado de la promoción no es válido"
        });
      }

      const [resultado] = await db.query(
        `
          UPDATE promociones
          SET estado = ?
          WHERE id_promocion = ?
        `,
        [
          estado,
          idPromocion
        ]
      );

      if (
        resultado.affectedRows === 0
      ) {
        return res.status(404).json({
          ok: false,
          mensaje:
            "La promoción indicada no existe"
        });
      }

      return res.json({
        ok: true,
        mensaje:
          estado === "Activa"
            ? "Promoción activada correctamente"
            : estado === "Inactiva"
              ? "Promoción desactivada correctamente"
              : "Promoción marcada como vencida"
      });
    } catch (error) {
      console.error(
        "Error al cambiar el estado de la promoción:",
        error.message
      );

      return res.status(500).json({
        ok: false,
        mensaje:
          "Error al cambiar el estado de la promoción",
        error: error.message
      });
    }
  }
);

module.exports = router;
