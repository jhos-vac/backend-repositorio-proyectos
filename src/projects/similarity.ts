/**
 * Parecido entre proyectos por palabras clave (RN-04). Sin extensiones de
 * PostgreSQL: se normaliza el texto (minúsculas, sin tildes), se quitan las
 * palabras vacías y se compara con el índice de Jaccard.
 */

// Palabras que aparecen en casi cualquier título y no dicen de qué trata el proyecto
const STOPWORDS = new Set([
  'para', 'como', 'sobre', 'desde', 'entre', 'mediante', 'donde', 'cual', 'cuales', 'esta', 'este',
  'estos', 'estas', 'todo', 'todos', 'toda', 'todas', 'cada', 'otro', 'otra', 'tiene', 'hacia',
  'sistema', 'sistemas', 'proyecto', 'proyectos', 'aplicacion', 'plataforma', 'basado', 'basada',
  'desarrollo', 'implementacion', 'propuesta', 'mejora', 'uso', 'usando',
]);

/** Palabras clave de un texto (máximo 15, de 4 letras o más). */
export function keywords(text: string): string[] {
  const words = (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 15);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((w) => sb.has(w)).length;
  return inter / (a.length + sb.size - inter);
}

/** 0 a 1. El nombre pesa más que la descripción. */
export function similarityScore(
  query: { name: string; description?: string },
  project: { name: string; description?: string | null },
): number {
  const byName = jaccard(keywords(query.name), keywords(project.name));
  const all = jaccard(
    keywords(`${query.name} ${query.description ?? ''}`),
    keywords(`${project.name} ${project.description ?? ''}`),
  );
  return 0.6 * byName + 0.4 * all;
}
