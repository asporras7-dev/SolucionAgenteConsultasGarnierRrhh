import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fetchWithRetry(url, options, maxRetries = 5, initialDelay = 2000) {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if (response.status === 429 || response.status === 503) {
        console.warn(`⚠️ API returned ${response.status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.warn(`⚠️ Request failed: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error(`API call failed after ${maxRetries} attempts`);
}

const hrDictionaryEsToEn = {
  "vacaciones": "vacation",
  "días de vacaciones": "vacation days",
  "teletrabajo": "work from home (telecommuting)",
  "colaborador": "employee",
  "colaboradores": "employees",
  "recursos humanos": "human resources",
  "incapacidad": "medical leave",
  "incapacidades": "medical leaves",
  "permiso": "permission/leave",
  "permisos": "permissions/leaves",
  "código de conducta": "code of conduct",
  "ética": "ethics",
  "reglamento": "regulation",
  "reglamentos": "regulations",
  "aguinaldo": "Christmas bonus (aguinaldo)",
  "salario": "salary",
  "pago": "payment",
  "contrato": "contract",
  "seguro": "insurance",
  "bienvenida": "welcome",
  "inducción": "induction/onboarding",
  " Garnier & Garnier": " Garnier & Garnier",
  "políticas": "policies",
  "política": "policy",
  "días hábiles": "business days",
  "médico": "medical",
  "enfermedad": "sickness/illness",
  "acoso": "harassment",
  "burnout": "burnout",
  "ansiedad": "anxiety",
  "depresión": "depression"
};

const hrDictionaryEnToEs = {};
for (const [key, value] of Object.entries(hrDictionaryEsToEn)) {
  hrDictionaryEnToEs[value.split(' ')[0]] = key;
}

/**
 * Traduce un texto entre español e inglés de forma inteligente.
 * @param {string} text - Texto a traducir.
 * @param {string} targetLang - Idioma de destino ('es' o 'en').
 * @returns {Promise<string>} Texto traducido.
 */
export async function translateText(text, targetLang) {
  if (!text) return '';
  
  const isEn = targetLang.toLowerCase() === 'en';
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Translate the following text to ${isEn ? 'English' : 'Spanish'}. Return ONLY the translated text, preserving the tone, structure, paragraph layout and formatting (do not add any comments or intros):\n\n${text}`
              }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
          return result.candidates[0].content.parts[0].text.trim();
        }
      }
      console.warn(`⚠️ Gemini translation API returned status ${response.status}. Usando fallback...`);
    } catch (err) {
      console.error('⚠️ Error llamando a la API de Gemini para traducción:', err.message);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: `Translate the following text to ${isEn ? 'English' : 'Spanish'}. Return ONLY the translated text, preserving the tone, structure, paragraph layout and formatting (do not add any comments or intros):\n\n${text}`
              }
            ]
          })
        });
        if (response.ok) {
          const result = await response.json();
          return result.content[0].text.trim();
        }
      } else if (process.env.OPENAI_API_KEY) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: `Translate the following text to ${isEn ? 'English' : 'Spanish'}. Return ONLY the translated text, preserving the tone, structure and formatting:\n\n${text}`
              }
            ]
          })
        });
        if (response.ok) {
          const result = await response.json();
          return result.choices[0].message.content.trim();
        }
      }
    } catch (err) {
      console.error('⚠️ Error llamando a las APIs de traducción, usando fallback local:', err.message);
    }
  }

  // Mock Translation Fallback (Para modo Demostración sin API Keys)
  console.log(`[Translation Service] Translating to ${targetLang.toUpperCase()} (Demo Mode)`);

  if (isEn) {
    let translated = text;
    // Traducir palabras clave
    for (const [esWord, enWord] of Object.entries(hrDictionaryEsToEn)) {
      const regex = new RegExp(`\\b${esWord}\\b`, 'gi');
      translated = translated.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return enWord[0].toUpperCase() + enWord.slice(1);
        }
        return enWord;
      });
    }

    // Traducción de frases comunes
    translated = translated
      .replace(/De acuerdo con/gi, "According to")
      .replace(/De conformidad con/gi, "In accordance with")
      .replace(/El colaborador tiene derecho a/gi, "The employee is entitled to")
      .replace(/Las políticas de/gi, "The policies of")
      .replace(/código de trabajo/gi, "labor code")
      .replace(/para resolver dudas/gi, "to resolve doubts")
      .replace(/en cualquier momento/gi, "at any time")
      .replace(/mucho éxito/gi, "great success")
      .replace(/el equipo de/gi, "the team of")
      .replace(/se pondrá en contacto/gi, "will contact you")
      .replace(/a la brevedad/gi, "as soon as possible")
      .replace(/sección/gi, "Section")
      .replace(/página/gi, "Page")
      .replace(/Manual de Inducción/gi, "Induction Manual")
      .replace(/Manual de Políticas/gi, "Policy Manual");

    if (translated === text) {
      // Modificar ligeramente para simular traducción si no hay coincidencias de diccionario
      return `[EN] ${text}`;
    }
    return `[EN] ${translated}`;
  } else {
    let translated = text;
    // Traducir palabras clave del inglés al español
    for (const [esWord, enWord] of Object.entries(hrDictionaryEsToEn)) {
      const regex = new RegExp(`\\b${enWord}\\b`, 'gi');
      translated = translated.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return esWord[0].toUpperCase() + esWord.slice(1);
        }
        return esWord;
      });
    }

    // Traducción de frases comunes del inglés al español
    translated = translated
      .replace(/According to/gi, "De acuerdo con")
      .replace(/In accordance with/gi, "De conformidad con")
      .replace(/entitled to/gi, "con derecho a")
      .replace(/policies/gi, "políticas")
      .replace(/as soon as possible/gi, "a la brevedad")
      .replace(/Section/gi, "Sección")
      .replace(/Page/gi, "Página")
      .replace(/Induction Manual/gi, "Manual de Inducción")
      .replace(/Policy Manual/gi, "Manual de Políticas");

    if (translated === text) {
      return `[ES] ${text}`;
    }
    return `[ES] ${translated}`;
  }
}
