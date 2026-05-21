import pdf from 'pdf-parse';
import dotenv from 'dotenv';
import { translateText } from './translationService.js';

dotenv.config();

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

/**
 * Renderizador personalizado para pdf-parse que inyecta marcas de página.
 */
const customPageRender = (pageData) => {
  return pageData.getTextContent().then((textContent) => {
    let lastY = null;
    let text = '';
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || !lastY) {
        text += item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    return `\n---PAGE_START_${pageData.pageIndex + 1}---\n` + text + `\n---PAGE_END_${pageData.pageIndex + 1}---\n`;
  });
};

/**
 * Extrae texto del PDF estructurado por páginas.
 * @param {Buffer} pdfBuffer - Buffer del archivo PDF.
 * @returns {Promise<Array<{page: number, text: string}>>}
 */
export async function parsePdfToPages(pdfBuffer) {
  const options = {
    pagerender: customPageRender
  };
  
  const data = await pdf(pdfBuffer, options);
  const fullText = data.text;
  
  const pages = [];
  const regex = /---PAGE_START_(\d+)---([\s\S]*?)---PAGE_END_\1---/g;
  let match;
  
  while ((match = regex.exec(fullText)) !== null) {
    const pageNum = parseInt(match[1], 10);
    const pageText = match[2].trim();
    if (pageText) {
      pages.push({ page: pageNum, text: pageText });
    }
  }
  
  // Si por alguna razón falló el parser por regex, dividimos por longitud promedio
  if (pages.length === 0 && fullText.trim()) {
    pages.push({ page: 1, text: fullText.trim() });
  }
  
  return pages;
}

/**
 * Genera chunks de texto vinculados a su página original.
 * @param {Array<{page: number, text: string}>} pages 
 * @param {number} chunkSize 
 * @param {number} chunkOverlap 
 * @returns {Array<{content: string, page: number, section: string}>}
 */
export function createChunksFromPages(pages, chunkSize = 600, chunkOverlap = 100) {
  const chunks = [];
  
  for (const pageObj of pages) {
    const text = pageObj.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    
    // Intentar deducir la sección a partir de encabezados comunes en las primeras líneas
    let section = 'General';
    const sectionMatch = text.match(/(Sección|Capítulo|Art[íi]culo)\s+[0-9a-zA-Z.]+(\s+[-—–]\s+[A-Za-z\s]+)?/i);
    if (sectionMatch) {
      section = sectionMatch[0];
    } else {
      // Tomar las primeras palabras como título si no hay match
      const firstWords = text.split(' ').slice(0, 4).join(' ');
      if (firstWords.length > 5 && firstWords.length < 50) {
        section = firstWords + '...';
      }
    }
    
    let index = 0;
    while (index < text.length) {
      const content = text.substring(index, index + chunkSize);
      chunks.push({
        content,
        page: pageObj.page,
        section
      });
      index += (chunkSize - chunkOverlap);
    }
  }
  
  return chunks;
}

/**
 * Genera un embedding vectorial de 1536 dimensiones de manera determinista (TF/IDF local).
 * Se utiliza como fallback sin llaves API.
 * @param {string} text 
 * @returns {Array<number>} Vector normalizado de 1536 dimensiones
 */
export function generateMockEmbedding(text) {
  const vector = new Array(1536).fill(0);
  const words = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
    .split(/\s+/);
    
  for (const word of words) {
    if (!word || word.length < 3) continue;
    
    // Hash polinomial simple para mapear palabras a un índice entre 0 y 1535
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0; // Entero de 32 bits
    }
    
    const idx = Math.abs(hash) % 1536;
    vector[idx] += 1.0;
  }
  
  // Normalizar vector (L2 norm) para cálculo de similitud de coseno
  let sumSq = 0;
  for (let i = 0; i < 1536; i++) {
    sumSq += vector[i] * vector[i];
  }
  
  if (sumSq === 0) {
    vector[0] = 1.0;
    return vector;
  }
  
  const length = Math.sqrt(sumSq);
  for (let i = 0; i < 1536; i++) {
    vector[i] = vector[i] / length;
  }
  
  return vector;
}

/**
 * Obtiene el embedding real de OpenAI o recurre al local determinista.
 * @param {string} text 
 * @returns {Promise<Array<number>>}
 */
