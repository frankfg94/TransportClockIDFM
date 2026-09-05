import type { CameraState } from "../geo/camera";
import { panCameraByScreen, zoomCameraAroundScreenPoint } from "../geo/camera";

export interface KeyboardControllerOptions {
  getCamera: () => CameraState;
  setCamera: (camera: CameraState) => void;
  onReset: () => void;
  onSelect: () => void;
  onEscape: () => void;
  onFocusNext?: (direction: 1 | -1) => void;
  reduceMotion?: boolean;
}

export function createKeyboardController(options: KeyboardControllerOptions) {
  return (event: KeyboardEvent): void => {
    const camera = options.getCamera();
    const panAmount = options.reduceMotion ? 64 : 42;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        options.setCamera(panCameraByScreen(camera, { x: -panAmount, y: 0 }));
        return;
      case "ArrowRight":
        event.preventDefault();
        options.setCamera(panCameraByScreen(camera, { x: panAmount, y: 0 }));
        return;
      case "ArrowUp":
        event.preventDefault();
        options.setCamera(panCameraByScreen(camera, { x: 0, y: -panAmount }));
        return;
      case "ArrowDown":
        event.preventDefault();
        options.setCamera(panCameraByScreen(camera, { x: 0, y: panAmount }));
        return;
      case "+":
      case "=":
        event.preventDefault();
        options.setCamera(zoomCameraAroundScreenPoint(camera, camera.zoom + 1, {
          x: camera.viewportWidthCssPx / 2,
          y: camera.viewportHeightCssPx / 2,
        }));
        return;
      case "-":
      case "_":
        event.preventDefault();
        options.setCamera(zoomCameraAroundScreenPoint(camera, camera.zoom - 1, {
          x: camera.viewportWidthCssPx / 2,
          y: camera.viewportHeightCssPx / 2,
        }));
        return;
      case "0":
        event.preventDefault();
        options.onReset();
        return;
      case "Enter":
        event.preventDefault();
        options.onSelect();
        return;
      case "Escape":
        event.preventDefault();
        options.onEscape();
        return;
      case "Tab":
        options.onFocusNext?.(event.shiftKey ? -1 : 1);
        return;
      default:
        return;
    }
  };
}

