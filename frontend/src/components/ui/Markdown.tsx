import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { cx } from './cx.ts';

// Sketchbook-styled markdown: ink borders, paper fills, serif headings.
const components: Components = {
  h1: ({ node: _node, ...props }) => <h3 className="mt-5 mb-2 font-serif text-[1.5em] leading-tight text-ink first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="mt-5 mb-2 font-serif text-[1.3em] leading-tight text-ink first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="mt-4 mb-1.5 font-serif text-[1.15em] leading-snug text-ink first:mt-0" {...props} />,
  h4: ({ node: _node, ...props }) => <h5 className="mt-3 mb-1 text-[1em] font-semibold text-ink first:mt-0" {...props} />,
  p: ({ node: _node, ...props }) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-ink" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a className="font-medium text-crayon-text underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
  ),
  ul: ({ node: _node, ...props }) => <ul className="my-2 list-disc space-y-1 pl-6 marker:text-crayon" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-6 marker:font-semibold marker:text-crayon-text" {...props} />,
  li: ({ node: _node, ...props }) => <li className="pl-1" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="my-3 rounded-r-xl border-l-[5px] border-yellow bg-stone/70 py-1.5 pr-3 pl-3 text-muted italic" {...props} />
  ),
  hr: () => <hr className="my-4 border-t-2 border-dashed border-ink/25" />,
  code: ({ node: _node, className, ...props }) =>
    className?.startsWith('language-') ? (
      <code className={cx(className, 'font-mono text-[0.9em]')} {...props} />
    ) : (
      <code className="rounded-md border border-ink/20 bg-stone px-1.5 py-0.5 font-mono text-[0.88em] text-ink" {...props} />
    ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-3 overflow-x-auto rounded-xl border-2 border-ink bg-chalk px-4 py-3 text-[0.9em] leading-relaxed text-paper shadow-[3px_3px_0_var(--color-ink)] [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-paper"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-xl border-2 border-ink shadow-[3px_3px_0_var(--color-ink)]">
      <table className="w-full border-collapse text-left text-[0.92em]" {...props} />
    </div>
  ),
  thead: ({ node: _node, ...props }) => <thead className="bg-yellow/70" {...props} />,
  tr: ({ node: _node, ...props }) => <tr className="border-b border-ink/15 last:border-b-0 even:bg-stone/60 [thead_&]:border-b-2 [thead_&]:border-ink" {...props} />,
  th: ({ node: _node, ...props }) => <th className="px-3 py-2 font-semibold whitespace-nowrap text-ink" {...props} />,
  td: ({ node: _node, ...props }) => <td className="px-3 py-1.5 align-top" {...props} />,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('min-w-0 text-ink [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
