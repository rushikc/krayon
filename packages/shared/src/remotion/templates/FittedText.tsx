import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fitText } from './fitText.js';
import { theme } from '../../theme.js';

type FittedTextProps = {
  text: string;
  maxWidth: number;
  maxSize: number;
  minSize: number;
  maxLines?: number;
  color?: string;
  fontFamily?: string;
  align?: 'left' | 'center';
};

const closeMath = (text: string) => {
  const marks = text.match(/\$/g)?.length ?? 0;
  if (marks % 2 === 1) return text.replace(/\$[^$]*$/, '…');
  return text;
};

const pieces = (text: string) => {
  const parts: { math: boolean; value: string }[] = [];
  const pattern = /\$([^$]+)\$/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ math: false, value: text.slice(cursor, index) });
    parts.push({ math: true, value: match[1] ?? '' });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ math: false, value: text.slice(cursor) });
  if (parts.length === 0) parts.push({ math: false, value: text });
  return parts;
};

const mathHtml = (value: string) =>
  katex.renderToString(value, { throwOnError: false, displayMode: false });

export function FittedText({
  text,
  maxWidth,
  maxSize,
  minSize,
  maxLines = 1,
  color = theme.ink,
  fontFamily = theme.sans,
  align = 'left',
}: FittedTextProps) {
  const fitted = fitText(text, maxWidth, maxSize, minSize, maxLines);
  const parts = pieces(closeMath(fitted.text));
  return (
    <div
      style={{
        width: maxWidth,
        maxWidth,
        fontSize: fitted.fontSize,
        lineHeight: 1.25,
        color,
        fontFamily,
        textAlign: align,
        overflow: 'hidden',
      }}
    >
      {parts.map((part, index) =>
        part.math ? (
          <span key={index} dangerouslySetInnerHTML={{ __html: mathHtml(part.value) }} />
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </div>
  );
}
