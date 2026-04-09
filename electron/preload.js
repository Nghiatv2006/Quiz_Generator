const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window Controls ──
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (callback) => ipcRenderer.on('window:maximized', (_, value) => callback(value)),
  },

  // ── Dialog ──
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },

  // ── Auth ──
  auth: {
    register: (data) => ipcRenderer.invoke('auth:register', data),
    login: (data) => ipcRenderer.invoke('auth:login', data),
    logout: () => ipcRenderer.invoke('auth:logout'),
    verify: (token) => ipcRenderer.invoke('auth:verify', token),
    resetPassword: (data) => ipcRenderer.invoke('auth:resetPassword', data),
  },

  // ── Users ──
  users: {
    getProfile: (userId) => ipcRenderer.invoke('user:getProfile', userId),
    updateProfile: (userId, data) => ipcRenderer.invoke('user:updateProfile', userId, data),
    changePassword: (data) => ipcRenderer.invoke('user:changePassword', data),
    getAll: (params, requestUser) => ipcRenderer.invoke('user:getAll', params, requestUser),
    updateRole: (userId, role, requestUser) => ipcRenderer.invoke('user:updateRole', userId, role, requestUser),
    delete: (userId, requestUser) => ipcRenderer.invoke('user:delete', userId, requestUser),
    getSettings: (userId) => ipcRenderer.invoke('user:getSettings', userId),
    updateSettings: (userId, data) => ipcRenderer.invoke('user:updateSettings', userId, data),
  },

  // ── Topics ──
  topics: {
    create: (data, requestUser) => ipcRenderer.invoke('topic:create', data, requestUser),
    getAll: (params) => ipcRenderer.invoke('topic:getAll', params),
    getById: (id) => ipcRenderer.invoke('topic:getById', id),
    update: (id, data, requestUser) => ipcRenderer.invoke('topic:update', id, data, requestUser),
    delete: (id, requestUser) => ipcRenderer.invoke('topic:delete', id, requestUser),
  },

  // ── Questions ──
  questions: {
    create: (data, requestUser) => ipcRenderer.invoke('question:create', data, requestUser),
    getAll: (params) => ipcRenderer.invoke('question:getAll', params),
    getById: (id) => ipcRenderer.invoke('question:getById', id),
    update: (id, data, requestUser) => ipcRenderer.invoke('question:update', id, data, requestUser),
    delete: (id, requestUser) => ipcRenderer.invoke('question:delete', id, requestUser),
    search: (params) => ipcRenderer.invoke('question:search', params),
    bulkImport: (questions, requestUser) => ipcRenderer.invoke('question:bulkImport', questions, requestUser),
    report: (id, data) => ipcRenderer.invoke('question:report', id, data),
  },

  // ── Exams ──
  exams: {
    create: (data, requestUser) => ipcRenderer.invoke('exam:create', data, requestUser),
    getAll: (params, requestUser) => ipcRenderer.invoke('exam:getAll', params, requestUser),
    getById: (id) => ipcRenderer.invoke('exam:getById', id),
    update: (id, data, requestUser) => ipcRenderer.invoke('exam:update', id, data, requestUser),
    delete: (id, requestUser) => ipcRenderer.invoke('exam:delete', id, requestUser),
    getAttempts: (examId, requestUser) => ipcRenderer.invoke('exam:getAttempts', examId, requestUser),
    start: (data) => ipcRenderer.invoke('exam:start', data),
  },

  // ── Attempts ──
  attempts: {
    saveAnswer: (data) => ipcRenderer.invoke('attempt:saveAnswer', data),
    nextAdaptiveQuestion: (data) => ipcRenderer.invoke('attempt:nextAdaptiveQuestion', data),
    submit: (attemptId, customStatus) => ipcRenderer.invoke('attempt:submit', attemptId, customStatus),
    getResult: (attemptId) => ipcRenderer.invoke('attempt:getResult', attemptId),
    getHistory: (params) => ipcRenderer.invoke('attempt:getHistory', params),
  },

  // ── AI Features ──
  ai: {
    generateQuestions: (data) => ipcRenderer.invoke('ai:generateQuestions', data),
    generateFromImage: (data) => ipcRenderer.invoke('ai:generateFromImage', data),
    explainAnswer: (data) => ipcRenderer.invoke('ai:explainAnswer', data),
    evaluateExam: (data) => ipcRenderer.invoke('ai:evaluateExam', data),
    learningPath: (data) => ipcRenderer.invoke('ai:learningPath', data),
    summarizeDocument: (data) => ipcRenderer.invoke('ai:summarizeDocument', data),
    qualityCheck: (data) => ipcRenderer.invoke('ai:qualityCheck', data),
    predictScore: (data) => ipcRenderer.invoke('ai:predictScore', data),
    semanticSearch: (payload) => ipcRenderer.invoke('ai:semanticSearch', payload),
    autoTag: (data) => ipcRenderer.invoke('ai:autoTag', data),
    summarizeResults: (data) => ipcRenderer.invoke('ai:summarizeResults', data),
    groupStudents: (data) => ipcRenderer.invoke('ai:groupStudents', data),
    // Chat
    chatSend: (data) => ipcRenderer.invoke('ai:chatSend', data),
    chatHistory: (sessionId) => ipcRenderer.invoke('ai:chatHistory', sessionId),
    chatSessions: (userId) => ipcRenderer.invoke('ai:chatSessions', userId),
    getProvider: (userId) => ipcRenderer.invoke('ai:getProvider', userId),
    setProvider: (data) => ipcRenderer.invoke('ai:setProvider', data),
    checkStatus: (userId) => ipcRenderer.invoke('ai:checkStatus', userId),
    onChatStream: (callback) => ipcRenderer.on('ai:chatStream', (_, chunk) => callback(chunk)),
  },

  // ── Statistics ──
  stats: {
    overview: () => ipcRenderer.invoke('stats:overview'),
    byTopic: (topicId) => ipcRenderer.invoke('stats:byTopic', topicId),
    byExam: (examId) => ipcRenderer.invoke('stats:byExam', examId),
    leaderboard: (params) => ipcRenderer.invoke('stats:leaderboard', params),
    userPerformance: (userId) => ipcRenderer.invoke('stats:userPerformance', userId),
    aiUsage: () => ipcRenderer.invoke('stats:aiUsage'),
    examFull: (examId) => ipcRenderer.invoke('stats:examFull', examId),
    attemptDetail: (attemptId) => ipcRenderer.invoke('stats:attemptDetail', attemptId),
  },

  // ── Gamification ──
  gamification: {
    getUserStats: (userId) => ipcRenderer.invoke('game:getUserStats', userId),
    getBadges: (userId) => ipcRenderer.invoke('game:getBadges', userId),
    getLeaderboard: (params) => ipcRenderer.invoke('game:getLeaderboard', params),
    getXPHistory: (userId) => ipcRenderer.invoke('game:getXPHistory', userId),
    getDailyQuests: (userId) => ipcRenderer.invoke('game:getDailyQuests', userId),
    addXP: (data) => ipcRenderer.invoke('game:addXP', data),
  },

  // ── Anti-Cheat ──
  cheat: {
    logEvent: (data) => ipcRenderer.invoke('cheat:logEvent', data),
    getReport: (attemptId) => ipcRenderer.invoke('cheat:getReport', attemptId),
    getAll: (params, requestUser) => ipcRenderer.invoke('cheat:getAll', params, requestUser),
    reviewReport: (logId, data, requestUser) => ipcRenderer.invoke('cheat:reviewReport', logId, data, requestUser),
  },

  // ── Voice & Accessibility (Feature 9) ──
  voice: {
    processCommand: (data) => ipcRenderer.invoke('voice:processCommand', data),
    textToIntent: (data) => ipcRenderer.invoke('voice:textToIntent', data),
    summarize: (data) => ipcRenderer.invoke('voice:summarize', data),
    transcribe: (data) => ipcRenderer.invoke('voice:transcribe', data),
  },
});
