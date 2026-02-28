let selectedFile = null;

// Upload zone
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(files) {
  if (files.length === 0) return;
  selectedFile = files[0];
  fileInfo.classList.add('show');
  fileInfo.innerHTML = `<p>📄 ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB)</p>`;
  document.getElementById('markBtn').disabled = false;
}

// API Settings
function saveApiSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim();
  
  if (apiKey) localStorage.setItem('ai-marker-api-key', apiKey);
  if (apiBaseUrl) localStorage.setItem('ai-marker-api-base-url', apiBaseUrl);
  
  showStatus('✅ API 設定已儲存', 'success');
}

function clearApiSettings() {
  localStorage.removeItem('ai-marker-api-key');
  localStorage.removeItem('ai-marker-api-base-url');
  document.getElementById('apiKey').value = '';
  document.getElementById('apiBaseUrl').value = '';
  showStatus('🗑️ API 設定已清除', 'success');
}

function toggleKeyVisibility() {
  const input = document.getElementById('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showStatus(msg, type) {
  const status = document.getElementById('apiStatus');
  status.textContent = msg;
  status.className = `status show ${type}`;
  setTimeout(() => status.classList.remove('show'), 3000);
}

// Load saved settings
function loadApiSettings() {
  const apiKey = localStorage.getItem('ai-marker-api-key');
  const apiBaseUrl = localStorage.getItem('ai-marker-api-base-url');
  if (apiKey) document.getElementById('apiKey').value = apiKey;
  if (apiBaseUrl) document.getElementById('apiBaseUrl').value = apiBaseUrl;
}

// Mark assignment
async function markAssignment() {
  if (!selectedFile) return alert('請上傳檔案');
  
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) return alert('請輸入 API Key');
  
  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('answerKey', document.getElementById('answerKey').value);
  formData.append('rubric', document.getElementById('rubric').value);
  formData.append('apiKey', apiKey);
  formData.append('apiBaseUrl', document.getElementById('apiBaseUrl').value);
  
  showLoading(true);
  
  try {
    const res = await fetch('/api/mark', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await res.text());
    
    const data = await res.json();
    displayOCRResult(data);
  } catch (err) {
    alert('批改失敗：' + err.message);
  } finally {
    showLoading(false);
  }
}

function displayOCRResult(data) {
  const resultsSection = document.getElementById('resultsSection');
  const results = document.getElementById('results');
  
  results.innerHTML = `
    <h3>📄 識別的文字</h3>
    <div style="background: var(--gray-100); padding: 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.95rem; line-height: 1.8; color: var(--gray-700); max-height: 300px; overflow-y: auto;">
      ${data.extractedText}
    </div>
    
    <div style="display: flex; gap: 8px;">
      <button onclick="confirmAndMark()" class="btn btn-primary" style="flex: 1;">✅ 確認無誤，開始批改</button>
      <button onclick="editOCRText()" class="btn btn-outline" style="flex: 1;">✏️ 編輯文字</button>
    </div>
    
    <div id="editPanel" style="display: none; margin-top: 16px;">
      <textarea id="editedText" class="textarea" rows="8"></textarea>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <button onclick="saveEditedText()" class="btn btn-primary" style="flex: 1;">💾 儲存並批改</button>
        <button onclick="cancelEdit()" class="btn btn-outline" style="flex: 1;">❌ 取消</button>
      </div>
    </div>
  `;
  
  // Store data for later use
  window.currentMarkData = data;
  
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function editOCRText() {
  document.getElementById('editedText').value = window.currentMarkData.extractedText;
  document.getElementById('editPanel').style.display = 'block';
}

function cancelEdit() {
  document.getElementById('editPanel').style.display = 'none';
}

function saveEditedText() {
  const editedText = document.getElementById('editedText').value;
  window.currentMarkData.extractedText = editedText;
  confirmAndMark();
}

async function confirmAndMark() {
  showLoading(true);
  
  try {
    const systemPrompt = `You are an expert teacher marking student work. 
${document.getElementById('answerKey').value ? `Answer Key:\n${document.getElementById('answerKey').value}\n` : ''}
${document.getElementById('rubric').value ? `Rubric:\n${document.getElementById('rubric').value}\n` : ''}
Respond with ONLY valid JSON (no markdown):
{
  "score": <number>,
  "maxScore": <number>,
  "feedback": "<feedback>",
  "strengths": ["<strength1>", "<strength2>"],
  "improvements": ["<improvement1>", "<improvement2>"]
}`;

    const apiKey = document.getElementById('apiKey').value.trim();
    const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim();
    
    const res = await fetch('/api/mark-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: window.currentMarkData.extractedText,
        answerKey: document.getElementById('answerKey').value,
        rubric: document.getElementById('rubric').value,
        apiKey,
        apiBaseUrl
      })
    });
    
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    
    displayMarkingResult(result, window.currentMarkData.extractedText);
  } catch (err) {
    alert('批改失敗：' + err.message);
  } finally {
    showLoading(false);
  }
}

function displayMarkingResult(data, extractedText) {
  const resultsSection = document.getElementById('resultsSection');
  const results = document.getElementById('results');
  
  results.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 3rem; margin-bottom: 10px;">
        ${data.score >= data.maxScore * 0.8 ? '🎉' : data.score >= data.maxScore * 0.6 ? '👍' : '💪'}
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">
        ${data.score} / ${data.maxScore}
      </div>
      <div style="font-size: 1.2rem; color: var(--gray-600);">
        ${Math.round((data.score / data.maxScore) * 100)}%
      </div>
    </div>
    
    <h3>📄 學生答案</h3>
    <div style="background: var(--gray-100); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; line-height: 1.6; color: var(--gray-700);">
      ${extractedText}
    </div>
    
    <h3>📝 反饋</h3>
    <p>${data.feedback}</p>
    
    ${data.strengths && data.strengths.length > 0 ? `
      <h3>💪 優點</h3>
      <ul>${data.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
    ` : ''}
    
    ${data.improvements && data.improvements.length > 0 ? `
      <h3>📈 需要改進</h3>
      <ul>${data.improvements.map(i => `<li>${i}</li>`).join('')}</ul>
    ` : ''}
  `;
  
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// Init
loadApiSettings();
