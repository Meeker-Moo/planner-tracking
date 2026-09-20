import { todoProgress } from './activity.util';

describe('todoProgress', () => {
  it('counts done items out of all items', () => {
    const todos = [
      { id: '1', text: 'a', done: true },
      { id: '2', text: 'b', done: false },
      { id: '3', text: 'c', done: true },
    ];
    expect(todoProgress({ todos })).toEqual({ done: 2, total: 3 });
  });

  it('is 0 of 0 for an activity without a to-do list', () => {
    expect(todoProgress({})).toEqual({ done: 0, total: 0 });
    expect(todoProgress({ todos: [] })).toEqual({ done: 0, total: 0 });
  });
});
