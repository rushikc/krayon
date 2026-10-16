export const fitText = (
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  maxLines = 1,
) => {
  const widthOf = (fontSize: number) => fontSize * 0.56;
  let fontSize = maxSize;
  const linesFor = (size: number) =>
    Math.max(1, Math.ceil((text.length * widthOf(size)) / Math.max(1, maxWidth)));
  while (fontSize > minSize && linesFor(fontSize) > maxLines) fontSize -= 1;
  const capacity = Math.max(1, Math.floor((maxWidth * maxLines) / widthOf(fontSize)));
  if (text.length <= capacity) return { fontSize, text };
  return { fontSize, text: `${text.slice(0, capacity - 1).trimEnd()}…` };
};