export async function getEmbedding(text) {

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateMockEmbedding(text);
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI HTTP error ${response.status}`);
    }
    
    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    console.error('⚠️ Error llamando a OpenAI Embeddings API, usando fallback local:', error.message);
    return generateMockEmbedding(text);
  }
}

/**
 * Calcula la similitud de coseno entre dos vectores normalizados (producto punto).
 * @param {Array<number>} v1 
 * @param {Array<number>} v2 
 * @returns {number}
 */
export function calculateCosineSimilarity(v1, v2) {
  if (v1.length !== v2.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
  }
  return dotProduct;
}

/**
 * Genera la respuesta combinando el prompt de sistema, los documentos de contexto y la consulta.
 * @param {string} promptSystem - Directrices del sistema
 * @param {Array<{content: string, documentName: string, section: string, page: number}>} contexts - Fragmentos RAG
 * @param {string} query - Pregunta del usuario
 * @returns {Promise<Object>} { answer: string, source: Object, confidence: number }
 */
export async function generateRAGAnswer(promptSystem, contexts, query, language = 'es') {
  const bestContext = contexts[0] || null;
  const confidence = bestContext ? parseFloat((bestContext.similarity || 0.85).toFixed(2)) : 0.0;
  
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const isEn = language.toLowerCase() === 'en';
  
  if (geminiKey && contexts.length > 0) {
    try {
      const contextText = contexts.map((c, i) => 
        `[Documento ${i+1}]: ${c.documentName}\nSección: ${c.section}\nPágina: ${c.page}\nContenido: ${c.content}`
      ).join('\n\n');
      
      const systemInstruction = isEn 
        ? "You are the Garnier HR Assistant. Answer the employee's query based ONLY on the provided context in English, and cite the source (document name, section, page). Do not include any Spanish text in the answer."
        : promptSystem;
        
      const userPrompt = isEn
        ? `Employee query: "${query}"\n\nAvailable official context:\n${contextText}\n\nAnswer precisely based only on the context and cite sources.`
        : `Consulta del colaborador: "${query}"\n\nContexto disponible de documentos oficiales:\n${contextText}\n\nResponde de manera precisa, basándote únicamente en el contexto provisto y citando claramente las fuentes.`;

      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
          const answer = result.candidates[0].content.parts[0].text;
          return {
            answer,
            source: bestContext ? {
              document_name: bestContext.documentName,
              section: bestContext.section,
              page: bestContext.page
            } : null,
            confidence,
            found: true
          };
        }
      }
      console.warn(`⚠️ Gemini API returned status ${response.status}. Usando fallback...`);
    } catch (err) {
      console.error('⚠️ Error llamando a la API de Gemini, usando RAG local sintético:', err.message);
    }
  }
  
  if (anthropicKey && contexts.length > 0) {
    try {
      const contextText = contexts.map((c, i) => 
        `[Documento ${i+1}]: ${c.documentName}\nSección: ${c.section}\nPágina: ${c.page}\nContenido: ${c.content}`
      ).join('\n\n');
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: isEn 
            ? "You are the Garnier HR Assistant. Answer the employee's query based ONLY on the provided context in English, and cite the source."
            : promptSystem,
          messages: [
            { 
              role: 'user', 
              content: isEn
                ? `Employee query: "${query}"\n\nAvailable official context:\n${contextText}\n\nAnswer precisely based only on the context and cite sources.`
                : `Consulta del colaborador: "${query}"\n\nContexto disponible de documentos oficiales:\n${contextText}\n\nResponde de manera precisa, basándote únicamente en el contexto provisto y citando claramente las fuentes.` 
            }
          ]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Anthropic HTTP error ${response.status}`);
      }
      
      const result = await response.json();
      const answer = result.content[0].text;
      
      return {
        answer,
        source: bestContext ? {
          document_name: bestContext.documentName,
          section: bestContext.section,
          page: bestContext.page
        } : null,
        confidence,
        found: true
      };
    } catch (err) {
      console.error('⚠️ Error llamando a la API de Anthropic, usando RAG local sintético:', err.message);
    }
  }

  // Fallback / Mock Inteligente si no hay API Key o falla Claude
  if (contexts.length === 0) {
    return {
      answer: '',
      source: null,
      confidence: 0.0,
      found: false
    };
  }

  // Generar respuesta basada en el mejor fragmento de forma local y profesional
  const docName = bestContext.documentName;
  const section = bestContext.section;
  const page = bestContext.page;
  const chunkText = bestContext.content;
  
  if (isEn) {
    // Traducir el chunk de español a inglés si el documento original es de otro idioma
    const translatedChunk = await translateText(chunkText, 'en');
    const translatedDocName = await translateText(docName, 'en');
    const translatedSection = await translateText(section, 'en');
    
    const answer = `According to the official Garnier & Garnier documentation in the document "${translatedDocName.replace('[EN] ', '')}" (Section: ${translatedSection}, Page: ${page}):\n\n"${translatedChunk.replace('[EN] ', '').trim()}"\n\nIf you need to expand this information or review related policies, please don't hesitate to ask me.`;
    
    return {
      answer,
      source: {
        document_name: docName,
        section: section,
        page: page
      },
      confidence,
      found: true
    };
  } else {
    // Sintetizar localmente con un formato pulido y profesional en español
    const answer = `De acuerdo con la documentación oficial de Garnier & Garnier en el documento "${docName}" (Sección: ${section}, Página: ${page}):\n\n"${chunkText.trim()}"\n\nSi necesitas ampliar esta información o revisar políticas relacionadas, no dudes en preguntarme.`;

    return {
      answer,
      source: {
        document_name: docName,
        section: section,
        page: page
      },
      confidence,
      found: true
    };
  }
}
