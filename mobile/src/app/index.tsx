import { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { stageToViewport, viewportToStage } from '@/stage/coordinates';
import { createDefaultStage } from '@/stage/defaults';
import type { StageDocument, StageObject } from '@/stage/model';
import { addObject, moveObject, removeLastObject } from '@/stage/operations';

export default function HomeScreen() {
  const [stage, setStage] = useState<StageDocument>(createDefaultStage);

  const resetStage = () => setStage(createDefaultStage());
  const addTarget = () => setStage((current) => addObject(current, 'target'));
  const removeTarget = () => setStage((current) => removeLastObject(current, 'target'));
  const addWall = () => setStage((current) => addObject(current, 'wall'));
  const removeWall = () => setStage((current) => removeLastObject(current, 'wall'));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>PROTOTYPE #0</Text>
        <Text style={styles.title}>2D Stage Planner</Text>

        <Text style={styles.description}>
          Arrange targets and walls to create a simple stage plan.
        </Text>

        <View style={styles.stage}>
          {stage.objects.map((object) => (
            <DraggableItem key={object.id} item={object} setStage={setStage} />
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
  setStage,
}: {
  item: StageObject;
  setStage: React.Dispatch<React.SetStateAction<StageDocument>>;
}) {
  const start = useRef(stageToViewport(item.position));
  const latestItem = useRef(item);

  latestItem.current = item;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        start.current = stageToViewport(latestItem.current.position);
      },

      onPanResponderMove: (_, gesture) => {
        const position = viewportToStage({
          space: 'viewport',
          x: start.current.x + gesture.dx,
          y: start.current.y + gesture.dy,
        });
        setStage((current) => moveObject(current, latestItem.current.id, position));
      },
    })
  ).current;

  const position = stageToViewport(item.position);

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        item.type === 'start' ? styles.startPosition
          : item.type === 'target' ? styles.target : styles.wall,
        {
          left: position.x,
          top: position.y,
        },
      ]}
    >
      {item.type === 'start' && <Text style={styles.startText}>Start Position</Text>}
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