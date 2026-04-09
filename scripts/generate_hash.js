// Script tạo bcrypt hash cho seed data
const bcrypt = require('bcryptjs');

async function generateHashes() {
  const salt = await bcrypt.genSalt(10);
  
  const adminHash = await bcrypt.hash('admin123', salt);
  const userHash = await bcrypt.hash('user123', salt);
  
  console.log('=== BCRYPT HASHES ===');
  console.log(`admin123 => ${adminHash}`);
  console.log(`user123  => ${userHash}`);
  console.log('');
  console.log('Copy these hashes to 02_views_triggers_procedures_seed.sql');
}

generateHashes();
