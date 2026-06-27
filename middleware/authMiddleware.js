const jwt = require("jsonwebtoken");

function verificarToken(req, res, next) {
  try {
    const encabezado =
      req.headers.authorization || "";

    if (!encabezado.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        mensaje:
          "Debes iniciar sesión para acceder a este recurso"
      });
    }

    const token = encabezado.substring(7);

    if (!process.env.JWT_SECRET) {
      console.error(
        "JWT_SECRET no está configurado"
      );

      return res.status(500).json({
        ok: false,
        mensaje:
          "La seguridad del servidor no está configurada"
      });
    }

    const sesion = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.administrador = {
      idAdministrador:
        sesion.idAdministrador,

      usuario:
        sesion.usuario,

      nombre:
        sesion.nombre
    };

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      mensaje:
        error.name === "TokenExpiredError"
          ? "La sesión ha expirado"
          : "El token de sesión no es válido"
    });
  }
}

module.exports = verificarToken;