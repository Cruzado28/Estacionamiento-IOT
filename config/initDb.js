const db = require("./db");

async function initDatabase() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios_admin (
        id_admin INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        rol ENUM('Administrador', 'Operador') DEFAULT 'Operador',
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tarjetas_rfid (
        id_tarjeta INT AUTO_INCREMENT PRIMARY KEY,
        uid_rfid VARCHAR(50) NOT NULL UNIQUE,
        nombre_usuario VARCHAR(100),
        placa VARCHAR(20),
        saldo DECIMAL(10,2) DEFAULT 0.00,
        estado ENUM('Afuera', 'Adentro', 'Bloqueada') DEFAULT 'Afuera',
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS espacios (
        id_espacio INT PRIMARY KEY,
        estado ENUM('Libre', 'Ocupado', 'Pagado', 'Pendiente') DEFAULT 'Libre',
        uid_rfid_actual VARCHAR(50),
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS registros_estacionamiento (
        id_registro INT AUTO_INCREMENT PRIMARY KEY,
        uid_rfid VARCHAR(50) NOT NULL,
        id_espacio INT,
        hora_ingreso DATETIME NOT NULL,
        hora_pago DATETIME NULL,
        hora_limite_salida DATETIME NULL,
        hora_salida DATETIME NULL,
        tiempo_minutos INT DEFAULT 0,
        monto DECIMAL(10,2) DEFAULT 0.00,
        pago_realizado BOOLEAN DEFAULT FALSE,
        estado ENUM(
          'Activo',
          'Pagado',
          'Finalizado',
          'Penalizado'
        ) DEFAULT 'Activo',
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_espacio) REFERENCES espacios(id_espacio)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pagos (
        id_pago INT AUTO_INCREMENT PRIMARY KEY,
        id_registro INT NOT NULL,
        uid_rfid VARCHAR(50) NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        metodo_pago ENUM(
          'Saldo virtual',
          'Efectivo',
          'Demo'
        ) DEFAULT 'Demo',
        fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_registro)
          REFERENCES registros_estacionamiento(id_registro)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS eventos (
        id_evento INT AUTO_INCREMENT PRIMARY KEY,
        tipo_evento ENUM(
          'Ingreso',
          'Salida',
          'Pago',
          'Alerta',
          'Sistema'
        ) NOT NULL,
        descripcion TEXT NOT NULL,
        uid_rfid VARCHAR(50),
        fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        id_config INT AUTO_INCREMENT PRIMARY KEY,
        tarifa_por_minuto DECIMAL(10,2) DEFAULT 0.10,
        tiempo_gracia_minutos INT DEFAULT 2,
        capacidad_maxima INT DEFAULT 10,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      INSERT INTO configuracion (
        tarifa_por_minuto,
        tiempo_gracia_minutos,
        capacidad_maxima
      )
      SELECT 0.10, 2, 10
      WHERE NOT EXISTS (
        SELECT 1 FROM configuracion
      )
    `);

    const espacios = Array.from({ length: 10 }, (_, indice) => [
      indice + 1,
      "Libre"
    ]);

    await connection.query(
      `INSERT IGNORE INTO espacios (id_espacio, estado) VALUES ?`,
      [espacios]
    );

    await connection.query(`
      INSERT IGNORE INTO tarjetas_rfid
        (uid_rfid, nombre_usuario, placa, saldo, estado)
      VALUES
        ('RFID-001', 'Usuario de prueba 1', 'ABC-123', 20.00, 'Afuera'),
        ('RFID-002', 'Usuario de prueba 2', 'BCD-456', 15.00, 'Afuera'),
        ('RFID-003', 'Usuario de prueba 3', 'CDE-789', 10.00, 'Afuera')
    `);

    await connection.commit();

    console.log("Base de datos inicializada correctamente");
  } catch (error) {
    await connection.rollback();
    console.error("Error al inicializar la base de datos:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = initDatabase;