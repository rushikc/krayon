import { describe, expect, it } from 'vitest';
import { createPriorityQueue, priorityKey } from '../src/queue.js';
import type { Priority } from '../src/queue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Work that finishes when the test says so. */
const gate = () => {
  let open = () => undefined as void;
  const done = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { done, open };
};

describe('priority queue', () => {
  it('never runs more than the limit at once', async () => {
    const queue = createPriorityQueue({ limit: () => 2 });
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, gate);
    const runs = gates.map((item) =>
      queue.run({}, async () => {
        running += 1;
        peak = Math.max(peak, running);
        await item.done;
        running -= 1;
      }),
    );
    await tick();
    expect(queue.inFlight()).toBe(2);
    expect(queue.waiting()).toBe(3);
    for (const item of gates) {
      item.open();
      await tick();
    }
    await Promise.all(runs);
    expect(peak).toBe(2);
    expect(queue.inFlight()).toBe(0);
  });

  it('starts clicked work first, then the viewed course, then auto, chapter, and background work', async () => {
    let viewed: string | null = 'b';
    const queue = createPriorityQueue({ limit: () => 1, viewedCourse: () => viewed });
    const order: string[] = [];
    const blocker = gate();
    const first = queue.run({}, () => blocker.done);
    const add = (name: string, priority: Priority) => queue.run(priority, async () => void order.push(name));
    const runs = [
      add('a-background', { courseId: 'a', kind: 'background' }),
      add('a-auto', { courseId: 'a', kind: 'auto' }),
      add('b-background', { courseId: 'b', kind: 'background' }),
      add('b-chapter-2', { courseId: 'b', kind: 'chapter', index: 2 }),
      add('b-chapter-1', { courseId: 'b', kind: 'chapter', index: 1 }),
      add('a-clicked', { courseId: 'a', userClicked: true }),
    ];
    viewed = 'b';
    blocker.open();
    await Promise.all([first, ...runs]);
    expect(order).toEqual(['a-clicked', 'b-chapter-1', 'b-chapter-2', 'b-background', 'a-auto', 'a-background']);
  });

  it('reorders waiting work when the viewed course changes', async () => {
    let viewed: string | null = 'a';
    const queue = createPriorityQueue({ limit: () => 1, viewedCourse: () => viewed });
    const order: string[] = [];
    const blocker = gate();
    const first = queue.run({}, () => blocker.done);
    const runs = [
      queue.run({ courseId: 'a', kind: 'chapter' }, async () => void order.push('a')),
      queue.run({ courseId: 'b', kind: 'chapter' }, async () => void order.push('b')),
    ];
    viewed = 'b';
    blocker.open();
    await Promise.all([first, ...runs]);
    expect(order).toEqual(['b', 'a']);
  });

  it('orders older lessons first inside the same kind', () => {
    const older = priorityKey({ courseId: 'a', kind: 'background', enqueuedAt: 1 }, null, 9);
    const newer = priorityKey({ courseId: 'a', kind: 'background', enqueuedAt: 2 }, null, 1);
    expect(older[3]).toBeLessThan(newer[3]!);
  });

  it('starts waiting work when the limit grows', async () => {
    let limit = 1;
    const queue = createPriorityQueue({ limit: () => limit });
    const blocker = gate();
    const first = queue.run({}, () => blocker.done);
    let started = false;
    const waiting = queue.run({}, async () => void (started = true));
    await tick();
    expect(started).toBe(false);
    limit = 3;
    const third = queue.run({}, async () => undefined);
    await tick();
    expect(started).toBe(true);
    blocker.open();
    await Promise.all([first, waiting, third]);
  });

  it('rejects waiting work with Cancelled on clear and keeps running work', async () => {
    const queue = createPriorityQueue({ limit: () => 1 });
    const blocker = gate();
    const first = queue.run({}, () => blocker.done);
    const waiting = queue.run({}, async () => 'never');
    queue.clear();
    await expect(waiting).rejects.toMatchObject({ name: 'Cancelled' });
    blocker.open();
    await first;
    expect(queue.inFlight()).toBe(0);
  });
});
