const express = require("express");
const db = require("../config/db");
const PDFDocument = require("pdfkit");

const router = express.Router();

/**
 * GET /api/v2/dashboard/resumen
 * Devuelve los indicadores principales del estacionamiento.
 */
router.get("/resumen", async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT
        total_espacios,
        espacios_libres,
        espacios_ocupados,
        espacios_reservados,
        espacios_mantenimiento,
        vehiculos_activos,
        ingresos_del_dia,
        ingresos_vehiculares_del_dia,
        permanencia_promedio_minutos,
        dispositivos_online,
        dispositivos_con_alerta
      FROM vw_dashboard_resumen
      LIMIT 1
    `);

        const [filasMetricas] = await db.query(`
      SELECT

        (
          SELECT
            ROUND(
              COALESCE(
                SUM(
                  CASE
                    WHEN r.exoneracion_total = 1
                      THEN COALESCE(s.tiempo_minutos, 0)

                    WHEN r.horas_gratis > 0
                      THEN LEAST(
                        COALESCE(s.tiempo_minutos, 0),
                        r.horas_gratis * 60
                      )

                    ELSE 0
                  END
                ),
                0
              ) / 60,
              2
            )

          FROM sesiones_parqueo s

          INNER JOIN vehiculos v
            ON v.id_vehiculo = s.vehiculo_id

          INNER JOIN roles r
            ON r.id_rol = v.rol_id

          WHERE s.estado IN (
            'Pagada',
            'Finalizada',
            'Penalizada'
          )

          AND DATE_FORMAT(
            COALESCE(
              s.fecha_hora_pago,
              s.fecha_hora_salida,
              s.fecha_hora_ingreso
            ),
            '%Y-%m'
          ) = DATE_FORMAT(CURDATE(), '%Y-%m')
        ) AS horas_exoneradas_mes,

        (
          SELECT COALESCE(
            SUM(s.monto_descuento),
            0
          )

          FROM sesiones_parqueo s

          WHERE DATE(s.fecha_hora_pago) = CURDATE()
        ) AS descuentos_aplicados_dia,

        (
          SELECT COUNT(
            DISTINCT v.conductor_id
          )

          FROM vehiculos v

          INNER JOIN roles r
            ON r.id_rol = v.rol_id

          WHERE v.estado = 'Activo'
            AND r.estado = 'Activo'
            AND (
              r.nombre LIKE '%VIP%'
              OR r.prioridad_acceso IN (
                'Alta',
                'Maxima'
              )
            )
        ) AS usuarios_vip,

        (
          SELECT COALESCE(
            SUM(s.monto_consumo),
            0
          )

          FROM sesiones_parqueo s

          WHERE DATE(
            s.fecha_hora_ingreso
          ) = CURDATE()
        ) AS consumo_registrado_dia
    `);

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "No se encontró información del dashboard"
      });
    }

    const datos = filas[0];

    const metricas =
      filasMetricas[0] || {};

    return res.json({
      ok: true,
      resumen: {
        totalEspacios: Number(datos.total_espacios),
        espaciosLibres: Number(datos.espacios_libres),
        espaciosOcupados: Number(datos.espacios_ocupados),
        espaciosReservados: Number(
          datos.espacios_reservados
        ),
        espaciosMantenimiento: Number(
          datos.espacios_mantenimiento
        ),
        vehiculosActivos: Number(datos.vehiculos_activos),
        ingresosDelDia: Number(datos.ingresos_del_dia),
        ingresosVehicularesDelDia: Number(
          datos.ingresos_vehiculares_del_dia
        ),
        permanenciaPromedioMinutos: Number(
          datos.permanencia_promedio_minutos
        ),
        dispositivosOnline: Number(
          datos.dispositivos_online
        ),
        dispositivosConAlerta: Number(
          datos.dispositivos_con_alerta
        ),

        horasExoneradasMes: Number(
          metricas.horas_exoneradas_mes
        ),

        descuentosAplicadosDia: Number(
          metricas.descuentos_aplicados_dia
        ),

        usuariosVip: Number(
          metricas.usuarios_vip
        ),

        consumoRegistradoDia: Number(
          metricas.consumo_registrado_dia
        )
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener el resumen del dashboard:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el resumen del dashboard",
      error: error.message
    });
  }
});

/**
 * GET /api/v2/dashboard/espacios
 * Devuelve el estado actual de todos los espacios.
 */
router.get("/espacios", async (req, res) => {
  try {
    const [espacios] = await db.query(`
      SELECT
        id_espacio AS idEspacio,
        numero_espacio AS numero,
        zona,
        estado_espacio AS estado,
        motivo_mantenimiento AS motivoMantenimiento,
        id_sesion AS idSesion,
        estado_sesion AS estadoSesion,
        DATE_FORMAT(
          fecha_hora_ingreso,
          '%Y-%m-%d %H:%i:%s'
        ) AS fechaHoraIngreso,
        tiempo_actual_minutos AS tiempoActualMinutos,
        id_vehiculo AS idVehiculo,
        placa,
        tipo_vehiculo AS tipoVehiculo,
        marca,
        modelo,
        color,
        id_conductor AS idConductor,
        conductor,
        id_rol AS idRol,
        rol,
        id_tarjeta AS idTarjeta,
        uid_rfid AS uidRfid
      FROM vw_estado_espacios
      ORDER BY numero_espacio
    `);

    return res.json({
      ok: true,
      total: espacios.length,
      espacios: espacios.map((espacio) => ({
        ...espacio,
        tiempoActualMinutos:
          espacio.tiempoActualMinutos === null
            ? null
            : Number(espacio.tiempoActualMinutos)
      }))
    });
  } catch (error) {
    console.error(
      "Error al obtener los espacios:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los espacios",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/dashboard/exportar/pdf
// ============================================================
router.get("/exportar/pdf", async (req, res) => {
  try {
    const [filasResumen] = await db.query(`
      SELECT
        total_espacios,
        espacios_libres,
        espacios_ocupados,
        espacios_reservados,
        espacios_mantenimiento,
        vehiculos_activos,
        ingresos_del_dia,
        ingresos_vehiculares_del_dia,
        permanencia_promedio_minutos,
        dispositivos_online,
        dispositivos_con_alerta
      FROM vw_dashboard_resumen
      LIMIT 1
    `);

    if (filasResumen.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje:
          "No existe información para generar el reporte"
      });
    }

    const [espacios] = await db.query(`
      SELECT
        numero_espacio AS numero,
        zona,
        estado_espacio AS estado,
        placa,
        conductor,

        DATE_FORMAT(
          fecha_hora_ingreso,
          '%d/%m/%Y %H:%i'
        ) AS fecha_hora_ingreso,

        tiempo_actual_minutos AS tiempo_actual_minutos

      FROM vw_estado_espacios
      ORDER BY numero_espacio ASC
    `);

    const resumen = filasResumen[0];

    const fechaArchivo = new Date()
      .toISOString()
      .slice(0, 10);

    const nombreArchivo =
      `dashboard-smart-parking-${fechaArchivo}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreArchivo}"`
    );

    const documento = new PDFDocument({
      size: "A4",
      margin: 35
    });

    documento.pipe(res);

    const formatearDuracion = (minutos) => {
      const total = Math.max(
        0,
        Number(minutos) || 0
      );

      if (total < 60) {
        return `${total} min`;
      }

      const horas = Math.floor(total / 60);
      const restantes = total % 60;

      return `${horas}h ${restantes}m`;
    };

    const dibujarEncabezado = () => {
      documento
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor("#1f2937")
        .text(
          "SMART PARKING IOT",
          {
            align: "center"
          }
        );

      documento
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#4f8ef7")
        .text(
          "Reporte Ejecutivo del Dashboard",
          {
            align: "center"
          }
        );

      documento
        .fontSize(8)
        .fillColor("#6b7280")
        .text(
          `Generado: ${new Date().toLocaleString("es-PE")}`,
          {
            align: "center"
          }
        );

      documento.moveDown(1.5);
    };

    dibujarEncabezado();

    documento
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#1f2937")
      .text("Indicadores principales");

    documento.moveDown(0.6);

    const indicadores = [
      {
        titulo: "Espacios totales",
        valor: Number(resumen.total_espacios)
      },
      {
        titulo: "Espacios libres",
        valor: Number(resumen.espacios_libres)
      },
      {
        titulo: "Espacios ocupados",
        valor: Number(resumen.espacios_ocupados)
      },
      {
        titulo: "Espacios reservados",
        valor: Number(resumen.espacios_reservados)
      },
      {
        titulo: "En mantenimiento",
        valor: Number(
          resumen.espacios_mantenimiento
        )
      },
      {
        titulo: "Vehículos activos",
        valor: Number(resumen.vehiculos_activos)
      },
      {
        titulo: "Ingresos del día",
        valor:
          `S/ ${Number(
            resumen.ingresos_del_dia
          ).toFixed(2)}`
      },
      {
        titulo: "Tiempo promedio",
        valor: formatearDuracion(
          resumen.permanencia_promedio_minutos
        )
      },
      {
        titulo: "Dispositivos online",
        valor: Number(
          resumen.dispositivos_online
        )
      },
      {
        titulo: "Alertas IoT",
        valor: Number(
          resumen.dispositivos_con_alerta
        )
      }
    ];

    const anchoCaja = 160;
    const altoCaja = 52;
    const espacioHorizontal = 12;
    const espacioVertical = 10;
    const inicioX = 35;

    let posicionX = inicioX;
    let posicionY = documento.y;

    indicadores.forEach((indicador, indice) => {
      if (indice > 0 && indice % 3 === 0) {
        posicionX = inicioX;
        posicionY += altoCaja + espacioVertical;
      }

      documento
        .roundedRect(
          posicionX,
          posicionY,
          anchoCaja,
          altoCaja,
          5
        )
        .fillAndStroke(
          "#f3f6fb",
          "#d9dce3"
        );

      documento
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#6b7280")
        .text(
          indicador.titulo.toUpperCase(),
          posicionX + 10,
          posicionY + 9,
          {
            width: anchoCaja - 20
          }
        );

      documento
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#1f2937")
        .text(
          String(indicador.valor),
          posicionX + 10,
          posicionY + 26,
          {
            width: anchoCaja - 20
          }
        );

      posicionX +=
        anchoCaja + espacioHorizontal;
    });

    documento.y =
      posicionY + altoCaja + 25;

    documento
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#1f2937")
      .text("Estado actual de los espacios");

    documento.moveDown(0.6);

    const columnas = [
      {
        titulo: "ESPACIO",
        ancho: 55
      },
      {
        titulo: "ZONA",
        ancho: 80
      },
      {
        titulo: "ESTADO",
        ancho: 85
      },
      {
        titulo: "PLACA",
        ancho: 75
      },
      {
        titulo: "CONDUCTOR",
        ancho: 145
      },
      {
        titulo: "INGRESO",
        ancho: 90
      },
      {
        titulo: "TIEMPO",
        ancho: 60
      }
    ];

    const anchoTotal = columnas.reduce(
      (total, columna) =>
        total + columna.ancho,
      0
    );

    const altoFila = 24;

    const dibujarCabeceraTabla = (y) => {
      let x = inicioX;

      documento
        .rect(
          inicioX,
          y,
          anchoTotal,
          altoFila
        )
        .fill("#1a2035");

      columnas.forEach((columna) => {
        documento
          .font("Helvetica-Bold")
          .fontSize(7)
          .fillColor("#ffffff")
          .text(
            columna.titulo,
            x + 3,
            y + 8,
            {
              width: columna.ancho - 6,
              align: "center"
            }
          );

        x += columna.ancho;
      });

      return y + altoFila;
    };

    posicionY = dibujarCabeceraTabla(
      documento.y
    );

    espacios.forEach((espacio, indice) => {
      if (posicionY + altoFila > 780) {
        documento.addPage();

        dibujarEncabezado();

        documento
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#1f2937")
          .text(
            "Estado actual de los espacios — continuación"
          );

        documento.moveDown(0.6);

        posicionY = dibujarCabeceraTabla(
          documento.y
        );
      }

      const fondo =
        indice % 2 === 0
          ? "#f3f6fb"
          : "#ffffff";

      documento
        .rect(
          inicioX,
          posicionY,
          anchoTotal,
          altoFila
        )
        .fill(fondo);

      const valoresFila = [
        String(espacio.numero),
        espacio.zona || "—",
        espacio.estado || "—",
        espacio.placa || "—",
        espacio.conductor || "—",
        espacio.fecha_hora_ingreso || "—",
        espacio.tiempo_actual_minutos === null
          ? "—"
          : formatearDuracion(
              espacio.tiempo_actual_minutos
            )
      ];

      let x = inicioX;

      valoresFila.forEach(
        (valor, columnaIndice) => {
          const columna =
            columnas[columnaIndice];

          documento
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#111827")
            .text(
              String(valor),
              x + 3,
              posicionY + 7,
              {
                width: columna.ancho - 6,
                height: altoFila - 6,
                align:
                  columnaIndice === 0 ||
                  columnaIndice === 2 ||
                  columnaIndice === 6
                    ? "center"
                    : "left",
                ellipsis: true
              }
            );

          documento
            .rect(
              x,
              posicionY,
              columna.ancho,
              altoFila
            )
            .strokeColor("#d9dce3")
            .lineWidth(0.3)
            .stroke();

          x += columna.ancho;
        }
      );

      posicionY += altoFila;
    });

    documento
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        `Total de espacios registrados: ${espacios.length}`,
        inicioX,
        posicionY + 12
      );

    documento.end();
  } catch (error) {
    console.error(
      "Error al exportar el Dashboard a PDF:",
      error.message
    );

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        mensaje:
          "Error al exportar el Dashboard a PDF",
        error: error.message
      });
    }

    res.end();
  }
});

