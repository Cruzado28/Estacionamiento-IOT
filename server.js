const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const initDatabase = require("./config/initDb");

const dashboardRoutes = require(
  "./routes/dashboardRoutes"
);

const vehiculoRoutes = require(
  "./routes/vehiculoRoutes"
);

const estacionamientoRoutes = require(
  "./routes/estacionamientoRoutes"
);

const historialRoutes = require(
  "./routes/historialRoutes"
);

const configuracionRoutes = require(
  "./routes/configuracionRoutes"
);

const rolesRoutes = require(
  "./routes/rolesRoutes"
);

const iotRoutes = require(
  "./routes/iotRoutes"
);

const authRoutes = require(
  "./routes/authRoutes"
);

const verificarToken = require(
  "./middleware/authMiddleware"
);

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

// ============================================================
// MIDDLEWARES GENERALES
// ============================================================

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

// ============================================================
// PÁGINA PRINCIPAL
// ============================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "nuevo-sistema.html"
    )
  );
});

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ============================================================
// ESTADO DEL SERVIDOR
// Esta ruta no requiere iniciar sesión.
// Railway puede utilizarla para verificar el servicio.
// ============================================================

app.get("/api/status", (req, res) => {
  return res.status(200).json({
    ok: true,
    estado: "OK",
    mensaje:
      "Smart Parking IoT funcionando correctamente",
    entorno:
      process.env.NODE_ENV || "development"
  });
});

// ============================================================
// AUTENTICACIÓN
// ============================================================

app.use(
  "/api/v2/auth",
  authRoutes
);

// ============================================================
// RUTAS PROTEGIDAS
// ============================================================

app.use(
  "/api/v2/dashboard",
  verificarToken,
  dashboardRoutes
);

app.use(
  "/api/v2/vehiculos",
  verificarToken,
  vehiculoRoutes
);

app.use(
  "/api/v2/estacionamiento",
  verificarToken,
  estacionamientoRoutes
);

app.use(
  "/api/v2/historial",
  verificarToken,
  historialRoutes
);

app.use(
  "/api/v2/configuracion/roles",
  verificarToken,
  rolesRoutes
);

app.use(
  "/api/v2/configuracion",
  verificarToken,
  configuracionRoutes
);

app.use(
  "/api/v2/iot",
  verificarToken,
  iotRoutes
);

// ============================================================
// RUTA NO ENCONTRADA
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    mensaje: "Ruta no encontrada"
  });
});

// ============================================================
// CONTROL GENERAL DE ERRORES
// ============================================================

app.use((error, req, res, next) => {
  console.error(
    "Error general del servidor:",
    error
  );

  return res.status(500).json({
    ok: false,
    mensaje:
      "Ocurrió un error interno en el servidor"
  });
});

// ============================================================
// INICIO DEL SERVIDOR
// ============================================================

async function iniciarServidor() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Smart Parking IoT iniciado en el puerto ${PORT}`
        );

        console.log(
          `Entorno: ${
            process.env.NODE_ENV ||
            "development"
          }`
        );
      }
    );
  } catch (error) {
    console.error(
      "No se pudo iniciar el servidor:",
      error.message
    );

    process.exit(1);
  }
}

iniciarServidor();
