# Semester Project Implementation Plan

## Project Goal

My semester project is a practical shooting training and stage-planning
application. The final version will allow a shooter to build a stage,
place targets and obstacles, plan a route, and review training data.

The main goal for the semester is to turn the existing prototype into a
functional application with a complete workflow rather than trying to
implement every possible feature.

## Current State

The application currently has the foundation of the stage editor and
route-planning system. Users can create a stage and place stage objects.
The project is being developed in React Native / Expo with TypeScript.

## Final Semester Scope

The semester version will focus on:

- Building and editing a shooting stage
- Placing targets, walls, fault lines, and shooting positions
- Route planning between required positions
- Minimizing unnecessary movement while still reaching positions needed
  to engage every target
- Saving useful shooter/training information
- A video-analysis interface for future training analysis

More advanced AI features can be developed after the core application is
stable.

## Spike Test: Camera Input

One uncertain part of the project is accessing camera/video input for the
future video-analysis system.

I created a spike that tests whether the application can request camera
permission and successfully open camera input.

During the test, the camera initially produced a black screen. Testing
showed that camera access worked when permission was manually enabled.
This suggests the problem is related to the permission/request flow rather
than the camera itself.

The implementation needs to check camera permission, request permission
when necessary, and handle denied permission before loading the camera.

## How the Spike Changed the Plan

Originally I treated video analysis mostly as an AI/computer-vision
problem. The spike showed that there are lower-level mobile issues that
have to work first.

The revised order is:

1. Stabilize the stage editor.
2. Finish stage rules and constraints.
3. Finish route-planning logic.
4. Establish reliable camera/video input.
5. Build the video-analysis interface.
6. Add computer-vision analysis after reliable video input exists.
7. Test and polish the complete workflow.

## Technical Challenges

The largest technical challenges I expect are route generation, enforcing
stage constraints, camera/video access on iOS, processing video reliably,
and keeping the interface understandable as more analysis features are
added.

I also need to avoid increasing the scope faster than I can finish the
core application.

## Syllabus / Learning Outcomes

The project will use the programming concepts covered throughout the
semester through application state, classes/components, user interaction,
data structures, algorithms, debugging, testing, and iterative
development.

As new syllabus topics are introduced, I will apply them to parts of the
application where they are useful rather than adding features only to
demonstrate a topic.

## End-of-Semester Goal

By the end of the semester, I want a stable prototype where a user can
create a stage, define its important constraints, plan a route through the
stage, and use training/video tools that can later support more advanced
shooter analysis.