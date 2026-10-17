import type { ModelClient } from '@krayon/shared';

const json = (value: unknown) => ({ text: JSON.stringify(value) });

/** Enough words that two lessons stay separate, and exactly 30 sentences for the beats fixture. */
export const scriptFor = (title: string) =>
  Array.from({ length: 30 }, (_, index) => `${title} point ${index + 1} is a complete sentence about the idea.`).join(' ');

/** Scripted Gemini answers for the fake-AI course flow. No network. */
export const fakeModel: ModelClient = {
  generateJson: async (req) => {
    const name = req.callType;
    if (name === 'structure') {
      return json({
        title: 'Supply and demand',
        category: 'Economy',
        chapters: [{ title: 'Demand', pdfPageStart: 1, pdfPageEnd: 2, skip: false }],
        pageLabelSamples: [],
      });
    }
    if (name === 'chapterText') return json({ chapterText: 'People buy less when the price rises [p. 1].' });
    if (name === 'lessonOutline') {
      return json({
        lessons: [
          { title: 'What demand is', focus: 'The idea of demand.', pageStart: 1, pageEnd: 1 },
          { title: 'How price moves it', focus: 'Price and quantity.', pageStart: 2, pageEnd: 2 },
        ],
      });
    }
    if (name === 'lessonScript') return json({ explanationSummary: scriptFor(req.prompt.includes('price') ? 'Price' : 'Demand') });
    if (name === 'studyDoc') return json({ studyDoc: '## Notes\nPrice and quantity move together.' });
    if (name === 'beats') return json({ beats: [{ firstSentence: 1, lastSentence: 30, title: 'Demand', visual: 'A title card.', pages: [1] }] });
    if (name === 'scene' || name === 'repair') return json({ title: 'Demand', scene: { layout: { type: 'titleCard', title: 'Demand' } } });
    if (name === 'review') return json({ pass: true, score: 9, issues: [] });
    if (name === 'chat') return json({ answer: 'Because a higher price means people buy less.' });
    throw new Error(`unexpected model call ${name}`);
  },
};
