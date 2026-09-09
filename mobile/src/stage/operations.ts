import type { StagePosition } from './coordinates';
import { createObject } from './defaults';
import { constrainPosition, normalizeRotation } from './geometry';
import type { StageDocument } from './model';

export function moveObject(stage: StageDocument, id: string, position: StagePosition): StageDocument {
  return { ...stage, objects: stage.objects.map((object) => object.id === id
    ? { ...object, position: constrainPosition(object, position, stage.stage) } : object) };
}

export function rotateObject(stage: StageDocument, id: string, delta: number): StageDocument {
  return { ...stage, objects: stage.objects.map((object) => {
    if (object.id !== id) return object;
    const rotated = { ...object, rotation: normalizeRotation(object.rotation + delta) };
    return { ...rotated, position: constrainPosition(rotated, rotated.position, stage.stage) };
  }) };
}

type AddableType = 'target' | 'wall';
/** Generate the ID once in the event handler, outside React's replayable state updater. */
export function addObject(stage: StageDocument, type: AddableType, id: string): StageDocument {
  if (stage.objects.some((object) => object.id === id)) throw new Error('Duplicate stage object ID: ' + id);
  const object = createObject(type, id, type === 'target' ? 216 : 168, type === 'target' ? 168 : 144);
  object.position = constrainPosition(object, object.position, stage.stage);
  const firstWall = stage.objects.findIndex((entry) => entry.type === 'wall');
  const index = type === 'target' && firstWall !== -1 ? firstWall : stage.objects.length;
  return { ...stage, objects: [...stage.objects.slice(0, index), object, ...stage.objects.slice(index)] };
}

export function removeLastObject(stage: StageDocument, type: AddableType): StageDocument {
  const last = stage.objects.filter((object) => object.type === type).at(-1);
  return last ? { ...stage, objects: stage.objects.filter((object) => object.id !== last.id) } : stage;
}
