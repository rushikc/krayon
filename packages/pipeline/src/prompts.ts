import type { GeneratedSegment, RoadmapTopic, SceneIssue } from '@krayon/shared';

export const templateGuide = `Each segment uses exactly one scene.layout. Fill its slots. Do not send coordinates.
Optional appearAt is a frame number inside the segment. Omit it to let items appear in order.

titleCard: the opening. Fields: title, optional subtitle.
bullets: a short list of facts. Fields: heading, items[{text, appearAt?}] with 1 to 5 items. A bullet is about 12 words.
flow: a sequence, such as a request path. Fields: optional heading, direction horizontal or vertical, nodes[{id, label, sublabel?, appearAt?}] with 2 to 6 nodes, edges[{from, to, label?}] whose from and to are node ids. A node label is about 6 words.
compare: two sides. Fields: optional heading, left{title, points[{text, appearAt?}]}, right with the same shape. 1 to 5 points on a side.
hubSpoke: one center with parts around it, such as Porter's five forces. Fields: center{id, label}, spokes[{id, label, sublabel?, appearAt?}] with 3 to 6 spokes. Spoke labels are about 6 words.
chart: a graph with axes. Fields: optional heading, xLabel, yLabel, curves[{id, label, kind: upward or downward or flat, shift?: left or right, appearAt?}], markers[{type: intersection or point, curveIds, label, appearAt?}]. Supply slopes upward. Demand slopes downward. Mark their crossing with an intersection marker labeled equilibrium. A shift sets shift on that curve.
timeline: steps over time. Fields: optional heading, steps[{label, detail?, appearAt?}] with 2 to 6 steps.
callout: one statement. Fields: kind definition or example or keyPoint, title, body.

Wrap math in single dollar signs, like $P = Q$.`;

const publicSegment = (segment: GeneratedSegment) => ({
  id: segment.id,
  title: segment.title,
  durationInFrames: segment.durationInFrames,
  narration: segment.narration,
  scene: segment.scene,
});

export const roadmapPrompt = `Read the attached document and split it into a study roadmap of smaller topics.
Return 3 to 7 topics.
Each id is unique kebab-case.
prerequisites lists ids of other topics in this same list, or is empty.
sourcePages lists 1-based page numbers that support the topic. For a photo, use [1].
Stay inside what the document actually says.`;

export const lessonPrompt = (topic: RoadmapTopic) => `Create a short lesson for this topic, grounded only in the attached document.
Topic id: ${topic.id}
Title: ${topic.title}
Summary: ${topic.summary}

Return 3 to 5 segments.
durationInFrames is between 90 and 240 at 30 fps.
narration is one or two sentences for the caption.
studyDoc is markdown notes for the same topic.
One template per segment. Node labels are about 6 words. Bullets are about 12 words.

${templateGuide}`;

export const segmentPrompt = (topic: RoadmapTopic, segment: GeneratedSegment, prompt?: string) => `Explain this one lesson segment in more depth.
Topic: ${topic.title}
Keep the segment id exactly "${segment.id}".
You may increase durationInFrames. Stay between 90 and 450 frames at 30 fps.
Return one segment, not a full lesson. Use exactly one template.
Node labels are about 6 words. Bullets are about 12 words.
Ground every label in the attached document.
${prompt ? `\nLearner request: ${prompt}` : ''}

${templateGuide}

Current segment:
${JSON.stringify(publicSegment(segment))}`;

export const repairPrompt = (segment: GeneratedSegment, issues: SceneIssue[]) => `Fix only these problems. Return the corrected segment, not a full lesson.
Keep the segment id exactly "${segment.id}".
Do not add coordinates. Use the same template unless a problem says the template itself is invalid.

Problems:
${issues.map((item) => `- ${item.path}: ${item.message}`).join('\n')}

${templateGuide}

Current segment:
${JSON.stringify(publicSegment(segment))}`;

export const reviewPrompt = (segment: GeneratedSegment, frames: number[]) => `You are reviewing still frames of one lesson segment.
Frames are attached after the source material, in this order: ${frames.join(', ')}.
Judge only what you can see:
- Text is legible and not overflowing, overlapping, or clipped.
- The diagram is conceptually right. Demand slopes down. Supply slopes up. Equilibrium is the intersection.
- Labels stay faithful to the source material.
- Pacing: items should not all appear on the first frame if the segment is long.

Return pass=true only when the score is high and you would show this to a learner.
score is 0 to 10.
issues name the frame, the problem, and severity low, medium, or high.
If you can fix the segment JSON, include patchedSegment. Keep the same id. Otherwise omit patchedSegment.

Segment JSON:
${JSON.stringify(publicSegment(segment))}`;
