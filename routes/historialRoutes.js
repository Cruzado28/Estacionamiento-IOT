const express = require("express");
const db = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

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

// ============================================================
// GET /api/v2/historial/exportar/excel
// ============================================================
router.get("/exportar/excel", async (req, res) => {
  try {
    const placa = String(
      req.query.placa || ""
    ).trim();

    const conductor = String(
      req.query.conductor || ""
    ).trim();

    const fechaInicio = String(
      req.query.fechaInicio || ""
    ).trim();

    const fechaFin = String(
      req.query.fechaFin || ""
    ).trim();

    const estado = String(
      req.query.estado || ""
    ).trim();

    const tipo = String(
      req.query.tipo || ""
    ).trim();

    const condiciones = [];
    const valores = [];

    if (placa) {
      condiciones.push("placa LIKE ?");
      valores.push(`%${placa}%`);
    }

    if (conductor) {
      condiciones.push("conductor LIKE ?");
      valores.push(`%${conductor}%`);
    }

    if (fechaInicio) {
      condiciones.push(
        "DATE(fecha_hora_ingreso) >= ?"
      );
      valores.push(fechaInicio);
    }

    if (fechaFin) {
      condiciones.push(
        "DATE(fecha_hora_ingreso) <= ?"
      );
      valores.push(fechaFin);
    }

    if (estado) {
      condiciones.push("estado = ?");
      valores.push(estado);
    }

    if (tipo) {
      condiciones.push("tipo_vehiculo = ?");
      valores.push(tipo);
    }

    const where =
      condiciones.length > 0
        ? `WHERE ${condiciones.join(" AND ")}`
        : "";

    const [sesiones] = await db.query(
      `
        SELECT
          id_sesion,
          placa,
          tipo_vehiculo,
          conductor,
          documento,
          rol,
          espacio,
          zona,
          uid_rfid,

          DATE_FORMAT(
            fecha_hora_ingreso,
            '%d/%m/%Y %H:%i:%s'
          ) AS fecha_hora_ingreso,

          DATE_FORMAT(
            fecha_hora_pago,
            '%d/%m/%Y %H:%i:%s'
          ) AS fecha_hora_pago,

          DATE_FORMAT(
            fecha_hora_salida,
            '%d/%m/%Y %H:%i:%s'
          ) AS fecha_hora_salida,

          tiempo_total_minutos,
          tarifa_aplicada,
          consumo_registrado,
          monto_descuento,
          total_pagado,
          pago_realizado,
          estado

        FROM vw_historial_sesiones

        ${where}

        ORDER BY id_sesion DESC
      `,
      valores
    );

    const libro = new ExcelJS.Workbook();

    libro.creator = "Smart Parking IoT";
    libro.created = new Date();

    const hoja = libro.addWorksheet(
      "Historial de accesos"
    );

    hoja.mergeCells("A1:R1");

    const titulo = hoja.getCell("A1");

    titulo.value =
      "SMART PARKING IOT - HISTORIAL DE ACCESOS";

    titulo.font = {
      bold: true,
      size: 16,
      color: {
        argb: "FFFFFFFF"
      }
    };

    titulo.alignment = {
      horizontal: "center",
      vertical: "middle"
    };

    titulo.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FF4F8EF7"
      }
    };

    hoja.getRow(1).height = 28;

    hoja.mergeCells("A2:R2");

    hoja.getCell("A2").value =
      `Generado: ${new Date().toLocaleString("es-PE")}`;

    hoja.getCell("A2").alignment = {
      horizontal: "center"
    };

    hoja.getCell("A2").font = {
      italic: true,
      color: {
        argb: "FF666666"
      }
    };

    hoja.columns = [
      {
        key: "idSesion",
        width: 12
      },
      {
        key: "fechaIngreso",
        width: 22
      },
      {
        key: "fechaPago",
        width: 22
      },
      {
        key: "fechaSalida",
        width: 22
      },
      {
        key: "tiempo",
        width: 16
      },
      {
        key: "conductor",
        width: 28
      },
      {
        key: "documento",
        width: 16
      },
      {
        key: "placa",
        width: 14
      },
      {
        key: "tipo",
        width: 16
      },
      {
        key: "rol",
        width: 22
      },
      {
        key: "espacio",
        width: 12
      },
      {
        key: "zona",
        width: 14
      },
      {
        key: "rfid",
        width: 18
      },
      {
        key: "tarifa",
        width: 15
      },
      {
        key: "consumo",
        width: 15
      },
      {
        key: "descuento",
        width: 15
      },
      {
        key: "total",
        width: 15
      },
      {
        key: "estado",
        width: 16
      }
    ];

    const encabezados = [
      "ID SESIÓN",
      "FECHA DE INGRESO",
      "FECHA DE PAGO",
      "FECHA DE SALIDA",
      "TIEMPO (MIN)",
      "CONDUCTOR",
      "DOCUMENTO",
      "PLACA",
      "TIPO",
      "ROL",
      "ESPACIO",
      "ZONA",
      "RFID",
      "TARIFA",
      "CONSUMO",
      "DESCUENTO",
      "TOTAL PAGADO",
      "ESTADO"
    ];

    const filaEncabezado = hoja.getRow(4);

    encabezados.forEach((encabezado, indice) => {
      filaEncabezado.getCell(indice + 1).value =
        encabezado;
    });

    filaEncabezado.font = {
      bold: true,
      color: {
        argb: "FFFFFFFF"
      }
    };

    filaEncabezado.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FF1A2035"
      }
    };

    filaEncabezado.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true
    };

    filaEncabezado.height = 28;

    sesiones.forEach((sesion) => {
      hoja.addRow({
        idSesion:
          sesion.id_sesion,

        fechaIngreso:
          sesion.fecha_hora_ingreso || "—",

        fechaPago:
          sesion.fecha_hora_pago || "—",

        fechaSalida:
          sesion.fecha_hora_salida || "—",

        tiempo:
          Number(sesion.tiempo_total_minutos) || 0,

        conductor:
          sesion.conductor,

        documento:
          sesion.documento,

        placa:
          sesion.placa,

        tipo:
          sesion.tipo_vehiculo,

        rol:
          sesion.rol,

        espacio:
          sesion.espacio,

        zona:
          sesion.zona,

        rfid:
          sesion.uid_rfid,

        tarifa:
          Number(sesion.tarifa_aplicada) || 0,

        consumo:
          Number(sesion.consumo_registrado) || 0,

        descuento:
          Number(sesion.monto_descuento) || 0,

        total:
          Number(sesion.total_pagado) || 0,

        estado:
          sesion.estado
      });
    });

    hoja.eachRow(
      {
        includeEmpty: false
      },
      (fila, numeroFila) => {
        if (numeroFila >= 5) {
          fila.alignment = {
            vertical: "middle"
          };

          fila.eachCell((celda) => {
            celda.border = {
              top: {
                style: "thin",
                color: {
                  argb: "FFD9D9D9"
                }
              },
              bottom: {
                style: "thin",
                color: {
                  argb: "FFD9D9D9"
                }
              },
              left: {
                style: "thin",
                color: {
                  argb: "FFD9D9D9"
                }
              },
              right: {
                style: "thin",
                color: {
                  argb: "FFD9D9D9"
                }
              }
            };
          });
        }
      }
    );

    ["N", "O", "P", "Q"].forEach((columna) => {
      hoja.getColumn(columna).numFmt =
        '"S/ "0.00';
    });

    hoja.autoFilter = {
      from: "A4",
      to: "R4"
    };

    hoja.views = [
      {
        state: "frozen",
        ySplit: 4
      }
    ];

    const fechaArchivo = new Date()
      .toISOString()
      .slice(0, 10);

    const nombreArchivo =
      `historial-smart-parking-${fechaArchivo}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreArchivo}"`
    );

    await libro.xlsx.write(res);

    res.end();
  } catch (error) {
    console.error(
      "Error al exportar el historial a Excel:",
      error.message
    );

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        mensaje:
          "Error al exportar el historial a Excel",
        error: error.message
      });
    }

    res.end();
  }
});

