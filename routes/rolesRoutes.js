const express = require("express");
const db = require("../config/db");

const router = express.Router();

function normalizarPrioridad(valor) {
  const prioridad = String(valor || "Normal").trim();

  const equivalencias = {
    normal: "Normal",
    alta: "Alta",
    maxima: "Maxima",
    máxima: "Maxima"
  };

  return equivalencias[prioridad.toLowerCase()] || "";
}

function validarDatosRol(cuerpo) {
  const nombre = String(cuerpo.nombre || "").trim();
  const icono = String(cuerpo.icono || "fa-user").trim();
  const descripcion = String(
    cuerpo.descripcion || "Rol registrado en el sistema"
  ).trim();

  const porcentajeDescuento = Number(
    cuerpo.porcentajeDescuento
  );

  const horasGratis = Number(
    cuerpo.horasGratis
  );

  const exoneracionTotal =
    cuerpo.exoneracionTotal === true;

  const prioridadAcceso = normalizarPrioridad(
    cuerpo.prioridadAcceso
  );

  const estado = String(
    cuerpo.estado || "Activo"
  ).trim();

  if (!nombre) {
    return {
      error: "El nombre del rol es obligatorio"
    };
  }

  if (nombre.length > 80) {
    return {
      error:
        "El nombre del rol no puede superar los 80 caracteres"
    };
  }

  if (!icono || icono.length > 60) {
    return {
      error:
        "El icono del rol no puede superar los 60 caracteres"
    };
  }

  if (
    !Number.isFinite(porcentajeDescuento) ||
    porcentajeDescuento < 0 ||
    porcentajeDescuento > 100
  ) {
    return {
      error:
        "El porcentaje de descuento debe estar entre 0 y 100"
    };
  }

  if (
    !Number.isInteger(horasGratis) ||
    horasGratis < 0
  ) {
    return {
      error:
        "Las horas gratuitas deben ser un número entero no negativo"
    };
  }

  if (!prioridadAcceso) {
    return {
      error:
        "La prioridad debe ser Normal, Alta o Máxima"
    };
  }

  if (descripcion.length > 255) {
    return {
      error:
        "La descripción no puede superar los 255 caracteres"
    };
  }

  if (!["Activo", "Inactivo"].includes(estado)) {
    return {
      error:
        "El estado del rol debe ser Activo o Inactivo"
    };
  }

  return {
    datos: {
      nombre,
      icono,
      porcentajeDescuento:
        exoneracionTotal
          ? 100
          : porcentajeDescuento,
      horasGratis,
      exoneracionTotal,
      prioridadAcceso,
      descripcion,
      estado
    }
  };
}

function formatearRol(rol) {
  return {
    idRol: rol.id_rol,
    nombre: rol.nombre,
    icono: rol.icono || "fa-user",
    porcentajeDescuento:
      Number(rol.porcentaje_descuento),
    horasGratis:
      Number(rol.horas_gratis),
    exoneracionTotal:
      Boolean(rol.exoneracion_total),
    prioridadAcceso:
      rol.prioridad_acceso,
    descripcion:
      rol.descripcion,
    estado:
      rol.estado
  };
}

// ============================================================
// POST /api/v2/configuracion/roles
// Crea un nuevo rol.
// ============================================================
router.post("/", async (req, res) => {
  try {
    const validacion = validarDatosRol(req.body);

    if (validacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: validacion.error
      });
    }

    const datos = validacion.datos;

    const [existentes] = await db.query(
      `
        SELECT id_rol
        FROM roles
        WHERE LOWER(nombre) = LOWER(?)
        LIMIT 1
      `,
      [datos.nombre]
    );

    if (existentes.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Ya existe un rol con ese nombre"
      });
    }

    const [resultado] = await db.query(
      `
        INSERT INTO roles (
          nombre,
          icono,
          porcentaje_descuento,
          horas_gratis,
          exoneracion_total,
          prioridad_acceso,
          descripcion,
          estado
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        datos.nombre,
        datos.icono,
        datos.porcentajeDescuento,
        datos.horasGratis,
        datos.exoneracionTotal,
        datos.prioridadAcceso,
        datos.descripcion,
        datos.estado
      ]
    );

    const [filas] = await db.query(
      `
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
        WHERE id_rol = ?
        LIMIT 1
      `,
      [resultado.insertId]
    );

    return res.status(201).json({
      ok: true,
      mensaje:
        "Rol creado correctamente",
      rol: formatearRol(filas[0])
    });
  } catch (error) {
    console.error(
      "Error al crear el rol:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al crear el rol",
      error: error.message
    });
  }
});

// ============================================================
// PUT /api/v2/configuracion/roles/:id
// Actualiza un rol existente.
// ============================================================
router.put("/:id", async (req, res) => {
  try {
    const idRol = Number(req.params.id);

    if (
      !Number.isInteger(idRol) ||
      idRol <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador del rol no es válido"
      });
    }

    const validacion = validarDatosRol(req.body);

    if (validacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: validacion.error
      });
    }

    const datos = validacion.datos;

    const [rolActual] = await db.query(
      `
        SELECT id_rol
        FROM roles
        WHERE id_rol = ?
        LIMIT 1
      `,
      [idRol]
    );

    if (rolActual.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "El rol indicado no existe"
      });
    }

    const [duplicados] = await db.query(
      `
        SELECT id_rol
        FROM roles
        WHERE LOWER(nombre) = LOWER(?)
          AND id_rol <> ?
        LIMIT 1
      `,
      [datos.nombre, idRol]
    );

    if (duplicados.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Ya existe otro rol con ese nombre"
      });
    }

    await db.query(
      `
        UPDATE roles
        SET
          nombre = ?,
          icono = ?,
          porcentaje_descuento = ?,
          horas_gratis = ?,
          exoneracion_total = ?,
          prioridad_acceso = ?,
          descripcion = ?,
          estado = ?
        WHERE id_rol = ?
      `,
      [
        datos.nombre,
        datos.icono,
        datos.porcentajeDescuento,
        datos.horasGratis,
        datos.exoneracionTotal,
        datos.prioridadAcceso,
        datos.descripcion,
        datos.estado,
        idRol
      ]
    );

    const [filas] = await db.query(
      `
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
        WHERE id_rol = ?
        LIMIT 1
      `,
      [idRol]
    );

    return res.json({
      ok: true,
      mensaje:
        "Rol actualizado correctamente",
      rol: formatearRol(filas[0])
    });
  } catch (error) {
    console.error(
      "Error al actualizar el rol:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al actualizar el rol",
      error: error.message
    });
  }
});

// ============================================================
// PATCH /api/v2/configuracion/roles/:id/estado
// Activa o desactiva un rol sin eliminarlo físicamente.
// ============================================================
router.patch("/:id/estado", async (req, res) => {
  try {
    const idRol = Number(req.params.id);
    const estado = String(
      req.body.estado || ""
    ).trim();

    if (
      !Number.isInteger(idRol) ||
      idRol <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El identificador del rol no es válido"
      });
    }

    if (!["Activo", "Inactivo"].includes(estado)) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El estado debe ser Activo o Inactivo"
      });
    }

    const [resultado] = await db.query(
      `
        UPDATE roles
        SET estado = ?
        WHERE id_rol = ?
      `,
      [estado, idRol]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "El rol indicado no existe"
      });
    }

    return res.json({
      ok: true,
      mensaje:
        estado === "Activo"
          ? "Rol activado correctamente"
          : "Rol desactivado correctamente"
    });
  } catch (error) {
    console.error(
      "Error al cambiar el estado del rol:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al cambiar el estado del rol",
      error: error.message
    });
  }
});

module.exports = router;
