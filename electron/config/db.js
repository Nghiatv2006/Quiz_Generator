const sql = require('mssql');
require('dotenv').config();

let pool = null;

// ── Config ──
const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quiz_generator',
  options: {
    encrypt: false,               // true nếu dùng Azure
    trustServerCertificate: true,  // dev mode
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

/**
 * Tạo connection pool
 */
async function createPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ SQL Server connected successfully');
    return pool;
  } catch (err) {
    console.error('❌ SQL Server connection failed:', err.message);
    throw err;
  }
}

/**
 * Lấy pool hiện tại
 */
function getPool() {
  if (!pool) throw new Error('Database pool not initialized. Call createPool() first.');
  return pool;
}

/**
 * Chuyển đổi `?` placeholder → `@p1, @p2, ...` cho mssql
 * Trả về { sql, inputs } 
 */
function convertParams(sqlStr, params = []) {
  let idx = 0;
  const inputs = [];
  const converted = sqlStr.replace(/\?/g, () => {
    idx++;
    const paramName = `p${idx}`;
    inputs.push({ name: paramName, value: params[idx - 1] });
    return `@${paramName}`;
  });
  return { sql: converted, inputs };
}

/**
 * Chuẩn hóa giá trị trước khi bind vào mssql
 * Tránh lỗi kiểu "Validation failed ... Invalid string" khi value là object/array.
 */
function normalizeParamValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Decimal từ DB đôi lúc về object/string wrapper → stringify để luôn an toàn cho NVARCHAR
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Xác định kiểu SQL cho giá trị JS
 */
function getSqlType(value) {
  if (value === null || value === undefined) return sql.NVarChar(sql.MAX);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return sql.NVarChar(50);
    if (Number.isInteger(value)) return sql.Int;
    return sql.Decimal(10, 2);
  }
  if (typeof value === 'boolean') return sql.Bit;
  if (value instanceof Date) return sql.DateTime2;
  if (typeof value === 'string') {
    if (value.length <= 50) return sql.NVarChar(50);
    if (value.length <= 100) return sql.NVarChar(100);
    if (value.length <= 300) return sql.NVarChar(300);
    if (value.length <= 500) return sql.NVarChar(500);
    return sql.NVarChar(sql.MAX);
  }
  return sql.NVarChar(sql.MAX);
}

/**
 * Execute SELECT query → trả về rows
 * @param {string} sqlStr - SQL với `?` placeholders
 * @param {Array} params - Giá trị tương ứng
 * @returns {Promise<Array>}
 */
async function query(sqlStr, params = []) {
  const db = getPool();
  const { sql: convertedSql, inputs } = convertParams(sqlStr, params);
  const request = db.request();

  for (const input of inputs) {
    const normalizedValue = normalizeParamValue(input.value);
    const sqlType = getSqlType(normalizedValue);
    request.input(input.name, sqlType, normalizedValue);
  }

  const result = await request.query(convertedSql);
  return result.recordset || [];
}

/**
 * Execute INSERT/UPDATE/DELETE → trả về { insertId, rowsAffected }
 * Tự thêm `SELECT SCOPE_IDENTITY() AS insertId` cho INSERT
 */
async function insert(sqlStr, params = []) {
  const db = getPool();
  const { sql: convertedSql, inputs } = convertParams(sqlStr, params);
  const request = db.request();

  for (const input of inputs) {
    const normalizedValue = normalizeParamValue(input.value);
    const sqlType = getSqlType(normalizedValue);
    request.input(input.name, sqlType, normalizedValue);
  }

  // Nếu là INSERT, thêm SCOPE_IDENTITY()
  let finalSql = convertedSql;
  const isInsert = convertedSql.trim().toUpperCase().startsWith('INSERT');
  if (isInsert) {
    finalSql = convertedSql + '; SELECT SCOPE_IDENTITY() AS insertId;';
  }

  const result = await request.query(finalSql);

  return {
    insertId: result.recordset?.[0]?.insertId || null,
    rowsAffected: result.rowsAffected?.[0] || 0,
  };
}

/**
 * Transaction helper
 * @param {Function} callback - (transaction) => Promise
 */
async function transaction(callback) {
  const db = getPool();
  const trans = new sql.Transaction(db);
  try {
    await trans.begin();
    const result = await callback(trans);
    await trans.commit();
    return result;
  } catch (err) {
    await trans.rollback();
    throw err;
  }
}

/**
 * Execute query trong transaction
 * @param {sql.Transaction} trans
 * @param {string} sqlStr
 * @param {Array} params
 */
async function transQuery(trans, sqlStr, params = []) {
  const { sql: convertedSql, inputs } = convertParams(sqlStr, params);
  const request = new sql.Request(trans);

  for (const input of inputs) {
    const normalizedValue = normalizeParamValue(input.value);
    const sqlType = getSqlType(normalizedValue);
    request.input(input.name, sqlType, normalizedValue);
  }

  const result = await request.query(convertedSql);
  return result.recordset || [];
}

/**
 * Execute INSERT trong transaction → trả về insertId
 */
async function transInsert(trans, sqlStr, params = []) {
  const { sql: convertedSql, inputs } = convertParams(sqlStr, params);
  const request = new sql.Request(trans);

  for (const input of inputs) {
    const normalizedValue = normalizeParamValue(input.value);
    const sqlType = getSqlType(normalizedValue);
    request.input(input.name, sqlType, normalizedValue);
  }

  const isInsert = convertedSql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = isInsert ? convertedSql + '; SELECT SCOPE_IDENTITY() AS insertId;' : convertedSql;

  const result = await request.query(finalSql);
  return {
    insertId: result.recordset?.[0]?.insertId || null,
    rowsAffected: result.rowsAffected?.[0] || 0,
  };
}

/**
 * Execute Stored Procedure
 * @param {string} spName
 * @param {Object} params - {paramName: value}
 */
async function execProc(spName, params = {}) {
  const db = getPool();
  const request = db.request();

  for (const [name, value] of Object.entries(params)) {
    const normalizedValue = normalizeParamValue(value);
    const sqlType = getSqlType(normalizedValue);
    request.input(name, sqlType, normalizedValue);
  }

  const result = await request.execute(spName);
  return result.recordsets || [];
}

/**
 * Đóng pool
 */
async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('🔌 SQL Server pool closed');
  }
}

module.exports = {
  sql,
  createPool,
  getPool,
  query,
  insert,
  transaction,
  transQuery,
  transInsert,
  execProc,
  closePool,
};
