export const API_BASE = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) {
    console.error('NEXT_PUBLIC_API_BASE is not defined in environment variables');
    return '';
  }
  // Remove any accidental quotes and whitespace (like trailing newlines)
  const cleaned = base.replace(/^['"\s]+|['"\s]+$/g, '');
  return cleaned;
})();
