/**
 * ══════════════════════════════════════════════════════════════
 *  AI Prompt Templates – Quiz Generator V2
 *  Tối ưu cho cả Ollama (llama3.1 / quizai) và Gemini
 *  Nguyên tắc: Rõ ràng → Có ví dụ → Ràng buộc output JSON
 * ══════════════════════════════════════════════════════════════
 */

// ── Tiêu đề lệnh chung để Ollama hiểu ngữ cảnh ───────────────
const JSON_RULE = `
QUAN TRỌNG: Chỉ trả về JSON hợp lệ. Không thêm bất kỳ text nào trước hoặc sau. Không dùng markdown. Không giải thích.`.trim();

const PROMPTS = {

  // ────────────────────────────────────────────────────────────
  // 1. SINH CÂU HỎI TỪ NỘI DUNG VĂN BẢN
  // ────────────────────────────────────────────────────────────
  GENERATE_QUESTIONS: (topic, content, count, difficulty, options = {}) => {
    const { bloomLevel, questionType } = options;
    const dist = difficulty === 'mixed'
      ? `Phân bổ: ${Math.round(count * 0.3)} câu easy, ${Math.round(count * 0.5)} câu medium, ${Math.ceil(count * 0.2)} câu hard`
      : `Tất cả ${count} câu ở mức: ${difficulty}`;

    const qtNote = questionType === 'fill_in'
      ? `Loại câu hỏi: ONLY "fill_in". Các câu yêu cầu điền vào chỗ trống, KHÔNG có mảng options.`
      : questionType === 'multiple_choice'
      ? `Loại câu hỏi: ONLY "multiple_choice". Mỗi câu có Từ 2 đến 3 đáp án đúng (isCorrect: true).`
      : `Loại câu hỏi: ONLY "single_choice". Mỗi câu chỉ có DUY NHẤT 1 đáp án đúng.`;

    const bloomNote = bloomLevel
      ? `Bloom Level yêu cầu: Tất cả câu hỏi phải ở mức "${bloomLevel}" (chỉ dùng giá trị này cho bloomLevel field).`
      : `Bloom Level: Phân bố đa dạng: remember, understand, apply, analyze (không chỉ "remember").`;

    const fillInExample = questionType === 'fill_in' ? `
  {
    "questionText": "Nước Việt Nam có thủ đô là _____?",
    "questionType": "fill_in",
    "difficulty": "easy",
    "acceptedAnswers": ["Hà Nội", "ha noi"],
    "matchMode": "ignore_case",
    "explanation": "Hà Nội là thủ đô Việt Nam từ năm 1945.",
    "bloomLevel": "remember",
    "estimatedTime": 20,
    "tags": ["lịch sử", "Việt Nam"]
  }` : `
  {
    "questionText": "Nội dung câu hỏi đầy đủ?",
    "questionType": "${questionType || 'single_choice'}",
    "difficulty": "easy",
    "options": [
      {"label": "A", "text": "Đáp án A", "isCorrect": true},
      {"label": "B", "text": "Đáp án B", "isCorrect": false},
      {"label": "C", "text": "Đáp án C", "isCorrect": false},
      {"label": "D", "text": "Đáp án D", "isCorrect": false}
    ],
    "explanation": "Giải thích tại sao A đúng...",
    "bloomLevel": "remember",
    "estimatedTime": 25,
    "tags": ["tag1", "tag2"]
  }`;

    return `${JSON_RULE}

Nhiệm vụ: Tạo ${count} câu hỏi trắc nghiệm chất lượng cao về chủ đề "${topic}".
${dist}
${qtNote}
${bloomNote}

Nội dung tham khảo:
${content}

Yêu cầu chất lượng:
- estimatedTime: easy=25, medium=45, hard=75 (giây)
- Giải thích (explanation) phải chi tiết, hữu ích cho người học
- Đáp án sai phải hợp lý, gây nhiễu tốt (không quá lộ liễu)
- Câu hỏi rõ ràng, kiểm tra đúng kiến thức từ nội dung

Trả về JSON array gồm chính xác ${count} phần tử. Ví dụ 1 phần tử:
[${fillInExample}
]`;
  },

  // ────────────────────────────────────────────────────────────
  // 2. SINH CÂU HỎI TỪ ẢNH (Vision)
  // ────────────────────────────────────────────────────────────
  GENERATE_FROM_IMAGE: (topic, count) => `${JSON_RULE}

Nhiệm vụ: Phân tích nội dung trong ảnh và tạo ${count} câu hỏi trắc nghiệm${topic ? ` về "${topic}"` : ''}.

Yêu cầu:
- Câu hỏi phải bám sát nội dung thực sự có trong ảnh
- Mỗi câu có đúng 1 đáp án correct
- Đa dạng bloomLevel (không phải tất cả đều "remember")

Trả về JSON array:
[{"questionText":"...","questionType":"single_choice","difficulty":"medium","options":[{"label":"A","text":"...","isCorrect":true},{"label":"B","text":"...","isCorrect":false},{"label":"C","text":"...","isCorrect":false},{"label":"D","text":"...","isCorrect":false}],"explanation":"...","bloomLevel":"understand","estimatedTime":45,"tags":[]}]`,

  // ────────────────────────────────────────────────────────────
  // 3. GIẢI THÍCH ĐÁP ÁN
  // ────────────────────────────────────────────────────────────
  EXPLAIN_ANSWER: (question, selected, correct) => {
    const isWrong = selected !== correct;
    return `Bạn là gia sư AI thân thiện. Hãy giải thích đáp án cho học sinh bằng tiếng Việt, ngắn gọn và dễ hiểu.

Câu hỏi: ${question}
Đáp án đúng: ${correct}
${isWrong ? `Học sinh đã chọn SAI: ${selected}` : 'Học sinh đã chọn ĐÚNG'}

Hãy giải thích:
${isWrong
  ? `1. Tại sao "${correct}" là đúng (giải thích ngắn gọn, có lý do cụ thể)
2. Tại sao "${selected}" là sai
3. Mẹo ghi nhớ để không nhầm lần sau`
  : `1. Tại sao "${correct}" là đúng (xác nhận và giải thích sâu hơn)
2. Kiến thức mở rộng liên quan`}

Kết thúc bằng 1 câu động viên hoặc gợi ý học tiếp.`;
  },

  // ────────────────────────────────────────────────────────────
  // 4. ĐÁNH GIÁ KỲ THI
  // ────────────────────────────────────────────────────────────
  EVALUATE_EXAM: (data) => `${JSON_RULE}

Nhiệm vụ: Phân tích và đánh giá kết quả kỳ thi dựa trên dữ liệu thống kê sau.

Dữ liệu kỳ thi:
${JSON.stringify(data, null, 2)}

Trả về JSON với cấu trúc chính xác:
{
  "overallAssessment": "Đánh giá tổng quan 2-3 câu về kỳ thi",
  "passRate": 75.5,
  "failRate": 24.5,
  "avgScore": 7.2,
  "weakAreas": [
    {"area": "Tên mảng kiến thức yếu", "description": "Mô tả cụ thể vấn đề", "affectedPercent": 60}
  ],
  "strongAreas": [
    {"area": "Tên mảng nắm vững", "description": "Nhận xét tích cực"}
  ],
  "recommendations": [
    "Đề xuất cụ thể cho giáo viên 1",
    "Đề xuất cụ thể cho giáo viên 2",
    "Đề xuất cụ thể cho giáo viên 3"
  ],
  "topStudents": [
    {"name": "Tên học sinh", "highlight": "Điểm nổi bật của họ"}
  ],
  "difficultyAssessment": "Đề phù hợp / quá khó / quá dễ với lý do"
}`,

  // ────────────────────────────────────────────────────────────
  // 5. LỘ TRÌNH HỌC CÁ NHÂN
  // ────────────────────────────────────────────────────────────
  LEARNING_PATH: (data) => `${JSON_RULE}

Nhiệm vụ: Tạo lộ trình học tập cá nhân hóa cho học sinh vừa thi xong.

Kết quả thi:
- Chủ đề: ${data.topicName}
- Điểm số: ${data.score}/${data.totalQuestions}${
  // BUG-12 FIX: tránh NaN khi totalQuestions = 0
  data.totalQuestions > 0
    ? ` (${Math.round((data.correctCount / data.totalQuestions) * 100)}%)`
    : ' (0%)'
}
- Đúng: ${data.correctCount} | Sai: ${(data.totalQuestions || 0) - (data.correctCount || 0)}
- Top 10 câu sai gần nhất: ${JSON.stringify(data.wrongAnswers?.slice(0, 10) || [])}

Trả về JSON với cấu trúc chính xác:
{
  "overallAssessment": "Đánh giá ngắn gọn về kết quả học sinh (1-2 câu)",
  "weakAreas": [
    {"area": "Mảng kiến thức yếu cụ thể", "wrongRate": 80, "priority": "high"}
  ],
  "strongAreas": [
    {"area": "Mảng nắm tốt", "correctRate": 90}
  ],
  "estimatedTime": "14 ngày",
  "motivationalNote": "Lời động viên cá nhân hóa, chân thành (1-2 câu)",
  "steps": [
    {
      "title": "Tên bước học cụ thể",
      "description": "Mô tả chi tiết việc cần làm trong bước này",
      "duration": "3 ngày",
      "resources": ["Tài liệu tham khảo 1", "Video/bài tập gợi ý"],
      "weakArea": "Mảng kiến thức bước này giải quyết",
      "priority": "high",
      "type": "learn"
    }
  ]
}`,

  // ────────────────────────────────────────────────────────────
  // 6. AI TUTOR CHAT
  // ────────────────────────────────────────────────────────────
  CHAT_TUTOR: (message, history, context = {}) => {
    const historyText = history.length > 0
      ? history.slice(-10).map(h =>
          `${h.sender_role === 'user' ? 'Học sinh' : 'QuizAI'}: ${h.content}`
        ).join('\n')
      : '(Chưa có lịch sử hội thoại)';

    const topicCtx = context.topicName
      ? `Học sinh đang học chủ đề: "${context.topicName}". Ưu tiên liên hệ kiến thức với chủ đề này.`
      : 'Học sinh đang hỏi kiến thức chung. Mọi câu trả lời phải mang tính giáo dục.';

    return `${topicCtx}

Bạn là một Gia Sư AI / Trợ Giảng thông minh của dự án hệ thống thi trắc nghiệm. Nhiệm vụ duy nhất của bạn là hỗ trợ học tập, giải thích kiến thức, và hướng dẫn ôn thi.

Lịch sử hội thoại (10 tin nhắn gần nhất):
${historyText}

Học sinh hỏi: ${message}

RÀNG BUỘC NGHIÊM NGẶT (TỐI QUAN TRỌNG):
1. TUYỆT ĐỐI KHÔNG trả lời các câu hỏi lạc đề, không liên quan đến học tập/kiến thức (ví dụ: công thức nấu món ăn phở, hỏi thời tiết, chính trị, v.v.). Nếu học sinh hỏi lạc đề, hãy từ chối khéo léo và nhắc nhở họ quay lại việc học. (VD: "Xin lỗi, mình là Trợ giảng AI. Mình chỉ có thể giúp bạn giải đáp các vấn đề học tập thôi nhé!").
2. Giải thích rõ ràng, dùng ví dụ thực tế trong chuyên ngành đang hỏi nếu cần.
3. Nếu học sinh hiểu sai, nhẹ nhàng sửa lỗi.
4. Kết thúc bằng 1 câu gợi ý hoặc câu hỏi để kiểm tra học sinh có hiểu không.
5. Giữ câu trả lời súc tích (100-200 từ là lý tưởng).`;
  },

  // ────────────────────────────────────────────────────────────
  // 7. KIỂM TRA CHẤT LƯỢNG CÂU HỎI
  // ────────────────────────────────────────────────────────────
  QUALITY_CHECK: (question, options) => `${JSON_RULE}

Nhiệm vụ: Đánh giá chất lượng câu hỏi trắc nghiệm theo tiêu chuẩn giáo dục.

Câu hỏi cần đánh giá:
- Nội dung: ${question.question_text}
- Loại: ${question.question_type}
- Độ khó gán: ${question.difficulty}
- Các đáp án: ${JSON.stringify(options)}

Tiêu chí chấm (mỗi tiêu chí 0-10):
- clarity: Câu hỏi rõ ràng, không mơ hồ
- accuracy: Đáp án đúng thực sự đúng về chuyên môn
- distractorQuality: Đáp án sai hợp lý, gây nhiễu tốt
- difficultyMatch: Độ khó phù hợp với label được gán
- grammar: Ngữ pháp, chính tả tiếng Việt

Trả về JSON:
{
  "score": 8.5,
  "feedback": "Nhận xét tổng quan về câu hỏi",
  "clarity": 9,
  "accuracy": 9,
  "distractorQuality": 7,
  "difficultyMatch": 8,
  "grammar": 9,
  "issues": ["Vấn đề 1 nếu có", "Vấn đề 2 nếu có"],
  "suggestions": ["Gợi ý cải thiện cụ thể 1", "Gợi ý 2"]
}`,

  // ────────────────────────────────────────────────────────────
  // 8. DỰ ĐOÁN ĐIỂM SỐ
  // ────────────────────────────────────────────────────────────
  PREDICT_SCORE: (history) => `${JSON_RULE}

Nhiệm vụ: Dựa trên lịch sử thi của học sinh, dự đoán kết quả lần thi tiếp theo.

Lịch sử thi (${history.length} lần gần nhất):
${JSON.stringify(history, null, 2)}

Phân tích xu hướng: điểm tăng/giảm, ổn định hay không ổn định, tỷ lệ đúng theo độ khó.

Trả về JSON:
{
  "predictedScore": 7.5,
  "confidence": 82,
  "passChance": 90,
  "trend": "improving",
  "strengths": ["Mảng mạnh 1", "Mảng mạnh 2"],
  "weaknesses": ["Mảng yếu 1", "Mảng yếu 2"],
  "suggestions": [
    "Ôn lại ... vì tỷ lệ sai còn cao",
    "Tập trung vào ... để cải thiện điểm",
    "Làm thêm bài tập dạng ... để consolidate"
  ],
  "readinessLevel": "ready"
}`,

  // ────────────────────────────────────────────────────────────
  // 9. TÌM KIẾM NGỮ NGHĨA
  // ────────────────────────────────────────────────────────────
  SEMANTIC_SEARCH: (searchQuery) => `${JSON_RULE}

Nhiệm vụ: Phân tích câu tìm kiếm và trích xuất từ khóa mở rộng để tìm kiếm câu hỏi trắc nghiệm.

Câu tìm kiếm: "${searchQuery}"

Hãy nghĩ về:
- Từ khóa chính xác trong câu hỏi
- Các từ đồng nghĩa, từ liên quan trong lĩnh vực giáo dục
- Ý định tìm kiếm (muốn tìm câu hỏi về khái niệm gì?)

Trả về JSON:
{
  "keywords": ["từ_khóa_1", "từ_khóa_2", "từ_khóa_3"],
  "synonyms": ["đồng_nghĩa_1", "đồng_nghĩa_2"],
  "intent": "Mô tả ý định tìm kiếm",
  "relatedConcepts": ["khái_niệm_liên_quan_1", "khái_niệm_liên_quan_2"]
}`,

  // ────────────────────────────────────────────────────────────
  // 10. AUTO TAGGING
  // ────────────────────────────────────────────────────────────
  AUTO_TAG: (questionText) => `${JSON_RULE}

Nhiệm vụ: Phân loại và gán tag cho câu hỏi trắc nghiệm.

Câu hỏi: "${questionText}"

Phân tích:
- Lĩnh vực kiến thức nào?
- Độ phức tạp tư duy (theo thang Bloom)?
- Mất bao lâu để làm (estimate)?
- Tags ngắn gọn (tối đa 5 tags)

Trả về JSON:
{
  "tags": ["tag1", "tag2", "tag3"],
  "difficulty": "medium",
  "bloomLevel": "apply",
  "estimatedTime": 45,
  "relatedTopics": ["chủ_đề_1", "chủ_đề_2"]
}`,

  // ────────────────────────────────────────────────────────────
  // 11. TÓM TẮT TÀI LIỆU
  // ────────────────────────────────────────────────────────────
  SUMMARIZE_DOCUMENT: (text) => `${JSON_RULE}

Nhiệm vụ: Đọc và tóm tắt tài liệu giáo dục sau, xác định các chủ đề chính để sinh câu hỏi trắc nghiệm.

Tài liệu:
${text.substring(0, 12000)}
${text.length > 12000 ? '\n[... nội dung bị cắt bớt ...]' : ''}

Trả về JSON:
{
  "title": "Tên tài liệu (suy ra từ nội dung)",
  "overallSummary": "Tóm tắt tổng quan 3-5 câu về nội dung tài liệu",
  "chapters": [
    {
      "name": "Tên chương/phần",
      "summary": "Tóm tắt nội dung chính của phần này",
      "keyConcepts": ["khái_niệm_1", "khái_niệm_2", "khái_niệm_3"],
      "estimatedQuestions": 10
    }
  ],
  "suggestedDistribution": {"easy": 10, "medium": 15, "hard": 5},
  "totalKeyConcepts": 12
}`,

  // ────────────────────────────────────────────────────────────
  // 12. BÁO CÁO KỲ THI (văn bản)
  // ────────────────────────────────────────────────────────────
  SUMMARIZE_RESULTS: (stats) => `Bạn là chuyên gia phân tích giáo dục. Viết báo cáo tổng kết kỳ thi bằng tiếng Việt.

Dữ liệu thống kê:
${JSON.stringify(stats, null, 2)}

Viết báo cáo 4-5 đoạn bao gồm:
1. Tổng quan kết quả (số lượng tham gia, tỷ lệ pass/fail, điểm trung bình)
2. Điểm mạnh của kỳ thi và học sinh
3. Điểm cần cải thiện và nguyên nhân
4. Đề xuất cụ thể cho giáo viên và học sinh
5. Nhận định về chất lượng đề thi

Viết chuyên nghiệp nhưng dễ hiểu, tránh dùng biệt ngữ kỹ thuật.`,

  // ────────────────────────────────────────────────────────────
  // 13. PHÂN NHÓM HỌC SINH
  // ────────────────────────────────────────────────────────────
  GROUP_STUDENTS: (performance) => `${JSON_RULE}

Nhiệm vụ: Phân nhóm học sinh theo điểm yếu tương đồng để hỗ trợ học nhóm hiệu quả.

Kết quả thi của ${performance.length} học sinh:
${JSON.stringify(performance, null, 2)}

Nguyên tắc phân nhóm:
- Mỗi nhóm 3-5 người
- Nhóm cùng mảng yếu giống nhau để hỗ trợ lẫn nhau
- Không để trình độ chênh lệch quá lớn trong 1 nhóm
- Đặt tên nhóm gợi ý mảng cần cải thiện

Trả về JSON:
{
  "groups": [
    {
      "name": "Nhóm Kiến thức Cơ bản",
      "members": [
        {"userId": 1, "fullName": "Tên học sinh", "score": 4.5}
      ],
      "weakAreas": ["Mảng yếu chung của nhóm"],
      "recommendation": "Bài tập hoặc hoạt động đề xuất cho nhóm này"
    }
  ],
  "summary": "Tóm tắt kết quả phân nhóm"
}`,

};

module.exports = PROMPTS;
