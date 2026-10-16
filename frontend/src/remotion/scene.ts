export const sceneElementTypes = [
  'title',
  'text',
  'box',
  'arrow',
  'badge',
  'equation',
  'lineGraph',
  'image',
] as const;

export type SceneElementType = (typeof sceneElementTypes)[number];

export type GraphPoint = {
  x: number;
  y: number;
};

export type SceneElement = {
  type: SceneElementType;
  text?: string;
  latex?: string;
  ref?: string;
  value?: string;
  start: number;
  end: number;
  points?: GraphPoint[];
};

export type Scene = {
  elements: SceneElement[];
};

export type GeneratedSegment = {
  id: string;
  title: string;
  durationInFrames: number;
  narration: string;
  scene: Scene;
};

export type GeneratedLesson = {
  studyDoc: string;
  segments: GeneratedSegment[];
};

export type RoadmapTopic = {
  id: string;
  title: string;
  summary: string;
  prerequisites: string[];
  sourcePages: number[];
};

export type Roadmap = {
  topics: RoadmapTopic[];
};

export const isSceneElementType = (type: string): type is SceneElementType =>
  (sceneElementTypes as readonly string[]).includes(type);

export const generatedDuration = (segments: GeneratedSegment[]) =>
  segments.reduce((total, segment) => total + segment.durationInFrames, 0);

export const orderTopics = (topics: RoadmapTopic[]) => {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const ordered: RoadmapTopic[] = [];
  const seen = new Set<string>();

  const visit = (topic: RoadmapTopic, stack: Set<string>) => {
    if (seen.has(topic.id) || stack.has(topic.id)) return;
    stack.add(topic.id);
    for (const prerequisite of topic.prerequisites) {
      const dependency = byId.get(prerequisite);
      if (dependency) visit(dependency, stack);
    }
    stack.delete(topic.id);
    seen.add(topic.id);
    ordered.push(topic);
  };

  for (const topic of topics) visit(topic, new Set());
  return ordered;
};