// ============================================================
// GET /api/v2/dashboard/graficos
// ============================================================
router.get("/graficos", async (req, res) => {
  try {
    const [
      [ocupacionPorHora],
      [ingresosPorDia],
      [vehiculosPorTipo],
      [usoBeneficios]
    ] = await Promise.all([
      // Ocupación real de cada hora del día actual.
      db.query(`
        WITH RECURSIVE horas AS (
          SELECT 6 AS hora

          UNION ALL

          SELECT hora + 1
          FROM horas
          WHERE hora < 21
        )

        SELECT
          h.hora,

          COUNT(s.id_sesion) AS total

        FROM horas h

        LEFT JOIN sesiones_parqueo s
          ON s.fecha_hora_ingreso <
            TIMESTAMP(
              CURDATE(),
              MAKETIME(h.hora + 1, 0, 0)
            )

          AND COALESCE(
            s.fecha_hora_salida,
            NOW()
          ) >= TIMESTAMP(
            CURDATE(),
            MAKETIME(h.hora, 0, 0)
          )

        GROUP BY h.hora

        ORDER BY h.hora ASC
      `),

      // Ingresos reales de los últimos siete días.
      db.query(`
        WITH RECURSIVE fechas AS (
          SELECT
            CURDATE() - INTERVAL 6 DAY AS fecha

          UNION ALL

          SELECT fecha + INTERVAL 1 DAY
          FROM fechas
          WHERE fecha < CURDATE()
        )

        SELECT
          DATE_FORMAT(
            f.fecha,
            '%d/%m'
          ) AS etiqueta,

          COALESCE(
            SUM(p.monto),
            0
          ) AS total

        FROM fechas f

        LEFT JOIN pagos p
          ON DATE(p.fecha_pago) = f.fecha
          AND p.estado = 'Completado'

        GROUP BY f.fecha

        ORDER BY f.fecha ASC
      `),

      // Cantidad real de vehículos registrados por tipo.
      db.query(`
        SELECT
          tipo AS etiqueta,
          COUNT(*) AS total

        FROM vehiculos

        WHERE estado = 'Activo'

        GROUP BY tipo

        ORDER BY total DESC, tipo ASC
      `),

      // Vehículos que cuentan con beneficios según su rol.
      db.query(`
        SELECT
          r.nombre AS etiqueta,

          COUNT(v.id_vehiculo) AS total

        FROM roles r

        LEFT JOIN vehiculos v
          ON v.rol_id = r.id_rol
          AND v.estado = 'Activo'

        WHERE r.estado = 'Activo'

          AND (
            r.porcentaje_descuento > 0
            OR r.horas_gratis > 0
            OR r.exoneracion_total = 1
          )

        GROUP BY
          r.id_rol,
          r.nombre

        ORDER BY total DESC, r.nombre ASC
      `)
    ]);

    return res.json({
      ok: true,

      graficos: {
        ocupacionPorHora:
          ocupacionPorHora.map((registro) => ({
            etiqueta: `${registro.hora}h`,
            total: Number(registro.total)
          })),

        ingresosPorDia:
          ingresosPorDia.map((registro) => ({
            etiqueta: registro.etiqueta,
            total: Number(registro.total)
          })),

        vehiculosPorTipo:
          vehiculosPorTipo.map((registro) => ({
            etiqueta: registro.etiqueta,
            total: Number(registro.total)
          })),

        usoBeneficios:
          usoBeneficios.map((registro) => ({
            etiqueta: registro.etiqueta,
            total: Number(registro.total)
          }))
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener los gráficos del dashboard:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener los gráficos del dashboard",
      error: error.message
    });
  }
});

// ============================================================
// GET /api/v2/dashboard/rankings
// ============================================================
router.get("/rankings", async (req, res) => {
  try {
    const [
      [establecimientos],
      [promociones]
    ] = await Promise.all([
      // Establecimientos con más actividades registradas.
      db.query(`
        SELECT
          e.id_establecimiento AS idEstablecimiento,
          e.nombre,
          COUNT(a.id_actividad) AS totalActividades,
          COUNT(
            DISTINCT a.sesion_id
          ) AS totalVisitas,
          COALESCE(
            SUM(a.monto_consumo),
            0
          ) AS consumoTotal

        FROM establecimientos e

        LEFT JOIN actividades a
          ON a.establecimiento_id =
            e.id_establecimiento
          AND a.estado = 'Registrada'

        WHERE e.estado = 'Activo'

        GROUP BY
          e.id_establecimiento,
          e.nombre

        HAVING COUNT(a.id_actividad) > 0

        ORDER BY
          totalVisitas DESC,
          consumoTotal DESC,
          e.nombre ASC

        LIMIT 5
      `),

      // Promociones realmente aplicadas a sesiones.
      db.query(`
        SELECT
          p.id_promocion AS idPromocion,
          p.nombre,
          COUNT(
            pa.id_promocion_aplicada
          ) AS totalUsos,
          COALESCE(
            SUM(pa.monto_descontado),
            0
          ) AS descuentoTotal

        FROM promociones p

        LEFT JOIN promociones_aplicadas pa
          ON pa.promocion_id = p.id_promocion
          AND pa.estado = 'Aplicada'

        GROUP BY
          p.id_promocion,
          p.nombre

        HAVING COUNT(
          pa.id_promocion_aplicada
        ) > 0

        ORDER BY
          totalUsos DESC,
          descuentoTotal DESC,
          p.nombre ASC

        LIMIT 5
      `)
    ]);

    return res.json({
      ok: true,

      rankings: {
        establecimientos:
          establecimientos.map(
            (establecimiento) => ({
              idEstablecimiento:
                establecimiento.idEstablecimiento,

              nombre:
                establecimiento.nombre,

              totalActividades: Number(
                establecimiento.totalActividades
              ),

              totalVisitas: Number(
                establecimiento.totalVisitas
              ),

              consumoTotal: Number(
                establecimiento.consumoTotal
              )
            })
          ),

        promociones:
          promociones.map(
            (promocion) => ({
              idPromocion:
                promocion.idPromocion,

              nombre:
                promocion.nombre,

              totalUsos: Number(
                promocion.totalUsos
              ),

              descuentoTotal: Number(
                promocion.descuentoTotal
              )
            })
          )
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener los rankings:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener los rankings del Dashboard",
      error: error.message
    });
  }
});

module.exports = router;