const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST,
  user: process.env.MYSQLUSER || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),

  timezone: "-05:00",
  
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '-05:00'", (error) => {
    if (error) {
      console.error(
        "Error al configurar la zona horaria de MySQL:",
        error.message
      );
    }
  });
});

module.exports = pool;