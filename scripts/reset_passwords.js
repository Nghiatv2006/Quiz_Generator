/**
 * Script cập nhật mật khẩu trong SQL Server
 * Chạy: node scripts/reset_passwords.js
 * 
 * Mật khẩu mặc định:
 *   - admin (id=1): admin123
 *   - teacher01 (id=2): admin123
 *   - student01, student02, student03 (id=3,4,5): user123
 */
const sql = require('mssql');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quiz_generator',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function resetPasswords() {
  console.log('🔄 Đang kết nối SQL Server...');
  console.log(`   Server: ${config.server}:${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);
  
  try {
    const pool = await sql.connect(config);
    console.log('✅ Kết nối thành công!\n');

    // Tạo hash
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);
    console.log('🔐 Đã tạo bcrypt hash');

    // Update admin + teacher
    const r1 = await pool.request()
      .input('hash', sql.NVarChar(255), adminHash)
      .query("UPDATE users SET password_hash = @hash WHERE id IN (1, 2)");
    console.log(`✅ Admin + Teacher: ${r1.rowsAffected[0]} rows updated (mật khẩu: admin123)`);

    // Update students
    const r2 = await pool.request()
      .input('hash', sql.NVarChar(255), userHash)
      .query("UPDATE users SET password_hash = @hash WHERE id IN (3, 4, 5)");
    console.log(`✅ Students: ${r2.rowsAffected[0]} rows updated (mật khẩu: user123)`);

    // Verify
    const users = await pool.request().query("SELECT id, username, email, role FROM users ORDER BY id");
    console.log('\n📋 Danh sách tài khoản:');
    console.log('─'.repeat(60));
    for (const u of users.recordset) {
      const pw = u.id <= 2 ? 'admin123' : 'user123';
      console.log(`  ${u.id}. ${u.username.padEnd(12)} | ${u.email.padEnd(25)} | ${u.role.padEnd(8)} | mk: ${pw}`);
    }
    console.log('─'.repeat(60));
    console.log('\n✅ Hoàn tất! Bạn có thể đăng nhập ngay.');

    await pool.close();
  } catch (err) {
    console.error('\n❌ Lỗi:', err.message);
    if (err.message.includes('connect') || err.message.includes('Login failed')) {
      console.log('\n💡 Gợi ý:');
      console.log('   1. Kiểm tra SQL Server đang chạy');
      console.log('   2. Kiểm tra file .env: DB_HOST, DB_USER, DB_PASSWORD');
      console.log('   3. Chạy lại file 01_drop_and_create_tables.sql');
      console.log('   4. Chạy lại file 02_views_triggers_procedures_seed.sql');
    }
    process.exit(1);
  }
}

resetPasswords();
