require('dotenv').config();
const { createPool, query } = require('./electron/config/db.js');

(async () => {
    try {
        await createPool();
        const res = await query("SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('exam_attempts') AND definition LIKE '%status%'");
        const cName = res[0]?.name;
        
        if (cName) {
            await query('ALTER TABLE exam_attempts DROP CONSTRAINT ' + cName);
            console.log('Dropped old constraint:', cName);
        }
        
        await query("ALTER TABLE exam_attempts ADD CONSTRAINT ck_exam_attempts_status CHECK (status IN ('in_progress','completed','timed_out','abandoned','banned'))");
        console.log('Added new constraint');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
