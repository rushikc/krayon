/** Cuts at a word boundary once the text is past `capacity`, leaving room for the ellipsis. */
export const shortenToFit = (text: string, capacity: number) => {
  if (text.length <= capacity) return text;
  const room = Math.max(1, capacity - 1);
  const slice = text.slice(0, room);
  const space = slice.lastIndexOf(' ');
  const cut = space > Math.floor(room / 2) ? slice.slice(0, space) : slice;
  return `${cut.trimEnd()}…`;
};

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
  return { fontSize, text: shortenToFit(text, capacity) };
};