// ============================================================
// GET /api/v2/historial/exportar/pdf
// ============================================================
router.get("/exportar/pdf", async (req, res) => {
  try {
    const placa = String(req.query.placa || "").trim();
    const conductor = String(req.query.conductor || "").trim();
    const fechaInicio = String(req.query.fechaInicio || "").trim();
    const fechaFin = String(req.query.fechaFin || "").trim();
    const estado = String(req.query.estado || "").trim();
    const tipo = String(req.query.tipo || "").trim();

    const condiciones = [];
    const valores = [];

    if (placa) {
      condiciones.push("placa LIKE ?");
      valores.push(`%${placa}%`);
    }

    if (conductor) {
      condiciones.push("conductor LIKE ?");
      valores.push(`%${conductor}%`);
    }

    if (fechaInicio) {
      condiciones.push("DATE(fecha_hora_ingreso) >= ?");
      valores.push(fechaInicio);
    }

    if (fechaFin) {
      condiciones.push("DATE(fecha_hora_ingreso) <= ?");
      valores.push(fechaFin);
    }

    if (estado) {
      condiciones.push("estado = ?");
      valores.push(estado);
    }

    if (tipo) {
      condiciones.push("tipo_vehiculo = ?");
      valores.push(tipo);
    }

    const where =
      condiciones.length > 0
        ? `WHERE ${condiciones.join(" AND ")}`
        : "";

    const [sesiones] = await db.query(
      `
        SELECT
          id_sesion,
          placa,
          tipo_vehiculo,
          conductor,
          espacio,

          DATE_FORMAT(
            fecha_hora_ingreso,
            '%d/%m/%Y %H:%i'
          ) AS fecha_hora_ingreso,

          DATE_FORMAT(
            fecha_hora_salida,
            '%d/%m/%Y %H:%i'
          ) AS fecha_hora_salida,

          tiempo_total_minutos,
          consumo_registrado,
          monto_descuento,
          total_pagado,
          estado

        FROM vw_historial_sesiones

        ${where}

        ORDER BY id_sesion DESC
      `,
      valores
    );

    const fechaArchivo = new Date()
      .toISOString()
      .slice(0, 10);

    const nombreArchivo =
      `historial-smart-parking-${fechaArchivo}.pdf`;

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
      layout: "landscape",
      margin: 30
    });

    documento.pipe(res);

    const dibujarEncabezado = () => {
      documento
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#1f2937")
        .text(
          "SMART PARKING IOT",
          30,
          25,
          {
            align: "center"
          }
        );

      documento
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#4f8ef7")
        .text(
          "Reporte de Historial de Accesos",
          {
            align: "center"
          }
        );

      documento
        .fontSize(8)
        .fillColor("#666666")
        .text(
          `Generado: ${new Date().toLocaleString("es-PE")}`,
          {
            align: "center"
          }
        );

      documento.moveDown(1);
    };

    const columnas = [
      {
        titulo: "FECHA",
        ancho: 82
      },
      {
        titulo: "SALIDA",
        ancho: 82
      },
      {
        titulo: "TIEMPO",
        ancho: 48
      },
      {
        titulo: "CONDUCTOR",
        ancho: 115
      },
      {
        titulo: "PLACA",
        ancho: 55
      },
      {
        titulo: "TIPO",
        ancho: 55
      },
      {
        titulo: "ESPACIO",
        ancho: 50
      },
      {
        titulo: "CONSUMO",
        ancho: 58
      },
      {
        titulo: "DESCUENTO",
        ancho: 62
      },
      {
        titulo: "TOTAL",
        ancho: 55
      },
      {
        titulo: "ESTADO",
        ancho: 65
      }
    ];

    const inicioX = 30;
    const altoFila = 24;

    const dibujarCabeceraTabla = (posicionY) => {
      let posicionX = inicioX;

      documento
        .rect(
          inicioX,
          posicionY,
          columnas.reduce(
            (total, columna) => total + columna.ancho,
            0
          ),
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
            posicionX + 3,
            posicionY + 8,
            {
              width: columna.ancho - 6,
              align: "center"
            }
          );

        posicionX += columna.ancho;
      });

      return posicionY + altoFila;
    };

    dibujarEncabezado();

    let posicionY = 92;

    posicionY = dibujarCabeceraTabla(posicionY);

    if (sesiones.length === 0) {
      documento
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#666666")
        .text(
          "No existen registros que coincidan con los filtros.",
          inicioX,
          posicionY + 20,
          {
            align: "center"
          }
        );
    } else {
      sesiones.forEach((sesion, indice) => {
        if (posicionY + altoFila > 550) {
          documento.addPage();

          dibujarEncabezado();

          posicionY = 92;
          posicionY = dibujarCabeceraTabla(posicionY);
        }

        const fondo =
          indice % 2 === 0
            ? "#f3f6fb"
            : "#ffffff";

        const anchoTotal = columnas.reduce(
          (total, columna) => total + columna.ancho,
          0
        );

        documento
          .rect(
            inicioX,
            posicionY,
            anchoTotal,
            altoFila
          )
          .fill(fondo);

        const valoresFila = [
          sesion.fecha_hora_ingreso || "—",
          sesion.fecha_hora_salida || "—",
          `${Number(sesion.tiempo_total_minutos) || 0} min`,
          sesion.conductor || "—",
          sesion.placa || "—",
          sesion.tipo_vehiculo || "—",
          String(sesion.espacio || "—"),
          `S/ ${Number(
            sesion.consumo_registrado
          ).toFixed(2)}`,
          `S/ ${Number(
            sesion.monto_descuento
          ).toFixed(2)}`,
          `S/ ${Number(
            sesion.total_pagado
          ).toFixed(2)}`,
          sesion.estado || "—"
        ];

        let posicionX = inicioX;

        valoresFila.forEach((valor, columnaIndice) => {
          const columna = columnas[columnaIndice];

          documento
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#111827")
            .text(
              String(valor),
              posicionX + 3,
              posicionY + 7,
              {
                width: columna.ancho - 6,
                height: altoFila - 6,
                align:
                  columnaIndice >= 6
                    ? "center"
                    : "left",
                ellipsis: true
              }
            );

          documento
            .rect(
              posicionX,
              posicionY,
              columna.ancho,
              altoFila
            )
            .strokeColor("#d9dce3")
            .lineWidth(0.3)
            .stroke();

          posicionX += columna.ancho;
        });

        posicionY += altoFila;
      });
    }

    documento
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666666")
      .text(
        `Total de registros: ${sesiones.length}`,
        inicioX,
        posicionY + 12
      );

    documento.end();
  } catch (error) {
    console.error(
      "Error al exportar el historial a PDF:",
      error.message
    );

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        mensaje:
          "Error al exportar el historial a PDF",
        error: error.message
      });
    }

    res.end();
  }
});

