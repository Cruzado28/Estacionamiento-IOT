const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const router = express.Router();

// ============================================================
// POST /api/v2/auth/login
// ============================================================
router.post("/login", async (req, res) => {
  try {
    const usuario = String(
      req.body.usuario || ""
    ).trim();

    const contrasena = String(
      req.body.contrasena || ""
    );

    if (!usuario || !contrasena) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El usuario y la contraseña son obligatorios"
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error(
        "JWT_SECRET no está configurado en el archivo .env"
      );

      return res.status(500).json({
        ok: false,
        mensaje:
          "La seguridad del servidor no está configurada"
      });
    }

    const [filas] = await db.query(
      `
        SELECT
          id_admin,
          nombre,
          correo,
          usuario,
          contrasena_hash,
          tema_preferido,
          color_principal,
          estado
        FROM administradores
        WHERE usuario = ?
        LIMIT 1
      `,
      [usuario]
    );

    if (filas.length === 0) {
      return res.status(401).json({
        ok: false,
        mensaje:
          "Usuario o contraseña incorrectos"
      });
    }

    const administrador = filas[0];

    if (administrador.estado !== "Activo") {
      return res.status(403).json({
        ok: false,
        mensaje:
          "La cuenta del administrador está inactiva"
      });
    }

    const contrasenaValida =
      await bcrypt.compare(
        contrasena,
        administrador.contrasena_hash
      );

    if (!contrasenaValida) {
      return res.status(401).json({
        ok: false,
        mensaje:
          "Usuario o contraseña incorrectos"
      });
    }

    const token = jwt.sign(
      {
        idAdministrador:
          administrador.id_admin,

        usuario:
          administrador.usuario,

        nombre:
          administrador.nombre
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h"
      }
    );

    return res.json({
      ok: true,
      mensaje:
        "Inicio de sesión correcto",

      token,

      administrador: {
        idAdministrador:
          administrador.id_admin,

        nombre:
          administrador.nombre,

        correo:
          administrador.correo,

        usuario:
          administrador.usuario,

        temaPreferido:
          administrador.tema_preferido,

        colorPrincipal:
          administrador.color_principal
      }
    });
  } catch (error) {
    console.error(
      "Error al iniciar sesión:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error interno al iniciar sesión"
    });
  }
});

// ============================================================
// GET /api/v2/auth/verificar
// ============================================================
router.get("/verificar", (req, res) => {
  try {
    const encabezado =
      req.headers.authorization || "";

    if (!encabezado.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        mensaje: "No se proporcionó un token de sesión"
      });
    }

    const token = encabezado.substring(7);

    const sesion = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    return res.json({
      ok: true,
      mensaje: "Sesión válida",
      administrador: {
        idAdministrador:
          sesion.idAdministrador,

        usuario:
          sesion.usuario,

        nombre:
          sesion.nombre
      }
    });
  } catch (error) {
    return res.status(401).json({
      ok: false,
      mensaje:
        error.name === "TokenExpiredError"
          ? "La sesión ha expirado"
          : "El token de sesión no es válido"
    });
  }
});

module.exports = router;