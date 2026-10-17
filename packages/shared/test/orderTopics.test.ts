import { describe, expect, it } from 'vitest';
import { orderTopics } from '../src/scene.js';
import type { RoadmapTopic } from '../src/scene.js';
import { roadmapTopics } from './fixtures/lesson.js';

const topic = (id: string, prerequisites: string[]): RoadmapTopic => ({
  id,
  title: id,
  summary: '',
  prerequisites,
  sourcePages: [],
});

describe('orderTopics', () => {
  it('orders a topic after its prerequisites', () => {
    const equilibrium = roadmapTopics[2];
    const supply = roadmapTopics[0];
    const demand = roadmapTopics[1];
    if (!supply || !demand || !equilibrium) throw new Error('Roadmap fixture is missing topics.');
    const ordered = orderTopics([equilibrium, supply, demand]);
    expect(ordered.map((item) => item.id)).toEqual(['supply', 'demand', 'equilibrium']);
  });

  it('returns when topics form a cycle', () => {
    const ordered = orderTopics([topic('a', ['b']), topic('b', ['a'])]);
    expect(ordered.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores an unknown prerequisite', () => {
    expect(orderTopics([topic('solo', ['missing'])]).map((item) => item.id)).toEqual(['solo']);
  });
});
