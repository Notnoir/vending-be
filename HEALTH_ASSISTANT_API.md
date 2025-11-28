# Health Assistant API - Documentation

## Overview

AI assistant menggunakan Google Gemini untuk menjawab pertanyaan seputar kesehatan, obat-obatan, dan penyakit.

## Features

- ✅ Menjawab pertanyaan tentang kesehatan umum
- ✅ Informasi tentang obat-obatan dan penggunaannya
- ✅ Gejala dan penyakit
- ✅ Rekomendasi obat untuk keluhan ringan
- ✅ Filter otomatis untuk pertanyaan di luar topik kesehatan
- ✅ Support riwayat percakapan (conversation history)

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install @google/generative-ai
```

### 2. Get Gemini API Key

1. Kunjungi https://makersuite.google.com/app/apikey
2. Login dengan Google account
3. Klik "Get API Key"
4. Copy API key yang didapat

### 3. Configure Environment Variable

Edit file `backend/.env` dan tambahkan:

```
GEMINI_API_KEY=your_actual_api_key_here
```

### 4. Start Server

```bash
npm run dev
```

## API Endpoints

### 1. Chat with Health Assistant

**Endpoint:** `POST /api/health-assistant/chat`

**Request Body:**

```json
{
  "message": "Apa obat untuk sakit kepala?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Halo"
    },
    {
      "role": "assistant",
      "content": "Halo! Ada yang bisa saya bantu seputar kesehatan Anda?"
    }
  ]
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Untuk sakit kepala ringan, Anda bisa menggunakan parasetamol (seperti Panadol) atau ibuprofen...",
  "isHealthRelated": true,
  "timestamp": "2025-11-28T10:30:00.000Z"
}
```

**Response (Non-health Question):**

```json
{
  "success": true,
  "message": "Maaf, pertanyaan tersebut di luar dari kemampuan saya. Saya hanya dapat membantu menjawab pertanyaan seputar kesehatan, obat-obatan, penyakit, dan rekomendasi perawatan kesehatan. Apakah ada yang bisa saya bantu terkait kesehatan Anda?",
  "isHealthRelated": false,
  "timestamp": "2025-11-28T10:30:00.000Z"
}
```

### 2. Get Product Recommendations

**Endpoint:** `POST /api/health-assistant/recommendations`

**Request Body:**

```json
{
  "symptoms": "batuk dan pilek"
}
```

**Response:**

```json
{
  "success": true,
  "recommendations": [
    {
      "productName": "OBH Combi",
      "description": "Obat batuk untuk meredakan batuk berdahak",
      "dosage": "3x sehari 1 sendok makan",
      "notes": "Diminum setelah makan"
    }
  ],
  "text": "Berdasarkan gejala batuk dan pilek...",
  "timestamp": "2025-11-28T10:30:00.000Z"
}
```

### 3. Check Service Status

**Endpoint:** `GET /api/health-assistant/status`

**Response:**

```json
{
  "success": true,
  "status": "ready",
  "message": "Health assistant service is ready",
  "timestamp": "2025-11-28T10:30:00.000Z"
}
```

## Usage Examples

### Example 1: Simple Chat (cURL)

```bash
curl -X POST http://localhost:3001/api/health-assistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Apa obat untuk demam?"
  }'
```

### Example 2: Chat with History (JavaScript/Fetch)

```javascript
const response = await fetch(
  "http://localhost:3001/api/health-assistant/chat",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Berapa kali sehari harus minum?",
      conversationHistory: [
        {
          role: "user",
          content: "Apa obat untuk demam?",
        },
        {
          role: "assistant",
          content: "Untuk demam, Anda bisa menggunakan parasetamol...",
        },
      ],
    }),
  }
);

const data = await response.json();
console.log(data.message);
```

### Example 3: Get Recommendations (Python)

```python
import requests

response = requests.post(
    'http://localhost:3001/api/health-assistant/recommendations',
    json={'symptoms': 'sakit perut dan mual'}
)

data = response.json()
print(data['recommendations'])
```

## Testing

### Test Health-Related Question

```bash
curl -X POST http://localhost:3001/api/health-assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Apa gejala diabetes?"}'
```

### Test Non-Health Question

```bash
curl -X POST http://localhost:3001/api/health-assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Siapa presiden Indonesia?"}'
```

## Important Notes

### ⚠️ Disclaimer

- Asisten ini memberikan informasi umum saja
- Untuk kondisi serius, selalu sarankan konsultasi dengan dokter/apoteker
- Tidak memberikan diagnosis medis yang pasti
- Rekomendasi obat bersifat umum dan sebaiknya dikonsultasikan dengan ahli

### 🔒 Security

- API key harus dijaga kerahasiaannya
- Jangan commit API key ke repository
- Gunakan environment variables untuk production

### 💰 Costs

- Gemini API memiliki free tier dengan quota terbatas
- Monitor penggunaan API di Google AI Studio
- Pertimbangkan rate limiting untuk production

## Troubleshooting

### Service Not Initialized

**Error:** "Health assistant service is not configured"

**Solution:**

1. Pastikan `GEMINI_API_KEY` sudah diset di `.env`
2. Restart server setelah update `.env`
3. Check status endpoint: `GET /api/health-assistant/status`

### API Key Invalid

**Error:** "API key not valid"

**Solution:**

1. Generate API key baru di Google AI Studio
2. Update `.env` dengan API key yang valid
3. Restart server

### Rate Limit Exceeded

**Error:** "Resource has been exhausted"

**Solution:**

1. Tunggu beberapa menit
2. Monitor penggunaan di Google AI Studio
3. Upgrade ke paid plan jika perlu

## Integration with Frontend

### React/Next.js Example

```typescript
// lib/healthAssistant.ts
export async function chatWithAssistant(message: string, history?: any[]) {
  const response = await fetch("/api/health-assistant/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      conversationHistory: history || [],
    }),
  });

  return response.json();
}

// components/HealthChatbot.tsx
import { useState } from "react";

export function HealthChatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    const response = await chatWithAssistant(input, messages);

    setMessages([
      ...messages,
      { role: "user", content: input },
      { role: "assistant", content: response.message },
    ]);

    setInput("");
  };

  return <div>{/* Chat UI here */}</div>;
}
```

## Future Enhancements

- [ ] Add conversation persistence (save to database)
- [ ] Add user feedback mechanism
- [ ] Integrate with product database for accurate recommendations
- [ ] Add image recognition for pill identification
- [ ] Support multiple languages
- [ ] Add voice input/output

## Support

For issues or questions, contact the development team.
