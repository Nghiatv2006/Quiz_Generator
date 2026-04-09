const db = require('../electron/config/db');

async function main() {
  await db.createPool();

  const exams = await db.query(
    "SELECT TOP (5) id, title FROM exams WHERE is_deleted = 0 ORDER BY id DESC"
  );

  console.log('Recent exams:', exams);

  for (const ex of exams) {
    const rows = await db.query(
      `SELECT TOP (20)
          eq.exam_id,
          eq.question_id,
          qo.id AS option_id,
          qo.option_label,
          qo.option_text,
          LEN(ISNULL(qo.option_text, '')) AS option_text_len
       FROM exam_questions eq
       LEFT JOIN question_options qo ON qo.question_id = eq.question_id
       WHERE eq.exam_id = ?
       ORDER BY eq.sort_order, qo.sort_order`,
      [ex.id]
    );

    console.log(`\nExam #${ex.id} - ${ex.title}`);
    console.log(rows);
  }

  const badRows = await db.query(
    `SELECT TOP (50)
        q.id AS question_id,
        LEFT(q.question_text, 120) AS question_preview,
        qo.option_label,
        qo.option_text,
        LEN(ISNULL(qo.option_text, '')) AS option_text_len
     FROM questions q
     JOIN question_options qo ON qo.question_id = q.id
     WHERE q.is_deleted = 0
       AND (qo.option_text IS NULL OR LTRIM(RTRIM(qo.option_text)) = '')
     ORDER BY q.id DESC, qo.sort_order`
  );

  console.log('\nQuestions with empty option_text:', badRows.length);
  console.log(badRows);

  await db.closePool();
}

main().catch(async (err) => {
  console.error(err);
  try { await db.closePool(); } catch (_) {}
  process.exit(1);
});
