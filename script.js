const stage = document.querySelector("#stage");
const startPosition = document.querySelector(".position-block");
const addTargetButton = document.querySelector("#add-target-button");
const removeTargetButton = document.querySelector("#remove-target-button");
const addWallButton = document.querySelector("#add-wall-button");
const removeWallButton = document.querySelector("#remove-wall-button");
const resetButton = document.querySelector("#reset-button");

const defaultTargets = [
  { id: "target-1", x: 0.78, y: 0.1 },
  { id: "target-2", x: 0.82, y: 0.58 },
  { id: "target-3", x: 0.48, y: 0.55 }
];

const defaultWalls = [
  { id: "wall-1", x: 0.18, y: 0.48, direction: "horizontal" },
  { id: "wall-2", x: 0.5, y: 0.06, direction: "vertical" },
  { id: "wall-3", x: 0.65, y: 0.82, direction: "horizontal" }
];

let targetCounter = defaultTargets.length;
let wallCounter = defaultWalls.length;
let targets = [];
let walls = [];

function placeObject(object, x, y) {
  const availableWidth = stage.clientWidth - object.offsetWidth;
  const availableHeight = stage.clientHeight - object.offsetHeight;

  object.style.left = `${availableWidth * x}px`;
  object.style.top = `${availableHeight * y}px`;
}

function makeDraggable(object) {
  object.addEventListener("pointerdown", (event) => {
    const objectRect = object.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const pointerOffsetX = event.clientX - objectRect.left;
    const pointerOffsetY = event.clientY - objectRect.top;

    object.setPointerCapture(event.pointerId);
    object.classList.add("dragging");

    function moveObject(moveEvent) {
      const maximumX = stage.clientWidth - object.offsetWidth;
      const maximumY = stage.clientHeight - object.offsetHeight;
      const requestedX = moveEvent.clientX - stageRect.left - stage.clientLeft - pointerOffsetX;
      const requestedY = moveEvent.clientY - stageRect.top - stage.clientTop - pointerOffsetY;

      object.style.left = `${Math.max(0, Math.min(requestedX, maximumX))}px`;
      object.style.top = `${Math.max(0, Math.min(requestedY, maximumY))}px`;
    }

    function stopDragging() {
      object.classList.remove("dragging");
      object.removeEventListener("pointermove", moveObject);
      object.removeEventListener("pointerup", stopDragging);
      object.removeEventListener("pointercancel", stopDragging);
    }

    object.addEventListener("pointermove", moveObject);
    object.addEventListener("pointerup", stopDragging);
    object.addEventListener("pointercancel", stopDragging);
  });
}

function createTarget(id, x = 0.5, y = 0.5) {
  const target = document.createElement("div");
  target.id = id;
  target.className = "draggable-object target";
  target.setAttribute("aria-label", id);
  stage.appendChild(target);
  makeDraggable(target);
  placeObject(target, x, y);
  targets.push(target);
}

function createWall(id, x = 0.5, y = 0.5, direction = "horizontal") {
  const wall = document.createElement("div");
  wall.id = id;
  wall.className = `draggable-object wall wall-${direction}`;
  wall.setAttribute("aria-label", id);
  stage.appendChild(wall);
  makeDraggable(wall);
  placeObject(wall, x, y);
  walls.push(wall);
}

function resetStage() {
  targets.forEach((target) => target.remove());
  walls.forEach((wall) => wall.remove());
  targets = [];
  walls = [];

  placeObject(startPosition, Number(startPosition.dataset.x), Number(startPosition.dataset.y));
  defaultTargets.forEach((target) => createTarget(target.id, target.x, target.y));
  defaultWalls.forEach((wall) => createWall(wall.id, wall.x, wall.y, wall.direction));
}

function keepObjectsInsideStage() {
  document.querySelectorAll(".draggable-object").forEach((object) => {
    const maximumX = stage.clientWidth - object.offsetWidth;
    const maximumY = stage.clientHeight - object.offsetHeight;
    const currentX = Number.parseFloat(object.style.left) || 0;
    const currentY = Number.parseFloat(object.style.top) || 0;

    object.style.left = `${Math.max(0, Math.min(currentX, maximumX))}px`;
    object.style.top = `${Math.max(0, Math.min(currentY, maximumY))}px`;
  });
}

addTargetButton.addEventListener("click", () => {
  targetCounter += 1;
  createTarget(`target-${targetCounter}`);
});

removeTargetButton.addEventListener("click", () => {
  const newestTarget = targets.pop();
  if (newestTarget) newestTarget.remove();
});

addWallButton.addEventListener("click", () => {
  wallCounter += 1;
  createWall(`wall-${wallCounter}`);
});

removeWallButton.addEventListener("click", () => {
  const newestWall = walls.pop();
  if (newestWall) newestWall.remove();
});

window.addEventListener("resize", keepObjectsInsideStage);

makeDraggable(startPosition);
resetStage();
