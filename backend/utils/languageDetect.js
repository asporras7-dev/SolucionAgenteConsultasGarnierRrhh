export function detectLanguage(text) {
  if (!text) return 'es';
  // Simple heuristic: if the text contains typical English words, assume English.
  const englishIndicators = [/\b(the|and|or|is|are|but|if|have|has|will|can|could|should|would)\b/i,
                           /\b(?:\w+ing)\b/i, // gerunds
                           /\b(?:\w+ed)\b/i];
  const lower = text.toLowerCase();
  for (const pattern of englishIndicators) {
    if (pattern.test(lower)) {
      return 'en';
    }
  }
  // Default to Spanish
  return 'es';
}
