const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Invalid file type'), allowed.includes(file.mimetype));
  }
});

// Helper: call AI API
async function callAI(messages, clientApiKey, clientBaseUrl) {
  const baseUrl = (clientBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = clientApiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) throw new Error('API Key not provided');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 2000,
      temperature: 0.3
    })
  });

  if (!response.ok) throw new Error(`AI API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// Helper: OCR image using AI Vision
async function ocrImage(b64, mimeType, clientApiKey, clientBaseUrl) {
  const baseUrl = (clientBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = clientApiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) throw new Error('API Key not provided');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please extract all text from this image. Return ONLY the extracted text, nothing else.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${b64}`, detail: 'high' }
            }
          ]
        }
      ],
      max_tokens: 2000
    })
  });

  if (!response.ok) throw new Error(`OCR API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// POST /api/mark
app.post('/api/mark', upload.single('file'), async (req, res) => {
  try {
    const { answerKey, rubric, apiKey, apiBaseUrl } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const b64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Step 1: OCR the image
    let extractedText = '';
    try {
      extractedText = await ocrImage(b64, mimeType, apiKey, apiBaseUrl);
    } catch (ocrErr) {
      console.error('OCR error:', ocrErr);
      extractedText = '[OCR failed - using image directly]';
    }

    // Step 2: Mark the extracted text
    const systemPrompt = `You are an expert teacher marking student work. 
${answerKey ? `Answer Key:\n${answerKey}\n` : ''}
${rubric ? `Rubric:\n${rubric}\n` : ''}
Respond with ONLY valid JSON (no markdown):
{
  "extractedText": "<text extracted from image>",
  "score": <number>,
  "maxScore": <number>,
  "feedback": "<feedback>",
  "strengths": ["<strength1>", "<strength2>"],
  "improvements": ["<improvement1>", "<improvement2>"]
}`;

    const messages = [
      {
        role: 'user',
        content: `Please mark this student work:\n\n${extractedText}`
      }
    ];

    const raw = await callAI([{ role: 'system', content: systemPrompt }, ...messages], apiKey, apiBaseUrl);
    let cleaned = raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(cleaned);
    result.extractedText = extractedText;
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`AI Marker running on port ${PORT}`));
module.exports = app;