// ============================================================
// GET /api/v2/historial/graficos
// ============================================================
router.get("/graficos", async (req, res) => {
  try {
    const [
      [ocupacionHistorica],
      [ingresosSemanales]
    ] = await Promise.all([
      // Promedio de ocupación por día durante los últimos 7 días.
      db.query(`
        WITH RECURSIVE fechas AS (
          SELECT
            CURDATE() - INTERVAL 6 DAY AS fecha

          UNION ALL

          SELECT fecha + INTERVAL 1 DAY
          FROM fechas
          WHERE fecha < CURDATE()
        ),

        horas AS (
          SELECT 6 AS hora

          UNION ALL

          SELECT hora + 1
          FROM horas
          WHERE hora < 21
        ),

        ocupacion_horaria AS (
          SELECT
            f.fecha,
            h.hora,
            COUNT(s.id_sesion) AS espacios_ocupados

          FROM fechas f

          CROSS JOIN horas h

          LEFT JOIN sesiones_parqueo s
            ON s.fecha_hora_ingreso <
              TIMESTAMP(
                f.fecha,
                MAKETIME(h.hora + 1, 0, 0)
              )

            AND COALESCE(
              s.fecha_hora_salida,
              NOW()
            ) >= TIMESTAMP(
              f.fecha,
              MAKETIME(h.hora, 0, 0)
            )

          GROUP BY
            f.fecha,
            h.hora
        )

        SELECT
          DATE_FORMAT(
            fecha,
            '%d/%m'
          ) AS etiqueta,

          COALESCE(
            ROUND(
              AVG(espacios_ocupados) /
              NULLIF(
                (
                  SELECT COUNT(*)
                  FROM espacios
                ),
                0
              ) * 100,
              2
            ),
            0
          ) AS porcentaje

        FROM ocupacion_horaria

        GROUP BY fecha

        ORDER BY fecha ASC
      `),

      // Ingresos reales de los últimos 7 días.
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
      `)
    ]);

    return res.json({
      ok: true,

      graficos: {
        ocupacionHistorica:
          ocupacionHistorica.map((registro) => ({
            etiqueta: registro.etiqueta,
            porcentaje: Number(
              registro.porcentaje
            )
          })),

        ingresosSemanales:
          ingresosSemanales.map((registro) => ({
            etiqueta: registro.etiqueta,
            total: Number(registro.total)
          }))
      }
    });
  } catch (error) {
    console.error(
      "Error al obtener los gráficos del historial:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error al obtener los gráficos del historial",
      error: error.message
    });
  }
});

module.exports = router;