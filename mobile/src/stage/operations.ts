import type { StagePosition } from './coordinates';
import type { StageDocument, StageObject } from './model';

export function moveObject(stage: StageDocument, id: string, position: StagePosition): StageDocument {
  return {
    ...stage,
    objects: stage.objects.map((object) => object.id === id
      ? { ...object, position: { ...position, x: Math.max(0, position.x), y: Math.max(0, position.y) } }
      : object),
  };
}

type AddableType = 'target' | 'wall';

export function addObject(stage: StageDocument, type: AddableType): StageDocument {
  const count = stage.objects.filter((object) => object.type === type).length;
  const object: StageObject = {
    id: `${type}-${count + 1}`,
    type,
    position: { space: 'stage', x: type === 'target' ? 140 : 100, y: type === 'target' ? 160 : 150 },
  };
  // Targets must stay below all walls, just as in the original separate arrays.
  const firstWall = stage.objects.findIndex((entry) => entry.type === 'wall');
  const index = type === 'target' && firstWall !== -1 ? firstWall : stage.objects.length;
  return { ...stage, objects: [...stage.objects.slice(0, index), object, ...stage.objects.slice(index)] };
}

export function removeLastObject(stage: StageDocument, type: AddableType): StageDocument {
  const last = stage.objects.filter((object) => object.type === type).at(-1);
  return last ? { ...stage, objects: stage.objects.filter((object) => object.id !== last.id) } : stage;
}
