import { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Item = {
  id: string;
  x: number;
  y: number;
  type: 'target' | 'wall';
};

export default function HomeScreen() {
  const [targets, setTargets] = useState<Item[]>([
    { id: 'target-1', x: 250, y: 60, type: 'target' },
    { id: 'target-2', x: 260, y: 250, type: 'target' },
    { id: 'target-3', x: 150, y: 230, type: 'target' },
  ]);

  const [walls, setWalls] = useState<Item[]>([
    { id: 'wall-1', x: 50, y: 200, type: 'wall' },
    { id: 'wall-2', x: 180, y: 40, type: 'wall' },
    { id: 'wall-3', x: 220, y: 320, type: 'wall' },
  ]);

  const [startPosition, setStartPosition] = useState({
  x: 25,
  y: 50,
  });

  const resetStage = () => {
    setTargets([
      { id: 'target-1', x: 250, y: 60, type: 'target' },
      { id: 'target-2', x: 260, y: 250, type: 'target' },
      { id: 'target-3', x: 150, y: 230, type: 'target' },
    ]);

    setWalls([
      { id: 'wall-1', x: 50, y: 200, type: 'wall' },
      { id: 'wall-2', x: 180, y: 40, type: 'wall' },
      { id: 'wall-3', x: 220, y: 320, type: 'wall' },
    ]);
    setStartPosition({
       x: 25,
       y: 50,
    });
  };

  const addTarget = () => {
    setTargets((current) => [
      ...current,
      {
        id: `target-${current.length + 1}`,
        x: 140,
        y: 160,
        type: 'target',
      },
    ]);
  };

  const removeTarget = () => {
    setTargets((current) => current.slice(0, -1));
  };

  const addWall = () => {
    setWalls((current) => [
      ...current,
      {
        id: `wall-${current.length + 1}`,
        x: 100,
        y: 150,
        type: 'wall',
      },
    ]);
  };

  const removeWall = () => {
    setWalls((current) => current.slice(0, -1));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>PROTOTYPE #0</Text>
        <Text style={styles.title}>2D Stage Planner</Text>

        <Text style={styles.description}>
          Arrange targets and walls to create a simple stage plan.
        </Text>

        <View style={styles.stage}>
          <DraggableStart
            position={startPosition}
            setPosition={setStartPosition}
          />

          {targets.map((target) => (
            <DraggableItem
              key={target.id}
              item={target}
              setItems={setTargets}
            />
          ))}

          {walls.map((wall) => (
            <DraggableItem
              key={wall.id}
              item={wall}
              setItems={setWalls}
            />
          ))}
        </View>

        <View style={styles.controls}>
          <Button title="Add Target" onPress={addTarget} />
          <Button title="Remove Target" onPress={removeTarget} />
          <Button title="Add Wall" onPress={addWall} />
          <Button title="Remove Wall" onPress={removeWall} />
          <Button title="Reset Positions" onPress={resetStage} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function DraggableItem({
  item,
  setItems,
}: {
  item: Item;
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
}) {
  const start = useRef({ x: item.x, y: item.y });
  const latestItem = useRef(item);

  latestItem.current = item;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        start.current = {
          x: latestItem.current.x,
          y: latestItem.current.y,
        };
      },

      onPanResponderMove: (_, gesture) => {
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.id === latestItem.current.id
              ? {
                  ...currentItem,
                  x: Math.max(0, start.current.x + gesture.dx),
                  y: Math.max(0, start.current.y + gesture.dy),
                }
              : currentItem
          )
        );
      },
    })
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        item.type === 'target' ? styles.target : styles.wall,
        {
          left: item.x,
          top: item.y,
        },
      ]}
    />
  );
}
function DraggableStart({
  position,
  setPosition,
}: {
  position: { x: number; y: number };
  setPosition: React.Dispatch<
    React.SetStateAction<{ x: number; y: number }>
  >;
}) {
  const start = useRef(position);
  const latestPosition = useRef(position);

  latestPosition.current = position;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        start.current = latestPosition.current;
      },

      onPanResponderMove: (_, gesture) => {
        setPosition({
          x: Math.max(0, start.current.x + gesture.dx),
          y: Math.max(0, start.current.y + gesture.dy),
        });
      },
    })
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.startPosition,
        {
          left: position.x,
          top: position.y,
        },
      ]}
    >
      <Text style={styles.startText}>Start Position</Text>
    </View>
  );
}
function Button({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef2f5',
  },

  container: {
    flex: 1,
    padding: 20,
  },

  eyebrow: {
    color: '#c44b2b',
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 4,
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#24303c',
  },

  description: {
    color: '#5f6b76',
    marginTop: 8,
    marginBottom: 20,
  },

  stage: {
    height: 430,
    backgroundColor: '#d9d3bf',
    borderWidth: 5,
    borderColor: '#33424f',
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },

  startPosition: {
    position: 'absolute',
    left: 25,
    top: 50,
    width: 110,
    height: 55,
    backgroundColor: '#d85b3d',
    borderColor: '#9e351d',
    borderWidth: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  startText: {
    color: 'white',
    fontWeight: 'bold',
  },

  target: {
    position: 'absolute',
    width: 48,
    height: 65,
    backgroundColor: '#b98b50',
    borderColor: '#604522',
    borderWidth: 3,
    borderRadius: 5,
  },

  wall: {
    position: 'absolute',
    width: 100,
    height: 24,
    backgroundColor: '#657783',
    borderColor: '#25333d',
    borderWidth: 3,
  },

  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },

  button: {
    backgroundColor: '#33424f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 5,
  },

  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});