/** Split camelCase or PascalCase into spaced title-style words. */
export function humanizeCamelCase(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  if (spaced.length === 0) {
    return spaced;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
