async function obtenerDatosDashboard() {
  try {
    const respuesta = await fetch("/api/dashboard");
    const data = await respuesta.json();

    if (!data.ok) {
      console.error("Error al obtener datos:", data.mensaje);
      return;
    }

    actualizarResumen(data.resumen);
    cargarEspacios(data.espacios);
    cargarEventos(data.eventos);
    cargarVehiculos(data.vehiculos);

  } catch (error) {
    console.error("Error de conexión con el servidor:", error);
  }
}

function actualizarResumen(resumen) {
  document.getElementById("totalEspacios").textContent = resumen.totalEspacios;
  document.getElementById("espaciosLibres").textContent = resumen.espaciosLibres;
  document.getElementById("espaciosOcupados").textContent = resumen.espaciosOcupados;
  document.getElementById("ingresosDia").textContent = `S/ ${Number(resumen.ingresosDia).toFixed(2)}`;
}

function cargarEspacios(espacios) {
  const parkingGrid = document.getElementById("parkingGrid");
  parkingGrid.innerHTML = "";

  espacios.forEach((espacio) => {
    const div = document.createElement("div");

    let claseEstado = "";
    let textoEstado = espacio.estado;

    if (espacio.estado === "Libre") {
      claseEstado = "free";
    } else if (espacio.estado === "Ocupado") {
      claseEstado = "occupied";
    } else if (espacio.estado === "Pagado") {
      claseEstado = "paid";
    } else {
      claseEstado = "pending";
    }

    div.className = `slot ${claseEstado}`;
    div.innerHTML = `
      Espacio ${espacio.id}
      <small>${textoEstado}</small>
      <small>${espacio.rfid ? espacio.rfid : ""}</small>
    `;

    parkingGrid.appendChild(div);
  });
}

function cargarEventos(eventos) {
  const eventsList = document.getElementById("eventsList");
  eventsList.innerHTML = "";

  if (eventos.length === 0) {
    eventsList.innerHTML = `
      <div class="event">
        <strong>Sistema:</strong> Aún no hay eventos registrados.
      </div>
    `;
    return;
  }

  eventos.forEach((evento) => {
    const div = document.createElement("div");
    div.className = "event";
    div.innerHTML = `
      <strong>${evento.tipo_evento} - ${evento.hora}:</strong> ${evento.descripcion}
    `;
    eventsList.appendChild(div);
  });
}

function cargarVehiculos(vehiculos) {
  const vehiclesTable = document.getElementById("vehiclesTable");
  vehiclesTable.innerHTML = "";

  if (vehiculos.length === 0) {
    vehiclesTable.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;">
          No hay vehículos dentro del estacionamiento.
        </td>
      </tr>
    `;
    return;
  }

  vehiculos.forEach((vehiculo) => {
    const fila = document.createElement("tr");

    const pagoTexto = vehiculo.pagoRealizado ? "Pagado" : "Pendiente";
    const clasePago = vehiculo.pagoRealizado ? "paid" : "pending";

    fila.innerHTML = `
      <td>${vehiculo.rfid}</td>
      <td>${vehiculo.espacio}</td>
      <td>${vehiculo.horaIngreso}</td>
      <td>${vehiculo.tiempoMinutos} min</td>
      <td><span class="badge ${clasePago}">${pagoTexto}</span></td>
      <td>S/ ${Number(vehiculo.monto).toFixed(2)}</td>
    `;

    vehiclesTable.appendChild(fila);
  });
}

obtenerDatosDashboard();

setInterval(obtenerDatosDashboard, 5000);

async function ejecutarAccion(accion) {
  const uid = document.getElementById("rfidSelect").value;
  const mensajeAccion = document.getElementById("mensajeAccion");

  try {
    mensajeAccion.className = "message-box";
    mensajeAccion.textContent = `Procesando ${accion} para ${uid}...`;

    const respuesta = await fetch(`/api/${accion}/${uid}`);
    const data = await respuesta.json();

    if (data.ok) {
      mensajeAccion.className = "message-box success";
      mensajeAccion.textContent = data.mensaje;
    } else {
      mensajeAccion.className = "message-box error";
      mensajeAccion.textContent = data.mensaje;
    }

    obtenerDatosDashboard();

  } catch (error) {
    mensajeAccion.className = "message-box error";
    mensajeAccion.textContent = "Error de conexión con el servidor.";
    console.error(error);
  }
}