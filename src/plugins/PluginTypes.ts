// Shared types for Lua plugin execution, persistent storage & main-thread ↔ Worker communication

export interface PluginInfo {
  name: string;
  mode: number | null;
  type: number | null;
  require: string;
  hasRun: boolean;
  hasTool: boolean;
  icon: string;
  error: string;
}

export type PluginRunResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'failed'; message: string };

export interface PluginSprite {
  id: string;
  image: string;
  folder: string;
  beat: number;
  x: number;
  width: number;
  visible: boolean;
}

export interface PluginImageParams {
  length: number;
  ticks: number;
  threshold: number;
  invert: boolean;
  beatAspect: number;
}

export type PluginDialog =
  | {
      readonly id: number;
      readonly kind: 'message';
      readonly title: string;
      readonly message: string;
    }
  | {
      readonly id: number;
      readonly kind: 'input';
      readonly title: string;
      readonly message: string;
      readonly defaultText: string;
    }
  | {
      readonly id: number;
      readonly kind: 'choice';
      readonly title: string;
      readonly message: string;
      readonly options: string[];
    }
  | {
      readonly id: number;
      readonly kind: 'filePick';
      readonly title: string;
      readonly message: string;
      readonly fromPhotos: boolean;
    }
  | {
      readonly id: number;
      readonly kind: 'imagePreview';
      readonly title: string;
      readonly message: string;
      readonly imageBytes: Uint8Array;
      readonly imageParams: PluginImageParams;
    };

export type PluginPromptRequest =
  | { kind: 'input'; message: string; defaultText: string }
  | { kind: 'choice'; message: string; options: string[] }
  | { kind: 'filePick'; message: string; fromPhotos: boolean }
  | {
      kind: 'imagePreview';
      message: string;
      imageBase64: string;
      length: number;
      ticks: number;
      threshold: number;
      invert: boolean;
    }
  | { kind: 'decodeImage'; imageBase64: string; width: number; height: number };

export interface PluginPromptAnswer {
  kind: PluginPromptRequest['kind'];
  value: string | null;
}

export type SerializedBeat = [number, number, number];

export interface SerializedSeg {
  beat: SerializedBeat;
  x: number;
}

export interface SerializedNote {
  id: number;
  beat: SerializedBeat;
  x: number;
  w: number;
  type?: number;
  segs: SerializedSeg[];
  extra: Record<string, unknown>;
}

export interface SerializedTimePoint {
  beat: SerializedBeat;
  bpm: number;
}

export interface SerializedEffectPoint {
  beat: SerializedBeat;
  kind: 'scroll' | 'jump';
  value: number;
  extra: Record<string, unknown>;
}

export interface PluginSnapshot {
  notes: SerializedNote[];
  times: SerializedTimePoint[];
  effects: SerializedEffectPoint[];
  selectedIDs: number[];
  orderIDs: number[];
  currentSec: number;
  currentBeat: number;
  divide: number;
  widthUnits: number;
  gridLines: number;
  meta: Record<string, unknown>;
}

export interface WorkerPatch {
  dirty: boolean;
  notes?: SerializedNote[];
  times?: SerializedTimePoint[];
  effects?: SerializedEffectPoint[];
  selectedIDs: number[];
  selectedChanged: boolean;
  orderIDs: number[];
  orderChanged: boolean;
  gridLines: number;
  gridChanged: boolean;
  seekToBeat?: SerializedBeat;
}

export type LuaWorkerRequest =
  | {
      type: 'inspect';
      id: number;
      items: { id: string; name: string; source: string }[];
    }
  | {
      type: 'run';
      id: number;
      source: string;
      fileName: string;
      pluginName: string;
      snapshot: PluginSnapshot;
      promptAnswers?: PluginPromptAnswer[];
    };

export type LuaWorkerResponse =
  | {
      type: 'inspectResult';
      id: number;
      results: Record<string, PluginInfo>;
    }
  | {
      type: 'log';
      id: number;
      text: string;
    }
  | {
      type: 'notice';
      id: number;
      text: string;
    }
  | {
      type: 'suspend';
      id: number;
      prompt: PluginPromptRequest;
    }
  | {
      type: 'runResult';
      id: number;
      result: PluginRunResult;
      log: string;
      unsupported: string[];
      notified: boolean;
      patch?: WorkerPatch;
    };
