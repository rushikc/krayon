import { continueRender, delayRender } from 'remotion';

const files = [
  { family: 'Fraunces', weight: '400', file: 'fraunces-latin-400-normal.woff2' },
  { family: 'Outfit', weight: '400', file: 'outfit-latin-400-normal.woff2' },
];

/**
 * Loads Fraunces and Outfit inside the composition so local and Cloud Run stills match.
 * The woff2 files are bundled with the Remotion webpack build. KaTeX is loaded by FittedText.
 */
let started = false;

export const loadLessonFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('lesson-fonts');
  void (async () => {
    try {
      const fraunces = await import('@fontsource/fraunces/files/fraunces-latin-400-normal.woff2');
      const outfit = await import('@fontsource/outfit/files/outfit-latin-400-normal.woff2');
      const urls = [String(fraunces.default), String(outfit.default)];
      await Promise.all(
        files.map((font, index) => {
          const face = new FontFace(font.family, `url(${urls[index]})`, { weight: font.weight });
          return face.load().then((loaded) => {
            document.fonts.add(loaded);
          });
        }),
      );
    } finally {
      continueRender(handle);
    }
  })();
};
